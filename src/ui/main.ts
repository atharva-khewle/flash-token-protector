import { hydrateFromExtension } from '../lib/storage'
import { familyOfAddress } from '../lib/input'
import { h, link } from './dom'
import { scanTab } from './scanTab'
import { sendTab } from './sendTab'
import { verifyTab } from './verifyTab'
import './style.css'

const REPO = 'https://github.com/atharva-khewle/flash-token-protector'

const TABS = [
  { id: 'verify', label: 'Verify tx', make: () => verifyTab() },
  { id: 'scan', label: 'Scan wallet', make: () => scanTab(() => undefined) },
  { id: 'send', label: 'Check before sending', make: () => sendTab() },
] as const

function mount(root: HTMLElement, banner: HTMLElement | null): void {
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
    ...(banner ? [banner] : []),
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
      h('p', {}, link(REPO, 'Source code and test evidence'), ' · ', link(`${REPO}/releases/latest`, 'Chrome extension'), ' · ', link(`${REPO}/blob/main/docs/PROOF.md`, 'Proof of work')),
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

/** Right-click "Check with Flash Token Protector" opens popup.html?q=<selection>. */
function applyQuery(): void {
  const q = new URLSearchParams(location.search).get('q')?.trim().slice(0, 200)
  if (!q) return
  const isHash = /^(0x)?[0-9a-fA-F]{64}$/.test(q)
  const isAddr = familyOfAddress(q) !== null
  const go = (tab: string, fill: (inputs: NodeListOf<HTMLInputElement>) => void) => {
    document.getElementById(`tabbtn-${tab}`)?.click()
    fill(document.querySelectorAll<HTMLInputElement>(`#tab-${tab} form input`))
  }
  if (isHash) go('verify', (i) => void (i[0]!.value = q))
  else if (isAddr) go('send', (i) => void (i[0]!.value = q))
}

async function start(): Promise<void> {
  await hydrateFromExtension()
  let banner: HTMLElement | null = null
  if (__TESTNET__) {
    const t = await import('../testnet')
    banner = (await t.setupTestnet()) ? t.testBanner() : null
  }
  mount(document.getElementById('app')!, banner)
  applyQuery()
}

void start()
