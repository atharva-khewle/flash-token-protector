// Transaction history for one address: every token transfer into or out of it that the keyless
// public RPCs (real USDT) and, when configured, the explorer index (any token) can show.

import { adapterFor } from '../chains'
import type { EvmAdapter } from '../chains/evm'
import type { TronAdapter } from '../chains/tron'
import type { Hex, TokenTransfer } from '../chains/types'
import { CHAINS, type ChainKey } from '../registry/chains'
import { canonicalUsdt } from '../registry/usdt'
import { addressToTopic, topicToAddress, TRANSFER_TOPIC } from '../verdict/transfer'
import { errMsg } from '../chains/rpc'
import { displayAddress } from '../lib/address'
import { analyzeName } from '../lib/homoglyph'
import { isLookalike } from '../lib/lookalike'
import { balanceOf, probeToken } from './probe'

export interface HistoryEntry {
  hash: string
  blockNumber: bigint | null
  timestamp: number | null
  direction: 'in' | 'out' | 'self'
  counterparty: Hex
  token: Hex
  /** True only for the exact canonical USDT contract. */
  canonical: boolean
  /** Self-reported by the token contract / explorer: display text only. */
  symbol: string | null
  name: string | null
  decimals: number | null
  value: bigint
}

const MAX_ENTRIES = 200

/** Pure: turns transfers into rows. Dedupes and sorts newest first. */
export function toHistory(chain: ChainKey, me: Hex, transfers: TokenTransfer[]): HistoryEntry[] {
  const usdt = canonicalUsdt(chain)
  const mine = me.toLowerCase()
  const seen = new Set<string>()
  const out: HistoryEntry[] = []
  for (const t of transfers) {
    const from = t.from.toLowerCase()
    const to = t.to.toLowerCase()
    if (from !== mine && to !== mine) continue
    const key = `${t.txHash}|${t.token}|${from}|${to}|${t.value}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      hash: t.txHash,
      blockNumber: t.blockNumber,
      timestamp: t.timestamp,
      direction: from === mine && to === mine ? 'self' : to === mine ? 'in' : 'out',
      counterparty: (to === mine ? from : to) as Hex,
      token: t.token.toLowerCase() as Hex,
      canonical: t.token.toLowerCase() === usdt.hex,
      symbol: t.tokenSymbol,
      name: t.tokenName,
      decimals: t.decimals,
      value: t.value,
    })
  }
  const order = (e: HistoryEntry) => e.blockNumber ?? BigInt(e.timestamp ?? 0)
  out.sort((a, b) => (order(b) > order(a) ? 1 : order(b) < order(a) ? -1 : 0))
  return out.slice(0, MAX_ENTRIES)
}

async function evmTransfers(chain: ChainKey, me: Hex, coverage: string[]): Promise<TokenTransfer[]> {
  const a = adapterFor(chain) as EvmAdapter
  const usdt = canonicalUsdt(chain)
  const meTopic = addressToTopic(me)
  const head = await a.getHead()
  const chunk = BigInt(a.logChunk)
  const transfers: TokenTransfer[] = []
  const maxBlocks = BigInt(CHAINS[chain].logWindow)
  let from = head
  let reached = head + 1n
  while (head - from < maxBlocks && from > 0n) {
    const lo = from >= chunk ? from - chunk + 1n : 0n
    try {
      const parts = await Promise.all([
        a.getLogs({ address: usdt.hex, topics: [TRANSFER_TOPIC, null, meTopic], fromBlock: lo, toBlock: from }),
        a.getLogs({ address: usdt.hex, topics: [TRANSFER_TOPIC, meTopic], fromBlock: lo, toBlock: from }),
      ])
      for (const l of parts.flat()) {
        if (l.topics.length !== 3 || l.data.length !== 66) continue
        transfers.push({
          txHash: l.txHash,
          blockNumber: l.blockNumber,
          timestamp: null,
          token: l.address,
          tokenName: null,
          tokenSymbol: null,
          decimals: null,
          from: topicToAddress(l.topics[1]!),
          to: topicToAddress(l.topics[2]!),
          value: BigInt(l.data),
          txFrom: null,
        })
      }
      reached = lo
      from = lo - 1n
    } catch {
      break
    }
  }
  const span = head - reached + 1n
  coverage.push(
    span > 0n
      ? `Real USDT transfers: last ${span.toString()} blocks (${reached}–${head}) from public RPCs. Older history needs an indexer.`
      : 'Real USDT history: public RPCs refused log queries. Try again later.',
  )

  const ex = await a.listTokenTransfers(me)
  if (ex.available) {
    transfers.push(...ex.value)
    coverage.push('Other tokens (including fakes) come from the explorer index.')
  } else {
    coverage.push(`Fake or other tokens sent to you are not listed here (${ex.reason}). New ones are still caught live while this page is open.`)
  }
  return transfers
}

export async function loadHistory(chain: ChainKey, me: Hex): Promise<{ entries: HistoryEntry[]; coverage: string[] }> {
  const coverage: string[] = []
  let transfers: TokenTransfer[] = []
  try {
    if (CHAINS[chain].family === 'tron') {
      transfers = (await (adapterFor(chain) as TronAdapter).listTrc20(me)).transfers
      coverage.push('TRC20 transfers (including fake tokens): last confirmed events from TronGrid.')
    } else {
      transfers = await evmTransfers(chain, me, coverage)
    }
  } catch (e) {
    coverage.push(`History unavailable right now (${errMsg(e)}).`)
  }
  const entries = toHistory(chain, me, transfers)

  // Timestamps for the newest rows (one block read each, capped).
  const a = adapterFor(chain)
  const blocks = [...new Set(entries.filter((e) => e.timestamp === null && e.blockNumber !== null).slice(0, 25).map((e) => e.blockNumber!))]
  const times = new Map<bigint, number | null>()
  await Promise.all(blocks.map(async (b) => times.set(b, await a.getBlockTimestamp(b))))
  for (const e of entries) if (e.timestamp === null && e.blockNumber !== null) e.timestamp = times.get(e.blockNumber) ?? null

  // Names for tokens the history did not name (self-reported text, used only to warn).
  const unnamed = [...new Set(entries.filter((e) => !e.canonical && e.symbol === null && e.name === null).map((e) => e.token))].slice(0, 8)
  const names = new Map<Hex, { symbol: string | null; name: string | null }>()
  await Promise.all(
    unnamed.map(async (t) => {
      try {
        const p = await probeToken(a, t, null, null)
        names.set(t, { symbol: p.symbol, name: p.name })
      } catch {
        /* a token that cannot be read stays unnamed */
      }
    }),
  )
  for (const e of entries) {
    const n = names.get(e.token)
    if (n) {
      e.symbol = n.symbol
      e.name = n.name
    }
  }
  return { entries, coverage }
}

/** Real USDT held right now, base units (null when the chain could not be read). */
export async function loadBalance(chain: ChainKey, me: Hex): Promise<bigint | null> {
  try {
    return await balanceOf(adapterFor(chain), canonicalUsdt(chain).hex, me)
  } catch {
    return null
  }
}

export type Flag = 'fake-usdt' | 'other-token' | 'dust' | 'zero' | 'lookalike'

export interface FlaggedEntry extends HistoryEntry {
  flags: Flag[]
  /** The known address this counterparty imitates, when flagged 'lookalike'. */
  imitates?: Hex
  trusted: boolean
}

/**
 * Pure: marks rows that deserve a second look, without any network call.
 * `trusted` = addresses the user saved. Addresses the user really paid (>= 1 USDT out) count too.
 */
export function flagEntries(chain: ChainKey, entries: HistoryEntry[], trusted: Hex[]): FlaggedEntry[] {
  const usdt = canonicalUsdt(chain)
  const one = 10n ** BigInt(usdt.decimals)
  const known = new Set<Hex>(trusted.map((t) => t.toLowerCase() as Hex))
  for (const e of entries) if (e.canonical && e.direction === 'out' && e.value >= one) known.add(e.counterparty)
  const knownDisplay = [...known].map((k) => ({ hex: k, shown: displayAddress(chain, k) }))
  const trustedSet = new Set(trusted.map((t) => t.toLowerCase()))

  return entries.map((e) => {
    const flags: Flag[] = []
    if (!e.canonical) flags.push(analyzeName(e.name ?? '', e.symbol ?? '').some((n) => n.code === 'usdt-lookalike') ? 'fake-usdt' : 'other-token')
    if (e.value === 0n) flags.push('zero')
    else if (e.canonical && e.direction === 'in' && e.value < one) flags.push('dust')
    let imitates: Hex | undefined
    if (!known.has(e.counterparty)) {
      const shown = displayAddress(chain, e.counterparty)
      const hit = knownDisplay.find((k) => isLookalike(shown, k.shown))
      if (hit) {
        flags.push('lookalike')
        imitates = hit.hex
      }
    }
    return { ...e, flags, imitates, trusted: trustedSet.has(e.counterparty) }
  })
}
