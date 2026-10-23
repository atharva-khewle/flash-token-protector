// Whiteboard diagram: who sent what to whom, who made which contract, who is attacking whom.
// An endless dotted board you can drag around, zoom (wheel, pinch, buttons) and rearrange
// (drag a box). Clicking a box shows what is known about it, with a link to the chain explorer.
// All text from the chain goes in as text nodes; nothing is parsed as markup.

import { append, clear, h, link } from './dom'

export type NodeKind = 'me' | 'wallet' | 'contract' | 'real' | 'fake' | 'creator' | 'attacker' | 'victim' | 'unknown'
export type EdgeKind = 'real' | 'fake' | 'dust' | 'zero' | 'call' | 'created' | 'lookalike' | 'approval' | 'other'

export interface GNode {
  id: string
  title: string
  /** Usually the short address. */
  sub?: string
  /** One word over the title, e.g. YOU, FAKE TOKEN, ATTACKER. */
  badge?: string
  kind: NodeKind
  /** Column, left to right. Rows are filled in order. */
  col: number
  /** Full address, shown and copyable in the info panel. */
  address?: string
  explorer?: string | null
  explorerName?: string
  info?: string[]
  actions?: { label: string; run: () => void }[]
}

export interface GEdge {
  from: string
  to: string
  kind: EdgeKind
  label?: string
}

export interface BoardSpec {
  title: string
  desc?: string
  nodes: GNode[]
  edges: GEdge[]
  /** Extra line under the board, e.g. what was not fetched. */
  footnote?: string
}

const NS = 'http://www.w3.org/2000/svg'
const W = 210
const H = 62
const COL_GAP = 300
const ROW_GAP = 92

const EDGE_TEXT: Record<EdgeKind, string> = {
  real: 'Real USDT',
  fake: 'Fake token',
  dust: 'Dust (tiny amount)',
  zero: 'Zero-value transfer',
  call: 'Called (signed the tx)',
  created: 'Created the contract',
  lookalike: 'Lookalike address',
  approval: 'Can spend your USDT',
  other: 'Other token',
}

let boardSeq = 0

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, text?: string): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  if (text !== undefined) el.textContent = text
  return el
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Where the line from the box centre towards (tx, ty) leaves the box. */
function boxExit(cx: number, cy: number, tx: number, ty: number): [number, number] {
  const dx = tx - cx
  const dy = ty - cy
  if (dx === 0 && dy === 0) return [cx, cy]
  const sx = Math.abs(dx) > 0 ? W / 2 / Math.abs(dx) : Infinity
  const sy = Math.abs(dy) > 0 ? H / 2 / Math.abs(dy) : Infinity
  const s = Math.min(sx, sy) + 0.03
  return [cx + dx * s, cy + dy * s]
}

export function whiteboard(spec: BoardSpec): HTMLElement {
  const id = `b${++boardSeq}`
  const usedKinds = [...new Set(spec.edges.map((e) => e.kind))]

  // ---------- layout: columns left to right (top to bottom on a narrow board), empty columns dropped ----------
  const pos = new Map<string, { x: number; y: number }>()
  const cols = [...new Set(spec.nodes.map((n) => n.col))].sort((a, b) => a - b)
  // A crowded column wraps into several, growing away from the middle of the board.
  const PER = 8
  const layout = (vertical: boolean) => {
    let shift = 0
    const mid = (cols.length - 1) / 2
    const spans = cols.map((c) => Math.ceil(spec.nodes.filter((n) => n.col === c).length / PER))
    cols.forEach((c, ci) => {
      const inCol = spec.nodes.filter((n) => n.col === c)
      const wraps = spans[ci]!
      const rows = Math.ceil(inCol.length / wraps)
      const outward = ci < mid ? -1 : 1
      const base = shift + (ci < mid ? wraps - 1 : 0)
      inCol.forEach((n, i) => {
        const sub = Math.floor(i / rows)
        const r = i % rows
        const inThis = Math.min(rows, inCol.length - sub * rows)
        const along = (r - (inThis - 1) / 2) * (vertical ? W + 26 : ROW_GAP)
        const across = base + outward * sub
        pos.set(n.id, vertical ? { x: along, y: across * ROW_GAP * 1.9 } : { x: across * COL_GAP, y: along })
      })
      shift += wraps
    })
  }
  layout(false)
  let laidOut = false

  // ---------- SVG skeleton ----------
  const root = svg('svg', { role: 'img', 'aria-label': `${spec.title}. Diagram with ${spec.nodes.length} boxes.` })
  const defs = svg('defs')
  const pattern = svg('pattern', { id: `${id}-dots`, width: 24, height: 24, patternUnits: 'userSpaceOnUse' })
  pattern.appendChild(svg('circle', { cx: 2, cy: 2, r: 1.3, class: 'gdot' }))
  defs.appendChild(pattern)
  for (const k of [...usedKinds, 'other'] as EdgeKind[]) {
    const m = svg('marker', { id: `${id}-arrow-${k}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' })
    m.appendChild(svg('path', { d: 'M0,0 L10,5 L0,10 z', class: `garrow-${k}` }))
    defs.appendChild(m)
  }
  root.appendChild(defs)
  root.appendChild(svg('rect', { x: 0, y: 0, width: '100%', height: '100%', fill: `url(#${id}-dots)` }))
  const world = svg('g')
  const edgeLayer = svg('g')
  const nodeLayer = svg('g')
  world.append(edgeLayer, nodeLayer)
  root.appendChild(world)

  // ---------- edges ----------
  const pairCount = new Map<string, number>()
  const edgeEls = spec.edges
    .filter((e) => pos.has(e.from) && pos.has(e.to))
    .map((e) => {
      const key = [e.from, e.to].sort().join('|')
      const idx = pairCount.get(key) ?? 0
      pairCount.set(key, idx + 1)
      const path = svg('path', { class: `gedge e-${e.kind}`, 'marker-end': `url(#${id}-arrow-${e.kind})` })
      const label = e.label ? svg('text', { class: 'gelabel', 'text-anchor': 'middle' }, cut(e.label, 34)) : null
      edgeLayer.appendChild(path)
      if (label) edgeLayer.appendChild(label)
      return { e, idx, path, label }
    })

  const drawEdges = () => {
    for (const { e, idx, path, label } of edgeEls) {
      const a = pos.get(e.from)!
      const b = pos.get(e.to)!
      if (e.from === e.to) {
        // Self transfer: a loop over the box.
        const x = a.x + W / 4
        const y = a.y - H / 2
        path.setAttribute('d', `M${x - 30},${y} C${x - 50},${y - 70} ${x + 50},${y - 70} ${x + 30},${y}`)
        label?.setAttribute('x', String(x))
        label?.setAttribute('y', String(y - 56))
        continue
      }
      // Parallel edges between the same two boxes fan out.
      // Long arrows that would run behind the boxes in between curve around them.
      const skips = Math.abs(b.x - a.x) > COL_GAP * 1.5 && Math.abs(b.y - a.y) < H ? 1 : Math.abs(b.y - a.y) > ROW_GAP * 2.5 && Math.abs(b.x - a.x) < W ? 1 : 0
      const bend = (idx === 0 ? 0 : (idx % 2 ? 1 : -1) * Math.ceil(idx / 2) * 34) + skips * -(H + 40)
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2
      const dx = b.x - a.x
      const dy = b.y - a.y
      const len = Math.hypot(dx, dy) || 1
      const cx = mx + (-dy / len) * bend
      const cy = my + (dx / len) * bend
      const [sx, sy] = boxExit(a.x, a.y, cx, cy)
      const [ex, ey] = boxExit(b.x, b.y, cx, cy)
      path.setAttribute('d', `M${sx},${sy} Q${cx},${cy} ${ex},${ey}`)
      if (label) {
        label.setAttribute('x', String((sx + 2 * cx + ex) / 4))
        label.setAttribute('y', String((sy + 2 * cy + ey) / 4 - 6))
      }
    }
  }

  // ---------- nodes ----------
  const nodeEls = new Map<string, SVGGElement>()
  for (const n of spec.nodes) {
    const g = svg('g', { class: `gnode k-${n.kind}`, tabindex: 0, role: 'button', 'aria-label': `${n.badge ?? ''} ${n.title} ${n.sub ?? ''}`.trim() })
    g.appendChild(svg('rect', { x: -W / 2, y: -H / 2, width: W, height: H, rx: 14 }))
    if (n.badge) g.appendChild(svg('text', { x: -W / 2 + 14, y: -H / 2 + 17, class: `gbadge k-${n.kind}` }, cut(n.badge.toUpperCase(), 26)))
    g.appendChild(svg('text', { x: -W / 2 + 14, y: n.badge ? 4 : -2, class: 'gtitle' }, cut(n.title, 26)))
    if (n.sub) g.appendChild(svg('text', { x: -W / 2 + 14, y: n.badge ? 21 : 16, class: 'gsub' }, cut(n.sub, 30)))
    nodeLayer.appendChild(g)
    nodeEls.set(n.id, g)
  }
  const placeNodes = () => {
    for (const [nid, g] of nodeEls) {
      const p = pos.get(nid)!
      g.setAttribute('transform', `translate(${p.x},${p.y})`)
    }
  }

  // ---------- view: pan and zoom ----------
  const board = h('div', { class: 'board' })
  board.appendChild(root as unknown as Node as HTMLElement)
  let view = { x: 0, y: 0, k: 1 }
  const applyView = () => {
    world.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`)
    pattern.setAttribute('patternTransform', `translate(${view.x},${view.y}) scale(${view.k})`)
  }
  const fit = () => {
    const r = board.getBoundingClientRect()
    const bw = r.width || 800
    const bh = r.height || 460
    const xs = [...pos.values()].map((p) => p.x)
    const ys = [...pos.values()].map((p) => p.y)
    if (xs.length === 0) return
    const minX = Math.min(...xs) - W / 2 - 40
    const maxX = Math.max(...xs) + W / 2 + 40
    const minY = Math.min(...ys) - H / 2 - 70
    const maxY = Math.max(...ys) + H / 2 + 40
    const k = Math.max(0.4, Math.min(1.15, bw / (maxX - minX), bh / (maxY - minY)))
    view = { k, x: bw / 2 - ((minX + maxX) / 2) * k, y: bh / 2 - ((minY + maxY) / 2) * k }
    applyView()
  }
  const zoomAt = (factor: number, px: number, py: number) => {
    const k = Math.max(0.15, Math.min(3, view.k * factor))
    view = { k, x: px - ((px - view.x) * k) / view.k, y: py - ((py - view.y) * k) / view.k }
    applyView()
  }

  // ---------- selection and info panel ----------
  const info = h('div', { class: 'boardinfo', 'aria-live': 'polite' })
  const showDefault = () => {
    clear(info)
    info.appendChild(h('div', { class: 'muted small' }, 'Tap a box to see who it is and open it on the explorer. Drag the board to move around; drag a box to move it.'))
  }
  const select = (nid: string | null) => {
    const linked = new Set<string>(nid ? [nid] : [])
    for (const { e } of edgeEls) if (nid && (e.from === nid || e.to === nid)) linked.add(e.from).add(e.to)
    for (const [k, g] of nodeEls) {
      g.classList.toggle('selected', k === nid)
      g.classList.toggle('dim', !!nid && !linked.has(k))
    }
    for (const { e, path, label } of edgeEls) {
      const on = !nid || e.from === nid || e.to === nid
      path.classList.toggle('dim', !on)
      label?.classList.toggle('dim', !on)
    }
    if (!nid) return showDefault()
    const n = spec.nodes.find((x) => x.id === nid)!
    clear(info)
    const ins = edgeEls.filter((x) => x.e.to === nid).length
    const outs = edgeEls.filter((x) => x.e.from === nid).length
    append(
      info,
      h('div', {}, n.badge ? h('strong', {}, `${n.badge}: `) : null, h('strong', {}, n.title)),
      n.address ? h('code', { class: 'addr' }, n.address) : null,
      n.info && n.info.length ? h('ul', {}, ...n.info.map((x) => h('li', {}, x))) : null,
      h('div', { class: 'muted small' }, `${ins} arrow(s) in, ${outs} out.`),
    )
    const row = h('div', { class: 'row' })
    if (n.explorer) row.appendChild(h('span', { class: 'explink' }, link(n.explorer, `Open on ${n.explorerName ?? 'explorer'}`)))
    if (n.address) {
      const c = h('button', { type: 'button' }, 'Copy address')
      c.addEventListener('click', () => {
        try {
          void navigator.clipboard.writeText(n.address!).then(() => (c.textContent = 'Copied'))
        } catch {
          /* optional */
        }
      })
      row.appendChild(c)
    }
    for (const a of n.actions ?? []) {
      const b = h('button', { type: 'button' }, a.label)
      b.addEventListener('click', a.run)
      row.appendChild(b)
    }
    if (row.childNodes.length) info.appendChild(row)
  }

  // ---------- pointers: pan, drag a box, pinch ----------
  const pointers = new Map<number, { x: number; y: number }>()
  let drag: { kind: 'pan' | 'node'; nid?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null = null
  let pinch: { d: number; k: number } | null = null
  const local = (ev: PointerEvent | WheelEvent) => {
    const r = board.getBoundingClientRect()
    return { x: ev.clientX - r.left, y: ev.clientY - r.top }
  }

  board.addEventListener('pointerdown', (ev) => {
    if ((ev.target as Element).closest('.boardtools')) return
    pointers.set(ev.pointerId, local(ev))
    board.setPointerCapture?.(ev.pointerId)
    if (pointers.size === 2) {
      const [p1, p2] = [...pointers.values()]
      pinch = { d: Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y), k: view.k }
      drag = null
      return
    }
    const g = (ev.target as Element).closest('.gnode')
    const nid = g ? [...nodeEls].find(([, el]) => el === g)?.[0] : undefined
    const p = local(ev)
    if (nid) {
      const np = pos.get(nid)!
      drag = { kind: 'node', nid, sx: p.x, sy: p.y, ox: np.x, oy: np.y, moved: false }
    } else {
      drag = { kind: 'pan', sx: p.x, sy: p.y, ox: view.x, oy: view.y, moved: false }
      board.classList.add('dragging')
    }
  })
  board.addEventListener('pointermove', (ev) => {
    if (!pointers.has(ev.pointerId)) return
    const p = local(ev)
    pointers.set(ev.pointerId, p)
    if (pinch && pointers.size === 2) {
      const [p1, p2] = [...pointers.values()]
      const d = Math.hypot(p1!.x - p2!.x, p1!.y - p2!.y)
      zoomAt((pinch.k * (d / pinch.d)) / view.k, (p1!.x + p2!.x) / 2, (p1!.y + p2!.y) / 2)
      return
    }
    if (!drag) return
    const dx = p.x - drag.sx
    const dy = p.y - drag.sy
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true
    if (drag.kind === 'pan') {
      view = { ...view, x: drag.ox + dx, y: drag.oy + dy }
      applyView()
    } else if (drag.nid) {
      pos.set(drag.nid, { x: drag.ox + dx / view.k, y: drag.oy + dy / view.k })
      placeNodes()
      drawEdges()
    }
  })
  const up = (ev: PointerEvent) => {
    pointers.delete(ev.pointerId)
    if (pointers.size < 2) pinch = null
    board.classList.remove('dragging')
    if (drag && !drag.moved) select(drag.kind === 'node' ? drag.nid! : null)
    drag = null
  }
  board.addEventListener('pointerup', up)
  board.addEventListener('pointercancel', up)
  board.addEventListener(
    'wheel',
    (ev) => {
      ev.preventDefault()
      const p = local(ev)
      zoomAt(Math.exp(-ev.deltaY * 0.0015), p.x, p.y)
    },
    { passive: false },
  )
  board.addEventListener('keydown', (ev) => {
    const g = (ev.target as Element).closest?.('.gnode')
    if (g && (ev.key === 'Enter' || ev.key === ' ')) {
      ev.preventDefault()
      select([...nodeEls].find(([, el]) => el === g)?.[0] ?? null)
    }
  })

  // ---------- toolbar ----------
  const tool = (label: string, title: string, run: () => void) => {
    const b = h('button', { type: 'button', title, 'aria-label': title }, label)
    b.addEventListener('click', run)
    return b
  }
  const centre = () => {
    const r = board.getBoundingClientRect()
    return [r.width / 2, r.height / 2] as const
  }
  board.append(
    h(
      'div',
      { class: 'boardtools' },
      tool('+', 'Zoom in', () => zoomAt(1.25, ...centre())),
      tool('−', 'Zoom out', () => zoomAt(0.8, ...centre())),
      tool('⤢', 'Fit everything', fit),
      tool('⛶', 'Full screen', () => {
        if (document.fullscreenElement) void document.exitFullscreen?.()
        else void board.requestFullscreen?.().then(() => setTimeout(fit, 120))
      }),
    ),
    h('div', { class: 'boardtip' }, 'Drag to move · scroll or pinch to zoom'),
  )

  placeNodes()
  drawEdges()
  applyView()
  showDefault()
  // Fit once the board has a size (it may be built before it is attached or while hidden).
  // Lay out for the board's real shape once it has one (it may be built while hidden).
  const firstFit = () => {
    if (laidOut || board.clientWidth === 0) return
    laidOut = true
    const widest = Math.max(...cols.map((c) => Math.min(PER, spec.nodes.filter((n) => n.col === c).length)))
    const vertical = board.clientWidth < 720 && widest <= Math.max(2, Math.floor(board.clientWidth / (W + 26)) + 1)
    layout(vertical && cols.length > 2)
    placeNodes()
    drawEdges()
    fit()
  }
  const ro =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          firstFit()
          if (laidOut) ro?.disconnect()
        })
      : null
  ro?.observe(board)
  queueMicrotask(firstFit)

  const legend = h(
    'ul',
    { class: 'boardlegend' },
    ...usedKinds.map((k) => h('li', {}, h('span', { class: `sw sw-${k}`, 'aria-hidden': 'true' }), EDGE_TEXT[k])),
  )

  return h(
    'div',
    { class: 'card boardcard' },
    h('div', { class: 'boardhead' }, h('h3', {}, spec.title), spec.desc ? h('span', { class: 'muted small' }, spec.desc) : null),
    board,
    legend,
    info,
    spec.footnote ? h('p', { class: 'muted small' }, spec.footnote) : null,
  )
}
