import { CHAINS, type ChainKey } from '../registry/chains'
import { parseAddress } from '../lib/input'
import { displayAddress } from '../lib/address'
import { addWatch, getWatchlist, removeWatch } from '../lib/storage'
import { runScan, type ScanOutput } from '../services/scan'
import type { Hex } from '../chains/types'
import { clear, field, h, link } from './dom'
import { addr, badge, busy, chainSelect, diffAddress, note } from './common'

export function scanTab(onWatchChange: () => void): HTMLElement {
  const chain = chainSelect('bsc')
  const address = h('input', { type: 'text', placeholder: 'Address to scan', autocomplete: 'off', spellcheck: 'false' })
  const btn = h('button', { type: 'submit', class: 'primary' }, 'Scan')
  const out = h('div', { class: 'result', 'aria-live': 'polite' })
  const err = h('p', { class: 'error', role: 'alert' })
  const watchBox = h('div', { class: 'card' })

  const renderWatch = () => {
    clear(watchBox)
    watchBox.appendChild(h('h3', {}, 'Watchlist (your own addresses, incl. your Binance deposit addresses)'))
    watchBox.appendChild(h('p', { class: 'muted small' }, 'Stored only in this browser. Used to spot lookalikes.'))
    const label = h('input', { type: 'text', placeholder: 'Label (e.g. Binance BEP20 deposit)' })
    const wa = h('input', { type: 'text', placeholder: 'Address', autocomplete: 'off', spellcheck: 'false' })
    const wc = chainSelect(chain.value as ChainKey)
    const add = h('button', { type: 'button' }, 'Add')
    const werr = h('p', { class: 'error' })
    add.addEventListener('click', () => {
      const c = wc.value as ChainKey
      const p = parseAddress(wa.value, CHAINS[c].family)
      if (!p.ok) return void (werr.textContent = p.reason)
      addWatch({ chain: c, address: p.display, label: label.value.trim().slice(0, 60) })
      renderWatch()
      onWatchChange()
    })
    watchBox.appendChild(h('div', { class: 'row' }, wc, wa, label, add))
    watchBox.appendChild(werr)
    const list = getWatchlist()
    if (list.length === 0) watchBox.appendChild(h('p', { class: 'muted' }, 'Empty.'))
    const ul = h('ul', { class: 'watch' })
    for (const w of list) {
      const rm = h('button', { type: 'button', class: 'link' }, 'remove')
      rm.addEventListener('click', () => {
        removeWatch(w.chain, w.address)
        renderWatch()
        onWatchChange()
      })
      ul.appendChild(h('li', {}, h('span', { class: 'tag' }, w.chain.toUpperCase()), addr(w.address), w.label ? h('span', { class: 'muted' }, ` ${w.label}`) : null, ' ', rm))
    }
    watchBox.appendChild(ul)
  }
  renderWatch()

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
    busy(btn, true, 'Scan')
    try {
      out.appendChild(renderScan(await runScan(c, p.hex, watch)))
    } catch (e2) {
      out.appendChild(note(`Scan failed: ${e2 instanceof Error ? e2.message : String(e2)}`, 'warn'))
    } finally {
      busy(btn, false, 'Scan')
    }
  })

  return h(
    'section',
    { class: 'tab', id: 'tab-scan' },
    h('p', { class: 'lead' }, 'Find fake USDT, address-poisoning attempts, risky approvals and account takeovers on an address. Read-only.'),
    form,
    out,
    watchBox,
  )
}

function renderScan(r: ScanOutput): HTMLElement {
  const info = CHAINS[r.chain]
  const show = (x: Hex) => displayAddress(r.chain, x)
  const wrap = h('div', { class: 'card' })
  wrap.appendChild(h('p', {}, 'Scanned ', addr(show(r.address)), ' on ', info.name, ' · ', link(info.explorer.address(show(r.address)), info.explorer.name)))

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
    const li = h('li', {}, h('div', {}, badge(p.kind, 'bad'), ' ', p.detail), h('div', { class: 'small' }, link(info.explorer.tx(p.txHash), 'tx')))
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
