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

/** Returns the receipt only if it has the fields every honest node returns. */
function validReceipt(r: unknown): RawReceipt | null {
  if (!r || typeof r !== 'object') return null
  const x = r as Partial<RawReceipt>
  if (typeof x.status !== 'string' || typeof x.blockNumber !== 'string' || typeof x.blockHash !== 'string' || typeof x.from !== 'string') return null
  if (!Array.isArray(x.logs)) return null
  return x as RawReceipt
}

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
        const t0 = Date.now()
        // The head this server knows tells "behind" apart from "says it does not exist".
        const headP = raw('eth_blockNumber', []).then(
          (h) => (typeof h === 'string' && /^0x[0-9a-f]+$/i.test(h) ? BigInt(h) : null),
          () => null,
        )
        try {
          const r = await raw('eth_getTransactionReceipt', [hash])
          // A rate-limited or broken server can answer with no result at all. That is a failure,
          // not "transaction not found": only an explicit null means not found.
          if (r === undefined) throw new Error('empty reply (often rate limiting)')
          if (r !== null) {
            const v = validReceipt(r)
            if (!v) throw new Error('malformed receipt (missing fields)')
            return { provider, ok: true, value: normalizeEvmReceipt(this.chain, hash, v), head: await headP, ms: Date.now() - t0 }
          }
          const tx = await raw('eth_getTransactionByHash', [hash])
          if (tx === undefined) throw new Error('empty reply (often rate limiting)')
          const status = tx ? 'pending' : 'notfound'
          return {
            provider,
            ok: true,
            value: { chain: this.chain, hash, status, blockNumber: null, blockHash: null, from: null, to: null, logs: [] },
            head: await headP,
            ms: Date.now() - t0,
          }
        } catch (e) {
          return { provider, ok: false, error: errMsg(e), head: await headP, ms: Date.now() - t0 }
        }
      }),
    )
  }

  async getLogs(f: LogFilter): Promise<LogEntry[]> {
    const params = [
      {
        ...(f.address ? { address: f.address } : {}),
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

  /** Latest block number only (cheap; used by the live watcher). */
  async getHead(): Promise<bigint> {
    return BigInt((await this.any((r) => r('eth_blockNumber', []))) as string)
  }

  /**
   * Every log of one block, grouped by tx, via eth_getBlockReceipts. Returns null when no provider
   * supports the method, so the caller can fall back to address-filtered queries.
   */
  async getBlockLogs(block: bigint): Promise<{ txHash: string; logs: LogEntry[] }[] | null> {
    try {
      const rs = (await this.any((r) => r('eth_getBlockReceipts', [`0x${block.toString(16)}`]))) as
        | { transactionHash: string; status?: string; logs: RawLog[] }[]
        | null
      if (!rs) return null
      return rs
        .filter((x) => x.status !== '0x0')
        .map((x) => ({
          txHash: x.transactionHash.toLowerCase(),
          logs: x.logs.map((l) => ({
            address: lc(l.address),
            topics: l.topics.map(lc),
            data: lc(l.data),
            logIndex: Number(l.logIndex),
            txHash: x.transactionHash.toLowerCase(),
            blockNumber: block,
          })),
        }))
    } catch {
      return null
    }
  }

  /** Transactions the address has broadcast that are not mined yet (pending nonce minus latest nonce). */
  async getPendingCount(address: Hex): Promise<number | null> {
    try {
      const [pending, latest] = await Promise.all([
        this.any((r) => r('eth_getTransactionCount', [address, 'pending'])),
        this.any((r) => r('eth_getTransactionCount', [address, 'latest'])),
      ])
      return Math.max(0, Number(BigInt(pending as string) - BigInt(latest as string)))
    } catch {
      return null
    }
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

  /** Local dev node only: any-token transfer logs straight from the node, no indexer needed. */
  private async listFromNode(address: Hex): Promise<Maybe<TokenTransfer[]>> {
    try {
      const head = (await this.getFinality()).head
      const topic = `0x${address.slice(2).padStart(64, '0')}` as Hex
      const T = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as Hex
      const [inc, out] = await Promise.all([
        this.getLogs({ topics: [T, null, topic], fromBlock: 0n, toBlock: head }),
        this.getLogs({ topics: [T, topic], fromBlock: 0n, toBlock: head }),
      ])
      const seen = new Set<string>()
      const items: TokenTransfer[] = []
      for (const l of [...inc, ...out]) {
        const k = `${l.txHash}|${l.logIndex}`
        if (seen.has(k) || l.topics.length !== 3 || l.data.length !== 66) continue
        seen.add(k)
        items.push({
          txHash: l.txHash,
          blockNumber: l.blockNumber,
          timestamp: null,
          token: l.address,
          tokenName: null,
          tokenSymbol: null,
          decimals: null,
          from: `0x${l.topics[1]!.slice(-40)}` as Hex,
          to: `0x${l.topics[2]!.slice(-40)}` as Hex,
          value: BigInt(l.data),
          txFrom: null,
        })
      }
      // Names and symbols come from the contracts themselves; they are untrusted text.
      const tokens = [...new Set(items.map((i) => i.token))]
      const meta = new Map<Hex, { name: string | null; symbol: string | null }>()
      await Promise.all(
        tokens.map(async (t) => {
          const [n, s] = await Promise.all([this.callString(t, '0x06fdde03'), this.callString(t, '0x95d89b41')])
          meta.set(t, { name: n, symbol: s })
        }),
      )
      for (const i of items) {
        const m = meta.get(i.token)
        i.tokenName = m?.name ?? null
        i.tokenSymbol = m?.symbol ?? null
      }
      return { available: true, value: items }
    } catch (e) {
      return { available: false, reason: `Node log query failed (${errMsg(e)}).` }
    }
  }

  private async callString(token: Hex, selector: Hex): Promise<string | null> {
    const r = await this.call(token, selector)
    if (!r.ok || r.data.length < 130) return null
    try {
      const h = r.data.slice(2)
      const len = parseInt(h.slice(64, 128), 16)
      const bytes = h.slice(128, 128 + len * 2).match(/../g) ?? []
      return new TextDecoder().decode(Uint8Array.from(bytes.map((b) => parseInt(b, 16)))).slice(0, 120)
    } catch {
      return null
    }
  }

  async listTokenTransfers(address: Hex): Promise<Maybe<TokenTransfer[]>> {
    if (this.info.unrestrictedLogs) return this.listFromNode(address)
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
