// Is this address being attacked, or is it attacking others? Pure rules over the transfers a scan
// already fetched. "Attacking" means the patterns poisoning and fake-USDT campaigns leave behind;
// it is a strong hint, not proof, and the UI says so.

import type { Hex, TokenTransfer } from '../chains/types'
import type { ChainKey } from '../registry/chains'
import { canonicalUsdt } from '../registry/usdt'
import type { WalletAnalysis } from './wallet'

export type Role = 'attacker' | 'victim' | 'both' | 'none'

export interface Behavior {
  role: Role
  /** Why we think it is being attacked. Empty = no sign of it. */
  victim: string[]
  /** Why we think it is attacking others. Empty = no sign of it. */
  attacker: string[]
  /** Addresses that attacked this one. */
  attackers: Hex[]
  /** Addresses this one appears to target. */
  targets: Hex[]
}

/** Distinct counterparties needed before a pattern counts as a campaign. */
export const CAMPAIGN_MIN = 3

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function analyzeBehavior(chain: ChainKey, address: Hex, transfers: TokenTransfer[], wallet: WalletAnalysis): Behavior {
  const usdt = canonicalUsdt(chain)
  const me = address.toLowerCase() as Hex
  const one = 10n ** BigInt(usdt.decimals)
  const dust = one / 100n
  const impersonators = new Set(wallet.fakeTokens.filter((g) => g.impersonatesUsdt).map((g) => g.token))
  const isReal = (t: TokenTransfer) => t.token.toLowerCase() === usdt.hex

  // ---------- being attacked ----------
  const victim: string[] = []
  const attackers = new Set<Hex>()
  const byKind = (k: 'zero-value' | 'lookalike' | 'dust') => wallet.poisoning.filter((p) => p.kind === k)
  const zero = byKind('zero-value')
  const look = byKind('lookalike')
  const dustIn = byKind('dust')
  if (zero.length) victim.push(`${plural(zero.length, 'zero-value transfer')} "from" this address that its owner did not sign. Someone is planting fake entries in its history.`)
  if (look.length) victim.push(`${plural(look.length, 'transfer')} involving addresses that imitate ones it really uses (address poisoning).`)
  if (dustIn.length) victim.push(`${plural(dustIn.length, 'tiny "dust" payment')} from strangers, often the first step of poisoning.`)
  for (const p of wallet.poisoning) attackers.add(p.counterparty)

  const fakeIn = transfers.filter((t) => t.to === me && t.from !== me && impersonators.has(t.token))
  if (fakeIn.length) {
    victim.push(`Received fake USDT ${plural(fakeIn.length, 'time')}. Tokens named like USDT that are worthless.`)
    for (const t of fakeIn) attackers.add(t.from)
  }

  // ---------- attacking others ----------
  const attacker: string[] = []
  const targets = new Set<Hex>()
  const campaign = (list: TokenTransfer[], side: 'to' | 'from') => new Set(list.map((t) => t[side]).filter((x) => x !== me))

  const dustOut = transfers.filter((t) => isReal(t) && t.from === me && t.value > 0n && t.value < dust && (t.txFrom === null || t.txFrom === me))
  const dustTargets = campaign(dustOut, 'to')
  if (dustTargets.size >= CAMPAIGN_MIN) {
    attacker.push(`Sent tiny USDT amounts to ${dustTargets.size} different addresses. Sprinkling dust like this is how poisoners plant their address in other people's history.`)
    for (const x of dustTargets) targets.add(x)
  }

  // A poisoner's lookalike address collects zero-value transfers "from" its victims.
  const zeroIn = transfers.filter((t) => isReal(t) && t.to === me && t.value === 0n)
  const zeroFrom = campaign(zeroIn, 'from')
  if (zeroFrom.size >= CAMPAIGN_MIN) {
    attacker.push(`Received zero-value USDT transfers from ${zeroFrom.size} different addresses. That is the trace a poisoning (lookalike) address leaves in its victims' histories.`)
    for (const x of zeroFrom) targets.add(x)
  }

  const zeroSigned = transfers.filter((t) => t.from === me && t.value === 0n && t.txFrom === me)
  const zeroTargets = campaign(zeroSigned, 'to')
  if (zeroTargets.size >= CAMPAIGN_MIN) {
    attacker.push(`Signed zero-value transfers to ${zeroTargets.size} different addresses.`)
    for (const x of zeroTargets) targets.add(x)
  }

  const fakeOut = transfers.filter((t) => t.from === me && impersonators.has(t.token))
  const fakeTargets = campaign(fakeOut, 'to')
  if (fakeTargets.size >= 2) {
    attacker.push(`Sent fake USDT to ${fakeTargets.size} different addresses. Spreading a lookalike token is how "flash USDT" scams start.`)
    for (const x of fakeTargets) targets.add(x)
  }

  const role: Role = victim.length && attacker.length ? 'both' : attacker.length ? 'attacker' : victim.length ? 'victim' : 'none'
  for (const t of targets) attackers.delete(t)
  return { role, victim, attacker, attackers: [...attackers], targets: [...targets] }
}
