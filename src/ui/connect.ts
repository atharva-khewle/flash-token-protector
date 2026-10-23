// "Connect wallet" in the top bar. Optional and read-only: it only asks the wallet which account is
// selected, then the Monitor a wallet panel follows that address.

import { discoverWallets, type DiscoveredWallet } from '../lib/wallet'
import { displayAddress } from '../lib/address'
import { clear, h } from './dom'
import type { WalletHooks } from './walletTab'

const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`

export function connectButton(hooks: WalletHooks, show: () => void): HTMLElement {
  const wrap = h('div', { class: 'connect' })
  const btn = h('button', { type: 'button', class: 'primary connectbtn', 'aria-haspopup': 'true', 'aria-expanded': 'false' }, 'Connect wallet')
  const menu = h('div', { class: 'connectmenu', role: 'menu' })
  menu.hidden = true
  wrap.append(btn, menu)

  const close = () => {
    menu.hidden = true
    btn.setAttribute('aria-expanded', 'false')
  }
  const openMenu = (...items: (Node | string)[]) => {
    clear(menu)
    menu.append(...items)
    menu.hidden = false
    btn.setAttribute('aria-expanded', 'true')
  }

  const connect = async (w: DiscoveredWallet) => {
    close()
    btn.disabled = true
    btn.textContent = 'Connecting…'
    try {
      await hooks.connect?.(w)
      show()
    } catch (e) {
      openMenu(h('p', { class: 'error' }, e instanceof Error ? e.message : String(e)))
    } finally {
      btn.disabled = false
      render()
    }
  }

  const render = () => {
    const a = hooks.current?.()
    btn.textContent = a ? short(displayAddress(a.chain, a.address)) : 'Connect wallet'
    btn.classList.toggle('connected', !!a)
    btn.title = a ? `${a.via === 'wallet' ? 'Connected' : 'Watching'} (read-only)` : 'Optional. Read-only: never asks you to sign or send.'
  }
  hooks.onAccount = render

  btn.addEventListener('click', async () => {
    if (!menu.hidden) return close()
    const a = hooks.current?.()
    if (a) {
      const view = h('button', { type: 'button', role: 'menuitem' }, 'Open wallet monitor')
      view.addEventListener('click', () => {
        close()
        show()
      })
      const off = h('button', { type: 'button', role: 'menuitem' }, a.via === 'wallet' ? 'Disconnect' : 'Stop watching')
      off.addEventListener('click', () => {
        close()
        hooks.disconnect?.()
      })
      return openMenu(h('div', { class: 'muted small' }, a.via === 'wallet' ? 'Connected · read-only' : 'Watching · read-only'), view, off)
    }
    openMenu(h('p', { class: 'muted small' }, 'Looking for wallets…'))
    const ws = await discoverWallets()
    if (ws.length === 0) {
      const paste = h('button', { type: 'button', role: 'menuitem' }, 'Paste an address instead')
      paste.addEventListener('click', () => {
        close()
        show()
      })
      return openMenu(h('p', { class: 'small' }, 'No browser wallet found (MetaMask, Trust, Rabby…).'), h('p', { class: 'muted small' }, 'Connecting is optional. You can watch any address by pasting it.'), paste)
    }
    if (ws.length === 1) return void connect(ws[0]!)
    openMenu(
      h('p', { class: 'muted small' }, 'Pick a wallet. It is only asked which account is selected.'),
      ...ws.map((w) => {
        const b = h('button', { type: 'button', role: 'menuitem' }, w.name)
        b.addEventListener('click', () => void connect(w))
        return b
      }),
    )
  })
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target as Node)) close()
  })
  render()
  return wrap
}
