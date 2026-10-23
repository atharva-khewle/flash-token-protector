// Follow-the-money analysis over the histories of several wallets. Pure: takes transfers already
// fetched, merges them, keeps the addresses that matter, and labels what each one does with the
// money (splits it, collects it, passes it on, or keeps it). Layers run from sources to sinks so a
// map can be laid out left to right in the direction the money flows.

import type { Hex, TokenTransfer } from '../chains/types'
import type { ChainKey } from '../registry/chains'
import { canonicalUsdt } from '../registry/usdt'
import { analyzeName } from '../lib/homoglyph'
import { displayAddress } from '../lib/address'

export type FlowKind = 'real' | 'fake' | 'other'

export interface Flow {
  from: Hex
  to: Hex
  token: Hex
  kind: FlowKind
  symbol: string | null
  /** Decimals for display. Real USDT: registry. Others: what the token reports (untrusted). */
  decimals: number | null
  total: bigint
  count: number
  first: number | null
  last: number | null
  txs: string[]
}

export type TraceRole = 'input' | 'source' | 'splitter' | 'collector' | 'pass-through' | 'destination' | 'unexplored' | 'busy'

export interface TraceNode {
  address: Hex
  /** Its history was read (so in/out totals are complete for the window read). */
  fetched: boolean
  input: boolean
  busy: boolean
  inTotal: bigint
  outTotal: bigint
  inCount: number
  outCount: number
  /** Distinct addresses on the map it sends to / receives from. */
  fanOut: number
  fanIn: number
  roles: TraceRole[]
  /** 0 = where money enters the map; higher = further downstream. */
  layer: number
}

export interface TraceGraph {
  nodes: TraceNode[]
  flows: Flow[]
  /** Plain sentences about the patterns found, most important first. */
  patterns: string[]
  /**
   * Selected token that entered the wallets whose history was read, from addresses outside that
   * group. Each dollar is counted once, at the door: hops between the group's own wallets are not
   * added again (summing every flow would count the same dollar once per hop).
   */
  inflow: bigint
  /** Decimals for `inflow` (real USDT unless a single other token is selected). */
  decimals: number | null
  transfersSeen: number
  dropped: number
}

export type TokenFilter = 'usdt' | 'all' | Hex

export interface TraceInput {
  chain: ChainKey
  /** History per fetched wallet (as read: may overlap between wallets). */
  histories: Map<Hex, TokenTransfer[]>
  inputs: Hex[]
  /** Wallets whose history was too large to read fully (exchanges, payment services). */
  busy?: Set<Hex>
  token?: TokenFilter
  /** Extra addresses per fetched wallet kept on the map (the biggest counterparties). */
  topPerWallet?: number
  maxNodes?: number
}

const key = (t: TokenTransfer) => `${t.txHash}|${t.token}|${t.from}|${t.to}|${t.value}`

/** Splits / collects to at least this many addresses on the map to count as a pattern. */
export const FAN_MIN = 3

export function buildTrace(inp: TraceInput): TraceGraph {
  const usdt = canonicalUsdt(inp.chain)
  const filter = inp.token ?? 'usdt'
  const fetched = new Set([...inp.histories.keys()].map((a) => a.toLowerCase() as Hex))
  const inputs = new Set(inp.inputs.map((a) => a.toLowerCase() as Hex))
  const busy = new Set([...(inp.busy ?? [])].map((a) => a.toLowerCase() as Hex))

  // 1. One copy of each transfer, whichever wallet's history it came from.
  const seen = new Set<string>()
  const all: TokenTransfer[] = []
  for (const list of inp.histories.values()) {
    for (const t of list) {
      const k = key(t)
      if (seen.has(k)) continue
      seen.add(k)
      all.push(t)
    }
  }

  const kindOf = (t: TokenTransfer): FlowKind => {
    if (t.token.toLowerCase() === usdt.hex) return 'real'
    const notes = analyzeName(t.tokenName ?? '', t.tokenSymbol ?? '')
    return notes.some((n) => n.code === 'usdt-lookalike') ? 'fake' : 'other'
  }
  const wanted = (t: TokenTransfer) => (filter === 'all' ? true : filter === 'usdt' ? t.token.toLowerCase() === usdt.hex : t.token.toLowerCase() === filter.toLowerCase())
  const transfers = all.filter((t) => t.from !== t.to && t.value > 0n && wanted(t))

  // 2. Which addresses stay on the map: every fetched wallet, anything two or more of them share,
  //    and each fetched wallet's biggest counterparties.
  const volume = new Map<Hex, Map<Hex, bigint>>()
  const touch = new Map<Hex, Set<Hex>>()
  for (const t of transfers) {
    for (const [me, other] of [
      [t.from, t.to],
      [t.to, t.from],
    ] as const) {
      if (!fetched.has(me)) continue
      const v = volume.get(me) ?? new Map<Hex, bigint>()
      v.set(other, (v.get(other) ?? 0n) + t.value)
      volume.set(me, v)
      const s = touch.get(other) ?? new Set<Hex>()
      s.add(me)
      touch.set(other, s)
    }
  }
  const keep = new Set<Hex>(fetched)
  for (const [a, s] of touch) if (s.size >= 2) keep.add(a)
  const top = inp.topPerWallet ?? 6
  for (const v of volume.values()) {
    ;[...v.entries()]
      .sort((x, y) => (y[1] > x[1] ? 1 : y[1] < x[1] ? -1 : 0))
      .slice(0, top)
      .forEach(([a]) => keep.add(a))
  }

  // 3. Flows between kept addresses, one per direction and token.
  const flowMap = new Map<string, Flow>()
  for (const t of transfers) {
    if (!keep.has(t.from) || !keep.has(t.to)) continue
    const k = `${t.from}|${t.to}|${t.token}`
    const kind = kindOf(t)
    const f = flowMap.get(k) ?? {
      from: t.from,
      to: t.to,
      token: t.token.toLowerCase() as Hex,
      kind,
      symbol: kind === 'real' ? 'USDT' : t.tokenSymbol,
      decimals: kind === 'real' ? usdt.decimals : t.decimals,
      total: 0n,
      count: 0,
      first: null,
      last: null,
      txs: [],
    }
    f.total += t.value
    f.count++
    if (t.timestamp) {
      f.first = f.first === null ? t.timestamp : Math.min(f.first, t.timestamp)
      f.last = f.last === null ? t.timestamp : Math.max(f.last, t.timestamp)
    }
    if (f.txs.length < 20) f.txs.push(t.txHash)
    flowMap.set(k, f)
  }
  let flows = [...flowMap.values()]

  // 4. Keep the map readable: drop the smallest unfetched leaves beyond the cap.
  const maxNodes = inp.maxNodes ?? 90
  const used = new Set<Hex>([...fetched, ...flows.flatMap((f) => [f.from, f.to])])
  let dropped = 0
  if (used.size > maxNodes) {
    const leafVol = new Map<Hex, bigint>()
    for (const f of flows) for (const a of [f.from, f.to]) if (!fetched.has(a)) leafVol.set(a, (leafVol.get(a) ?? 0n) + f.total)
    const leaves = [...leafVol.entries()].sort((x, y) => (x[1] > y[1] ? 1 : x[1] < y[1] ? -1 : 0))
    const drop = new Set(leaves.slice(0, used.size - maxNodes).map(([a]) => a))
    dropped = drop.size
    flows = flows.filter((f) => !drop.has(f.from) && !drop.has(f.to))
  }

  // 5. Per-address totals and roles.
  const nodes = new Map<Hex, TraceNode>()
  const node = (a: Hex): TraceNode => {
    let n = nodes.get(a)
    if (!n) {
      n = { address: a, fetched: fetched.has(a), input: inputs.has(a), busy: busy.has(a), inTotal: 0n, outTotal: 0n, inCount: 0, outCount: 0, fanOut: 0, fanIn: 0, roles: [], layer: 0 }
      nodes.set(a, n)
    }
    return n
  }
  for (const a of fetched) node(a)
  const outs = new Map<Hex, Set<Hex>>()
  const ins = new Map<Hex, Set<Hex>>()
  for (const f of flows) {
    const a = node(f.from)
    const b = node(f.to)
    a.outTotal += f.total
    a.outCount += f.count
    b.inTotal += f.total
    b.inCount += f.count
    ;(outs.get(f.from) ?? outs.set(f.from, new Set()).get(f.from)!).add(f.to)
    ;(ins.get(f.to) ?? ins.set(f.to, new Set()).get(f.to)!).add(f.from)
  }
  for (const n of nodes.values()) {
    n.fanOut = outs.get(n.address)?.size ?? 0
    n.fanIn = ins.get(n.address)?.size ?? 0
    if (n.input) n.roles.push('input')
    if (n.busy) n.roles.push('busy')
    if (n.fanOut >= FAN_MIN) n.roles.push('splitter')
    if (n.fanIn >= FAN_MIN) n.roles.push('collector')
    if (n.fanIn === 0 && n.fanOut > 0) n.roles.push('source')
    if (n.fetched && n.inTotal > 0n && n.outTotal > 0n) {
      const diff = n.inTotal > n.outTotal ? n.inTotal - n.outTotal : n.outTotal - n.inTotal
      if (diff * 10n <= n.inTotal) n.roles.push('pass-through')
    }
    if (n.inTotal > 0n && (n.fetched ? n.outTotal * 20n <= n.inTotal : n.fanOut === 0)) n.roles.push(n.fetched ? 'destination' : 'unexplored')
  }

  // 6. Layers: longest path from where money enters, ignoring edges that close a cycle.
  const layer = new Map<Hex, number>()
  const state = new Map<Hex, 1 | 2>()
  const depth = (a: Hex): number => {
    if (state.get(a) === 2) return layer.get(a)!
    if (state.get(a) === 1) return -1 // cycle: ignore this edge
    state.set(a, 1)
    let d = 0
    for (const p of ins.get(a) ?? []) {
      const pd = depth(p)
      if (pd >= 0) d = Math.max(d, pd + 1)
    }
    state.set(a, 2)
    layer.set(a, d)
    return d
  }
  for (const a of nodes.keys()) depth(a)
  for (const n of nodes.values()) n.layer = layer.get(n.address) ?? 0

  // 7. Patterns, in plain words.
  const single = filter !== 'all' && filter !== 'usdt' ? flows[0] : undefined
  const decimals = filter === 'usdt' ? usdt.decimals : filter === 'all' ? null : (single?.decimals ?? null)
  const inflow = filter === 'all' ? 0n : transfers.reduce((s, t) => (fetched.has(t.to) && !fetched.has(t.from) ? s + t.value : s), 0n)
  const list = [...nodes.values()]
  const by = (f: (n: TraceNode) => bigint) => (x: TraceNode, y: TraceNode) => (f(y) > f(x) ? 1 : f(y) < f(x) ? -1 : 0)
  const patterns: string[] = []
  const short = (a: Hex) => {
    const s = displayAddress(inp.chain, a)
    return `${s.slice(0, 6)}…${s.slice(-4)}`
  }
  const fmt = (v: bigint) => fmtAmount(v, decimals)
  const unit = filter === 'usdt' ? ' USDT' : single?.symbol ? ` ${single.symbol}` : ''
  for (const n of list.filter((x) => x.roles.includes('splitter')).sort(by((x) => x.outTotal)).slice(0, 3)) {
    patterns.push(`${short(n.address)} splits money to ${n.fanOut} addresses${decimals !== null ? ` (${fmt(n.outTotal)}${unit} out)` : ''}.`)
  }
  for (const n of list.filter((x) => x.roles.includes('collector')).sort(by((x) => x.inTotal)).slice(0, 3)) {
    patterns.push(`${n.fanIn} addresses send to ${short(n.address)}, which collects ${decimals !== null ? `${fmt(n.inTotal)}${unit}` : 'the money'}.`)
  }
  const passes = list.filter((x) => x.roles.includes('pass-through'))
  if (passes.length) patterns.push(`${passes.length} wallet${passes.length === 1 ? '' : 's'} pass the money straight on (in ≈ out), typical of layering.`)
  const sinks = list.filter((x) => x.roles.includes('destination')).sort(by((x) => x.inTotal)).slice(0, 3)
  if (sinks.length && decimals !== null) patterns.push(`Money ends up at ${sinks.map((s) => `${short(s.address)} (${fmt(s.inTotal)}${unit})`).join(', ')}.`)
  const unexplored = list.filter((x) => x.roles.includes('unexplored')).length
  if (unexplored) patterns.push(`${unexplored} address${unexplored === 1 ? '' : 'es'} received money but ${unexplored === 1 ? 'was' : 'were'} not followed further. Add hops or select ${unexplored === 1 ? 'it' : 'them'} to go deeper.`)
  if (busy.size) patterns.push(`${busy.size} wallet${busy.size === 1 ? ' has' : 's have'} more history than was read (often an exchange or payment service); not followed further.`)

  return { nodes: list, flows, patterns, inflow, decimals, transfersSeen: all.length, dropped }
}


export function fmtAmount(v: bigint, decimals: number | null): string {
  if (decimals === null) return v.toString()
  const base = 10n ** BigInt(decimals)
  const whole = v / base
  const frac = v % base
  const n = Number(whole) + Number(frac) / Number(base)
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  return n.toLocaleString('en-US', { maximumFractionDigits: n > 0 && n < 1 ? 6 : 2 })
}
