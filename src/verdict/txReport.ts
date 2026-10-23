// "What is in this transaction and what looks wrong?" Pure: takes already-fetched evidence.
// Unlike verifyTx it needs no expected recipient, so it cannot say a payment reached *you*.
// It lists every party and token, judges each token by address (L2), and reports problems.

import type { Hex, NormLog, NormReceipt } from '../chains/types'
import type { ChainKey } from '../registry/chains'
import { canonicalUsdt, type CanonicalToken } from '../registry/usdt'
import { displayAddress } from '../lib/address'
import { isLookalike } from '../lib/lookalike'
import type { TokenCheckResult } from './tokenCheck'
import { decodeTransfer, formatUnits, TRANSFER_TOPIC } from './transfer'
import type { Check } from './types'
import type { CodeState } from './wallet'

export type Level = 'bad' | 'warn' | 'info' | 'ok'

export interface Problem {
  level: Level
  text: string
}

export interface ReportTransfer {
  from: Hex
  to: Hex
  value: bigint
  logIndex: number
}

export interface ReportToken extends TokenCheckResult {
  token: Hex
  name: string | null
  symbol: string | null
  /** Decimals for display. Real USDT: from the registry. Others: what the token reports (untrusted). */
  decimals?: number | null
  transfers: ReportTransfer[]
}

export interface ReportParty {
  address: Hex
  roles: string[]
  code: CodeState | null
}

export type Headline = 'NOT ON CHAIN' | 'BLOCK HASH' | 'FAILED TX' | 'FAKE USDT FOUND' | 'PROBLEMS FOUND' | 'NO RED FLAGS'

export interface ReportInput {
  chain: ChainKey
  hash: string
  isBlockHash: boolean
  /** Checks already produced by the shared L1 rules (found / consensus / status / finality). */
  checks: Check[]
  receipt: NormReceipt | null
  /** Judgment per emitting contract; missing entries are treated as UNKNOWN. */
  tokens: Map<Hex, Omit<ReportToken, 'transfers' | 'token'>>
  codes: Map<Hex, CodeState>
}

export interface TxReport {
  headline: Headline
  problems: Problem[]
  tokens: ReportToken[]
  parties: ReportParty[]
  /** Net real-USDT change per address, formatted. */
  net: { address: Hex; value: bigint; formatted: string }[]
  other721: number
}

const DUST_UNITS = 1n

function groupTransfers(receipt: NormReceipt, usdt: CanonicalToken): { byToken: Map<Hex, ReportTransfer[]>; nft: number } {
  const byToken = new Map<Hex, ReportTransfer[]>()
  let nft = 0
  for (const log of receipt.logs as NormLog[]) {
    if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue
    if (log.topics.length === 4) {
      nft++
      continue
    }
    const d = decodeTransfer(log, usdt)
    if (!d) continue
    const list = byToken.get(d.token) ?? []
    list.push({ from: d.from, to: d.to, value: d.value, logIndex: d.logIndex })
    byToken.set(d.token, list)
  }
  return { byToken, nft }
}

export function buildReport(inp: ReportInput): TxReport {
  const usdt = canonicalUsdt(inp.chain)
  const show = (h: Hex) => displayAddress(inp.chain, h)
  const problems: Problem[] = []
  const empty = (headline: Headline): TxReport => ({ headline, problems, tokens: [], parties: [], net: [], other721: 0 })

  if (inp.isBlockHash) {
    problems.push({ level: 'bad', text: 'This is a block hash, not a transaction hash. It proves nothing about a payment.' })
    return empty('BLOCK HASH')
  }
  const failed = inp.checks.filter((c) => c.status === 'fail')
  const notReceived = failed.find((c) => c.notReceived)
  if (notReceived) {
    problems.push({ level: 'bad', text: notReceived.reason })
    return empty('NOT ON CHAIN')
  }
  if (!inp.receipt) {
    for (const c of inp.checks.filter((x) => x.status !== 'pass')) problems.push({ level: 'warn', text: c.reason })
    if (problems.length === 0) problems.push({ level: 'warn', text: 'No provider returned this transaction. Try again later.' })
    return empty('PROBLEMS FOUND')
  }
  if (inp.receipt.status === 'reverted') {
    problems.push({ level: 'bad', text: 'The transaction failed (reverted). No tokens moved, whatever an explorer row, screenshot or message says.' })
    return empty('FAILED TX')
  }
  for (const c of inp.checks) {
    if (c.status === 'warn' || c.status === 'skip') problems.push({ level: 'warn', text: c.reason })
    else if (c.status === 'fail') problems.push({ level: 'bad', text: c.reason })
  }

  const { byToken, nft } = groupTransfers(inp.receipt, usdt)
  const tokens: ReportToken[] = []
  for (const [token, transfers] of byToken) {
    const j = inp.tokens.get(token) ?? {
      verdict: 'UNKNOWN' as const,
      summary: 'Could not read this contract.',
      findings: [],
      nameFindings: [],
      name: null,
      symbol: null,
    }
    tokens.push({ ...j, token, transfers })
  }
  // Real USDT first, then the dangerous ones.
  const rank = { 'REAL USDT': 0, 'FAKE USDT': 1, 'NOT A CONTRACT': 2, UNKNOWN: 3, 'NOT USDT': 4 } as const
  tokens.sort((a, b) => rank[a.verdict] - rank[b.verdict])

  const label = (t: ReportToken) => {
    const n = [t.symbol, t.name].filter(Boolean).join(' / ')
    return `${n ? `“${n}” ` : ''}${show(t.token)}`
  }

  const real = tokens.find((t) => t.verdict === 'REAL USDT')
  const fakes = tokens.filter((t) => t.verdict === 'FAKE USDT')

  if (real) problems.push({ level: 'ok', text: `Real USDT moved in this transaction (${real.transfers.length} transfer(s) from the canonical contract ${usdt.address}).` })
  for (const t of fakes) {
    problems.push({
      level: 'bad',
      text: `FAKE USDT: ${label(t)} calls itself USDT/Tether but is not the real contract. ${t.transfers.length} transfer(s) of it are worthless.`,
    })
  }
  if (fakes.length > 0 && !real) {
    problems.push({ level: 'bad', text: 'No real USDT moved in this transaction. If you were told you were paid USDT, you were not.' })
  } else if (fakes.length > 0 && real) {
    problems.push({ level: 'warn', text: 'Real USDT and a fake lookalike appear together. Only the transfers marked REAL USDT count.' })
  }
  for (const t of tokens) {
    if (t.verdict === 'NOT A CONTRACT') problems.push({ level: 'bad', text: `${show(t.token)} emitted a transfer but has no contract code now (self-destructed or not a real token).` })
    if (t.verdict === 'UNKNOWN') problems.push({ level: 'warn', text: `Could not read ${show(t.token)}. It is not the canonical USDT address.` })
    if (t.verdict === 'NOT USDT') problems.push({ level: 'info', text: `Other token: ${label(t)}. Not USDT; fine if you expected it, fake if someone called it USDT.` })
    for (const f of t.findings) {
      if (f.code === 'impersonates-usdt') continue
      problems.push({ level: f.level === 'high' ? 'bad' : f.level === 'medium' ? 'warn' : 'info', text: `${label(t)}: ${f.detail}` })
    }
  }
  if (nft > 0) problems.push({ level: 'info', text: `${nft} NFT-style Transfer log(s) (4 topics) ignored. They are not token payments.` })

  // Amounts. Tiny or zero transfers are how address poisoning is planted.
  for (const t of tokens) {
    for (const x of t.transfers) {
      if (x.value === 0n) {
        problems.push({
          level: 'warn',
          text: `Zero-value transfer ${show(x.from)} → ${show(x.to)} (${t.verdict === 'REAL USDT' ? 'real USDT' : 'token ' + show(t.token)}). Zero transfers are used to plant lookalike addresses in your history. Never copy an address from history.`,
        })
      } else if (t.verdict === 'REAL USDT' && x.value < DUST_UNITS * 10n ** BigInt(usdt.decimals)) {
        problems.push({
          level: 'warn',
          text: `Real USDT dust: ${formatUnits(x.value, usdt.decimals)} USDT ${show(x.from)} → ${show(x.to)}. Tiny transfers are used to poison address history.`,
        })
      }
    }
  }

  if (byToken.size === 0 && nft === 0) {
    problems.push({
      level: 'warn',
      text: 'This transaction moved no tokens (no Transfer logs). If it was sold to you as a USDT payment, no USDT arrived. It may be a native coin transfer or a plain contract call.',
    })
  }

  // Parties.
  const roles = new Map<Hex, Set<string>>()
  const add = (a: Hex | null, r: string) => {
    if (!a) return
    const k = a.toLowerCase() as Hex
    roles.set(k, (roles.get(k) ?? new Set()).add(r))
  }
  add(inp.receipt.from, 'tx sender')
  add(inp.receipt.to, 'tx target')
  for (const t of tokens) {
    for (const x of t.transfers) {
      add(x.from, t.verdict === 'REAL USDT' ? 'USDT sender' : 'token sender')
      add(x.to, t.verdict === 'REAL USDT' ? 'USDT receiver' : 'token receiver')
    }
  }
  const parties: ReportParty[] = [...roles].map(([address, r]) => ({ address, roles: [...r], code: inp.codes.get(address) ?? null }))

  if (inp.receipt.to && tokens.length > 0) {
    const to = inp.receipt.to.toLowerCase()
    const direct = tokens.some((t) => t.token === to)
    const p = parties.find((x) => x.address === to)
    if (!direct && p?.code?.kind === 'contract') {
      problems.push({ level: 'info', text: `The transaction was sent to a contract (${show(p.address)}), not directly to the token. That is normal for swaps and batch senders; transfers inside it are still listed above.` })
    }
  }
  for (const p of parties) {
    if (p.code?.kind === 'delegated') problems.push({ level: 'warn', text: `${show(p.address)} is an EIP-7702 delegated account (its code was set by someone's authorization).` })
  }
  const seen = new Set<string>()
  for (const a of parties) {
    for (const b of parties) {
      if (a === b) continue
      const key = [a.address, b.address].sort().join()
      if (seen.has(key)) continue
      const m = isLookalike(show(a.address), show(b.address))
      if (m) {
        seen.add(key)
        problems.push({ level: 'warn', text: `${show(a.address)} and ${show(b.address)} look alike (first ${m.prefix} and last ${m.suffix} characters match) but are different addresses.` })
      }
    }
  }

  // Net real USDT.
  const netMap = new Map<Hex, bigint>()
  for (const x of real?.transfers ?? []) {
    netMap.set(x.from, (netMap.get(x.from) ?? 0n) - x.value)
    netMap.set(x.to, (netMap.get(x.to) ?? 0n) + x.value)
  }
  const net = [...netMap].filter(([, v]) => v !== 0n).map(([address, value]) => ({ address, value, formatted: formatUnits(value, usdt.decimals) }))

  const hasBad = problems.some((p) => p.level === 'bad')
  const hasWarn = problems.some((p) => p.level === 'warn')
  const headline: Headline = fakes.length > 0 ? 'FAKE USDT FOUND' : hasBad || hasWarn ? 'PROBLEMS FOUND' : 'NO RED FLAGS'
  return { headline, problems, tokens, parties, net, other721: nft }
}
