// Reads the transfer history of many wallets and follows the money outward, hop by hop.
// Read-only and keyless: TronGrid pages on Tron; the explorer index on BSC/ETH when the site has a
// key, otherwise recent windows of canonical-USDT logs from public RPCs.

import { adapterFor } from '../chains'
import type { EvmAdapter } from '../chains/evm'
import type { TronAdapter } from '../chains/tron'
import type { Hex, TokenTransfer } from '../chains/types'
import { displayAddress } from '../lib/address'
import { CHAINS, type ChainKey } from '../registry/chains'
import { canonicalUsdt } from '../registry/usdt'
import { addressToTopic, topicToAddress, TRANSFER_TOPIC } from '../verdict/transfer'

export type Follow = 'out' | 'in' | 'both'

export interface CrawlOptions {
  chain: ChainKey
  inputs: Hex[]
  /** Pages (Tron, explorer: 200 transfers each) or RPC windows per wallet. */
  pages: number
  /** How many times to follow the money to new wallets (0 = only the inputs). */
  hops: number
  /** New wallets to follow from each wallet, biggest counterparties first. */
  perWallet: number
  follow: Follow
  /** Stop adding wallets after this many. */
  maxWallets?: number
  signal?: AbortSignal
  onProgress?: (p: { done: number; total: number; text: string }) => void
}

export interface CrawlResult {
  histories: Map<Hex, TokenTransfer[]>
  busy: Set<Hex>
  /** What could and could not be read, in plain words. */
  notes: string[]
  /** Hop at which each wallet was reached (0 = input). */
  hopOf: Map<Hex, number>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

class Stopped extends Error {}

/** Retries rate-limited calls (HTTP 429) with a growing pause; free endpoints allow a few per second. */
async function patient<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      const limited = e instanceof Error && /429|rate|too many/i.test(e.message)
      if (!limited || attempt >= 6) throw e
      if (signal?.aborted) throw new Stopped()
      await sleep(800 * 2 ** attempt)
    }
  }
}

async function tronHistory(me: Hex, pages: number, signal?: AbortSignal): Promise<{ list: TokenTransfer[]; more: boolean }> {
  const a = adapterFor('tron') as TronAdapter
  const list: TokenTransfer[] = []
  let fp: string | null = null
  for (let p = 0; p < pages; p++) {
    if (signal?.aborted) throw new Stopped()
    const r = await patient(() => a.listTrc20(me, fp), signal)
    list.push(...r.transfers)
    fp = r.next
    if (!fp) return { list, more: false }
    await sleep(400) // stay under the public rate limit
  }
  return { list, more: true }
}

async function evmHistory(chain: ChainKey, me: Hex, pages: number, signal?: AbortSignal): Promise<{ list: TokenTransfer[]; more: boolean; source: 'explorer' | 'rpc' }> {
  const a = adapterFor(chain) as EvmAdapter
  const list: TokenTransfer[] = []
  // Explorer index first: full history, every token.
  for (let p = 1; p <= pages; p++) {
    if (signal?.aborted) throw new Stopped()
    const ex = await patient(() => a.listTokenTransfers(me, p), signal)
    if (!ex.available) break
    list.push(...ex.value)
    if (ex.value.length < 200) return { list, more: false, source: 'explorer' }
    if (p === pages) return { list, more: true, source: 'explorer' }
  }
  if (list.length) return { list, more: false, source: 'explorer' }

  // No explorer: canonical USDT from public RPC logs, newest windows first, until refused.
  const usdt = canonicalUsdt(chain)
  const head = (await a.getFinality()).head
  const chunk = BigInt(a.logChunk)
  const meTopic = addressToTopic(me)
  let to = head
  for (let w = 0; w < pages * 4 && to > 0n; w++) {
    if (signal?.aborted) throw new Stopped()
    const from = to >= chunk ? to - chunk + 1n : 0n
    try {
      const parts = await patient(() => Promise.all([
        a.getLogs({ address: usdt.hex, topics: [TRANSFER_TOPIC, meTopic], fromBlock: from, toBlock: to }),
        a.getLogs({ address: usdt.hex, topics: [TRANSFER_TOPIC, null, meTopic], fromBlock: from, toBlock: to }),
      ]), signal)
      for (const l of parts.flat()) {
        if (l.topics.length !== 3 || l.data.length !== 66) continue
        list.push({
          txHash: l.txHash,
          blockNumber: l.blockNumber,
          timestamp: null,
          token: l.address,
          tokenName: null,
          tokenSymbol: 'USDT',
          decimals: usdt.decimals,
          from: topicToAddress(l.topics[1]!),
          to: topicToAddress(l.topics[2]!),
          value: BigInt(l.data),
          txFrom: null,
        })
      }
    } catch {
      return { list, more: false, source: 'rpc' }
    }
    to = from - 1n
  }
  return { list, more: false, source: 'rpc' }
}

/** Reads every input wallet, then follows the biggest counterparties for `hops` rounds. */
export async function crawl(o: CrawlOptions): Promise<CrawlResult> {
  const usdt = canonicalUsdt(o.chain)
  const tron = CHAINS[o.chain].family === 'tron'
  const maxWallets = o.maxWallets ?? 40
  const histories = new Map<Hex, TokenTransfer[]>()
  const busy = new Set<Hex>()
  const hopOf = new Map<Hex, number>()
  const notes: string[] = []
  let rpcOnly = false
  let queue = [...new Set(o.inputs.map((a) => a.toLowerCase() as Hex))]
  queue.forEach((a) => hopOf.set(a, 0))
  let done = 0

  for (let hop = 0; hop <= o.hops && queue.length; hop++) {
    const batch = queue.slice(0, Math.max(0, maxWallets - histories.size))
    if (batch.length < queue.length) notes.push(`Stopped adding wallets at ${maxWallets}; ${queue.length - batch.length} more were not read.`)
    const total = () => done + batch.length - batch.filter((a) => histories.has(a)).length
    // A few wallets at a time (one on Tron): the free servers rate-limit.
    const width = tron ? 1 : 3
    for (let i = 0; i < batch.length; i += width) {
      if (o.signal?.aborted) break
      await Promise.all(
        batch.slice(i, i + width).map(async (a) => {
          try {
            const r = tron ? await tronHistory(a, o.pages, o.signal) : await evmHistory(o.chain, a, o.pages, o.signal)
            histories.set(a, r.list)
            if (r.more) busy.add(a)
            if ('source' in r && r.source === 'rpc') rpcOnly = true
          } catch (e) {
            if (e instanceof Stopped) return
            histories.set(a, [])
            const shown = displayAddress(o.chain, a)
            notes.push(`Could not read ${shown.slice(0, 6)}…${shown.slice(-4)}: ${e instanceof Error ? e.message.slice(0, 80) : 'error'}`)
          }
          done++
          o.onProgress?.({ done, total: Math.max(total(), done), text: `Hop ${hop}: read ${done} wallet${done === 1 ? '' : 's'}` })
        }),
      )
    }
    if (o.signal?.aborted) {
      notes.push('Stopped before finishing. The map shows what was read so far.')
      break
    }
    if (hop === o.hops) break

    // Next hop: each wallet's biggest real-USDT counterparties in the chosen direction.
    const next: Hex[] = []
    for (const a of batch) {
      if (busy.has(a)) continue
      const vol = new Map<Hex, bigint>()
      for (const t of histories.get(a) ?? []) {
        if (t.token.toLowerCase() !== usdt.hex || t.value === 0n) continue
        if ((o.follow === 'out' || o.follow === 'both') && t.from === a && t.to !== a) vol.set(t.to, (vol.get(t.to) ?? 0n) + t.value)
        if ((o.follow === 'in' || o.follow === 'both') && t.to === a && t.from !== a) vol.set(t.from, (vol.get(t.from) ?? 0n) + t.value)
      }
      ;[...vol.entries()]
        .sort((x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0))
        .filter(([c]) => !hopOf.has(c))
        .slice(0, o.perWallet)
        .forEach(([c]) => {
          hopOf.set(c, hop + 1)
          next.push(c)
        })
    }
    queue = next
  }

  if (tron) notes.unshift(`History from TronGrid: up to ${o.pages * 200} events per wallet.`)
  else if (rpcOnly) notes.unshift('No explorer key on this site, so EVM history comes from free public servers: real USDT only, and only recent blocks (on BNB Chain about the last hour or two).')
  else notes.unshift(`History from the explorer index: up to ${o.pages * 200} transfers per wallet, every token.`)
  return { histories, busy, notes, hopOf }
}
