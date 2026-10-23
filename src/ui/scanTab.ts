import { CHAINS, type ChainKey } from '../registry/chains'
import { parseAddress } from '../lib/input'
import { displayAddress } from '../lib/address'
import { getWatchlist } from '../lib/storage'
import { runScan, type ScanOutput } from '../services/scan'
import type { Hex } from '../chains/types'
import { clear, field, h, maybeLink } from './dom'
import { summaryCard } from './summary'
import { plainScan } from '../verdict/plain'
import { addr, badge, busy, chainSelect, diffAddress, note } from './common'

export function scanTab(): HTMLElement {
  const chain = chainSelect('bsc')
  const address = h('input', { type: 'text', placeholder: 'Address to analyze', autocomplete: 'off', spellcheck: 'false' })
  const btn = h('button', { type: 'submit', class: 'primary' }, 'Analyze address')
  const out = h('div', { class: 'result', 'aria-live': 'polite' })
  const err = h('p', { class: 'error', role: 'alert' })

  const form = h('form', { class: 'card form' }, field('Chain', chain), field('Address', address), err, btn)
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    err.textContent = ''
    clear(out)
    const c = chain.value as ChainKey
    const fam = CHAINS[c].family
    const p = parseAddress(address.value, fam)
    if (!p.ok) return void (err.textContent = p.reason)
    const watch = getWatchlist(c)
      .map((w) => parseAddress(w.address, fam))
      .flatMap((x) => (x.ok ? [x.hex] : []))
    busy(btn, true, 'Analyze address')
    try {
      const res = await runScan(c, p.hex, watch)
      out.appendChild(summaryCard(plainScan(res), renderScan(res)))
    } catch (e2) {
      out.appendChild(note(`Scan failed: ${e2 instanceof Error ? e2.message : String(e2)}`, 'warn'))
    } finally {
      busy(btn, false, 'Analyze address')
    }
  })

  return h(
    'section',
    { class: 'tab', id: 'tab-scan' },
    h('p', { class: 'lead' }, 'Find fake USDT, address-poisoning attempts, risky approvals and account takeovers on an address. Read-only.'),
    form,
    out,
  )
}

function renderScan(r: ScanOutput): HTMLElement {
  const info = CHAINS[r.chain]
  const show = (x: Hex) => displayAddress(r.chain, x)
  const wrap = h('div', { class: 'card' })
  wrap.appendChild(h('p', {}, 'Scanned ', addr(show(r.address)), ' on ', info.name, ' ', maybeLink(info.explorer.address(show(r.address)), info.explorer.name)))

  wrap.appendChild(h('h3', {}, 'Coverage'))
  const cov = h('ul', { class: 'muted small' })
  for (const c of r.coverage) cov.appendChild(h('li', {}, c))
  wrap.appendChild(cov)
  wrap.appendChild(note('Nothing found ≠ safe. This scan only sees the window above.', 'info'))

  wrap.appendChild(h('h3', {}, 'Account control'))
  if (r.code) {
    if (r.code.kind === 'delegated') {
      wrap.appendChild(note(`EIP-7702: this address has delegated its code to ${show(r.code.to)}. If you did not do this on purpose, a drainer may control it. Move funds with a fresh wallet and revoke the delegation.`, 'danger'))
    } else if (r.code.kind === 'contract') {
      wrap.appendChild(note(`This is a contract (${r.code.size} bytes of code), not a normal wallet.`, 'info'))
    } else {
      wrap.appendChild(h('p', {}, badge('OK', 'ok'), ' Plain account, no EIP-7702 delegation.'))
    }
  }
  for (const t of r.tronPermissions) wrap.appendChild(note(t.detail, t.level === 'high' ? 'danger' : 'info'))
  if (!r.code && r.tronPermissions.length === 0) wrap.appendChild(h('p', {}, badge('OK', 'ok'), ' Owner permission belongs to this account only.'))

  wrap.appendChild(h('h3', {}, 'Live USDT approvals'))
  if (r.approvals.length === 0) wrap.appendChild(h('p', { class: 'muted' }, 'None found in the scanned window.'))
  else {
    const ul = h('ul', {})
    for (const a of r.approvals) {
      ul.appendChild(h('li', { class: `risk-${a.level}` }, addr(show(a.spender)), ` can spend ${a.formatted} USDT. Revoke it if you do not recognise this spender.`))
    }
    wrap.appendChild(ul)
  }

  wrap.appendChild(h('h3', {}, 'Real USDT (canonical contract)'))
  wrap.appendChild(h('p', {}, `In: ${r.wallet.realIn.count} transfers, ${r.wallet.realIn.total} USDT · Out: ${r.wallet.realOut.count} transfers, ${r.wallet.realOut.total} USDT`))

  wrap.appendChild(h('h3', {}, `Poisoning attempts (${r.wallet.poisoning.length})`))
  if (r.wallet.poisoning.length === 0) wrap.appendChild(h('p', { class: 'muted' }, 'None found in the scanned window.'))
  const pl = h('ul', { class: 'poison' })
  for (const p of r.wallet.poisoning) {
    const li = h('li', {}, h('div', {}, badge(p.kind, 'bad'), ' ', p.detail), h('div', { class: 'small' }, maybeLink(info.explorer.tx(p.txHash), 'tx'), h('code', { class: 'addr' }, p.txHash)))
    if (p.match) {
      li.appendChild(h('div', { class: 'cmp' }, h('span', { class: 'muted' }, 'fake: '), diffAddress(p.match.candidate, p.match.target)))
      li.appendChild(h('div', { class: 'cmp' }, h('span', { class: 'muted' }, 'yours: '), addr(p.match.target)))
    }
    pl.appendChild(li)
  }
  wrap.appendChild(pl)

  wrap.appendChild(h('h3', {}, `Fake / unknown tokens received (${r.wallet.fakeTokens.length})`))
  if (r.wallet.fakeTokens.length === 0) wrap.appendChild(h('p', { class: 'muted' }, 'None seen (see coverage).'))
  const fl = h('ul', {})
  for (const g of r.wallet.fakeTokens) {
    const risk = r.tokenRisks.find((x) => x.token === g.token)
    const li = h(
      'li',
      {},
      h('div', {}, h('strong', {}, `“${g.symbol ?? '?'}” ${g.name ?? ''}`), ' at ', addr(show(g.token)), ` · ${g.count} transfer(s)`, g.impersonatesUsdt ? badge('FAKE USDT', 'bad') : null),
    )
    const notes = [...g.nameNotes, ...(risk?.findings.map((f) => f.detail) ?? [])]
    if (notes.length > 0) {
      const ul = h('ul', { class: 'risks' })
      for (const n of [...new Set(notes)]) ul.appendChild(h('li', {}, n))
      li.appendChild(ul)
    }
    fl.appendChild(li)
  }
  wrap.appendChild(fl)
  return wrap
}
