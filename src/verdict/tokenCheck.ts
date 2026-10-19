// "Is this token contract the real USDT?" Identity is the contract address and nothing else (L2).
// Name, symbol and code are only used to explain what a non-canonical contract is.

import type { Hex } from '../chains/types'
import { tokenRisk, type RiskFinding, type TokenProbe } from './tokenRisk'
import type { NameFinding } from '../lib/homoglyph'

export type TokenVerdict = 'REAL USDT' | 'FAKE USDT' | 'NOT USDT' | 'NOT A CONTRACT' | 'UNKNOWN'

export interface TokenCheckResult {
  verdict: TokenVerdict
  summary: string
  findings: RiskFinding[]
  nameFindings: NameFinding[]
}

/** `probe` is null when the chain could not be read. Canonical needs no read: the address decides. */
export function judgeToken(canonical: boolean, probe: TokenProbe | null): TokenCheckResult {
  if (canonical) {
    return {
      verdict: 'REAL USDT',
      summary: 'This is the canonical USDT contract for this chain (exact address match against the built-in registry).',
      findings: [],
      nameFindings: [],
    }
  }
  if (!probe) {
    return {
      verdict: 'UNKNOWN',
      summary: 'The chain could not be read, so nothing is shown about this contract. It is still not the canonical USDT address. Treat it as not USDT.',
      findings: [],
      nameFindings: [],
    }
  }
  if (probe.code === '0x' || probe.code.length <= 2) {
    return {
      verdict: 'NOT A CONTRACT',
      summary: 'There is no contract code at this address on this chain. It is not USDT. Check you picked the right chain.',
      findings: [],
      nameFindings: [],
    }
  }
  const { findings, nameFindings } = tokenRisk(probe)
  if (findings.some((f) => f.code === 'impersonates-usdt')) {
    return {
      verdict: 'FAKE USDT',
      summary: 'This contract presents itself as USDT / Tether but is not the real USDT contract. Anything shown as "USDT" from it is worthless.',
      findings,
      nameFindings,
    }
  }
  return {
    verdict: 'NOT USDT',
    summary: 'This is a different token, not the real USDT. That alone does not make it a scam, but if anyone called it USDT, it is fake.',
    findings,
    nameFindings,
  }
}

export function claimedName(p: Pick<TokenProbe, 'name' | 'symbol'> | null): string {
  if (!p) return ''
  const s = p.symbol ?? ''
  const n = p.name ?? ''
  return s && n ? `${s} / ${n}` : s || n
}

export type { Hex }
