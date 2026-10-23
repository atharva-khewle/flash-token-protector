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
  title: string
  desc: string
  leaves: Leaf[]
}

const wallet: WalletHooks = {}

// Three sections. The leaf ids (tab-tx, tabbtn-tx, ...) are what tests and the extension's
// right-click menu address, so they stay stable whatever the layout.
const SECTIONS: Section[] = [
  {
    id: 'quick',
    label: 'Quick check',
    title: 'Quick check',
    desc: 'Paste what you were given. You get a plain answer first; the technical details are one click away.',
    leaves: [
      { id: 'tx', label: 'Transaction', hint: 'A tx hash someone says paid you', make: () => txTab() },
      { id: 'scan', label: 'Wallet address', hint: 'Is this wallet attacked, or attacking?', make: () => scanTab() },
      { id: 'token', label: 'Token address', hint: 'Is this token the real USDT?', make: () => tokenTab() },
    ],
  },
  {
    id: 'detail',
    label: 'Detailed analysis',
    title: 'Detailed analysis',
    desc: 'Confirm a payment reached your own address, follow a wallet live, and check an address before you pay it.',
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
    title: 'Attack vectors',
    desc: 'Every trick this tool defends against, drawn out: what the attacker does, what you see, and what catches it.',
    leaves: [{ id: 'vectors', label: 'Attack vectors', hint: '', make: () => vectorsTab() }],
  },
  {
    id: 'faq',
    label: 'FAQ',
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
    h('p', { class: 'muted small' }, 'Real USDT is only these addresses. A token with any other address is not USDT, whatever its name says.'),
    h('ul', { class: 'official' }, ...rows),
  )
}

function legendCard(): HTMLElement {
  const row = (tone: string, label: string, text: string) => h('li', {}, h('span', { class: `lg lg-${tone}`, 'aria-hidden': 'true' }), h('div', {}, h('strong', {}, label), h('div', { class: 'muted small' }, text)))
  return h(
    'div',
    { class: 'card side' },
    h('h3', { class: 'flush' }, 'How to read a result'),
    h(
      'ul',
      { class: 'legend' },
      row('good', 'Low risk', 'Nothing worrying found. Still confirm the payment reached your own address.'),
      row('caution', 'Be careful', 'Something is unclear or not final yet. Wait and check again.'),
      row('danger', 'High risk', 'Fake token, failed or missing payment. Do not release funds.'),
    ),
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
    const nb = h('button', { type: 'button', class: 'navbtn', id: `navbtn-${s.id}` }, h('span', {}, s.label))
    nb.addEventListener('click', () => select(lastLeaf.get(s.id) ?? s.leaves[0]!.id))
    navBtns.set(s.id, nb)
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
    const main = h('div', { class: 'sectionmain' }, h('div', { class: 'card workcard' }, subnav, ...leafPanels))
    const aside = s.id === 'quick' ? h('aside', { class: 'sidecol' }, officialCard(), legendCard(), rulesCard()) : null
    const el = h(
      'section',
      { class: 'dsection', id: `section-${s.id}` },
      h('div', { class: 'sectionhead' }, h('h2', {}, s.title), h('p', { class: 'muted' }, s.desc)),
      h('div', { class: aside ? 'sectiongrid' : 'sectionsolo' }, main, aside),
    )
    sectionEls.set(s.id, el)
    content.appendChild(el)
  }

  const trust = h(
    'div',
    { class: 'sidetrust' },
    h('div', { class: 'small' }, h('strong', {}, 'Read-only')),
    h('div', { class: 'muted small' }, 'No keys, no signatures, no accounts. Connecting a wallet only reads which address is selected.'),
    h('div', { class: 'muted small' }, 'If a wallet warns about this site, that is a reputation flag on the domain, not on what the app does. It never asks for a signature. You can skip Connect and paste an address instead.'),
    h('div', { class: 'muted small domain' }, 'You are on ', h('strong', {}, location.host || 'local file'), '. Bookmark it.'),
  )

  root.append(
    ...(banner ? [banner] : []),
    h(
      'header',
      { class: 'topbar' },
      h('div', { class: 'brand' }, h('span', { class: 'logo', 'aria-hidden': 'true' }), h('div', {}, titleEl(), h('div', { class: 'muted small tagline worry' }, 'Scared someone sent you flash USDT? Paste the transaction hash and see in seconds if it is real. Do not release goods or money until it says VERIFIED.'))),
      h('div', { class: 'topactions' }, modeSwitch(), openInTab(), isExtensionPage() ? null : connectButton(wallet, () => select('wallet'))),
    ),
    h('div', { class: 'shell' }, h('div', { class: 'sidebar' }, nav, trust), content),
    h(
      'footer',
      { class: 'foot' },
      h('p', {}, 'This tool never says "safe". VERIFIED means: canonical USDT reached your address in a final block, as reported by two independent RPC providers.'),
      h('p', {}, 'It cannot see fiat chargebacks, a compromised device, or anything off-chain. Never share a seed phrase. Nobody legitimate needs it.'),
      h('p', {}, link(REPO, 'Source code and test evidence'), ' · ', link(`${REPO}/releases/latest`, 'Chrome extension'), ' · ', link(`${REPO}/blob/main/docs/PROOF.md`, 'Proof of work')),
    ),
  )

  let start = 'tx'
  try {
    const saved = sessionStorage.getItem('ftp.leaf')
    if (saved && panels.has(saved)) start = saved
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
