// Fetches everything a transaction touches, then hands it to the pure report rules.

import { adapterFor } from '../chains'
import type { Hex, NormReceipt, ProviderResult } from '../chains/types'
import type { ChainKey } from '../registry/chains'
import { canonicalUsdt } from '../registry/usdt'
import { finalityCheck } from '../verdict/finality'
import { judgeToken } from '../verdict/tokenCheck'
import { buildReport, type ReportInput, type TxReport } from '../verdict/txReport'
import { consensusCheck } from '../verdict/verifyTx'
import { TRANSFER_TOPIC } from '../verdict/transfer'
import type { Check } from '../verdict/types'
import { classifyCode, type CodeState } from '../verdict/wallet'
import { probeToken } from './probe'

const MAX_TOKENS = 8
const MAX_PARTIES = 12

export interface TxReportOutput extends TxReport {
  chain: ChainKey
  hash: string
  blockNumber: bigint | null
  /** Contracts beyond the probe limit, left unjudged. */
  skippedTokens: number
  /** Every server's raw answer, for the 'servers' panel. */
  providers: ProviderResult<NormReceipt>[]
}

export async function runTxReport(args: { chain: ChainKey; hash: string; hiddenChars: number }): Promise<TxReportOutput> {
  const { chain, hash } = args
  const a = adapterFor(chain)
  const usdt = canonicalUsdt(chain)
  const [providers, finality] = await Promise.all([a.getReceipt(hash), a.getFinality().catch(() => null)])

  const answered = providers.filter((p) => p.ok)
  const allMissing = answered.length > 0 && answered.every((p) => p.ok && (p.value.status === 'notfound' || p.value.status === 'pending'))
  const isBlockHash = allMissing ? await a.isBlockHash(hash) : false

  const checks: Check[] = []
  let receipt = null as ReportInput['receipt']
  if (allMissing) {
    const pending = answered.some((p) => p.ok && p.value.status === 'pending')
    checks.push({
      id: 'L1.found',
      layer: 'L1',
      status: 'fail',
      required: true,
      notReceived: true,
      reason: pending
        ? 'Transaction is pending (not in any block). It can still be replaced or dropped.'
        : 'No provider knows this transaction on this chain. Check the chain selected, or it was never broadcast / was dropped.',
    })
  } else {
    const c = consensusCheck(providers)
    checks.push(c.check)
    receipt = c.receipt
    if (receipt && receipt.status === 'success' && receipt.blockNumber !== null) {
      checks.push(finalityCheck(chain, receipt.blockNumber, finality))
    }
  }

  const tokens: ReportInput['tokens'] = new Map()
  const codes: ReportInput['codes'] = new Map()
  let skippedTokens = 0

  if (receipt && receipt.status === 'success') {
    const emitters = [...new Set(receipt.logs.filter((l) => l.topics[0]?.toLowerCase() === TRANSFER_TOPIC && l.topics.length === 3).map((l) => l.address.toLowerCase() as Hex))]
    // Real USDT needs no reads. Judge the rest, capped so a spam tx cannot fan out.
    const others = emitters.filter((t) => t !== usdt.hex)
    skippedTokens = Math.max(0, others.length - MAX_TOKENS)
    if (emitters.includes(usdt.hex)) tokens.set(usdt.hex, { ...judgeToken(true, null), name: null, symbol: null })
    await Promise.all(
      others.slice(0, MAX_TOKENS).map(async (t) => {
        let probe = null
        try {
          await a.getCode(t)
          probe = await probeToken(a, t, null, null)
        } catch {
          probe = null
        }
        tokens.set(t, { ...judgeToken(false, probe), name: probe?.name ?? null, symbol: probe?.symbol ?? null })
      }),
    )

    const addrs = new Set<Hex>()
    for (const x of [receipt.from, receipt.to]) if (x) addrs.add(x.toLowerCase() as Hex)
    for (const l of receipt.logs) {
      if (l.topics[0]?.toLowerCase() !== TRANSFER_TOPIC || l.topics.length !== 3) continue
      addrs.add(`0x${l.topics[1]!.slice(-40)}`.toLowerCase() as Hex)
      addrs.add(`0x${l.topics[2]!.slice(-40)}`.toLowerCase() as Hex)
    }
    await Promise.all(
      [...addrs].slice(0, MAX_PARTIES).map(async (x) => {
        try {
          codes.set(x, classifyCode(await a.getCode(x)) as CodeState)
        } catch {
          /* code kind is optional context */
        }
      }),
    )
  }

  const report = buildReport({ chain, hash, isBlockHash, checks, receipt, tokens, codes })
  if (skippedTokens > 0) report.problems.push({ level: 'warn', text: `${skippedTokens} more token contract(s) in this transaction were not checked (limit ${MAX_TOKENS}). A transaction touching this many tokens is unusual.` })
  return { ...report, chain, hash, blockNumber: receipt?.blockNumber ?? null, skippedTokens, providers }
}
