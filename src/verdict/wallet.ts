// Wallet scan rules (L5 + L7). Pure.

import type { ChainKey } from '../registry/chains'
import { canonicalUsdt } from '../registry/usdt'
import type { Hex, TokenTransfer } from '../chains/types'
import { analyzeName } from '../lib/homoglyph'
import { findLookalikes, type LookalikeMatch } from '../lib/lookalike'
import { displayAddress } from '../lib/address'
import { formatUnits } from './transfer'

// ---------- L7: account code (EIP-7702) ----------

export type CodeState =
  | { kind: 'eoa' }
  | { kind: 'delegated'; to: Hex }
  | { kind: 'contract'; size: number }

/** EIP-7702: a delegated EOA has code 0xef0100 || 20-byte address. */
export function classifyCode(code: Hex): CodeState {
  const c = code.toLowerCase()
  if (c === '0x' || c === '0x0') return { kind: 'eoa' }
  if (c.length === 2 + 46 && c.startsWith('0xef0100')) return { kind: 'delegated', to: `0x${c.slice(8)}` as Hex }
  return { kind: 'contract', size: (c.length - 2) / 2 }
}

// ---------- L7: approvals ----------

export interface Allowance {
  token: Hex
  spender: Hex
  amount: bigint
}

export interface ApprovalFinding {
  spender: Hex
  amount: bigint
  formatted: string
  unlimited: boolean
  level: 'high' | 'medium'
}

const UNLIMITED = 2n ** 255n

/** Lists live allowances on canonical USDT. Unlimited ones are high risk. */
export function analyzeApprovals(chain: ChainKey, list: Allowance[], knownSpenders: Hex[] = []): ApprovalFinding[] {
  const usdt = canonicalUsdt(chain)
  const known = new Set(knownSpenders.map((s) => s.toLowerCase()))
  return list
    .filter((a) => a.amount > 0n && !known.has(a.spender.toLowerCase()))
    .map((a) => {
      const unlimited = a.amount >= UNLIMITED
      return {
        spender: a.spender,
        amount: a.amount,
        formatted: unlimited ? 'unlimited' : formatUnits(a.amount, usdt.decimals),
        unlimited,
        level: unlimited ? ('high' as const) : ('medium' as const),
      }
    })
    .sort((x, y) => (x.amount < y.amount ? 1 : x.amount > y.amount ? -1 : 0))
}

// ---------- Tron account permissions ----------

export interface TronPermissionKey {
  address: string
  weight: number
}

export interface TronPermissionFinding {
  level: 'high' | 'info'
  detail: string
}

/**
 * Leaked-seed bait and permission hijack: the owner permission no longer
 * belongs only to the account's own key, so the visible key cannot move funds.
 */
export function analyzeTronPermissions(
  account: string,
  owner: { threshold: number; keys: TronPermissionKey[] } | null,
): TronPermissionFinding[] {
  if (!owner) return [{ level: 'info', detail: 'Account not activated, or permissions not readable.' }]
  const own = owner.keys.find((k) => k.address === account)
  const others = owner.keys.filter((k) => k.address !== account)
  if (!own || own.weight < owner.threshold) {
    return [
      {
        level: 'high',
        detail: `Owner permission is controlled by other key(s): ${others.map((k) => k.address).join(', ') || 'unknown'}. The account's own key cannot move funds alone. Typical of "free wallet with USDT" bait and permission hijacks.`,
      },
    ]
  }
  if (others.length > 0) {
    return [{ level: 'high', detail: `Other key(s) can also act as owner: ${others.map((k) => k.address).join(', ')}.` }]
  }
  return []
}

// ---------- Transfers: real vs fake, poisoning ----------

export interface FakeTokenGroup {
  token: Hex
  name: string | null
  symbol: string | null
  count: number
  impersonatesUsdt: boolean
  nameNotes: string[]
}

export interface PoisonFinding {
  txHash: string
  kind: 'zero-value' | 'lookalike' | 'dust'
  counterparty: Hex
  match: LookalikeMatch | null
  token: Hex
  canonical: boolean
  detail: string
}

export interface WalletAnalysis {
  realIn: { count: number; total: string }
  realOut: { count: number; total: string }
  fakeTokens: FakeTokenGroup[]
  poisoning: PoisonFinding[]
  /** Addresses the user really paid, plus the watchlist. The "trusted" set for lookalikes. */
  counterparties: Hex[]
}

export function analyzeWallet(chain: ChainKey, victim: Hex, transfers: TokenTransfer[], watchlist: Hex[]): WalletAnalysis {
  const usdt = canonicalUsdt(chain)
  const me = victim.toLowerCase() as Hex
  const one = 10n ** BigInt(usdt.decimals)

  let inCount = 0
  let outCount = 0
  let inSum = 0n
  let outSum = 0n
  const fake = new Map<Hex, FakeTokenGroup>()
  const trusted = new Set<Hex>(watchlist.map((w) => w.toLowerCase() as Hex))

  for (const t of transfers) {
    const canonical = t.token.toLowerCase() === usdt.hex
    if (canonical) {
      if (t.to === me && t.from !== me) {
        inCount++
        inSum += t.value
      }
      if (t.from === me && t.to !== me) {
        outCount++
        outSum += t.value
        // Only real-size payments I signed count as "addresses I use".
        if (t.value >= one && (t.txFrom === null || t.txFrom === me)) trusted.add(t.to)
      }
    } else {
      const g = fake.get(t.token) ?? {
        token: t.token,
        name: t.tokenName,
        symbol: t.tokenSymbol,
        count: 0,
        impersonatesUsdt: false,
        nameNotes: [],
      }
      g.count++
      const notes = analyzeName(t.tokenName ?? '', t.tokenSymbol ?? '')
      g.impersonatesUsdt = g.impersonatesUsdt || notes.some((n) => n.code === 'usdt-lookalike')
      g.nameNotes = [...new Set([...g.nameNotes, ...notes.map((n) => n.detail)])]
      fake.set(t.token, g)
    }
  }

  const trustedList = [...trusted]
  const show = (h: Hex) => displayAddress(chain, h)
  const trustedShown = trustedList.map(show)
  const lookalikes = (h: Hex) => findLookalikes(show(h), trustedShown)
  const poisoning: PoisonFinding[] = []
  const seen = new Set<string>()
  for (const t of transfers) {
    const canonical = t.token.toLowerCase() === usdt.hex
    const outgoing = t.from === me
    const counterparty = outgoing ? t.to : t.from
    if (counterparty === me) continue
    const key = `${t.txHash}|${counterparty}`
    if (seen.has(key)) continue

    if (outgoing && t.value === 0n && t.txFrom !== me) {
      seen.add(key)
      poisoning.push({
        txHash: t.txHash,
        kind: 'zero-value',
        counterparty,
        match: lookalikes(counterparty)[0] ?? null,
        token: t.token,
        canonical,
        detail: `Zero-value transfer "from you" to ${show(counterparty)} that you did not sign. It exists only to plant that address in your history.`,
      })
      continue
    }

    const m = lookalikes(counterparty)[0]
    if (m) {
      seen.add(key)
      poisoning.push({
        txHash: t.txHash,
        kind: 'lookalike',
        counterparty,
        match: m,
        token: t.token,
        canonical,
        detail: `${show(counterparty)} imitates ${m.target} (same first ${m.prefix} / last ${m.suffix} characters). Never copy it from history.`,
      })
      continue
    }

    if (!outgoing && canonical && t.value > 0n && t.value < one / 100n) {
      seen.add(key)
      poisoning.push({
        txHash: t.txHash,
        kind: 'dust',
        counterparty,
        match: null,
        token: t.token,
        canonical,
        detail: `Dust (${formatUnits(t.value, usdt.decimals)} USDT) from ${show(counterparty)}. Often the first step of poisoning.`,
      })
    }
  }

  return {
    realIn: { count: inCount, total: formatUnits(inSum, usdt.decimals) },
    realOut: { count: outCount, total: formatUnits(outSum, usdt.decimals) },
    fakeTokens: [...fake.values()].sort((a, b) => Number(b.impersonatesUsdt) - Number(a.impersonatesUsdt) || b.count - a.count),
    poisoning,
    counterparties: trustedList,
  }
}

// ---------- Send check ----------

export type SendCheck =
  | { level: 'known'; detail: string }
  | { level: 'danger'; detail: string; matches: LookalikeMatch[] }
  | { level: 'unknown'; detail: string }

/** Compares a destination with the watchlist and recent real counterparties. */
export function checkDestination(dest: string, watchlist: string[], recent: string[]): SendCheck {
  const d = dest.toLowerCase()
  const all = [...new Set([...watchlist, ...recent].map((a) => a.toLowerCase()))]
  if (all.includes(d)) {
    return { level: 'known', detail: 'Exact match with an address you saved or paid before. Still compare it with where you got it.' }
  }
  const matches = findLookalikes(d, all)
  if (matches.length > 0) {
    return {
      level: 'danger',
      detail: 'This address looks like one you use but is DIFFERENT. This is how address poisoning steals funds. Do not send.',
      matches,
    }
  }
  return { level: 'unknown', detail: 'New address: not in your watchlist or recent payments. Confirm it out of band, never from wallet history.' }
}
