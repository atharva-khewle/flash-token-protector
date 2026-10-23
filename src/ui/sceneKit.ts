// Small helpers for writing attack scenes: who the actors are (boxes) and what moves between them (arrows).
// Columns run left to right: 0 = attacker side, 1 = attacker tools/contracts, 2 = tokens/infrastructure, 3 = victim side, 4 = what happens next.

import type { EdgeKind, NodeKind } from './graph'

export interface SNode {
  id: string
  kind: NodeKind
  title: string
  col: number
  badge?: string
  info: string[]
}

export interface SEdge {
  from: string
  to: string
  kind: EdgeKind
  label?: string
}

export interface Scene {
  /** Numbered story, in plain words: what the attacker does and what moves where. */
  steps: string[]
  nodes: SNode[]
  edges: SEdge[]
  /** Optional line under the board. */
  foot?: string
}

const maker =
  (kind: NodeKind) =>
  (id: string, title: string, col: number, badge?: string, ...info: string[]): SNode => ({ id, kind, title, col, badge, info })

export const attacker = maker('attacker')
export const victim = maker('victim')
export const fake = maker('fake')
export const real = maker('real')
export const contract = maker('contract')
export const wallet = maker('wallet')
export const me = maker('me')
export const creator = maker('creator')
export const unknown = maker('unknown')

export const edge = (from: string, to: string, kind: EdgeKind, label?: string): SEdge => ({ from, to, kind, label })

export interface Incident {
  /** Short name of the real case. */
  title: string
  when?: string
  /** What happened, using only what the linked source reports. */
  text: string
  url: string
  /** Who published it. */
  source: string
}
