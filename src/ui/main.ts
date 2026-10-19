import { h } from './dom'
import { scanTab } from './scanTab'
import { sendTab } from './sendTab'
import { verifyTab } from './verifyTab'
import './style.css'

const TABS = [
  { id: 'verify', label: 'Verify tx', make: () => verifyTab() },
  { id: 'scan', label: 'Scan wallet', make: () => scanTab(() => undefined) },
  { id: 'send', label: 'Check before sending', make: () => sendTab() },
] as const

function mount(root: HTMLElement): void {
  const panels = TABS.map((t) => {
    const p = t.make()
    p.hidden = true
    return p
  })
  const buttons = TABS.map((t, i) => {
    const b = h('button', { type: 'button', role: 'tab', class: 'tabbtn', id: `tabbtn-${t.id}` }, t.label)
    b.addEventListener('click', () => select(i))
    return b
  })
  const select = (i: number) => {
    panels.forEach((p, j) => (p.hidden = i !== j))
    buttons.forEach((b, j) => b.setAttribute('aria-selected', String(i === j)))
    try {
      sessionStorage.setItem('ftp.tab', String(i))
    } catch {
      /* optional */
    }
  }

  root.append(
    h(
      'header',
      { class: 'top' },
      h('h1', {}, 'Flash Token Protector'),
      h('p', { class: 'tagline' }, 'Is this USDT real? Read-only checks against the chain. No wallet connection, no signatures, no keys.'),
      h('p', { class: 'domain' }, 'You are on ', h('strong', {}, location.host || 'local file'), '. Bookmark it. Clones of checker sites exist.'),
    ),
    h('nav', { class: 'tabs', role: 'tablist' }, ...buttons),
    ...panels,
    h(
      'footer',
      { class: 'foot' },
      h('p', {}, 'This tool never says "safe". VERIFIED means: canonical USDT reached your address in a final block, as reported by two independent RPC providers.'),
      h('p', {}, 'It cannot see fiat chargebacks, a compromised device, or anything off-chain. Never share a seed phrase. Nobody legitimate needs it.'),
    ),
  )
  let start = 0
  try {
    start = Number(sessionStorage.getItem('ftp.tab') ?? 0) || 0
  } catch {
    /* optional */
  }
  select(Math.min(Math.max(start, 0), TABS.length - 1))
}

mount(document.getElementById('app')!)
