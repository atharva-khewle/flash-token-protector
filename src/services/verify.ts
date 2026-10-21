// Verify-tx orchestration: fetch evidence, then hand it to the pure rules.

import { encodeFunctionData, decodeFunctionResult, parseAbi } from 'viem'
import { adapterFor } from '../chains'
import type { Hex, NormReceipt, ProviderResult } from '../chains/types'
import type { ChainKey } from '../registry/chains'
import { canonicalUsdt } from '../registry/usdt'
import { wasAccepted } from '../lib/storage'
import { tokenRisk, type RiskFinding } from '../verdict/tokenRisk'
import { verifyTx, type TxContext, type TxResult } from '../verdict/verifyTx'
import { probeToken } from './probe'

const blacklistAbi = parseAbi(['function isBlackListed(address) view returns (bool)'])

export interface DecoyRisk {
  token: Hex
  name: string | null
  symbol: string | null
  findings: RiskFinding[]
}

export interface VerifyOutput extends TxResult {
  chain: ChainKey
  hash: string
  blockTimestamp: number | null
  decoyRisks: DecoyRisk[]
  /** Every server's raw answer, for the 'servers' panel. */
  providers: ProviderResult<NormReceipt>[]
}

async function isBlacklisted(chain: ChainKey, who: Hex): Promise<boolean | null> {
  const usdt = canonicalUsdt(chain)
  if (!usdt.hasBlacklistGetter) return null
  const r = await adapterFor(chain).call(usdt.hex, encodeFunctionData({ abi: blacklistAbi, functionName: 'isBlackListed', args: [who] }))
  if (!r.ok || r.data === '0x') return null
  try {
    return decodeFunctionResult({ abi: blacklistAbi, functionName: 'isBlackListed', data: r.data })
  } catch {
    return null
  }
}

export async function runVerify(args: {
  chain: ChainKey
  hash: string
  hiddenChars: number
  context: TxContext
  watchlist: Hex[]
}): Promise<VerifyOutput> {
  const a = adapterFor(args.chain)
  const [providers, finality] = await Promise.all([a.getReceipt(args.hash), a.getFinality().catch(() => null)])

  const answered = providers.filter((p) => p.ok)
  const nothing = answered.length > 0 && answered.every((p) => p.ok && p.value.status === 'notfound')
  const isBlockHash = nothing ? await a.isBlockHash(args.hash) : false

  const first = answered.find((p) => p.ok && p.value.status === 'success' && p.value.blockNumber !== null)
  const blockNumber = first && first.ok ? first.value.blockNumber : null
  const blockTimestamp = blockNumber !== null ? await a.getBlockTimestamp(blockNumber) : null

  // First pass to learn who sent canonical USDT to the target, then check those senders.
  const base = {
    chain: args.chain,
    hash: args.hash,
    hiddenChars: args.hiddenChars,
    providers,
    finality,
    blockTimestamp,
    context: args.context,
    previouslyAccepted: wasAccepted(args.chain, args.hash),
    watchlist: args.watchlist,
    senderBlacklisted: {} as Record<Hex, boolean | null>,
    isBlockHash,
  }
  const pre = verifyTx(base)
  const senders = pre.canonicalSenders.slice(0, 5)
  const bl = await Promise.all(senders.map((s) => isBlacklisted(args.chain, s)))
  senders.forEach((s, i) => (base.senderBlacklisted[s] = bl[i] ?? null))
  const result = verifyTx(base)

  // L6: explain up to 3 decoy tokens, preferring ones that credit the target.
  const decoyTokens = [...new Map(
    [...result.decoys].sort((x, y) => Number(y.touchesTarget) - Number(x.touchesTarget)).map((d) => [d.token, d] as const),
  ).values()].slice(0, 3)
  const decoyRisks = await Promise.all(
    decoyTokens.map(async (d) => {
      const holder = d.touchesTarget ? (d.to ?? null) : null
      const p = await probeToken(a, d.token, holder, d.touchesTarget ? d.value : null)
      return { token: d.token, name: p.name, symbol: p.symbol, findings: tokenRisk(p).findings }
    }),
  )

  return { ...result, chain: args.chain, hash: args.hash, blockTimestamp, decoyRisks, providers }
}
