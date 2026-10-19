// L1 finality. Uses the chain's finalized tag when available,
// otherwise a conservative confirmation count.

import type { ChainKey } from '../registry/chains'
import type { Finality } from '../chains/types'
import type { Check } from './types'

/** Fallback only, used when the provider does not expose finalized/solidified blocks. */
export const MIN_CONFIRMATIONS: Record<ChainKey, number> = {
  bsc: 30,
  eth: 96,
  tron: 20,
}

export function finalityCheck(chain: ChainKey, blockNumber: bigint, f: Finality | null): Check {
  const base = { id: 'L1.finality', layer: 'L1' as const, required: true, vectors: ['C17'] }
  if (!f) return { ...base, status: 'skip', reason: 'Could not read the chain head, so finality is unknown.' }
  const confs = f.head >= blockNumber ? f.head - blockNumber + 1n : 0n
  if (f.finalized !== null) {
    if (blockNumber <= f.finalized) {
      return { ...base, status: 'pass', reason: `Finalized (${confs} confirmations; finalized head ${f.finalized}).` }
    }
    return {
      ...base,
      status: 'warn',
      reason: `Included in block ${blockNumber} but not finalized yet (${confs} confirmations). Wait and check again.`,
    }
  }
  const min = BigInt(MIN_CONFIRMATIONS[chain])
  if (confs >= min) {
    return { ...base, status: 'pass', reason: `${confs} confirmations (finalized tag unavailable; required ${min}).` }
  }
  return { ...base, status: 'warn', reason: `Only ${confs} confirmations; wait for ${min}.` }
}
