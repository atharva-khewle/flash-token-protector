// Verify-tx verdict. Pure: takes everything already fetched, returns checks
// and a verdict. No network calls here, so every rule is unit-testable.

import type { ChainKey } from '../registry/chains'
import { canonicalUsdt } from '../registry/usdt'
import type { Finality, Hex, NormReceipt, ProviderResult } from '../chains/types'
import { displayAddress } from '../lib/address'
import { findLookalikes } from '../lib/lookalike'
import { finalityCheck } from './finality'
import { analyzeProviders, type ProviderAnalysis } from './providers'
import { analyzeTransfers, formatUnits, type Decoy } from './transfer'
import { combine, type Check, type Verdict } from './types'

export interface TxContext {
  /** Expected recipient (hex form). */
  recipient?: Hex
  /** Expected amount in base units of the canonical token. */
  amount?: bigint
  /** Unix seconds. The payment must be in a block at or after this time. */
  notBefore?: number
}

export interface TxEvidence {
  chain: ChainKey
  hash: string
  hiddenChars: number
  providers: ProviderResult<NormReceipt>[]
  finality: Finality | null
  /** Unix seconds of the tx block, if known. */
  blockTimestamp: number | null
  context: TxContext
  /** True if this hash was already accepted locally for an earlier deal. */
  previouslyAccepted: boolean
  /** User's watched addresses (hex form) for lookalike checks. */
  watchlist: Hex[]
  /** Blacklist status of each canonical sender to the target; null = unknown / not supported. */
  senderBlacklisted: Record<Hex, boolean | null>
  /** Set when the hash turned out to be a block hash. */
  isBlockHash?: boolean
}

export interface TxResult {
  verdict: Verdict
  checks: Check[]
  receipt: NormReceipt | null
  target: Hex | null
  /** Net canonical USDT for the target, base units. */
  netToTarget: bigint | null
  netFormatted: string | null
  /** Every address whose canonical USDT balance changed in this tx. */
  net: { address: Hex; value: bigint; formatted: string }[]
  decoys: Decoy[]
  canonicalSenders: Hex[]
}

const DUST_THRESHOLD_USD = 1n

export { receiptFingerprint } from './providers'

/**
 * L1 consensus. Passes only when at least two servers return the identical mined receipt and no
 * server that has seen that block contradicts them. Servers that are behind or rate-limited are
 * reported but do not count against the others.
 */
export function consensusCheck(providers: ProviderResult<NormReceipt>[]): { check: Check; receipt: NormReceipt | null; analysis: ProviderAnalysis } {
  const base = { id: 'L1.consensus', layer: 'L1' as const, required: true, vectors: ['F30'] }
  const analysis = analyzeProviders(providers)
  const firstAnswer = providers.find((p): p is Extract<typeof p, { ok: true }> => p.ok)?.value ?? null
  const receipt = analysis.receipt ?? firstAnswer
  switch (analysis.outcome) {
    case 'no-answer':
      return { check: { ...base, status: 'skip', reason: 'No RPC server answered. Try again later.' }, receipt: null, analysis }
    case 'agree':
      return { check: { ...base, status: 'pass', reason: analysis.summary }, receipt, analysis }
    case 'single':
      return { check: { ...base, status: 'warn', reason: `${analysis.summary} Two matching answers are required.` }, receipt, analysis }
    case 'conflict':
      return { check: { ...base, status: 'warn', reason: `${analysis.summary} ${analysis.believe}` }, receipt, analysis }
    default:
      return { check: { ...base, status: 'pass', reason: analysis.summary }, receipt, analysis }
  }
}

export function verifyTx(ev: TxEvidence): TxResult {
  const usdt = canonicalUsdt(ev.chain)
  const show = (h: Hex) => displayAddress(ev.chain, h)
  const checks: Check[] = []
  const empty: TxResult = {
    verdict: 'UNVERIFIED',
    checks,
    receipt: null,
    target: null,
    netToTarget: null,
    netFormatted: null,
    net: [],
    decoys: [],
    canonicalSenders: [],
  }

  checks.push({
    id: 'L0.format',
    layer: 'L0',
    status: 'pass',
    required: true,
    reason:
      ev.hiddenChars > 0
        ? `Valid hash. Removed ${ev.hiddenChars} hidden character(s) from the pasted text.`
        : 'Valid hash format for this chain.',
    vectors: ['C20'],
  })

  if (ev.isBlockHash) {
    checks.push({
      id: 'L0.kind',
      layer: 'L0',
      status: 'fail',
      required: true,
      reason: 'This is a block hash, not a transaction hash. It proves nothing about a payment.',
      vectors: ['C20'],
    })
    return { ...empty, verdict: combine(checks) }
  }

  const { check: consensus, receipt } = consensusCheck(ev.providers)
  const statuses = ev.providers.filter((p) => p.ok).map((p) => (p.ok ? p.value.status : 'notfound'))
  const allMissing = statuses.length > 0 && statuses.every((s) => s === 'notfound' || s === 'pending')

  if (allMissing) {
    const pending = statuses.includes('pending')
    checks.push({
      id: 'L1.found',
      layer: 'L1',
      status: 'fail',
      required: true,
      notReceived: true,
      reason: pending
        ? 'Transaction is pending (not in any block). It can still be replaced or dropped. Nothing has been received.'
        : 'No provider knows this transaction on this chain. Check the chain, or it was never broadcast / was dropped.',
      vectors: ['C16', 'A5'],
    })
    const unreachable = ev.providers.filter((p) => !p.ok).length
    if (unreachable > 0) checks.push({
      id: 'L1.unreachable',
      layer: 'L1',
      status: 'warn',
      required: false,
      reason: `${unreachable} server(s) could not answer, so a very recent transaction may be missing here. Check again in a minute.`,
    })
    return { ...empty, verdict: combine(checks) }
  }

  checks.push(consensus)
  if (!receipt) return { ...empty, checks, verdict: combine(checks) }

  if (receipt.status === 'reverted') {
    checks.push({
      id: 'L1.status',
      layer: 'L1',
      status: 'fail',
      required: true,
      reason: 'Transaction failed (status 0 / reverted). Nothing moved, whatever the input data or screenshot says.',
      vectors: ['C15'],
    })
    return { ...empty, checks, receipt, verdict: combine(checks) }
  }
  if (receipt.status !== 'success' || receipt.blockNumber === null) {
    checks.push({
      id: 'L1.status',
      layer: 'L1',
      status: 'fail',
      required: true,
      notReceived: true,
      reason: 'Transaction is not in a block yet.',
      vectors: ['C16'],
    })
    return { ...empty, checks, receipt, verdict: combine(checks) }
  }
  checks.push({ id: 'L1.status', layer: 'L1', status: 'pass', required: true, reason: `Succeeded in block ${receipt.blockNumber}.`, vectors: ['C15'] })
  checks.push(finalityCheck(ev.chain, receipt.blockNumber, ev.finality))

  // L2 + L3
  const preliminary = analyzeTransfers(receipt.logs, usdt, ev.context.recipient ?? null)
  let target: Hex | null = ev.context.recipient ?? null
  if (!target) {
    const gainers = [...preliminary.net.entries()].filter(([, v]) => v > 0n)
    if (gainers.length === 1) target = gainers[0]![0]
  }
  const analysis = target ? analyzeTransfers(receipt.logs, usdt, target) : preliminary
  const net = [...analysis.net.entries()]
    .filter(([, v]) => v !== 0n)
    .map(([address, value]) => ({ address, value, formatted: formatUnits(value, usdt.decimals) }))
  const netToTarget = target ? analysis.net.get(target) ?? 0n : null
  const canonicalSenders = target
    ? [...new Set(analysis.canonical.filter((t) => t.to === target).map((t) => t.from))]
    : []

  if (analysis.canonical.length === 0) {
    const usdtLike = analysis.decoys.length > 0
    checks.push({
      id: 'L2.identity',
      layer: 'L2',
      status: 'fail',
      required: true,
      reason: usdtLike
        ? `No canonical USDT moved. ${analysis.decoys.length} Transfer event(s) come from other contracts: these are not USDT, whatever they are named.`
        : `No canonical USDT (${usdt.address}) transfer in this transaction.`,
      vectors: ['A1', 'A2', 'A3', 'A4', 'C13'],
    })
  } else {
    checks.push({
      id: 'L2.identity',
      layer: 'L2',
      status: 'pass',
      required: true,
      reason: `Canonical USDT contract ${usdt.address} (${usdt.decimals} decimals) emitted ${analysis.canonical.length} transfer(s).`,
      vectors: ['A1', 'A2', 'A3', 'A4', 'C13'],
    })
  }

  if (analysis.canonical.length > 0) {
    if (!target) {
      checks.push({
        id: 'L3.net',
        layer: 'L3',
        status: 'skip',
        required: true,
        reason: 'Several addresses gained USDT. Enter your receiving address to see what you got.',
        vectors: ['C19'],
      })
    } else if (netToTarget! <= 0n) {
      checks.push({
        id: 'L3.net',
        layer: 'L3',
        status: 'fail',
        required: true,
        reason: `Net canonical USDT to ${show(target)} is ${formatUnits(netToTarget!, usdt.decimals)}. This address did not receive USDT in this tx.`,
        vectors: ['C18', 'C19'],
      })
    } else {
      const dust = netToTarget! < DUST_THRESHOLD_USD * 10n ** BigInt(usdt.decimals)
      checks.push({
        id: 'L3.net',
        layer: 'L3',
        status: dust ? 'warn' : 'pass',
        required: true,
        reason: dust
          ? `Net received is only ${formatUnits(netToTarget!, usdt.decimals)} USDT (dust). Typical of address-poisoning, not a payment.`
          : `Net received: ${formatUnits(netToTarget!, usdt.decimals)} USDT (after any outflows in the same tx).`,
        vectors: ['C19', 'A6', 'D22'],
      })
    }
  }

  const decoysOnTarget = analysis.decoys.filter((d) => d.touchesTarget)
  if (analysis.decoys.length > 0) {
    checks.push({
      id: 'L3.decoys',
      layer: 'L3',
      status: decoysOnTarget.length > 0 && analysis.canonical.length > 0 ? 'warn' : 'pass',
      required: false,
      reason:
        decoysOnTarget.length > 0
          ? `${decoysOnTarget.length} non-USDT Transfer event(s) also credit your address. They are excluded from the amount. A real payer has no reason to add them.`
          : `${analysis.decoys.length} non-USDT Transfer event(s) in this tx (e.g. swap legs). Excluded from the amount.`,
      vectors: ['C14'],
    })
  }

  // L4
  if (ev.context.recipient) {
    const got = netToTarget ?? 0n
    checks.push({
      id: 'L4.recipient',
      layer: 'L4',
      status: got > 0n ? 'pass' : 'fail',
      required: true,
      reason: got > 0n ? 'Your address received canonical USDT in this tx.' : 'Your address is not the USDT recipient in this tx.',
      vectors: ['C18'],
    })
  } else {
    checks.push({
      id: 'L4.recipient',
      layer: 'L4',
      status: 'skip',
      required: true,
      reason: 'No expected recipient given. A real tx to someone else looks identical. Enter your address.',
      vectors: ['C18'],
    })
  }

  if (ev.context.amount !== undefined) {
    const got = netToTarget ?? 0n
    const exp = ev.context.amount
    checks.push({
      id: 'L4.amount',
      layer: 'L4',
      status: got >= exp ? 'pass' : 'fail',
      required: false,
      reason:
        got >= exp
          ? got === exp
            ? `Amount matches: ${formatUnits(exp, usdt.decimals)} USDT.`
            : `Received ${formatUnits(got, usdt.decimals)} USDT, more than the expected ${formatUnits(exp, usdt.decimals)}.`
          : `Received ${formatUnits(got, usdt.decimals)} USDT, expected ${formatUnits(exp, usdt.decimals)}.`,
      vectors: ['C18', 'C14', 'A6'],
    })
  }

  if (ev.context.notBefore !== undefined) {
    if (ev.blockTimestamp === null) {
      checks.push({ id: 'L4.time', layer: 'L4', status: 'skip', required: true, reason: 'Block time unknown, cannot check "not before".', vectors: ['C18'] })
    } else {
      const okTime = ev.blockTimestamp >= ev.context.notBefore
      checks.push({
        id: 'L4.time',
        layer: 'L4',
        status: okTime ? 'pass' : 'fail',
        required: true,
        reason: okTime
          ? `Mined at ${new Date(ev.blockTimestamp * 1000).toISOString()}, after your start time.`
          : `Mined at ${new Date(ev.blockTimestamp * 1000).toISOString()}, BEFORE this deal started. An old payment is being reused as proof.`,
        vectors: ['C18'],
      })
    }
  }

  checks.push(
    ev.previouslyAccepted
      ? {
          id: 'L4.reuse',
          layer: 'L4',
          status: 'warn',
          required: false,
          reason: 'You already accepted this exact tx hash before (stored in this browser). The same payment may be shown to you twice.',
          vectors: ['C18'],
        }
      : { id: 'L4.reuse', layer: 'L4', status: 'pass', required: false, reason: 'Not seen before in this browser.', vectors: ['C18'] },
  )

  // L5
  const watch = ev.watchlist.map((w) => show(w))
  const suspicious: string[] = []
  for (const s of canonicalSenders) {
    for (const m of findLookalikes(show(s), watch)) suspicious.push(`sender ${show(s)} imitates your ${m.target}`)
  }
  if (target) for (const m of findLookalikes(show(target), watch)) suspicious.push(`recipient ${show(target)} imitates your ${m.target}`)
  checks.push(
    watch.length === 0
      ? { id: 'L5.lookalike', layer: 'L5', status: 'skip', required: false, reason: 'Watchlist empty. Add your addresses to catch lookalikes.', vectors: ['D22', 'D23'] }
      : suspicious.length > 0
        ? { id: 'L5.lookalike', layer: 'L5', status: 'warn', required: false, reason: `Lookalike address: ${suspicious.join('; ')}.`, vectors: ['D22', 'D23'] }
        : { id: 'L5.lookalike', layer: 'L5', status: 'pass', required: false, reason: 'No lookalike of your watched addresses involved.', vectors: ['D22', 'D23'] },
  )

  const bl = canonicalSenders.map((s) => [s, ev.senderBlacklisted[s] ?? null] as const)
  const listed = bl.filter(([, v]) => v === true).map(([s]) => s)
  const unknown = bl.some(([, v]) => v === null)
  checks.push(
    listed.length > 0
      ? {
          id: 'L5.blacklist',
          layer: 'L5',
          status: 'warn',
          required: false,
          reason: `Sender ${listed.map(show).join(', ')} is on Tether's blacklist. Funds from it may get your exchange account frozen.`,
          vectors: ['F31'],
        }
      : unknown || !usdt.hasBlacklistGetter
        ? {
            id: 'L5.blacklist',
            layer: 'L5',
            status: 'skip',
            required: false,
            reason: usdt.hasBlacklistGetter ? 'Blacklist status could not be read.' : 'This USDT contract has no public blacklist getter. Source risk not checked.',
            vectors: ['F31'],
          }
        : { id: 'L5.blacklist', layer: 'L5', status: 'pass', required: false, reason: 'Sender is not on the Tether blacklist (on-chain getter).', vectors: ['F31'] },
  )

  return {
    verdict: combine(checks),
    checks,
    receipt,
    target,
    netToTarget,
    netFormatted: netToTarget === null ? null : formatUnits(netToTarget, usdt.decimals),
    net,
    decoys: analysis.decoys,
    canonicalSenders,
  }
}
