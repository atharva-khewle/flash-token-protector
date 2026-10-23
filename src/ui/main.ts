import { hydrateFromExtension } from '../lib/storage'
import { familyOfAddress } from '../lib/input'
import { canonicalUsdt } from '../registry/usdt'
import { CHAINS, type ChainKey } from '../registry/chains'
import { h, link } from './dom'
import { connectButton } from './connect'
import { faqTab } from './faqTab'
import { applyMode, getMode, setMode, type Mode } from './mode'
import { savedTab } from './savedTab'
import { scanTab } from './scanTab'
import { sendTab } from './sendTab'
import { syncDetails } from './summary'
import { tokenTab } from './tokenTab'
import { trackerTab } from './trackerTab'
import { txTab } from './txTab'
import { vectorsTab } from './vectorsTab'
import { verifyTab } from './verifyTab'
import { walletTab, type WalletHooks } from './walletTab'
import './style.css'
import './soft.css'
import './dashboard.css'

const REPO = 'https://github.com/atharva-khewle/flash-token-protector'

interface Leaf {
  id: string
  label: string
  hint: string
  make: () => HTMLElement
}
interface Section {
  id: string
  label: string
  /** Label in the phone's bottom tab bar. */
  short: string
  title: string
  desc: string
  leaves: Leaf[]
  /** Not in the menu until unlocked (the Tracker: ten clicks on the logo). */
  hidden?: boolean
}

const wallet: WalletHooks = {}

const TRACKER_KEY = 'ftp.tracker'
function trackerUnlocked(): boolean {
  try {
    return localStorage.getItem(TRACKER_KEY) === '1'
  } catch {
    return false
  }
}

// Three sections. The leaf ids (tab-tx, tabbtn-tx, ...) are what tests and the extension's
// right-click menu address, so they stay stable whatever the layout.
const SECTIONS: Section[] = [
  {
    id: 'quick',
    label: 'Quick check',
    short: 'Check',
    title: 'Quick check',
    desc: 'Paste a hash or an address. Get a plain answer.',
    leaves: [
      { id: 'tx', label: 'Transaction', hint: 'A tx hash someone says paid you', make: () => txTab() },
      { id: 'scan', label: 'Wallet address', hint: 'Is this wallet attacked, or attacking?', make: () => scanTab() },
      { id: 'token', label: 'Token address', hint: 'Is this token the real USDT?', make: () => tokenTab() },
    ],
  },
  {
    id: 'detail',
    label: 'Deep analysis',
    short: 'Deep',
    title: 'Deep analysis',
    desc: 'Checks for your own funds.',
    leaves: [
      { id: 'verify', label: 'Verify a payment', hint: 'Did real USDT reach my address?', make: () => verifyTab() },
      { id: 'wallet', label: 'Monitor a wallet', hint: 'Balance, history, live alerts', make: () => walletTab(wallet) },
      { id: 'send', label: 'Before you send', hint: 'Is this address a lookalike?', make: () => sendTab() },
      { id: 'saved', label: 'Saved addresses', hint: 'Your own addresses', make: () => savedTab() },
    ],
  },
  {
    id: 'vectors',
    label: 'Attack vectors',
    short: 'Attacks',
    title: 'Attack vectors',
    desc: 'How each scam works, drawn out.',
    leaves: [{ id: 'vectors', label: 'Attack vectors', hint: '', make: () => vectorsTab() }],
  },
  {
    id: 'tracker',
    label: 'Tracker',
    short: 'Tracker',
    title: 'Tracker',
    desc: 'Follow the money across many wallets.',
    hidden: true,
    leaves: [{ id: 'tracker', label: 'Tracker', hint: '', make: () => trackerTab() }],
  },
  {
    id: 'faq',
    label: 'FAQ',
    short: 'FAQ',
    title: 'Questions and answers',
    desc: 'Short answers, in plain words.',
    leaves: [{ id: 'faq', label: 'FAQ', hint: '', make: () => faqTab() }],
  },
]

const isExtensionPage = () => typeof chrome !== 'undefined' && !!chrome.runtime?.id

/** Extension popup only: the same app in a full browser tab, which has room for history and diagrams. */
function openInTab(): HTMLElement | null {
  if (!isExtensionPage() || new URLSearchParams(location.search).has('tab')) return null
  const b = h('button', { type: 'button', class: 'ghost' }, 'Open in a tab')
  b.addEventListener('click', () => {
    window.open(chrome.runtime.getURL('popup.html?tab=1'), '_blank', 'noopener')
  })
  return b
}

function modeSwitch(): HTMLElement {
  const wrap = h('div', { class: 'modeswitch', role: 'group', 'aria-label': 'View' })
  const opts: { m: Mode; label: string; title: string }[] = [
    { m: 'simple', label: 'Simple', title: 'Plain answers, details folded' },
    { m: 'advanced', label: 'Advanced', title: 'Show every detail and extra fields' },
  ]
  const btns = opts.map((o) => {
    const b = h('button', { type: 'button', class: 'modebtn', 'data-mode': o.m, title: o.title, 'aria-pressed': String(getMode() === o.m) }, o.label)
    b.addEventListener('click', () => {
      setMode(o.m)
      for (const x of btns) x.setAttribute('aria-pressed', String(x.dataset.mode === o.m))
      syncDetails(o.m === 'advanced')
    })
    return b
  })
  wrap.append(...btns)
  return wrap
}

function officialCard(): HTMLElement {
  const rows = (['bsc', 'eth', 'tron'] as ChainKey[]).map((k) => {
    const a = canonicalUsdt(k).address
    const copy = h('button', { type: 'button', class: 'link small' }, 'Copy')
    copy.addEventListener('click', () => {
      try {
        void navigator.clipboard.writeText(a).then(() => (copy.textContent = 'Copied'))
      } catch {
        /* clipboard optional */
      }
    })
    return h('li', {}, h('div', { class: 'offname' }, h('strong', {}, CHAINS[k].name), copy), h('code', { class: 'addr' }, a))
  })
  return h(
    'div',
    { class: 'card side' },
    h('h3', { class: 'flush' }, 'Official USDT contracts'),
    h('p', { class: 'muted small' }, 'Only these addresses are real USDT.'),
    h('ul', { class: 'official' }, ...rows),
  )
}

function rulesCard(): HTMLElement {
  return h(
    'div',
    { class: 'card side' },
    h('h3', { class: 'flush' }, 'Three rules'),
    h(
      'ol',
      { class: 'rules' },
      h('li', {}, 'Never trust a screenshot or a token name. Check the hash here.'),
      h('li', {}, 'Never copy an address from wallet history. Lookalikes are planted there.'),
      h('li', {}, 'The exchange deposit history is the final word for exchange balances.'),
    ),
  )
}

const FLASHABLE = ['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FDUSD', 'USDe']

/** "Flash USDT Protector", with the token name rotating through the stablecoins that get faked. */
function titleEl(): HTMLElement {
  const tok = h('span', { class: 'flashtok', 'aria-hidden': 'true' }, FLASHABLE[0])
  const t = h('h1', { 'aria-label': 'Flash Token Protector' }, h('span', { 'aria-hidden': 'true' }, 'Flash '), tok, h('span', { 'aria-hidden': 'true' }, ' Protector'))
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!still) {
    let i = 0
    setInterval(() => {
      tok.classList.add('out')
      setTimeout(() => {
        i = (i + 1) % FLASHABLE.length
        tok.textContent = FLASHABLE[i]!
        tok.classList.remove('out')
      }, 220)
    }, 2200)
  }
  return t
}

function mount(root: HTMLElement, banner: HTMLElement | null): void {
  applyMode()
  const panels = new Map<string, HTMLElement>()
  const subBtns = new Map<string, HTMLButtonElement>()
  const navBtns = new Map<string, HTMLButtonElement>()
  const sectionEls = new Map<string, HTMLElement>()
  const lastLeaf = new Map<string, string>()

  const select = (leafId: string) => {
    const sec = SECTIONS.find((s) => s.leaves.some((l) => l.id === leafId)) ?? SECTIONS[0]!
    for (const [id, el] of sectionEls) el.hidden = id !== sec.id
    for (const [id, b] of navBtns) b.setAttribute('aria-current', id === sec.id ? 'page' : 'false')
    for (const l of sec.leaves) {
      panels.get(l.id)!.hidden = l.id !== leafId
      subBtns.get(l.id)?.setAttribute('aria-selected', String(l.id === leafId))
    }
    lastLeaf.set(sec.id, leafId)
    try {
      sessionStorage.setItem('ftp.leaf', leafId)
    } catch {
      /* optional */
    }
  }

  const nav = h('nav', { class: 'sidenav', 'aria-label': 'Sections' })
  const content = h('div', { class: 'content' })
  for (const s of SECTIONS) {
    const nb = h('button', { type: 'button', class: 'navbtn', id: `navbtn-${s.id}`, 'aria-label': s.label }, h('span', { class: 'navlong' }, s.label), h('span', { class: 'navshort', 'aria-hidden': 'true' }, s.short))
    nb.addEventListener('click', () => select(lastLeaf.get(s.id) ?? s.leaves[0]!.id))
    navBtns.set(s.id, nb)
    if (s.hidden && !trackerUnlocked()) nb.hidden = true
    nav.appendChild(nb)

    const leafPanels = s.leaves.map((l) => {
      const p = l.make()
      panels.set(l.id, p)
      return p
    })
    const subnav =
      s.leaves.length > 1
        ? h(
            'div',
            { class: 'subtabs', role: 'tablist', 'aria-label': s.label },
            ...s.leaves.map((l) => {
              const b = h('button', { type: 'button', role: 'tab', class: 'subtab', id: `tabbtn-${l.id}` }, h('span', { class: 'sublabel' }, l.label), h('span', { class: 'subhint' }, l.hint))
              b.addEventListener('click', () => select(l.id))
              subBtns.set(l.id, b)
              return b
            }),
          )
        : null
    // Attack vectors flows on the page itself: its diagram is the only box.
    const main = s.id === 'vectors' || s.id === 'tracker' ? h('div', { class: 'sectionmain flat' }, ...leafPanels) : h('div', { class: 'sectionmain' }, h('div', { class: 'card workcard' }, subnav, ...leafPanels))
    const aside = s.id === 'quick' ? h('aside', { class: 'sidecol' }, officialCard(), rulesCard()) : null
    const el = h(
      'section',
      { class: 'dsection', id: `section-${s.id}` },
      h('div', { class: 'sectionhead' }, h('h2', {}, s.title), h('p', { class: 'muted' }, s.desc)),
      h('div', { class: aside ? 'sectiongrid' : 'sectionsolo' }, main, aside),
    )
    sectionEls.set(s.id, el)
    content.appendChild(el)
  }

  // Ten quick clicks on the logo unlock the Tracker (remembered in this browser).
  const logo = h('span', { class: 'logo', 'aria-hidden': 'true' })
  let clicks: number[] = []
  logo.addEventListener('click', () => {
    const now = Date.now()
    clicks = [...clicks.filter((t) => now - t < 5000), now]
    if (clicks.length < 10) return
    clicks = []
    try {
      localStorage.setItem(TRACKER_KEY, '1')
    } catch {
      /* this visit only */
    }
    navBtns.get('tracker')!.hidden = false
    select('tracker')
  })

  const trust = h(
    'div',
    { class: 'sidetrust' },
    h('div', { class: 'small' }, h('strong', {}, 'Read-only')),
    h('div', { class: 'muted small' }, 'No keys, no signatures. Connecting only reads your address.'),
  )

  root.append(
    ...(banner ? [banner] : []),
    h(
      'header',
      { class: 'topbar' },
      h('div', { class: 'brand' }, logo, h('div', {}, titleEl(), h('div', { class: 'muted small tagline worry' }, 'Got paid in USDT? Check it is real before you release anything.'))),
      h('div', { class: 'topactions' }, modeSwitch(), openInTab(), isExtensionPage() ? null : connectButton(wallet, () => select('wallet'))),
    ),
    h('div', { class: 'shell' }, h('div', { class: 'sidebar' }, nav, trust), content),
    h(
      'footer',
      { class: 'foot' },
      h('p', {}, 'Read-only. It never says "safe", only what the chain shows. Never share a seed phrase.'),
      h('p', {}, link(REPO, 'Source code and test evidence'), ' · ', link(`${REPO}/releases/latest`, 'Chrome extension'), ' · ', link(`${REPO}/blob/main/docs/PROOF.md`, 'Proof of work')),
    ),
  )

  let start = 'tx'
  try {
    const saved = sessionStorage.getItem('ftp.leaf')
    if (saved && panels.has(saved) && (saved !== 'tracker' || trackerUnlocked())) start = saved
  } catch {
    /* optional */
  }
  select(start)
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
  if (isHash) go('tx', (i) => void (i[0]!.value = q))
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
