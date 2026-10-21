// The friendly top of every result: a risk dial, one sentence, what it means, what to do.
// The full technical result is kept underneath, folded until the user asks for it.

import type { Plain } from '../verdict/plain'
import { h } from './dom'

const ICON = { good: '✓', caution: '!', danger: '✕' } as const
const LEVEL = { good: 'Low risk', caution: 'Be careful', danger: 'High risk' } as const

export function summaryCard(p: Plain, details: HTMLElement): HTMLElement {
  const dial = h('div', { class: `dial dial-${p.tone}`, role: 'img', 'aria-label': `Risk ${p.risk} out of 100: ${LEVEL[p.tone]}` }, h('span', { class: 'dialicon', 'aria-hidden': 'true' }, ICON[p.tone]))
  // CSSOM (allowed by the page CSP), not an inline style attribute.
  dial.style.setProperty('--pct', `${p.risk}%`)

  const toggle = h('button', { type: 'button', class: 'detailsbtn', 'aria-expanded': 'false' }, 'Show full details')
  const holder = h('div', { class: 'fulldetails' }, details)
  holder.hidden = true
  toggle.addEventListener('click', () => {
    holder.hidden = !holder.hidden
    toggle.setAttribute('aria-expanded', String(!holder.hidden))
    toggle.textContent = holder.hidden ? 'Show full details' : 'Hide details'
  })

  return h(
    'div',
    { class: 'resultwrap' },
    h(
      'div',
      { class: `card plain plain-${p.tone}` },
      h(
        'div',
        { class: 'plainhead' },
        dial,
        h('div', { class: 'plaintitle' }, h('div', { class: 'risklabel' }, `${LEVEL[p.tone]} · ${p.risk}/100`), h('h2', {}, p.title)),
      ),
      p.points.length ? h('ul', { class: 'plainpoints' }, ...p.points.map((x) => h('li', {}, x))) : null,
      p.todo.length ? h('div', { class: 'plaintodo' }, h('strong', {}, 'What to do'), h('ul', {}, ...p.todo.map((x) => h('li', {}, x)))) : null,
      h('div', { class: 'plainfoot' }, toggle, h('span', { class: 'muted small' }, 'Summary made by fixed rules from the data below. Nothing is sent to an AI.')),
    ),
    holder,
  )
}
