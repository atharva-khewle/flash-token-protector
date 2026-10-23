import { CHAINS, type ChainKey } from '../registry/chains'
import { parseAddress } from '../lib/input'
import { displayAddress } from '../lib/address'
import { getWatchlist } from '../lib/storage'
import { runScan, type ScanOutput } from '../services/scan'
import type { Hex } from '../chains/types'
import { clear, field, h, maybeLink } from './dom'
import { summaryCard } from './summary'
import { plainScan } from '../verdict/plain'
import { addr, badge, busy, chainSelect, diffAddress, explorerLinks, note } from './common'
import { scanDiagram } from './diagrams'
import { whiteboard } from './graph'

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
      const show = (res: ScanOutput) => {
        clear(out)
        const more = moreBar(res, async (b) => {
          b.disabled = true
          b.textContent = 'Reading older history…'
          try {
            show(await runScan(c, p.hex, watch, { prev: res }))
          } catch (e3) {
            b.disabled = false
            b.textContent = 'Analyze older history'
            b.after(note(`Could not read more: ${e3 instanceof Error ? e3.message : String(e3)}`, 'warn'))
          }
        })
        const board = h('div', {}, roleCard(res), whiteboard(scanDiagram(res)), more)
        out.appendChild(summaryCard(plainScan(res), renderScan(res), { links: explorerLinks(c, [{ kind: 'address', value: displayAddress(c, res.address) }]), board }))
      }
      show(await runScan(c, p.hex, watch))
    } catch (e2) {
      out.appendChild(note(`Scan failed: ${e2 instanceof Error ? e2.message : String(e2)}`, 'warn'))
    } finally {
      busy(btn, false, 'Analyze address')
    }
  })

  return h(
    'section',
    { class: 'tab', id: 'tab-scan' },
    h('p', { class: 'lead' }, 'Paste any wallet address. You see whether it is being attacked (fake USDT, poisoning, risky approvals) or is attacking others, with a map of who sent what to whom.'),
    form,
    out,
  )
}

/** Two boxes: is this address being attacked, and is it attacking others? */
function roleCard(r: ScanOutput): HTMLElement {
  const b = r.behavior
  const box = (kind: 'victim' | 'attacker', title: string, reasons: string[], none: string) =>
    h(
      'div',
      { class: `rolebox r-${kind}${reasons.length ? ' on' : ''}` },
      h('h4', {}, reasons.length ? `${title}: yes` : `${title}: no sign`),
      reasons.length ? h('ul', {}, ...reasons.map((x) => h('li', {}, x))) : h('div', { class: 'muted small' }, none),
    )
  return h(
    'div',
    { class: 'rolecard' },
    box('victim', 'Being attacked', b.victim, 'No poisoning, fake USDT or dust from strangers in the history checked.'),
    box('attacker', 'Attacking others', b.attacker, 'No dust sprinkling, zero-value campaigns or fake-token spreading in the history checked.'),
  )
}

/** How much history was read, and a button to read further back. */
function moreBar(r: ScanOutput, more: (b: HTMLButtonElement) => void): HTMLElement {
  const n = r.transfers.length
  const btn = h('button', { type: 'button', class: 'primary' }, 'Analyze older history')
  btn.addEventListener('click', () => more(btn))
  const what = r.coverage[0] ?? ''
  return h(
    'div',
    { class: 'morebar' },
    h('div', {}, h('strong', {}, `${n} transfer${n === 1 ? '' : 's'} analyzed`), r.rounds > 1 ? ` in ${r.rounds} rounds` : '', h('div', { class: 'muted small' }, what)),
    r.cursor ? btn : h('span', { class: 'muted small' }, 'That is all the history the free servers give for this address.'),
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
