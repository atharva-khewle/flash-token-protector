// Check a token contract address against the canonical USDT for a chain. Read-only.

import { adapterFor } from '../chains'
import type { Hex } from '../chains/types'
import type { ChainKey } from '../registry/chains'
import { canonicalUsdt } from '../registry/usdt'
import { judgeToken, type TokenCheckResult } from '../verdict/tokenCheck'
import type { TokenProbe } from '../verdict/tokenRisk'
import { probeToken } from './probe'

export interface TokenCheckOutput extends TokenCheckResult {
  chain: ChainKey
  token: Hex
  name: string | null
  symbol: string | null
}

export async function runTokenCheck(args: { chain: ChainKey; token: Hex }): Promise<TokenCheckOutput> {
  const { chain, token } = args
  const canonical = token.toLowerCase() === canonicalUsdt(chain).hex.toLowerCase()
  // The address alone decides, so the real contract needs no network at all.
  if (canonical) return { ...judgeToken(true, null), chain, token, name: null, symbol: null }
  const a = adapterFor(chain)

  let probe: TokenProbe | null = null
  try {
    // getCode throws when every provider fails, which probeToken would hide as "no code".
    await a.getCode(token)
    probe = await probeToken(a, token, null, null)
  } catch {
    probe = null
  }
  const verdict = judgeToken(canonical, probe)
  return { ...verdict, chain, token, name: probe?.name ?? null, symbol: probe?.symbol ?? null }
}
