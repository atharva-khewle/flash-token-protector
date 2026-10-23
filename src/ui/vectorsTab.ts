// Attack vectors tab: pick a vector on the left, see it drawn on the same whiteboard the result maps use
// (drag to move, scroll or pinch to zoom), with the story step by step and a real-world case below.

import { clear, h, link } from './dom'
import { type BoardSpec, whiteboard } from './graph'
import { INCIDENTS } from './incidents'
import type { Scene } from './sceneKit'
import { SCENES_A } from './scenesA'
import { SCENES_B } from './scenesB'
import { VECTORS, type Vector } from './vectors'

export const SCENES: Record<string, Scene> = { ...SCENES_A, ...SCENES_B }

/** The scam people meet most: a fake token that looks like USDT. Shown first. */
export const DEFAULT_VECTOR = 'A1'

function boardOf(v: Vector, s: Scene): BoardSpec {
  return {
    title: 'Attack map',
    desc: 'Red arrows are fake or attacker-controlled. Green arrows are real USDT. Tap a box for details.',
    nodes: s.nodes.map((n) => ({ id: n.id, title: n.title, badge: n.badge, kind: n.kind, col: n.col, info: n.info })),
    edges: s.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind, label: e.label })),
    footnote: s.foot,
    direction: 'down',
  }
}

function detail(v: Vector): HTMLElement {
  const s = SCENES[v.id]
  const inc = INCIDENTS[v.id]
  const body: (Node | null)[] = [
    h('header', { class: 'vx-top' }, h('span', { class: 'vx-id' }, v.id), h('h3', {}, v.name), h('span', { class: `vx-sev sev-${v.sev.toLowerCase()}` }, v.sev)),
    h('p', { class: 'muted small' }, `${v.group} · Chains: ${v.chains} · Layer: ${v.layer}`),
  ]
  if (s) {
    body.push(whiteboard(boardOf(v, s)))
    body.push(h('h4', { class: 'vx-h' }, 'What happens, step by step'), h('ol', { class: 'vx-steps' }, ...s.steps.map((t) => h('li', {}, t))))
  }
  body.push(h('h4', { class: 'vx-h' }, 'How this tool catches it'), h('p', {}, v.det))
  if (inc) {
    body.push(
      h(
        'div',
        { class: 'vx-incident' },
        h('div', { class: 'vx-incidenttag' }, 'Real-world case'),
        h('h4', {}, inc.title, inc.when ? ` (${inc.when})` : ''),
        h('p', {}, inc.text),
        h('p', { class: 'small' }, link(inc.url, 'Read the write-up'), ` · ${inc.source}`),
      ),
    )
  }
  body.push(h('details', { class: 'vx-more' }, h('summary', {}, 'Technical description from the README'), h('div', { class: 'vx-detail' }, h('p', {}, h('strong', {}, 'How it works. '), v.how), v.sees ? h('p', {}, h('strong', {}, 'What the victim sees. '), v.sees) : null)))
  return h('div', { class: 'vx-detailbox' }, ...body)
}

export function vectorsTab(): HTMLElement {
  const stage = h('div', { class: 'vx-stage' })
  const picks = new Map<string, HTMLButtonElement>()
  const picker = h('nav', { class: 'vx-picker', 'aria-label': 'Attack vectors' })

  const show = (id: string) => {
    const v = VECTORS.find((x) => x.id === id) ?? VECTORS[0]!
    for (const [k, b] of picks) b.setAttribute('aria-current', String(k === v.id))
    clear(stage)
    stage.appendChild(detail(v))
  }

  const groups = [...new Set(VECTORS.map((v) => v.group))]
  const top = VECTORS.find((v) => v.id === DEFAULT_VECTOR)!
  const makeBtn = (v: Vector, extra?: string) => {
    const b = h('button', { type: 'button', class: 'vx-pick', id: `vx-${v.id}` }, h('span', { class: 'vx-pickid' }, v.id), h('span', { class: 'vx-pickname' }, v.name), extra ? h('span', { class: 'vx-pickflag' }, extra) : null)
    b.addEventListener('click', () => show(v.id))
    picks.set(v.id, b)
    return b
  }
  picker.append(h('div', { class: 'vx-group' }, 'Most common'), makeBtn(top, 'Start here'))
  for (const g of groups) {
    picker.append(h('div', { class: 'vx-group' }, g))
    for (const v of VECTORS.filter((x) => x.group === g && x.id !== DEFAULT_VECTOR)) picker.append(makeBtn(v))
  }

  const root = h('div', { class: 'tab vx-root', id: 'tab-vectors' }, h('p', { class: 'lead' }, 'Pick an attack below. The board shows who does what and which funds move where, like the maps in your results. Drag the board, scroll or pinch to zoom.'), h('div', { class: 'vx-layout' }, picker, stage))
  show(DEFAULT_VECTOR)
  return root
}
