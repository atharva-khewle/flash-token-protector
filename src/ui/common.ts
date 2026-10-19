import { CHAIN_KEYS, CHAINS, type ChainKey } from '../registry/chains'
import { charDiff } from '../lib/lookalike'
import { h } from './dom'

export function chainSelect(initial: ChainKey = 'bsc'): HTMLSelectElement {
  const s = h('select', { name: 'chain' })
  for (const k of CHAIN_KEYS) {
    const o = h('option', { value: k }, CHAINS[k].name)
    if (k === initial) o.selected = true
    s.appendChild(o)
  }
  return s
}

export function badge(text: string, kind: string): HTMLElement {
  return h('span', { class: `badge badge-${kind}` }, text)
}

export function statusIcon(status: 'pass' | 'fail' | 'warn' | 'skip'): HTMLElement {
  const map = { pass: 'PASS', fail: 'FAIL', warn: 'WARN', skip: 'SKIP' }
  return h('span', { class: `st st-${status}` }, map[status])
}

/** Renders an address with characters that differ from `target` highlighted. */
export function diffAddress(candidate: string, target: string): HTMLElement {
  const wrap = h('code', { class: 'addr diff' })
  for (const { ch, same } of charDiff(candidate, target)) {
    wrap.appendChild(h('span', { class: same ? 'same' : 'differs' }, ch))
  }
  return wrap
}

export function addr(text: string): HTMLElement {
  return h('code', { class: 'addr' }, text)
}

export function note(text: string, kind: 'info' | 'warn' | 'danger' = 'info'): HTMLElement {
  return h('p', { class: `note note-${kind}` }, text)
}

export function busy(btn: HTMLButtonElement, on: boolean, label: string): void {
  btn.disabled = on
  btn.textContent = on ? 'Checking…' : label
}
