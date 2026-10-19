// L6: explain what a non-canonical token is. This never makes a token "real";
// it only says how it can hurt you.

import { keccak256, toFunctionSelector, toHex } from 'viem'
import type { Hex } from '../chains/types'
import { analyzeName, type NameFinding } from '../lib/homoglyph'

export interface TokenProbe {
  token: Hex
  code: Hex
  name: string | null
  symbol: string | null
  /** EIP-1967 implementation slot value, if read. */
  implSlot: Hex | null
  /** EIP-1967 beacon slot value, if read. */
  beaconSlot: Hex | null
  /** balanceOf(holder) right now. */
  holderBalance: bigint | null
  /** Amount the Transfer event claimed the holder got. */
  loggedValue: bigint | null
  /** balanceOf(a random fresh address). Non-zero means balanceOf lies. */
  randomBalance: bigint | null
  /** eth_call transfer(holder -> other, 1) from holder. null = not simulated. */
  transferSim: { ok: boolean; error?: string } | null
}

export type RiskLevel = 'high' | 'medium' | 'info'

export interface RiskFinding {
  code: string
  level: RiskLevel
  detail: string
  vectors: string[]
}

function slotOf(label: string): Hex {
  return toHex(BigInt(keccak256(toHex(label))) - 1n, { size: 32 })
}

export const EIP1967_IMPL_SLOT = slotOf('eip1967.proxy.implementation')
export const EIP1967_BEACON_SLOT = slotOf('eip1967.proxy.beacon')

const SELECTORS: { sig: string; code: string; level: RiskLevel; detail: string; vectors: string[] }[] = [
  { sig: 'mint(address,uint256)', code: 'mint', level: 'medium', detail: 'Owner can mint any amount.', vectors: ['B8'] },
  { sig: 'mint(uint256)', code: 'mint', level: 'medium', detail: 'Owner can mint any amount.', vectors: ['B8'] },
  { sig: 'burn(address,uint256)', code: 'burn-from', level: 'high', detail: 'Can burn tokens out of any address (your "balance" can be removed).', vectors: ['B8'] },
  { sig: 'pause()', code: 'pause', level: 'medium', detail: 'Owner can pause all transfers.', vectors: ['B8', 'B9'] },
  { sig: 'addBlackList(address)', code: 'blacklist', level: 'medium', detail: 'Owner can blacklist holders.', vectors: ['B8', 'B9'] },
  { sig: 'blacklist(address)', code: 'blacklist', level: 'medium', detail: 'Owner can blacklist holders.', vectors: ['B8', 'B9'] },
  { sig: 'setBlacklist(address,bool)', code: 'blacklist', level: 'medium', detail: 'Owner can blacklist holders.', vectors: ['B8', 'B9'] },
  { sig: 'upgradeTo(address)', code: 'upgradeable', level: 'medium', detail: 'Upgradeable: code can change after you receive it.', vectors: ['B10'] },
  { sig: 'upgradeToAndCall(address,bytes)', code: 'upgradeable', level: 'medium', detail: 'Upgradeable: code can change after you receive it.', vectors: ['B10'] },
  { sig: 'owner()', code: 'owner', level: 'info', detail: 'Has an owner with special rights.', vectors: ['B8'] },
]

/** Collects PUSH4 immediates from EVM bytecode (rough but cheap function-selector scan). */
export function push4Selectors(code: Hex): Set<string> {
  const out = new Set<string>()
  const h = code.slice(2).toLowerCase()
  for (let i = 0; i < h.length; i += 2) {
    const op = parseInt(h.slice(i, i + 2), 16)
    if (op === 0x63) {
      out.add(h.slice(i + 2, i + 10))
      i += 8
    } else if (op >= 0x60 && op <= 0x7f) {
      i += (op - 0x5f) * 2
    }
  }
  return out
}

const MINIMAL_PROXY = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/i

function nonZeroSlot(v: Hex | null): Hex | null {
  if (!v || v === '0x') return null
  return BigInt(v) === 0n ? null : (`0x${v.slice(-40)}` as Hex)
}

export function tokenRisk(p: TokenProbe): { findings: RiskFinding[]; nameFindings: NameFinding[] } {
  const findings: RiskFinding[] = []
  const nameFindings = analyzeName(p.name ?? '', p.symbol ?? '')

  for (const n of nameFindings) {
    if (n.code === 'url' || n.code === 'instructions') {
      findings.push({ code: `name-${n.code}`, level: 'high', detail: `${n.detail} Do not visit it, and do not interact with this token.`, vectors: ['A7'] })
    }
  }
  if (nameFindings.some((n) => n.code === 'usdt-lookalike')) {
    findings.push({ code: 'impersonates-usdt', level: 'high', detail: 'Named like USDT but it is not the canonical contract: fake USDT.', vectors: ['A1', 'A2'] })
  }

  if (p.code === '0x' || p.code.length <= 2) {
    findings.push({ code: 'no-code', level: 'high', detail: 'No contract code at this address now (self-destructed, or never a real token).', vectors: ['B8'] })
    return { findings, nameFindings }
  }

  const impl = nonZeroSlot(p.implSlot)
  const beacon = nonZeroSlot(p.beaconSlot)
  const minimal = MINIMAL_PROXY.exec(p.code)
  if (impl || beacon || minimal) {
    const what = impl ? `EIP-1967 implementation ${impl}` : beacon ? `beacon ${beacon}` : `minimal proxy to 0x${minimal![1]}`
    findings.push({ code: 'proxy', level: 'medium', detail: `Proxy contract (${what}). Its behaviour can be swapped later.`, vectors: ['B10'] })
  }

  const sels = push4Selectors(p.code)
  const seen = new Set<string>()
  for (const s of SELECTORS) {
    if (seen.has(s.code)) continue
    if (sels.has(toFunctionSelector(s.sig).slice(2))) {
      seen.add(s.code)
      findings.push({ code: s.code, level: s.level, detail: s.detail, vectors: s.vectors })
    }
  }

  if (p.randomBalance !== null && p.randomBalance > 0n) {
    findings.push({
      code: 'fake-balance',
      level: 'high',
      detail: 'balanceOf() returns a balance for a random fresh address. The balances it reports are fiction.',
      vectors: ['B11'],
    })
  }
  if (p.holderBalance !== null && p.loggedValue !== null && p.holderBalance < p.loggedValue) {
    findings.push({
      code: 'event-without-balance',
      level: 'high',
      detail: 'The Transfer event claims more than the address holds now. Either the event was fake, or the balance was taken back / expired.',
      vectors: ['B8', 'B11', 'B12'],
    })
  }
  if (p.transferSim && !p.transferSim.ok) {
    findings.push({
      code: 'honeypot',
      level: 'high',
      detail: `A simulated transfer by the holder reverts${p.transferSim.error ? ` (${p.transferSim.error})` : ''}. You likely cannot move or sell it.`,
      vectors: ['B9'],
    })
  }
  return { findings, nameFindings }
}
