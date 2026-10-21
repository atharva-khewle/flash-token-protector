// "Which servers said what": every server's answer, how up to date it was, how much we trust it,
// and what the differences probably mean. Shown open whenever the servers did not simply agree.

import type { NormReceipt, ProviderResult } from '../chains/types'
import { analyzeProviders, type Role } from '../verdict/providers'
import { h } from './dom'
import { badge } from './common'

const ROLE: Record<Role, { text: string; kind: string }> = {
  agrees: { text: 'Agrees', kind: 'ok' },
  alone: { text: 'Only answer', kind: 'warn' },
  behind: { text: 'Behind', kind: 'warn' },
  limited: { text: 'Limited', kind: 'warn' },
  conflicts: { text: 'Disagrees', kind: 'bad' },
}
const RELIABILITY_KIND = { 'usually reliable': 'ok', 'sometimes limited': 'warn', 'often limited': 'bad' } as const

export function renderProviders(providers: ProviderResult<NormReceipt>[]): HTMLElement | null {
  if (providers.length === 0) return null
  const a = analyzeProviders(providers)
  const maxHead = a.rows.reduce<bigint | null>((m, r) => (r.head !== null && (m === null || r.head > m) ? r.head : m), null)
  const allGood = a.outcome === 'agree' && a.rows.every((r) => r.role === 'agrees')

  const list = h('div', { class: 'servers' })
  for (const r of a.rows) {
    const lag = r.head !== null && maxHead !== null && maxHead > r.head ? ` (${maxHead - r.head} behind the newest)` : ''
    list.appendChild(
      h(
        'div',
        { class: `server server-${r.role}` },
        h('div', { class: 'serverhead' }, h('strong', {}, r.provider), badge(ROLE[r.role].text, ROLE[r.role].kind), badge(r.note.reliability, RELIABILITY_KIND[r.note.reliability])),
        h('div', {}, h('span', { class: 'muted' }, 'Said: '), r.said),
        h('div', { class: 'muted small' }, `Latest block it knew: ${r.head !== null ? r.head.toString() + lag : 'unknown'}${r.ms !== null ? ` · answered in ${r.ms} ms` : ''}`),
        h('div', { class: 'small' }, r.why),
        h('div', { class: 'muted small' }, `${r.note.operator}. ${r.note.note}`),
      ),
    )
  }

  const body = h(
    'div',
    {},
    h('p', {}, h('strong', {}, a.summary)),
    list,
    a.likely.length > 0 ? h('h4', {}, 'What is probably happening') : null,
    a.likely.length > 0 ? h('ul', { class: 'risks' }, ...a.likely.map((x) => h('li', {}, x))) : null,
    h('h4', {}, 'Who to believe'),
    h('p', {}, a.believe),
    h('p', { class: 'muted small' }, 'Reliability notes come from our own tests and can change. The verdict never relies on them: it needs two servers that return the identical answer.'),
  )
  const box = h('details', { class: 'card serversbox' }, h('summary', {}, allGood ? `Servers checked: ${a.agreeing} agreed` : 'Servers did not fully agree. See what each one said'), body)
  if (!allGood) box.open = true
  return box
}
