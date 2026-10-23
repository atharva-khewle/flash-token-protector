// Plain-language summaries: what a result means for someone who does not read receipts.
// Fixed rules over the structured result, so the same data always gives the same words.
// Nothing here is sent anywhere, and no AI model is involved.

import type { Hex } from '../chains/types'
import type { ChainKey } from '../registry/chains'
import { CHAINS } from '../registry/chains'
import { canonicalUsdt } from '../registry/usdt'
import { displayAddress } from '../lib/address'
import type { ScanOutput } from '../services/scan'
import type { TokenCheckOutput } from '../services/tokenCheck'
import type { TxReportOutput } from '../services/txReport'
import type { VerifyOutput } from '../services/verify'
import { analyzeProviders } from './providers'
import { formatUnits } from './transfer'

export type Tone = 'good' | 'caution' | 'danger'

export interface Plain {
  tone: Tone
  /** 0 = nothing worrying, 100 = do not accept / do not trust. */
  risk: number
  title: string
  points: string[]
  todo: string[]
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
const toneOf = (risk: number): Tone => (risk < 30 ? 'good' : risk < 70 ? 'caution' : 'danger')
const short = (chain: ChainKey, a: Hex) => {
  const s = displayAddress(chain, a)
  return `${s.slice(0, 6)}…${s.slice(-4)}`
}
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function serversPoint(providers: VerifyOutput['providers']): { point: string | null; risk: number } {
  if (providers.length === 0) return { point: null, risk: 0 }
  const a = analyzeProviders(providers)
  if (a.outcome === 'conflict') {
    return { point: 'The free blockchain servers we ask did not all agree. What you see follows the majority; check again in a few minutes before you rely on it.', risk: 20 }
  }
  if (a.outcome === 'single') return { point: 'Only one blockchain server could confirm this right now. It is probably right, but check again in a minute.', risk: 15 }
  return { point: null, risk: 0 }
}

// ---------- Analyze tx ----------

export function plainTx(r: TxReportOutput): Plain {
  const usdt = canonicalUsdt(r.chain)
  const chainName = CHAINS[r.chain].name
  switch (r.headline) {
    case 'NOT ON CHAIN':
      return {
        tone: 'danger',
        risk: 90,
        title: `This transaction is not on ${chainName}.`,
        points: ['Nothing was paid with this hash on this network. It may be on another network, still pending, or made up.'],
        todo: ['Check you picked the right network.', 'Ask the sender for the correct transaction hash.', 'Do not release goods or money yet.'],
      }
    case 'BLOCK HASH':
      return { tone: 'danger', risk: 85, title: 'That is a block number code, not a payment.', points: ['A block hash proves nothing about a payment to you.'], todo: ['Ask the sender for the transaction hash of the payment.'] }
    case 'FAILED TX':
      return {
        tone: 'danger',
        risk: 95,
        title: 'This transaction failed. No money moved.',
        points: ['A failed transaction can still appear in wallets and explorers, but nothing was transferred.'],
        todo: ['Do not release goods or money for it.'],
      }
  }

  let risk = 10
  const points: string[] = []
  const todo: string[] = []

  const real = r.tokens.find((t) => t.verdict === 'REAL USDT')
  const fakes = r.tokens.filter((t) => t.verdict === 'FAKE USDT' || t.verdict === 'NOT A CONTRACT')
  const others = r.tokens.filter((t) => t.verdict === 'NOT USDT' || t.verdict === 'UNKNOWN')

  if (fakes.length > 0) {
    risk = real ? 80 : 95
    points.push(`${plural(fakes.length, 'token')} in this transaction ${fakes.length === 1 ? 'pretends' : 'pretend'} to be USDT but ${fakes.length === 1 ? 'is' : 'are'} not. ${fakes.length === 1 ? 'It is' : 'They are'} worthless.`)
    if (!real) points.push('No real USDT moved at all.')
    todo.push('If someone says they paid you with this, they did not. Do not release goods or money.')
  }

  const receivers = r.net.filter((n) => n.value > 0n).sort((a, b) => (b.value > a.value ? 1 : -1))
  if (real && receivers.length > 0) {
    const top = receivers.slice(0, 3).map((n) => `${formatUnits(n.value, usdt.decimals)} USDT to ${short(r.chain, n.address)}`)
    points.push(`Real USDT moved: ${top.join('; ')}${receivers.length > 3 ? `; and ${receivers.length - 3} more` : ''}.`)
    todo.push('To confirm it paid you, use Detailed analysis → Verify a payment with your own address.')
  } else if (real) {
    points.push('Real USDT moved, but nobody ended up with more than they started (it only passed through).')
  }

  if (others.length > 0) {
    const names = others.map((t) => t.symbol).filter(Boolean).slice(0, 3)
    points.push(`It also moved ${plural(others.length, 'other token')}${names.length ? ` (${names.join(', ')})` : ''}. That is normal for swaps and is not USDT.`)
  }

  const tiny = r.tokens.some((t) => t.transfers.some((x) => x.value === 0n || (t.verdict === 'REAL USDT' && x.value < 10n ** BigInt(usdt.decimals))))
  if (tiny) {
    risk += 25
    points.push('It contains zero or tiny transfers. Scammers use these to plant lookalike addresses in your history.')
    todo.push('Never copy a receiving address from your wallet history.')
  }

  const dangerous = r.tokens.flatMap((t) => (t.verdict === 'REAL USDT' ? [] : t.findings.filter((f) => f.level === 'high' && f.code !== 'impersonates-usdt')))
  if (dangerous.length > 0) {
    risk += Math.min(30, 15 * dangerous.length)
    points.push('A token in it has dangerous traits (for example a fake balance or it cannot be sold). See the details.')
  }

  if (r.tokens.length === 0) {
    risk += 40
    points.push('It moved no tokens. If it was sold to you as a USDT payment, no USDT arrived. It may be a plain coin transfer or a contract call.')
  }

  if (r.problems.some((p) => /not finalized|confirmations; wait|Only \d+ confirmations/i.test(p.text))) {
    risk += 20
    points.push('It is very recent and not final yet.')
    todo.push('Wait a minute and check again.')
  }

  const s = serversPoint(r.providers)
  if (s.point) {
    risk += s.risk
    points.push(s.point)
  }

  risk = clamp(risk)
  const title =
    fakes.length > 0
      ? real
        ? 'Real USDT moved, but a fake "USDT" is mixed in.'
        : 'Fake USDT. No real USDT was sent.'
      : real
        ? risk < 30
          ? 'Looks normal: real USDT moved.'
          : 'Real USDT moved, with some things to check.'
        : r.tokens.length === 0
          ? 'No tokens moved in this transaction.'
          : 'No USDT in this transaction.'
  if (todo.length === 0) todo.push('Nothing to do. Open the details if you want to see every step.')
  return { tone: toneOf(risk), risk, title, points, todo: [...new Set(todo)] }
}

// ---------- Verify tx ----------

const FAIL_PLAIN: Record<string, string> = {
  'L0.kind': 'This is a block code, not a payment.',
  'L1.status': 'The transaction failed, so nothing moved.',
  'L2.identity': 'The token is not the real USDT. Only the name was copied.',
  'L4.recipient': 'The real USDT in it went to a different address, not yours.',
  'L4.amount': 'Less arrived than expected.',
  'L4.time': 'This payment happened before your deal started. It may be an old payment shown again.',
  'L4.reuse': 'You already accepted this transaction for an earlier deal.',
  'L5.blacklist': 'The sender is frozen by Tether, so this USDT may be unusable.',
  'L5.lookalike': 'The sender imitates an address you use.',
  'L3.net': 'Your address did not end up with the USDT.',
}
const WARN_PLAIN: Record<string, string> = {
  'L1.finality': 'It is not final yet. Wait a minute and check again.',
  'L1.consensus': 'The blockchain servers we ask did not all agree yet. Check again in a few minutes.',
  'L1.unreachable': 'Some blockchain servers could not be reached. Check again in a minute.',
  'L3.net': 'Only a tiny amount arrived.',
  'L4.recipient': 'You did not enter your address, so we cannot tell whether it paid you.',
  'L4.amount': 'You did not enter the expected amount, so the amount was not compared.',
  'L5.lookalike': 'The sender looks like an address you use. Be careful.',
}

export function plainVerify(r: VerifyOutput): Plain {
  const failed = r.checks.filter((c) => c.status === 'fail')
  const unsure = r.checks.filter((c) => c.status === 'warn' || (c.status === 'skip' && c.required))
  switch (r.verdict) {
    case 'VERIFIED':
      return {
        tone: 'good',
        risk: 5,
        title: `Yes. ${r.netFormatted ?? ''} real USDT reached your address.`.replace('Yes.  ', 'Yes. '),
        points: ['It is the real USDT contract, it is final, and two independent blockchain servers agree.'],
        todo: ['If it was an exchange deposit, also check the exchange\'s deposit history.'],
      }
    case 'NOT RECEIVED':
      return {
        tone: 'danger',
        risk: 90,
        title: 'Nothing has arrived.',
        points: failed.map((c) => (c.id === 'L1.found' ? (/pending/i.test(c.reason) ? 'The transaction is still pending and can be cancelled.' : 'This transaction is not on this network.') : FAIL_PLAIN[c.id] ?? c.reason)).slice(0, 3),
        todo: ['Do not release goods or money yet.', 'Check the network and the hash, then try again later.'],
      }
    case 'FAKE':
      return {
        tone: 'danger',
        risk: 95,
        title: 'No. This is not a real USDT payment to you.',
        points: [...new Set(failed.map((c) => FAIL_PLAIN[c.id] ?? c.reason))].slice(0, 3),
        todo: ['Do not release goods or money.'],
      }
    default:
      return {
        tone: 'caution',
        risk: 55,
        title: 'Not proven yet.',
        points: [...new Set(unsure.map((c) => WARN_PLAIN[c.id] ?? c.reason))].slice(0, 4),
        todo: ['Wait and check again before you release anything.'],
      }
  }
}

// ---------- Check token ----------

export function plainToken(r: TokenCheckOutput): Plain {
  const real = canonicalUsdt(r.chain)
  const name = [r.symbol, r.name].filter(Boolean).join(' / ')
  switch (r.verdict) {
    case 'REAL USDT':
      return { tone: 'good', risk: 0, title: 'This is the real USDT.', points: [`It is exactly the official USDT contract on ${CHAINS[r.chain].name}.`], todo: ['Still check that a payment went to your address (Detailed analysis → Verify a payment).'] }
    case 'FAKE USDT':
      return {
        tone: 'danger',
        risk: 98,
        title: 'Fake USDT.',
        points: [`It calls itself ${name ? `"${name}"` : 'USDT'}, but it is a different contract from the real one (${real.address.slice(0, 6)}…${real.address.slice(-4)}).`, 'Anything shown as USDT from this contract is worthless.'],
        todo: ['Do not accept it as payment.', 'Do not interact with it or visit links in its name.'],
      }
    case 'NOT USDT':
      return {
        tone: 'caution',
        risk: 40,
        title: 'This is not USDT.',
        points: [`It is a different token${name ? ` (${name})` : ''}. That is fine if you expected it, but it is not USDT.`],
        todo: ['If someone called it USDT, treat it as fake.'],
      }
    case 'NOT A CONTRACT':
      return { tone: 'danger', risk: 80, title: 'This is not a token.', points: ['There is no contract at this address on this network. It may be a wallet address, or the wrong network.'], todo: ['Check the network and the address.'] }
    default:
      return { tone: 'caution', risk: 60, title: 'Could not check this token right now.', points: ['The blockchain could not be read. It is still not the real USDT address.'], todo: ['Try again in a minute.'] }
  }
}

// ---------- Analyze address ----------

export function plainScan(r: ScanOutput): Plain {
  let risk = 5
  const points: string[] = []
  const todo: string[] = []
  const w = r.wallet

  const fake = w.fakeTokens.filter((g) => g.impersonatesUsdt)
  if (fake.length > 0) {
    risk += 35
    points.push(`${plural(fake.length, 'fake USDT token')} ${fake.length === 1 ? 'was' : 'were'} sent to this address. ${fake.length === 1 ? 'It is' : 'They are'} worthless, whatever the wallet shows.`)
    todo.push('Ignore fake tokens. Do not try to sell or swap them; that is often how drainers get approval.')
  }
  if (w.poisoning.length > 0) {
    risk += 30
    points.push(`${plural(w.poisoning.length, 'suspicious tiny or zero transfer')} came from addresses that may imitate ones you use (address poisoning).`)
    todo.push('Never copy a receiving address from your history. Use the original source or a saved contact.')
  }
  const high = r.approvals.filter((a) => a.level === 'high')
  if (r.approvals.length > 0) {
    risk += high.length > 0 ? 30 : 15
    points.push(`${plural(r.approvals.length, 'app')} can spend this address's USDT${high.length ? ` (${high.length} without a limit)` : ''}.`)
    todo.push('Remove spending permissions you do not recognise, from your wallet\'s approvals settings or a revoke tool.')
  }
  if (r.code?.kind === 'delegated') {
    risk += 35
    points.push('This wallet has handed control of its code to a contract (EIP-7702). If you did not set this up, someone else may control it.')
    todo.push('If you did not do this, move funds to a fresh wallet.')
  }
  const tronHigh = r.tronPermissions.filter((p) => p.level === 'high')
  if (tronHigh.length > 0) {
    risk += 60
    points.push('Someone else controls this Tron account\'s permissions. Funds sent here may be impossible to move.')
    todo.push('Do not send funds to this account. Do not pay any "fee" to unlock it.')
  }
  const b = r.behavior
  if (b.attacker.length > 0) {
    risk += 60
    points.unshift(`This address looks like it is attacking other wallets: ${b.attacker[0]}`)
    todo.unshift('Do not send funds to this address and do not accept "payments" from it.')
  }
  if (w.realIn.count + w.realOut.count > 0) {
    points.push(`Real USDT in the period checked: received ${w.realIn.total} (${plural(w.realIn.count, 'transfer')}), sent ${w.realOut.total} (${plural(w.realOut.count, 'transfer')}).`)
  } else {
    points.push('No real USDT moved in the period checked.')
  }
  risk = clamp(risk)
  const title =
    b.role === 'attacker' || b.role === 'both'
      ? 'This address looks like an attacker.'
      : b.role === 'victim' && risk >= 30
        ? 'This address is being attacked.'
        : risk < 30
          ? 'Nothing worrying found.'
          : risk < 70
            ? 'A few things to check.'
            : 'Warning signs found on this address.'
  if (todo.length === 0) todo.push('Nothing to do. Only recent history was checked, so this is not a guarantee.')
  return { tone: toneOf(risk), risk, title, points, todo }
}
