// L1: when the public servers answer differently, work out who is behind, who is limited and who
// actually conflicts, and say what that probably means. Pure: takes the answers already fetched.

import type { NormReceipt, ProviderResult } from '../chains/types'
import { providerNote, type ProviderNote } from '../registry/providers'

export type Answer = 'mined' | 'failed' | 'pending' | 'notfound' | 'error'
export type Role = 'agrees' | 'behind' | 'limited' | 'conflicts' | 'alone'

export interface ProviderRow {
  provider: string
  answer: Answer
  /** What the server said, in words. */
  said: string
  head: bigint | null
  ms: number | null
  role: Role
  why: string
  note: ProviderNote
}

export type Outcome = 'agree' | 'single' | 'conflict' | 'none-found' | 'no-answer'

export interface ProviderAnalysis {
  rows: ProviderRow[]
  outcome: Outcome
  /** The receipt the majority of servers returned (never a "not found" when a server has it mined). */
  receipt: NormReceipt | null
  agreeing: number
  summary: string
  likely: string[]
  believe: string
}

export function receiptFingerprint(r: NormReceipt): string {
  const logs = r.logs
    .map((l) => `${l.address.toLowerCase()}|${l.topics.map((t) => t.toLowerCase()).join(',')}|${l.data.toLowerCase()}`)
    .join(';')
  return [r.status, r.blockNumber?.toString() ?? '-', (r.blockHash ?? '-').toLowerCase(), logs].join('#')
}

function errorWhy(raw: string): string {
  const lines = raw.split('\n').filter((l) => !/^(URL|Request body):/.test(l.trim()))
  const e = lines.join(' ')
  if (/429|too many|rate limit|limit exceeded|empty reply|reached .*limit|upgrade/i.test(e)) {
    return 'Rate-limited: this free server refused because it gets too many requests. Not a sign of fraud.'
  }
  if (/archive|personal token/i.test(e)) return 'This free server only serves recent data without an account. Not a sign of fraud.'
  if (/fetch|ENOTFOUND|ECONN|TLS|certificate|timeout|network|abort|HTTP request failed|HTTP 5\d\d/i.test(e)) {
    return 'Could not be reached from your network (blocked by your internet provider or firewall, down, or too slow).'
  }
  if (/malformed|missing fields/i.test(e)) return 'Sent an incomplete answer, so it was ignored.'
  return `Error: ${(lines[0] ?? raw).slice(0, 120)}`
}

const mined = (r: NormReceipt) => (r.status === 'success' || r.status === 'reverted') && r.blockNumber !== null

export function analyzeProviders(providers: ProviderResult<NormReceipt>[]): ProviderAnalysis {
  const groups = new Map<string, { receipt: NormReceipt; members: string[] }>()
  for (const p of providers) {
    if (!p.ok || !mined(p.value)) continue
    const fp = receiptFingerprint(p.value)
    const g = groups.get(fp)
    if (g) g.members.push(p.provider)
    else groups.set(fp, { receipt: p.value, members: [p.provider] })
  }
  const best = [...groups.values()].sort((a, b) => b.members.length - a.members.length)[0] ?? null
  const bestFp = best ? receiptFingerprint(best.receipt) : null
  const block = best?.receipt.blockNumber ?? null

  const rows: ProviderRow[] = providers.map((p) => {
    const base = { provider: p.provider, head: p.head ?? null, ms: p.ms ?? null, note: providerNote(p.provider) }
    if (!p.ok) return { ...base, answer: 'error', said: 'No usable answer', role: 'limited', why: errorWhy(p.error) }
    const r = p.value
    if (mined(r)) {
      const said = `${r.status === 'reverted' ? 'Failed' : 'Succeeded'} in block ${r.blockNumber}, ${r.logs.length} event(s)`
      const answer: Answer = r.status === 'reverted' ? 'failed' : 'mined'
      if (receiptFingerprint(r) === bestFp) return { ...base, answer, said, role: 'agrees', why: 'Matches the majority answer.' }
      const b = best!.receipt
      let why: string
      if (r.blockNumber === b.blockNumber && r.blockHash?.toLowerCase() !== b.blockHash?.toLowerCase()) {
        why = 'Same block number but a different block: a chain reorganization in progress, or this server is on a different fork. Wait for the block to be final.'
      } else if (r.blockNumber !== b.blockNumber) {
        why = `Puts the transaction in block ${r.blockNumber} instead of ${b.blockNumber}: usually a reorganization. Wait for finality.`
      } else {
        why = 'Same block but different result or event data. One server is returning wrong data. Do not rely on this transaction until it is resolved.'
      }
      return { ...base, answer, said, role: 'conflicts', why }
    }
    const answer: Answer = r.status === 'pending' ? 'pending' : 'notfound'
    const said = answer === 'pending' ? 'Pending (not in a block)' : 'Not found'
    if (block === null) return { ...base, answer, said, role: 'agrees', why: 'No server has it in a block.' }
    if (base.head !== null && base.head < block) {
      return { ...base, answer, said, role: 'behind', why: `Behind: it only knows up to block ${base.head}, and the transaction is in block ${block} (${block - base.head} block(s) later). It will catch up.` }
    }
    return {
      ...base,
      answer,
      said,
      role: 'conflicts',
      why:
        base.head === null
          ? 'Says it does not have the transaction, and did not report how far it is synced. Possibly behind, possibly wrong.'
          : `Says it does not have it, although it already knows block ${base.head} (the transaction is in ${block}). Either this server is wrong or the others are.`,
    }
  })

  const agreeing = best?.members.length ?? 0
  const conflicts = rows.filter((r) => r.role === 'conflicts')
  const limited = rows.filter((r) => r.role === 'limited')
  const behind = rows.filter((r) => r.role === 'behind')
  const answered = rows.filter((r) => r.answer !== 'error')

  let outcome: Outcome
  if (answered.length === 0) outcome = 'no-answer'
  else if (!best) outcome = 'none-found'
  else if (conflicts.length > 0) outcome = 'conflict'
  else if (agreeing >= 2) outcome = 'agree'
  else outcome = 'single'
  if (best && agreeing === 1 && outcome === 'single') rows.find((r) => r.role === 'agrees')!.role = 'alone'

  const names = (rs: ProviderRow[]) => rs.map((r) => r.provider).join(', ')
  const likely: string[] = []
  if (behind.length) likely.push(`${names(behind)} ${behind.length === 1 ? 'is' : 'are'} a few blocks behind and has not seen the transaction yet. This is normal for free servers.`)
  for (const r of limited) likely.push(`${r.provider}: ${r.why}`)
  for (const r of conflicts) likely.push(`${r.provider}: ${r.why}`)

  let summary: string
  let believe: string
  switch (outcome) {
    case 'agree':
      summary = `${agreeing} independent servers returned the same receipt.${behind.length + limited.length ? ` ${behind.length + limited.length} other(s) were behind or limited and were not counted.` : ''}`
      believe = `Believe the ${agreeing} servers that agree. Servers that are behind or rate-limited do not count against them.`
      break
    case 'single':
      summary = `Only one server (${best!.members[0]}) could return the transaction; the others were behind or limited.`
      believe = `The answer from ${best!.members[0]} is probably right, but one server is not enough proof. Check again in a minute.`
      break
    case 'conflict':
      summary = `Servers disagree: ${agreeing} say one thing, ${conflicts.length} say another.`
      believe =
        agreeing >= 2
          ? `The majority (${names(rows.filter((r) => r.role === 'agrees'))}) is more likely right, but do not accept a payment until all servers agree. Check again in a few minutes.`
          : 'Nobody can be trusted yet. Wait a few minutes and check again; if it persists, check the transaction on the official explorer.'
      if (agreeing >= 2) likely.push('If the disagreement is about a recent block, it usually clears up once the block is final.')
      break
    case 'none-found':
      summary = 'No server has this transaction in a block.'
      believe = 'Nothing was received yet. A pending or unknown transaction is not a payment.'
      break
    default:
      summary = 'No server answered.'
      believe = 'Check your connection and try again. Some networks block public blockchain servers.'
  }
  return { rows, outcome, receipt: best?.receipt ?? null, agreeing, summary, likely, believe }
}
