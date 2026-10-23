// Turns each kind of result into a whiteboard diagram: boxes are addresses, contracts and the
// transaction itself; arrows are money, fake tokens, "signed", "created" and "imitates".

import type { Hex } from '../chains/types'
import { displayAddress } from '../lib/address'
import { CHAINS, type ChainKey } from '../registry/chains'
import { canonicalUsdt } from '../registry/usdt'
import type { Creator, Spread, TxIntel } from '../services/intel'
import type { ScanOutput } from '../services/scan'
import type { TokenCheckOutput } from '../services/tokenCheck'
import type { TxReportOutput } from '../services/txReport'
import type { VerifyOutput } from '../services/verify'
import { decodeTransfer, formatUnits } from '../verdict/transfer'
import { openCheck } from './common'
import type { BoardSpec, EdgeKind, GEdge, GNode, NodeKind } from './graph'

const short = (s: string) => (s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s)

// When one address plays several parts, the most alarming one colours the box.
const RANK: NodeKind[] = ['attacker', 'fake', 'creator', 'me', 'victim', 'real', 'contract', 'wallet', 'unknown']

class Builder {
  private nodes = new Map<string, GNode>()
  private edges: GEdge[] = []
  private edgeKeys = new Set<string>()

  constructor(private chain: ChainKey) {}

  /** A box for an address. Calling it again for the same address merges badges and notes. */
  addr(a: Hex, o: { kind: NodeKind; col: number; badge?: string; title?: string; info?: string[]; token?: boolean }): string {
    const shown = displayAddress(this.chain, a)
    const id = shown.toLowerCase()
    const info = CHAINS[this.chain]
    const old = this.nodes.get(id)
    if (old) {
      if (RANK.indexOf(o.kind) < RANK.indexOf(old.kind)) old.kind = o.kind
      if (o.badge && !(old.badge ?? '').includes(o.badge)) old.badge = old.badge ? `${old.badge} · ${o.badge}` : o.badge
      if (o.title && (old.title === 'Address' || old.title === 'Wallet')) old.title = o.title
      for (const x of o.info ?? []) if (!old.info?.includes(x)) (old.info ??= []).push(x)
      return id
    }
    this.nodes.set(id, {
      id,
      kind: o.kind,
      col: o.col,
      badge: o.badge,
      title: o.title ?? 'Address',
      sub: short(shown),
      address: shown,
      explorer: info.explorer.address(shown),
      explorerName: info.explorer.name,
      info: o.info ? [...o.info] : [],
      actions: [{ label: o.token ? 'Check this token' : 'Check this address', run: () => openCheck(o.token ? 'token' : 'scan', this.chain, shown) }],
    })
    return id
  }

  node(n: GNode): string {
    if (!this.nodes.has(n.id)) this.nodes.set(n.id, n)
    return n.id
  }

  edge(from: string, to: string, kind: EdgeKind, label?: string): void {
    const k = `${from}|${to}|${kind}|${label ?? ''}`
    if (this.edgeKeys.has(k)) return
    this.edgeKeys.add(k)
    this.edges.push({ from, to, kind, label })
  }

  has(a: Hex): boolean {
    return this.nodes.has(displayAddress(this.chain, a).toLowerCase())
  }

  count(): number {
    return this.nodes.size
  }

  spec(title: string, desc: string, footnote?: string): BoardSpec {
    return { title, desc, nodes: [...this.nodes.values()], edges: this.edges, footnote }
  }
}

function realEdge(chain: ChainKey, v: bigint): { kind: EdgeKind; label: string } {
  const usdt = canonicalUsdt(chain)
  const one = 10n ** BigInt(usdt.decimals)
  if (v === 0n) return { kind: 'zero', label: '0 USDT (zero-value)' }
  const label = `${formatUnits(v, usdt.decimals)} USDT`
  return v < one / 100n ? { kind: 'dust', label: `${label} (dust)` } : { kind: 'real', label }
}

function txNode(chain: ChainKey, hash: string, o: { kind: NodeKind; badge: string; info: string[] }): GNode {
  const c = CHAINS[chain]
  return { id: 'tx', kind: o.kind, col: 1, badge: o.badge, title: 'This transaction', sub: short(hash), explorer: c.explorer.tx(hash), explorerName: c.explorer.name, info: o.info }
}

/** Creator of a contract, and other places a fake token was sent. */
function addCreator(b: Builder, token: string, c: Creator | undefined, label: string): string | null {
  if (!c) return null
  if (!c.creator) {
    if (!c.owner) return c.note
    const id = b.addr(c.owner, { kind: 'creator', col: 0, badge: 'OWNS THE TOKEN', title: 'Owner (likely deployer)', info: [c.note] })
    b.edge(id, token, 'created', 'owns it')
    return c.note
  }
  const id = b.addr(c.creator, { kind: 'creator', col: 0, badge: label, title: 'Deployer', info: [c.note, ...(c.txHash ? [`Creation tx: ${c.txHash}`] : [])] })
  b.edge(id, token, 'created', 'created it')
  return null
}

const MAX_SPREAD = 10

function addSpread(b: Builder, chain: ChainKey, tokenId: string, symbol: string, s: Spread | undefined, skipTx: string | null, cols: { signer: number; from: number; to: number }): string | null {
  if (!s) return null
  const pairs = new Map<string, { from: Hex; to: Hex; txHash: string }>()
  for (const t of s.transfers) {
    if (t.txHash === skipTx) continue
    const k = `${t.from}|${t.to}`
    if (!pairs.has(k)) pairs.set(k, t)
  }
  const list = [...pairs.values()]
  const shown = list.slice(0, MAX_SPREAD)
  for (const t of shown) {
    const f = b.addr(t.from, { kind: 'attacker', col: cols.from, badge: 'SENDS THIS FAKE TOKEN', title: 'Sender' })
    const to = b.addr(t.to, { kind: 'victim', col: cols.to, badge: 'GOT THIS FAKE TOKEN', title: 'Target' })
    b.edge(f, to, 'fake', `fake “${symbol}”`)
    const signer = s.signers.get(t.txHash)
    if (signer && signer !== t.from) {
      const sg = b.addr(signer, { kind: 'attacker', col: cols.signer, badge: 'SIGNED THE SENDS', title: 'Signer' })
      b.edge(sg, f, 'call', 'signed for')
    }
  }
  const targets = new Set(list.map((t) => t.to))
  if (list.length > shown.length) {
    b.node({ id: `more-${tokenId}`, kind: 'victim', col: cols.to, badge: 'MORE TARGETS', title: `+${list.length - shown.length} more transfers`, info: [s.note] })
    b.edge(tokenId, `more-${tokenId}`, 'fake', 'also sent to')
  }
  return list.length ? `${s.note} It reached ${targets.size} address(es) besides this transaction.` : s.note
}

// ---------- Transaction ----------

export function txDiagram(r: TxReportOutput, intel?: TxIntel): BoardSpec {
  const b = new Builder(r.chain)
  const fake = r.headline === 'FAKE USDT FOUND'
  const bad = r.headline === 'NOT ON CHAIN' || r.headline === 'BLOCK HASH' || r.headline === 'FAILED TX'
  b.node(txNode(r.chain, r.hash, { kind: fake || bad ? 'fake' : 'unknown', badge: r.headline, info: r.problems.slice(0, 5).map((p) => p.text) }))
  const notes: string[] = []

  const signer = intel?.parties?.from ?? r.parties.find((p) => p.roles.includes('tx sender'))?.address ?? null
  const target = intel?.parties ? intel.parties.to : (r.parties.find((p) => p.roles.includes('tx target'))?.address ?? null)
  if (signer) b.edge(b.addr(signer, { kind: fake ? 'attacker' : 'wallet', col: 0, badge: fake ? 'SIGNED THE FAKE TX' : 'SIGNED THE TX', title: 'Signer' }), 'tx', 'call', 'signed')
  if (target && !r.tokens.some((t) => t.token === target)) {
    b.edge('tx', b.addr(target, { kind: 'contract', col: 2, badge: 'CALLED', title: 'Contract' }), 'call', 'called')
  }

  for (const t of r.tokens) {
    const isFake = t.verdict === 'FAKE USDT'
    const isReal = t.verdict === 'REAL USDT'
    const sym = t.symbol ?? 'token'
    const tok = b.addr(t.token, {
      kind: isReal ? 'real' : isFake ? 'fake' : 'contract',
      col: 2,
      badge: isReal ? 'REAL USDT' : isFake ? 'FAKE USDT TOKEN' : t.verdict === 'NOT USDT' ? 'OTHER TOKEN' : t.verdict,
      title: isReal ? 'Tether USD (official)' : `“${sym}” ${t.name ? `/ ${t.name}` : ''}`.trim(),
      info: [t.summary],
      token: true,
    })
    b.edge('tx', tok, t.token === target ? 'call' : 'other', t.token === target ? 'called' : 'moved')
    if (isFake || t.verdict === 'UNKNOWN') {
      const n1 = addCreator(b, tok, intel?.creators.get(t.token), isFake ? 'CREATED THE FAKE TOKEN' : 'CREATED THE TOKEN')
      if (n1) notes.push(`${sym} creator: ${n1}`)
      const n2 = addSpread(b, r.chain, tok, sym, intel?.spreads.get(t.token), r.hash, { signer: 0, from: 3, to: 4 })
      if (n2) notes.push(`${sym}: ${n2}`)
    }
    for (const x of t.transfers.slice(0, 20)) {
      const e = isReal ? realEdge(r.chain, x.value) : { kind: (isFake ? 'fake' : 'other') as EdgeKind, label: isFake ? `fake “${sym}”` : sym }
      const from = b.addr(x.from, { kind: isFake ? 'attacker' : 'wallet', col: 3, badge: isFake ? 'SENT THE FAKE TOKEN' : undefined, title: 'Sender' })
      const to = b.addr(x.to, { kind: isFake ? 'victim' : 'wallet', col: 4, badge: isFake ? 'GOT THE FAKE TOKEN' : isReal ? 'GOT REAL USDT' : undefined, title: 'Receiver' })
      b.edge(from, to, e.kind, e.label)
    }
  }
  if (!intel) notes.push('Looking up who signed it and who created the tokens…')
  return b.spec('Transaction map', 'Who signed it, which contracts it used, and where every token went.', notes.join(' ') || undefined)
}

// ---------- Verify a payment ----------

export function verifyDiagram(r: VerifyOutput, parties?: { from: Hex; to: Hex | null } | null): BoardSpec {
  const b = new Builder(r.chain)
  const usdt = canonicalUsdt(r.chain)
  const good = r.verdict === 'VERIFIED'
  b.node(txNode(r.chain, r.hash, { kind: good ? 'real' : r.verdict === 'UNVERIFIED' ? 'unknown' : 'fake', badge: r.verdict, info: [] }))
  const signer = parties?.from ?? r.receipt?.from ?? null
  if (signer) b.edge(b.addr(signer, { kind: r.verdict === 'FAKE' && r.decoys.length ? 'attacker' : 'wallet', col: 0, badge: 'SIGNED THE TX', title: 'Signer' }), 'tx', 'call', 'signed')
  if (r.target) b.addr(r.target, { kind: 'me', col: 3, badge: 'YOU (expected recipient)', title: 'Your address' })
  for (const log of r.receipt?.logs ?? []) {
    const d = decodeTransfer(log, usdt)
    if (!d || !d.canonical) continue
    const e = realEdge(r.chain, d.value)
    b.edge(b.addr(d.from, { kind: 'wallet', col: 2, title: 'Sender' }), b.addr(d.to, { kind: 'wallet', col: 3, title: 'Receiver' }), e.kind, e.label)
  }
  for (const d of r.decoys) {
    const risk = r.decoyRisks.find((x) => x.token === d.token)
    const sym = risk?.symbol ?? 'token'
    const tok = b.addr(d.token, { kind: 'fake', col: 1, badge: 'NOT REAL USDT', title: `“${sym}”`, info: [d.reason], token: true })
    b.edge('tx', tok, 'other', 'moved')
    if (d.from && d.to) b.edge(b.addr(d.from, { kind: 'attacker', col: 2, badge: 'SENT A DECOY', title: 'Sender' }), b.addr(d.to, { kind: 'victim', col: 3, title: 'Receiver' }), 'fake', `fake “${sym}”`)
  }
  return b.spec('Payment map', 'Real USDT arrows are green. Red arrows are tokens that only look like USDT.')
}

// ---------- Address ----------

const MAX_PARTIES = 24

export function scanDiagram(s: ScanOutput): BoardSpec {
  const b = new Builder(s.chain)
  const usdt = canonicalUsdt(s.chain)
  const me = s.address.toLowerCase() as Hex
  const role = s.behavior.role
  const meBadge = role === 'attacker' ? 'THIS ADDRESS · LOOKS LIKE AN ATTACKER' : role === 'both' ? 'THIS ADDRESS · ATTACKED AND ATTACKING' : role === 'victim' ? 'THIS ADDRESS · UNDER ATTACK' : 'THIS ADDRESS'
  const attackers = new Set(s.behavior.attackers)
  const targets = new Set(s.behavior.targets)
  const impersonators = new Set(s.wallet.fakeTokens.filter((g) => g.impersonatesUsdt).map((g) => g.token))
  const symbol = new Map(s.wallet.fakeTokens.map((g) => [g.token, g.symbol ?? 'token']))
  const one = 10n ** BigInt(usdt.decimals)

  // Aggregate: one arrow per counterparty, direction and kind.
  type Agg = { cp: Hex; dir: 'in' | 'out'; kind: EdgeKind; n: number; sum: bigint; sym: string }
  const agg = new Map<string, Agg>()
  for (const t of s.transfers) {
    const dir = t.to === me ? 'in' : 'out'
    const cp = dir === 'in' ? t.from : t.to
    if (cp === me) continue
    const real = t.token.toLowerCase() === usdt.hex
    const kind: EdgeKind = real ? (t.value === 0n ? 'zero' : t.value < one / 100n ? 'dust' : 'real') : impersonators.has(t.token) ? 'fake' : 'other'
    const k = `${cp}|${dir}|${kind}`
    const a = agg.get(k) ?? { cp, dir, kind, n: 0, sum: 0n, sym: real ? 'USDT' : (symbol.get(t.token) ?? t.tokenSymbol ?? 'token') }
    a.n++
    a.sum += t.value
    agg.set(k, a)
  }
  const score = (cp: Hex) => (attackers.has(cp) || targets.has(cp) ? 1000 : 0) + [...agg.values()].filter((a) => a.cp === cp).reduce((x, a) => x + a.n, 0)
  const parties = [...new Set([...agg.values()].map((a) => a.cp))].sort((x, y) => score(y) - score(x))
  const shown = new Set(parties.slice(0, MAX_PARTIES))
  const dirs = (cp: Hex) => new Set([...agg.values()].filter((a) => a.cp === cp).map((a) => a.dir))

  const both = parties.filter((cp) => shown.has(cp) && dirs(cp).size === 2)
  const half = Math.floor(both.length / 2)
  const place = (cp: Hex) => {
    const d = dirs(cp)
    const kind: NodeKind = attackers.has(cp) ? 'attacker' : targets.has(cp) ? 'victim' : 'wallet'
    const badge = attackers.has(cp) ? 'ATTACKS THIS ADDRESS' : targets.has(cp) ? 'TARGETED BY THIS ADDRESS' : undefined
    b.addr(cp, { kind, col: d.size === 2 ? 1 : d.has('in') ? 0 : 2, badge, title: d.size === 2 ? 'Sends and receives' : d.has('in') ? 'Sent to it' : 'Received from it' })
  }
  both.slice(0, half).forEach(place)
  const meId = b.addr(me, { kind: role === 'attacker' ? 'attacker' : 'me', col: 1, badge: meBadge, title: 'Checked address', info: [...s.behavior.victim, ...s.behavior.attacker] })
  both.slice(half).forEach(place)
  for (const cp of parties) if (shown.has(cp) && dirs(cp).size < 2) place(cp)

  for (const a of agg.values()) {
    if (!shown.has(a.cp)) continue
    const cpId = displayAddress(s.chain, a.cp).toLowerCase()
    const times = a.n > 1 ? `${a.n}× ` : ''
    const label =
      a.kind === 'real' || a.kind === 'dust' ? `${times}${formatUnits(a.sum, usdt.decimals)} USDT` : a.kind === 'zero' ? `${times}zero-value` : a.kind === 'fake' ? `${times}fake “${a.sym}”` : `${times}${a.sym}`
    if (a.dir === 'in') b.edge(cpId, meId, a.kind, label)
    else b.edge(meId, cpId, a.kind, label)
  }

  // Lookalikes: show what they imitate.
  for (const p of s.wallet.poisoning) {
    if (!p.match || !b.has(p.counterparty)) continue
    const real = b.addr(p.match.target as Hex, { kind: 'wallet', col: 2, badge: 'THE REAL CONTACT', title: 'Real address' })
    b.edge(displayAddress(s.chain, p.counterparty).toLowerCase(), real, 'lookalike', 'imitates')
  }
  for (const ap of s.approvals) {
    b.edge(b.addr(ap.spender, { kind: ap.unlimited ? 'attacker' : 'contract', col: 2, badge: 'CAN SPEND ITS USDT', title: 'Spender' }), meId, 'approval', `can spend ${ap.formatted}`)
  }
  const more = parties.length - shown.size
  return b.spec(
    'Address map',
    'Who sends to this address, who it sends to, and who is attacking whom.',
    more > 0 ? `${more} more counterparties are not drawn; the busiest and the suspicious ones are shown first.` : undefined,
  )
}

// ---------- Token ----------

export function tokenDiagram(r: TokenCheckOutput, intel?: { creator?: Creator; spread?: Spread }): BoardSpec {
  const b = new Builder(r.chain)
  const usdt = canonicalUsdt(r.chain)
  const real = r.verdict === 'REAL USDT'
  const fake = r.verdict === 'FAKE USDT'
  const sym = r.symbol ?? 'token'
  const tok = b.addr(r.token, {
    kind: real ? 'real' : fake || r.verdict === 'NOT A CONTRACT' ? 'fake' : 'contract',
    col: 1,
    badge: real ? 'REAL USDT' : fake ? 'FAKE USDT' : r.verdict,
    title: real ? 'Tether USD (official)' : `“${sym}”${r.name ? ` / ${r.name}` : ''}`,
    info: [r.summary, ...r.findings.map((f) => f.detail)],
    token: true,
  })
  const notes: string[] = []
  if (!real) {
    const realId = b.addr(usdt.hex, { kind: 'real', col: 2, badge: 'THE REAL USDT', title: 'Tether USD (official)', token: true })
    b.edge(tok, realId, fake ? 'lookalike' : 'other', fake ? 'pretends to be' : 'is not')
    const n1 = addCreator(b, tok, intel?.creator, fake ? 'CREATED THE FAKE TOKEN' : 'CREATED THE TOKEN')
    if (n1) notes.push(`Creator: ${n1}`)
    const n2 = addSpread(b, r.chain, tok, sym, intel?.spread, null, { signer: 0, from: 2, to: 3 })
    if (n2) notes.push(n2)
    if (!intel) notes.push('Looking up the creator and recent transfers…')
  }
  return b.spec('Token map', real ? 'This is the official contract.' : 'Who made this token, who is sending it, and who received it.', notes.join(' ') || undefined)
}
