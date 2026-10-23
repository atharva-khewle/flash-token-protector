// Saved addresses: the user's own addresses (and ones they really pay). Every check compares
// addresses against this list to catch lookalikes. Stored only in this browser.

import { CHAINS, type ChainKey } from '../registry/chains'
import { parseAddress } from '../lib/input'
import { addWatch, getWatchlist, removeWatch } from '../lib/storage'
import { clear, field, h } from './dom'
import { addr, chainSelect } from './common'

export function savedTab(): HTMLElement {
  const box = h('div', { class: 'card' })

  const render = () => {
    clear(box)
    box.appendChild(h('h3', { class: 'flush' }, 'Watchlist (your own addresses, incl. your Binance deposit addresses)'))
    box.appendChild(h('p', { class: 'muted small' }, 'Stored only in this browser. Used to spot lookalikes in every check.'))
    const label = h('input', { type: 'text', placeholder: 'Label (e.g. Binance BEP20 deposit)', maxlength: '60' })
    const wa = h('input', { type: 'text', placeholder: 'Address', autocomplete: 'off', spellcheck: 'false' })
    const wc = chainSelect('bsc')
    const add = h('button', { type: 'button', class: 'primary' }, 'Add')
    const werr = h('p', { class: 'error' })
    add.addEventListener('click', () => {
      const c = wc.value as ChainKey
      const p = parseAddress(wa.value, CHAINS[c].family)
      if (!p.ok) return void (werr.textContent = p.reason)
      addWatch({ chain: c, address: p.display, label: label.value.trim().slice(0, 60) })
      render()
    })
    box.appendChild(h('div', { class: 'addrow' }, field('Network', wc), field('Address', wa), field('Label', label), add))
    box.appendChild(werr)
    const list = getWatchlist()
    if (list.length === 0) box.appendChild(h('p', { class: 'muted' }, 'Empty. Add the addresses your company receives funds on.'))
    const ul = h('ul', { class: 'watch' })
    for (const w of list) {
      const rm = h('button', { type: 'button', class: 'link' }, 'remove')
      rm.addEventListener('click', () => {
        removeWatch(w.chain, w.address)
        render()
      })
      ul.appendChild(h('li', {}, h('span', { class: 'tag' }, w.chain.toUpperCase()), addr(w.address), w.label ? h('span', { class: 'muted' }, ` ${w.label}`) : null, ' ', rm))
    }
    box.appendChild(ul)
  }
  render()

  return h(
    'section',
    { class: 'tab', id: 'tab-saved' },
    h('p', { class: 'lead' }, 'Lookalikes of these get flagged.'),
    box,
  )
}
