// Content script for BscScan / Etherscan: marks token links as real or fake USDT,
// and flags addresses that imitate one of the user's saved addresses.
// Page text is never trusted: badges are built with textContent only.

import type { ChainKey } from '../../src/registry/chains'
import {
  addressFromHref,
  chainOfHost,
  classifyTokenLink,
  emptyState,
  lookalikeOnPage,
  normalizeState,
  STORAGE_KEY,
  type Badge,
  type ExtState,
} from '../../src/ext/logic'

// Test hook: the --test build also injects on http://127.0.0.1:5199, where a <meta> names the chain.
// Release builds are never injected there, so this branch cannot run for users.
function testChain(): ChainKey | null {
  if (!__EXT_TEST__) return null
  if (location.hostname !== '127.0.0.1') return null
  const v = document.querySelector('meta[name="ftp-test-chain"]')?.getAttribute('content')
  return v === 'bsc' || v === 'eth' ? v : null
}

const chain = chainOfHost(location.hostname) ?? testChain()
let state: ExtState = emptyState()

const COLORS = { real: ['#0f5132', '#d1e7dd'], fake: ['#842029', '#f8d7da'], warn: ['#664d03', '#fff3cd'] } as const

function badgeEl(kind: 'real' | 'fake' | 'warn', text: string, title: string): HTMLElement {
  const s = document.createElement('span')
  s.dataset.ftpBadge = '1'
  s.textContent = text
  s.title = title
  Object.assign(s.style, {
    display: 'inline-block',
    margin: '0 4px',
    padding: '1px 6px',
    borderRadius: '4px',
    border: `1px solid ${COLORS[kind][0]}`,
    color: COLORS[kind][0],
    background: COLORS[kind][1],
    font: '600 11px/1.5 system-ui, sans-serif',
    whiteSpace: 'nowrap',
    verticalAlign: 'middle',
  })
  return s
}

function labelOf(a: HTMLAnchorElement): string {
  const titles = Array.from(a.querySelectorAll('[title]'), (n) => n.getAttribute('title') ?? '')
  return `${a.textContent ?? ''} ${a.getAttribute('title') ?? ''} ${titles.join(' ')}`.trim()
}

function annotate(root: ParentNode): void {
  if (!chain) return
  for (const a of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    if (a.dataset.ftpDone) continue
    const href = a.getAttribute('href') ?? ''
    const label = labelOf(a)
    if (label === '') continue // logo-only link: the text link next to it gets the badge
    a.dataset.ftpDone = '1'

    const tok: Badge | null = classifyTokenLink(chain, href, label)
    if (tok) {
      a.after(badgeEl(tok.kind, tok.text, tok.title))
      continue
    }
    const addr = addressFromHref(href)
    if (addr) {
      const look = lookalikeOnPage(chain, addr, state)
      if (look) a.after(badgeEl('warn', look.text, look.title))
    }
  }
}

function reset(): void {
  document.querySelectorAll('[data-ftp-badge]').forEach((n) => n.remove())
  document.querySelectorAll<HTMLElement>('[data-ftp-done]').forEach((n) => delete n.dataset.ftpDone)
}

let timer: ReturnType<typeof setTimeout> | undefined
function schedule(): void {
  clearTimeout(timer)
  timer = setTimeout(() => annotate(document), 250)
}

async function start(): Promise<void> {
  if (!chain) return
  try {
    state = normalizeState((await chrome.storage.local.get(STORAGE_KEY))[STORAGE_KEY])
  } catch {
    state = emptyState()
  }
  annotate(document)
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true })
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[STORAGE_KEY]) {
      state = normalizeState(changes[STORAGE_KEY].newValue)
      reset()
      annotate(document)
    }
  })
}

void start()
