import { CHAINS, type ChainKey } from '../registry/chains'
import { canonicalUsdt } from '../registry/usdt'
import { parseAddress } from '../lib/input'
import { getRecent, getWatchlist } from '../lib/storage'
import { checkDestination, classifyCode } from '../verdict/wallet'
import { adapterFor } from '../chains'
import { clear, field, h } from './dom'
import { addr, badge, busy, chainSelect, diffAddress, note } from './common'

export function sendTab(): HTMLElement {
  const chain = chainSelect('bsc')
  const dest = h('input', { type: 'text', placeholder: 'Destination address', autocomplete: 'off', spellcheck: 'false' })
  const btn = h('button', { type: 'submit', class: 'primary' }, 'Check')
  const out = h('div', { class: 'result', 'aria-live': 'polite' })
  const err = h('p', { class: 'error', role: 'alert' })
  const form = h('form', { class: 'card form' }, field('Chain', chain), field('Paste the destination', dest, 'Paste it from the original source (the person, invoice or exchange page), not from your wallet history.'), err, btn)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    err.textContent = ''
    clear(out)
    const c = chain.value as ChainKey
    const p = parseAddress(dest.value, CHAINS[c].family)
    if (!p.ok) return void (err.textContent = p.reason)
    const card = h('div', { class: 'card' })
    if (p.hidden > 0) card.appendChild(note(`The pasted text contained ${p.hidden} hidden character(s). They were removed. Re-copy from the original source.`, 'warn'))

    const res = checkDestination(p.display, getWatchlist(c).map((w) => w.address), getRecent(c))
    if (res.level === 'danger') {
      card.appendChild(h('div', { class: 'verdict' }, badge('LOOKALIKE', 'bad'), h('p', {}, res.detail)))
      for (const m of res.matches) {
        card.appendChild(h('div', { class: 'cmp' }, h('span', { class: 'muted' }, 'pasted: '), diffAddress(p.display, m.target)))
        card.appendChild(h('div', { class: 'cmp' }, h('span', { class: 'muted' }, 'yours:  '), addr(m.target)))
      }
    } else if (res.level === 'known') {
      card.appendChild(h('div', { class: 'verdict' }, badge('KNOWN', 'ok'), h('p', {}, res.detail)))
    } else {
      card.appendChild(h('div', { class: 'verdict' }, badge('NEW', 'warn'), h('p', {}, res.detail)))
    }

    const usdt = canonicalUsdt(c)
    if (p.hex === usdt.hex) {
      card.appendChild(note('This is the USDT token contract itself. Tokens sent to it are usually lost.', 'danger'))
    }
    card.appendChild(
      note('Withdrawing from Binance? Turn on the withdrawal whitelist and save addresses in the Address Book once, from the source. Then always pick from the whitelist, never from history.', 'info'),
    )
    out.appendChild(card)

    // Extra context that needs the network; the lookalike verdict above does not wait for it.
    busy(btn, true, 'Check')
    try {
      const code = classifyCode(await adapterFor(c).getCode(p.hex))
      if (code.kind === 'contract') card.appendChild(note('Destination is a smart contract, not a personal wallet. Make sure that is expected.', 'warn'))
      if (code.kind === 'delegated') card.appendChild(note('Destination is an EIP-7702 delegated account (code set on a wallet).', 'info'))
    } catch {
      /* code check is optional */
    } finally {
      busy(btn, false, 'Check')
    }
  })

  return h('section', { class: 'tab', id: 'tab-send' }, form, out)
}
