// Generic EVM adapter (BSC, Ethereum). Read-only JSON-RPC through viem.

import { createPublicClient, http, type PublicClient } from 'viem'
import type { ChainInfo } from '../registry/chains'
import type {
  CallResult,
  ChainAdapter,
  Finality,
  Hex,
  LogEntry,
  LogFilter,
  Maybe,
  NormReceipt,
  ProviderResult,
  TokenTransfer,
} from './types'
import { errMsg, fetchJson, firstOk, hostOf, TIMEOUT_MS } from './rpc'

interface RawLog {
  address: string
  topics: string[]
  data: string
  logIndex: string
  transactionHash: string
  blockNumber: string
}

interface RawReceipt {
  status: string
  blockNumber: string
  blockHash: string
  from: string
  to: string | null
  logs: RawLog[]
}

type Raw = (method: string, params: unknown[]) => Promise<unknown>

function client(url: string): Raw {
  const c: PublicClient = createPublicClient({
    transport: http(url, { timeout: TIMEOUT_MS, retryCount: 0, fetchOptions: { credentials: 'omit', referrerPolicy: 'no-referrer' } }),
  })
  return (method, params) => c.request({ method: method as never, params: params as never })
}

const lc = (s: string) => s.toLowerCase() as Hex

export function normalizeEvmReceipt(chain: ChainInfo['key'], hash: string, r: RawReceipt): NormReceipt {
  return {
    chain,
    hash,
    status: r.status === '0x1' ? 'success' : 'reverted',
    blockNumber: BigInt(r.blockNumber),
    blockHash: r.blockHash,
    from: lc(r.from),
    to: r.to ? lc(r.to) : null,
    logs: r.logs.map((l) => ({
      address: lc(l.address),
      topics: l.topics.map(lc),
      data: lc(l.data),
      logIndex: Number(l.logIndex),
    })),
  }
}

export class EvmAdapter implements ChainAdapter {
  readonly chain: ChainInfo['key']
  private readonly rpcs: { url: string; raw: Raw }[]
  private readonly logRpcs: { url: string; raw: Raw }[]

  constructor(
    private readonly info: ChainInfo,
    private readonly explorerProxy: string | null = '/api/explorer',
  ) {
    this.chain = info.key
    this.rpcs = info.rpcs.map((url) => ({ url, raw: client(url) }))
    this.logRpcs = info.logRpcs.map((url) => ({ url, raw: client(url) }))
  }

  private any<T>(fn: (raw: Raw) => Promise<T>): Promise<T> {
    return firstOk(this.rpcs, (p) => fn(p.raw))
  }

  async getReceipt(hash: string): Promise<ProviderResult<NormReceipt>[]> {
    return Promise.all(
      this.rpcs.map(async ({ url, raw }): Promise<ProviderResult<NormReceipt>> => {
        const provider = hostOf(url)
        try {
          const r = (await raw('eth_getTransactionReceipt', [hash])) as RawReceipt | null
          if (r) return { provider, ok: true, value: normalizeEvmReceipt(this.chain, hash, r) }
          const tx = (await raw('eth_getTransactionByHash', [hash])) as { blockNumber: string | null } | null
          const status = tx ? 'pending' : 'notfound'
          return {
            provider,
            ok: true,
            value: { chain: this.chain, hash, status, blockNumber: null, blockHash: null, from: null, to: null, logs: [] },
          }
        } catch (e) {
          return { provider, ok: false, error: errMsg(e) }
        }
      }),
    )
  }

  async getLogs(f: LogFilter): Promise<LogEntry[]> {
    const params = [
      {
        address: f.address,
        topics: f.topics,
        fromBlock: `0x${f.fromBlock.toString(16)}`,
        toBlock: `0x${f.toBlock.toString(16)}`,
      },
    ]
    const logs = (await firstOk(this.logRpcs, (p) => p.raw('eth_getLogs', params))) as RawLog[]
    return logs.map((l) => ({
      address: lc(l.address),
      topics: l.topics.map(lc),
      data: lc(l.data),
      logIndex: Number(l.logIndex),
      txHash: l.transactionHash.toLowerCase(),
      blockNumber: BigInt(l.blockNumber),
    }))
  }

  /** Max block span per getLogs call for this chain's log RPCs. */
  get logChunk(): number {
    return this.info.logChunk
  }

  async getCode(address: Hex): Promise<Hex> {
    return lc((await this.any((r) => r('eth_getCode', [address, 'latest']))) as string)
  }

  async call(to: Hex, data: Hex, from?: Hex): Promise<CallResult> {
    try {
      const out = await this.any((r) => r('eth_call', [{ to, data, ...(from ? { from } : {}) }, 'latest']))
      return { ok: true, data: lc(out as string) }
    } catch (e) {
      return { ok: false, error: errMsg(e) }
    }
  }

  async getFinality(): Promise<Finality> {
    return this.any(async (r) => {
      const head = BigInt((await r('eth_blockNumber', [])) as string)
      let finalized: bigint | null = null
      try {
        const b = (await r('eth_getBlockByNumber', ['finalized', false])) as { number: string } | null
        if (b) finalized = BigInt(b.number)
      } catch {
        finalized = null
      }
      return { head, finalized }
    })
  }

  async getBlockTimestamp(block: bigint): Promise<number | null> {
    try {
      const b = (await this.any((r) => r('eth_getBlockByNumber', [`0x${block.toString(16)}`, false]))) as { timestamp: string } | null
      return b ? Number(BigInt(b.timestamp)) : null
    } catch {
      return null
    }
  }

  async getStorageAt(address: Hex, slot: Hex): Promise<Hex | null> {
    try {
      return lc((await this.any((r) => r('eth_getStorageAt', [address, slot, 'latest']))) as string)
    } catch {
      return null
    }
  }

  async isBlockHash(hash: string): Promise<boolean> {
    try {
      const b = await this.any((r) => r('eth_getBlockByHash', [hash, false]))
      return !!b
    } catch {
      return false
    }
  }

  async getTxSender(hash: string): Promise<Hex | null> {
    try {
      const tx = (await this.any((r) => r('eth_getTransactionByHash', [hash]))) as { from: string } | null
      return tx ? lc(tx.from) : null
    } catch {
      return null
    }
  }

  async listTokenTransfers(address: Hex): Promise<Maybe<TokenTransfer[]>> {
    if (!this.explorerProxy) return { available: false, reason: 'No explorer proxy configured.' }
    try {
      const url = `${this.explorerProxy}?chain=${this.chain}&address=${address}`
      const body = (await fetchJson(url)) as
        | { available: true; items: { hash: string; blockNumber: string; timeStamp: string; contractAddress: string; tokenName: string; tokenSymbol: string; tokenDecimal: string; from: string; to: string; value: string }[] }
        | { available: false; reason: string }
      if (!body.available) return body
      return {
        available: true,
        value: body.items.map((i) => ({
          txHash: i.hash.toLowerCase(),
          blockNumber: BigInt(i.blockNumber),
          timestamp: Number(i.timeStamp),
          token: lc(i.contractAddress),
          tokenName: i.tokenName,
          tokenSymbol: i.tokenSymbol,
          decimals: Number(i.tokenDecimal),
          from: lc(i.from),
          to: lc(i.to),
          value: BigInt(i.value),
          txFrom: null,
        })),
      }
    } catch (e) {
      return { available: false, reason: `Explorer proxy unavailable (${errMsg(e)}). Deploy with EXPLORER_API_KEY to enable.` }
    }
  }
}
