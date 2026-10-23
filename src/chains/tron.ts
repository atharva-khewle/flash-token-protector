// Tron adapter over the public HTTP API (TronGrid, PublicNode). Read-only.

import { CHAINS, type ChainInfo } from '../registry/chains'
import { hexToTron, tronToHex } from '../lib/tron'
import type {
  CallResult,
  ChainAdapter,
  Finality,
  Hex,
  LogEntry,
  Maybe,
  NormReceipt,
  ProviderResult,
  TokenTransfer,
} from './types'
import { errMsg, fetchJson, firstOk, hostOf } from './rpc'

export interface TronTxInfo {
  id?: string
  blockNumber?: number
  blockTimeStamp?: number
  result?: string
  receipt?: { result?: string }
  log?: { address: string; topics?: string[]; data?: string }[]
}

const strip = (s: string) => s.toLowerCase().replace(/^0x/, '')
const hx = (s: string) => `0x${strip(s)}` as Hex

/** Tron log addresses are 20 bytes; some endpoints prefix 41. */
function logAddr(a: string): Hex {
  const s = strip(a)
  return hx(s.length === 42 && s.startsWith('41') ? s.slice(2) : s)
}

export function normalizeTronInfo(hash: string, info: TronTxInfo): NormReceipt {
  const failed = info.result === 'FAILED' || (info.receipt?.result !== undefined && info.receipt.result !== 'SUCCESS')
  return {
    chain: 'tron',
    hash,
    status: failed ? 'reverted' : 'success',
    blockNumber: info.blockNumber !== undefined ? BigInt(info.blockNumber) : null,
    blockHash: null,
    from: null,
    to: null,
    logs: (info.log ?? []).map((l, i) => ({
      address: logAddr(l.address),
      topics: (l.topics ?? []).map(hx),
      data: hx(l.data ?? ''),
      logIndex: i,
    })),
  }
}

export class TronAdapter implements ChainAdapter {
  readonly chain = 'tron' as const

  constructor(private readonly info: ChainInfo) {}

  private post(base: string, path: string, body: unknown): Promise<unknown> {
    return fetchJson(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  private any<T>(path: string, body: unknown): Promise<T> {
    return firstOk(this.info.rpcs, (b) => this.post(b, path, body) as Promise<T>)
  }

  async getReceipt(hash: string): Promise<ProviderResult<NormReceipt>[]> {
    return Promise.all(
      this.info.rpcs.map(async (base): Promise<ProviderResult<NormReceipt>> => {
        const provider = hostOf(base)
        try {
          const info = (await this.post(base, '/wallet/gettransactioninfobyid', { value: hash })) as TronTxInfo
          if (info && info.id) return { provider, ok: true, value: normalizeTronInfo(hash, info) }
          const tx = (await this.post(base, '/wallet/gettransactionbyid', { value: hash })) as { txID?: string }
          return {
            provider,
            ok: true,
            value: { chain: 'tron', hash, status: tx?.txID ? 'pending' : 'notfound', blockNumber: null, blockHash: null, from: null, to: null, logs: [] },
          }
        } catch (e) {
          return { provider, ok: false, error: errMsg(e) }
        }
      }),
    )
  }

  async getLogs(): Promise<LogEntry[]> {
    // Tron history comes from TronGrid's indexed API (listTokenTransfers), not log filters.
    return []
  }

  /** Who signed a transaction and which contract it called. */
  async getTxParties(hash: string): Promise<{ from: Hex; to: Hex | null } | null> {
    try {
      const tx = (await this.any('/wallet/gettransactionbyid', { value: hash })) as {
        raw_data?: { contract?: { parameter?: { value?: { owner_address?: string; contract_address?: string; to_address?: string } } }[] }
      }
      const v = tx?.raw_data?.contract?.[0]?.parameter?.value
      if (!v?.owner_address) return null
      const to = v.contract_address ?? v.to_address
      return { from: logAddr(v.owner_address), to: to ? logAddr(to) : null }
    } catch {
      return null
    }
  }

  /** The account that deployed a contract (Tron keeps it on the contract itself). */
  async getCreator(address: Hex): Promise<Hex | null> {
    try {
      const r = (await this.any('/wallet/getcontract', { value: `41${strip(address)}` })) as { origin_address?: string }
      return r?.origin_address ? logAddr(r.origin_address) : null
    } catch {
      return null
    }
  }

  /** Recent confirmed Transfer events of one TRC20 token (TronGrid index). */
  async tokenTransfers(token: Hex, limit = 50): Promise<{ txHash: string; from: Hex; to: Hex; value: bigint }[]> {
    const base = this.info.logRpcs[0]!
    const body = (await fetchJson(`${base}/v1/contracts/${hexToTron(token)}/events?event_name=Transfer&only_confirmed=true&limit=${limit}`)) as {
      data?: { transaction_id: string; result?: Record<string, string> }[]
    }
    const out: { txHash: string; from: Hex; to: Hex; value: bigint }[] = []
    const addr = (s: string | undefined): Hex | null => {
      if (!s) return null
      if (s.startsWith('T')) return tronToHex(s)
      return /^(0x)?(41)?[0-9a-fA-F]{40}$/.test(s) ? logAddr(s.replace(/^0x/, '')) : null
    }
    for (const d of body.data ?? []) {
      const r = d.result ?? {}
      const from = addr(r.from ?? r['0'])
      const to = addr(r.to ?? r['1'])
      const v = r.value ?? r['2']
      if (!from || !to || !v || !/^\d+$/.test(v)) continue
      out.push({ txHash: d.transaction_id, from, to, value: BigInt(v) })
    }
    return out
  }

  async getCode(address: Hex): Promise<Hex> {
    const r = (await this.any('/wallet/getcontract', { value: `41${strip(address)}` })) as { bytecode?: string }
    return r?.bytecode ? hx(r.bytecode) : '0x'
  }

  async call(to: Hex, data: Hex, from?: Hex): Promise<CallResult> {
    try {
      const r = (await this.any('/wallet/triggerconstantcontract', {
        owner_address: `41${strip(from ?? '0x0000000000000000000000000000000000000000')}`,
        contract_address: `41${strip(to)}`,
        data: strip(data),
      })) as { constant_result?: string[]; result?: { result?: boolean; message?: string } }
      if (r?.result?.result && r.constant_result?.[0] !== undefined) return { ok: true, data: hx(r.constant_result[0]) }
      let msg = r?.result?.message ?? 'call failed'
      if (/^[0-9a-f]+$/i.test(msg)) {
        try {
          msg = new TextDecoder().decode(Uint8Array.from(msg.match(/../g)!.map((b) => parseInt(b, 16))))
        } catch {
          /* keep hex */
        }
      }
      return { ok: false, error: msg.slice(0, 160) }
    } catch (e) {
      return { ok: false, error: errMsg(e) }
    }
  }

  async getFinality(): Promise<Finality> {
    return firstOk(this.info.rpcs, async (b) => {
      const head = (await this.post(b, '/wallet/getnowblock', {})) as { block_header: { raw_data: { number: number } } }
      const solid = (await this.post(b, '/walletsolidity/getnowblock', {})) as { block_header: { raw_data: { number: number } } }
      return { head: BigInt(head.block_header.raw_data.number), finalized: BigInt(solid.block_header.raw_data.number) }
    })
  }

  async getBlockTimestamp(block: bigint): Promise<number | null> {
    try {
      const b = (await this.any('/wallet/getblockbynum', { num: Number(block) })) as { block_header?: { raw_data: { timestamp: number } } }
      return b?.block_header ? Math.floor(b.block_header.raw_data.timestamp / 1000) : null
    } catch {
      return null
    }
  }

  async getStorageAt(): Promise<Hex | null> {
    return null
  }

  async isBlockHash(hash: string): Promise<boolean> {
    try {
      const b = (await this.any('/wallet/getblockbyid', { value: hash })) as { blockID?: string }
      return !!b?.blockID
    } catch {
      return false
    }
  }

  async getOwnerPermission(address: string): Promise<{ threshold: number; keys: { address: string; weight: number }[] } | null> {
    const acc = (await this.any('/wallet/getaccount', { address, visible: true })) as {
      owner_permission?: { threshold: number; keys: { address: string; weight: number }[] }
      address?: string
    }
    if (!acc?.address) return null
    // Accounts that never changed permissions return no owner_permission: the account key alone controls it.
    return acc.owner_permission ?? { threshold: 1, keys: [{ address, weight: 1 }] }
  }

  /** Recent TRC20 Transfer and Approval events for an address (TronGrid index, confirmed only).
   *  One page (200) of TRC20 events. Pass the returned `next` to get the page before it. */
  async listTrc20(address: Hex, fingerprint?: string | null): Promise<{ transfers: TokenTransfer[]; approvals: { token: Hex; spender: Hex }[]; next: string | null }> {
    const base = this.info.logRpcs[0]!
    const fp = fingerprint ? `&fingerprint=${encodeURIComponent(fingerprint)}` : ''
    const url = `${base}/v1/accounts/${hexToTron(address)}/transactions/trc20?limit=200&only_confirmed=true${fp}`
    const body = (await fetchJson(url)) as {
      data?: {
        transaction_id: string
        block_timestamp: number
        token_info: { address: string; name: string; symbol: string; decimals: number }
        from: string
        to: string
        type: string
        value: string
      }[]
      meta?: { fingerprint?: string }
    }
    const transfers: TokenTransfer[] = []
    const approvals: { token: Hex; spender: Hex }[] = []
    for (const d of body.data ?? []) {
      const token = tronToHex(d.token_info.address)
      const from = tronToHex(d.from)
      const to = tronToHex(d.to)
      if (!token || !from || !to) continue
      if (d.type === 'Approval') {
        approvals.push({ token, spender: to })
        continue
      }
      if (d.type !== 'Transfer') continue
      transfers.push({
        txHash: d.transaction_id,
        blockNumber: null,
        timestamp: Math.floor(d.block_timestamp / 1000),
        token,
        tokenName: d.token_info.name ?? null,
        tokenSymbol: d.token_info.symbol ?? null,
        decimals: d.token_info.decimals ?? null,
        from,
        to,
        value: /^\d+$/.test(d.value) ? BigInt(d.value) : 0n,
        txFrom: null,
      })
    }
    const next = (body.data?.length ?? 0) >= 200 && body.meta?.fingerprint ? body.meta.fingerprint : null
    return { transfers, approvals, next }
  }

  async listTokenTransfers(address: Hex): Promise<Maybe<TokenTransfer[]>> {
    try {
      return { available: true, value: (await this.listTrc20(address)).transfers }
    } catch (e) {
      return { available: false, reason: `TronGrid unavailable (${errMsg(e)}).` }
    }
  }
}

export const tron = new TronAdapter(CHAINS.tron)
