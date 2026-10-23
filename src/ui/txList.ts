// "Show all transactions" under an address result: every transfer the scan has read so far (all
// rounds of "Analyze older history"), incoming and outgoing, filterable by direction and by token.

import type { Hex, TokenTransfer } from '../chains/types'
import { displayAddress } from '../lib/address'
import { CHAINS } from '../registry/chains'
import { canonicalUsdt } from '../registry/usdt'
import type { ScanOutput } from '../services/scan'
import { formatUnits } from '../verdict/transfer'
import { clear, h, link } from './dom'
import { openCheck, tokenAmount } from './common'

type Dir = 'all' | 'in' | 'out'
const PAGE = 50
const short = (s: string) => (s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s)

interface TokenInfo {
  token: Hex
  label: string
  kind: 'real' | 'fake' | 'other'
  count: number
}

function when(t: TokenTransfer): string {
  if (t.timestamp) return new Date(t.timestamp * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  return t.blockNumber !== null ? `block ${t.blockNumber}` : ''
}

export function txListPanel(r: ScanOutput): HTMLElement {
  const usdt = canonicalUsdt(r.chain)
  const me = r.address.toLowerCase()
  const ex = CHAINS[r.chain].explorer
  const impersonators = new Set(r.wallet.fakeTokens.filter((g) => g.impersonatesUsdt).map((g) => g.token))
  const kindOf = (t: TokenTransfer): TokenInfo['kind'] => (t.token.toLowerCase() === usdt.hex ? 'real' : impersonators.has(t.token) ? 'fake' : 'other')

  // Newest first; one row per transfer that touches this address.
  const rows = r.transfers
    .filter((t) => t.from === me || t.to === me)
    .sort((a, b) => (b.timestamp ?? Number(b.blockNumber ?? 0n)) - (a.timestamp ?? Number(a.blockNumber ?? 0n)))

  const tokens = new Map<Hex, TokenInfo>()
  for (const t of rows) {
    const k = kindOf(t)
    const cur = tokens.get(t.token) ?? { token: t.token, kind: k, count: 0, label: k === 'real' ? 'USDT (real)' : `${(t.tokenSymbol ?? 'unnamed').slice(0, 16)}${k === 'fake' ? ' (fake)' : ''}` }
    cur.count++
    tokens.set(t.token, cur)
  }

  let dir: Dir = 'all'
  let token: Hex | 'all' = 'all'
  let shown = PAGE

  const toggle = h('button', { type: 'button', class: 'txl-toggle', 'aria-expanded': 'false' }, `Show all transactions (${rows.length})`)
  const panel = h('div', { class: 'txl' })
  panel.hidden = true

  const dirBar = h('div', { class: 'filters', role: 'group', 'aria-label': 'Direction' })
  const tokenSel = h('select', { 'aria-label': 'Token' })
  tokenSel.appendChild(h('option', { value: 'all' }, `All tokens (${rows.length})`))
  for (const t of [...tokens.values()].sort((a, b) => ({ real: 0, fake: 1, other: 2 })[a.kind] - ({ real: 0, fake: 1, other: 2 })[b.kind] || b.count - a.count)) {
    tokenSel.appendChild(h('option', { value: t.token }, `${t.label} (${t.count})`))
  }
  tokenSel.addEventListener('change', () => {
    token = tokenSel.value as Hex | 'all'
    shown = PAGE
    render()
  })
  const body = h('div', {})

  const renderDir = () => {
    clear(dirBar)
    for (const [id, label] of [
      ['all', 'All'],
      ['in', 'Incoming'],
      ['out', 'Outgoing'],
    ] as const) {
      const b = h('button', { type: 'button', class: 'filter', 'aria-pressed': String(dir === id) }, label)
      b.addEventListener('click', () => {
        dir = id
        shown = PAGE
        renderDir()
        render()
      })
      dirBar.appendChild(b)
    }
  }

  const render = () => {
    clear(body)
    const list = rows.filter((t) => (dir === 'all' || (dir === 'in' ? t.to === me : t.from === me)) && (token === 'all' || t.token === token))
    if (list.length === 0) {
      body.appendChild(h('p', { class: 'muted' }, 'No transfers match these filters in the history read so far.'))
      return
    }
    const tb = h('tbody', {})
    for (const t of list.slice(0, shown)) {
      const k = kindOf(t)
      const incoming = t.to === me
      const other = displayAddress(r.chain, incoming ? t.from : t.to)
      const amount = k === 'real' ? `${formatUnits(t.value, usdt.decimals)} USDT` : tokenAmount(t.value, t.decimals, t.tokenSymbol)
      const check = h('button', { type: 'button', class: 'link small' }, 'Check')
      check.addEventListener('click', () => openCheck('tx', r.chain, t.txHash))
      const exUrl = ex.tx(t.txHash)
      tb.appendChild(
        h(
          'tr',
          { class: `txl-${k}` },
          h('td', { class: 'muted small' }, when(t)),
          h('td', {}, h('span', { class: `txl-dir ${incoming ? 'in' : 'out'}` }, incoming ? '↓ In' : '↑ Out')),
          h('td', {}, h('span', { class: `txl-tok k-${k}` }, k === 'real' ? 'USDT' : (t.tokenSymbol ?? 'unnamed').slice(0, 16)), k === 'fake' ? h('span', { class: 'txl-flag' }, 'fake') : null),
          h('td', { class: `txl-amt ${k}` }, `${incoming ? '+' : '−'}${amount}`),
          h('td', {}, h('code', { class: 'addr', title: other }, short(other))),
          h('td', { class: 'txl-actions' }, check, exUrl ? link(exUrl, ex.name) : null),
        ),
      )
    }
    body.appendChild(
      h(
        'div',
        { class: 'txl-scroll' },
        h(
          'table',
          { class: 'tbl txl-table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'When'), h('th', {}, 'Direction'), h('th', {}, 'Token'), h('th', {}, 'Amount'), h('th', {}, incoming(dir)), h('th', {}, 'Transaction'))),
          tb,
        ),
      ),
    )
    if (list.length > shown) {
      const more = h('button', { type: 'button' }, `Show ${Math.min(PAGE, list.length - shown)} more (${list.length - shown} left)`)
      more.addEventListener('click', () => {
        shown += PAGE
        render()
      })
      body.appendChild(more)
    }
  }
  const incoming = (d: Dir) => (d === 'in' ? 'From' : d === 'out' ? 'To' : 'From / to')

  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden
    toggle.setAttribute('aria-expanded', String(!panel.hidden))
    toggle.textContent = panel.hidden ? `Show all transactions (${rows.length})` : 'Hide transactions'
    if (!panel.hidden && !body.firstChild) {
      renderDir()
      render()
    }
  })

  panel.append(
    h('div', { class: 'txl-bar' }, dirBar, tokenSel),
    h('p', { class: 'muted small' }, `${r.coverage[0] ?? ''} Fake-token amounts are what the token itself reports.`),
    body,
  )
  return h('div', { class: 'txl-wrap' }, toggle, panel)
}
