import { CHAINS, type ChainKey } from '../registry/chains'
import { canonicalUsdt } from '../registry/usdt'
import { parseAddress, parseAmount, parseTxHash } from '../lib/input'
import { displayAddress } from '../lib/address'
import { getWatchlist, markAccepted } from '../lib/storage'
import { runVerify, type VerifyOutput } from '../services/verify'
import { LAYER_NAMES } from '../verdict/types'
import type { Hex } from '../chains/types'
import { clear, field, h, maybeLink } from './dom'
import { addr, badge, busy, chainSelect, note, statusIcon } from './common'

export const VERDICT_TEXT: Record<VerifyOutput['verdict'], string> = {
  VERIFIED: 'Canonical USDT arrived at your address and every required check passed.',
  FAKE: 'This does not prove a real USDT payment to you. Do not release goods or funds.',
  UNVERIFIED: 'Not proven either way. Read the warnings and skipped checks below.',
  'NOT RECEIVED': 'Nothing has arrived on-chain. A pending or unknown tx is not a payment.',
}

export function verifyTab(): HTMLElement {
  const chain = chainSelect('bsc')
  const hash = h('input', { type: 'text', placeholder: '0x… (BSC/ETH) or 64 hex (Tron)', autocomplete: 'off', spellcheck: 'false' })
  const recipient = h('input', { type: 'text', placeholder: 'Your receiving address', autocomplete: 'off', spellcheck: 'false' })
  const amount = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'e.g. 5000' })
  const notBefore = h('input', { type: 'datetime-local' })
  const btn = h('button', { type: 'submit', class: 'primary' }, 'Verify')
  const out = h('div', { class: 'result', 'aria-live': 'polite' })
  const err = h('p', { class: 'error', role: 'alert' })

  const form = h(
    'form',
    { class: 'card form' },
    field('Chain', chain, 'Binance P2P on BEP20 = BNB Smart Chain.'),
    field('Transaction hash', hash),
    field('Your address (expected recipient)', recipient, 'Required for a VERIFIED verdict. A real payment to someone else looks the same.'),
    h('div', { class: 'row' }, field('Expected amount (USDT)', amount), field('Deal started at (optional)', notBefore, 'Payments mined before this are rejected.')),
    err,
    btn,
  )

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    err.textContent = ''
    clear(out)
    const c = chain.value as ChainKey
    const fam = CHAINS[c].family
    const ph = parseTxHash(hash.value, c)
    if (!ph.ok) return void (err.textContent = ph.reason)
    let rec: Hex | undefined
    if (recipient.value.trim()) {
      const pa = parseAddress(recipient.value, fam)
      if (!pa.ok) return void (err.textContent = `Your address: ${pa.reason}`)
      rec = pa.hex
    }
    let amt: bigint | undefined
    if (amount.value.trim()) {
      const v = parseAmount(amount.value, canonicalUsdt(c).decimals)
      if (v === null) return void (err.textContent = 'Amount: use digits and an optional decimal point, e.g. 5000 or 5000.50.')
      amt = v
    }
    let nb: number | undefined
    if (notBefore.value) {
      const t = Date.parse(notBefore.value)
      if (Number.isNaN(t)) return void (err.textContent = 'Deal start time is not a valid date.')
      nb = Math.floor(t / 1000)
    }
    const watch = getWatchlist(c)
      .map((w) => parseAddress(w.address, fam))
      .flatMap((p) => (p.ok ? [p.hex] : []))

    busy(btn, true, 'Verify')
    try {
      const r = await runVerify({ chain: c, hash: ph.hash, hiddenChars: ph.hidden, context: { recipient: rec, amount: amt, notBefore: nb }, watchlist: watch })
      out.appendChild(renderResult(r))
    } catch (e2) {
      out.appendChild(note(`Could not complete the check: ${e2 instanceof Error ? e2.message : String(e2)}. Result: UNVERIFIED.`, 'warn'))
    } finally {
      busy(btn, false, 'Verify')
    }
  })

  return h(
    'section',
    { class: 'tab', id: 'tab-verify' },
    h('p', { class: 'lead' }, 'Paste the tx hash the payer gave you. Checks run against the chain itself, not screenshots or links.'),
    form,
    out,
  )
}

function renderResult(r: VerifyOutput): HTMLElement {
  const usdt = canonicalUsdt(r.chain)
  const info = CHAINS[r.chain]
  const kind = r.verdict === 'VERIFIED' ? 'ok' : r.verdict === 'FAKE' ? 'bad' : r.verdict === 'NOT RECEIVED' ? 'bad' : 'warn'
  const show = (x: Hex) => displayAddress(r.chain, x)

  const wrap = h('div', { class: 'card' })
  wrap.appendChild(h('div', { class: 'verdict' }, badge(r.verdict, kind), h('p', {}, VERDICT_TEXT[r.verdict])))

  if (r.target && r.netToTarget !== null) {
    wrap.appendChild(
      h('p', { class: 'amount' }, 'Net canonical USDT to ', addr(show(r.target)), ': ', h('strong', {}, `${r.netFormatted} USDT`)),
    )
  }
  const txLink = maybeLink(info.explorer.tx(r.hash), info.explorer.name)
  if (txLink) wrap.appendChild(h('p', { class: 'muted' }, 'Open on ', txLink, ' (link built by this app; check the domain).'))
  wrap.appendChild(note('Depositing to Binance? The final truth is your Binance deposit history, not this page and not a screenshot.', 'info'))

  const list = h('ol', { class: 'checks' })
  for (const c of r.checks) {
    list.appendChild(
      h('li', { class: `check check-${c.status}` }, statusIcon(c.status), h('span', { class: 'layer' }, `${c.layer} ${LAYER_NAMES[c.layer]}`), h('span', { class: 'why' }, c.reason)),
    )
  }
  wrap.appendChild(h('h3', {}, 'Checks'))
  wrap.appendChild(list)

  if (r.net.length > 0) {
    const t = h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'Address'), h('th', {}, 'Net USDT change'))))
    const tb = h('tbody', {})
    for (const n of r.net) tb.appendChild(h('tr', {}, h('td', {}, addr(show(n.address))), h('td', { class: n.value > 0n ? 'pos' : 'neg' }, n.formatted)))
    t.appendChild(tb)
    wrap.appendChild(h('h3', {}, `Canonical USDT movements (${usdt.address})`))
    wrap.appendChild(t)
  }

  if (r.decoys.length > 0) {
    wrap.appendChild(h('h3', {}, `Decoys found (${r.decoys.length})`))
    const ul = h('ul', { class: 'decoys' })
    for (const d of r.decoys) {
      const risk = r.decoyRisks.find((x) => x.token === d.token)
      const label = risk && (risk.symbol || risk.name) ? `“${risk.symbol ?? ''}${risk.name ? ` / ${risk.name}` : ''}”` : 'unnamed token'
      const li = h(
        'li',
        {},
        h('div', {}, h('strong', {}, label), ' at ', addr(show(d.token)), d.touchesTarget ? badge('credits you', 'bad') : null),
        h('div', { class: 'muted' }, d.reason),
        d.value !== null && d.to ? h('div', { class: 'muted' }, `Claims ${d.value.toString()} raw units to `, addr(show(d.to)), ' (its own decimals are not trusted).') : null,
      )
      if (risk && risk.findings.length > 0) {
        const fl = h('ul', { class: 'risks' })
        for (const f of risk.findings) fl.appendChild(h('li', { class: `risk-${f.level}` }, f.detail))
        li.appendChild(fl)
      }
      ul.appendChild(li)
    }
    wrap.appendChild(ul)
  }

  if (r.verdict === 'VERIFIED') {
    const acc = h('button', { type: 'button' }, 'I accepted this payment (warn me if it is reused)')
    acc.addEventListener('click', () => {
      markAccepted(r.chain, r.hash)
      acc.disabled = true
      acc.textContent = 'Saved in this browser'
    })
    wrap.appendChild(acc)
  }

  const providers = r.checks.find((c) => c.id === 'L1.consensus')
  if (providers) wrap.appendChild(h('p', { class: 'muted small' }, `RPC: ${providers.reason}`))
  return wrap
}
