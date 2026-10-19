// Paste guard for Binance and explorer pages.
// When an address is pasted, it is checked against the user's saved addresses
// (lookalikes) and against the address they last copied (clipboard swap).
// It never blocks the paste and never reads anything except the pasted address.

import { charDiff } from '../../src/lib/lookalike'
import {
  COPY_KEY,
  edges,
  emptyState,
  extractAddress,
  inspectPaste,
  normalizeState,
  STORAGE_KEY,
  type CopyRecord,
  type ExtState,
  type PasteResult,
} from '../../src/ext/logic'

let state: ExtState = emptyState()
let lastCopy: CopyRecord | null = null
let host: HTMLElement | null = null

function record(text: string): void {
  const a = extractAddress(text)
  if (!a) return
  lastCopy = { text: a, ts: Date.now() }
  try {
    void chrome.storage.local.set({ [COPY_KEY]: lastCopy })
  } catch {
    /* extension reloaded; in-memory copy is still used */
  }
}

// Plain selection + Ctrl+C
document.addEventListener('copy', () => record(window.getSelection()?.toString() ?? ''), true)

// "Copy" buttons call navigator.clipboard.writeText in the page. content-main.ts reports them here.
window.addEventListener('message', (e) => {
  if (e.source !== window) return
  const d = e.data as { __ftp?: string; text?: unknown } | null
  if (d && d.__ftp === 'copy' && typeof d.text === 'string') record(d.text.slice(0, 200))
})

const COLORS = { ok: '#198754', warn: '#b58105', danger: '#c0392b' } as const

function show(r: PasteResult): void {
  host?.remove()
  host = document.createElement('div')
  host.style.all = 'initial'
  Object.assign(host.style, { position: 'fixed', top: '12px', right: '12px', zIndex: '2147483647', maxWidth: '460px' })
  // Open so tests can read the banner. The page can already remove the host element either way.
  const root = host.attachShadow({ mode: 'open' })

  const box = document.createElement('div')
  Object.assign(box.style, {
    background: '#10161d',
    color: '#e6edf3',
    border: `3px solid ${COLORS[r.level]}`,
    borderRadius: '8px',
    padding: '12px 14px',
    font: '14px/1.45 system-ui, sans-serif',
    boxShadow: '0 6px 24px rgba(0,0,0,.45)',
  })
  const title = document.createElement('div')
  title.textContent = `Flash Token Protector: ${r.headline}`
  Object.assign(title.style, { fontWeight: '700', color: COLORS[r.level], marginBottom: '6px' })
  box.append(title)

  const { head, tail } = edges(r.address)
  const big = document.createElement('div')
  Object.assign(big.style, { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '18px', margin: '4px 0 8px', wordBreak: 'break-all' })
  big.textContent = `${head} … ${tail}`
  box.append(big)

  if (r.lookalikeOf) {
    const row = (label: string, text: string, diffAgainst?: string) => {
      const d = document.createElement('div')
      Object.assign(d.style, { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '12px', wordBreak: 'break-all', margin: '2px 0' })
      d.append(`${label} `)
      if (diffAgainst) {
        for (const { ch, same } of charDiff(text, diffAgainst)) {
          const s = document.createElement('span')
          s.textContent = ch
          if (!same) Object.assign(s.style, { color: '#ff6b6b', fontWeight: '700', textDecoration: 'underline' })
          d.append(s)
        }
      } else d.append(text)
      return d
    }
    box.append(row('pasted:', r.address, r.lookalikeOf), row('yours: ', r.lookalikeOf))
  }

  for (const line of r.details) {
    const p = document.createElement('div')
    p.textContent = line
    Object.assign(p.style, { fontSize: '13px', color: '#c9d1d9', margin: '4px 0', wordBreak: 'break-all' })
    box.append(p)
  }
  const note = document.createElement('div')
  note.textContent = 'Compare the first and last characters with where you got this address. On Binance, use the withdrawal whitelist.'
  Object.assign(note.style, { fontSize: '12px', color: '#8b949e', marginTop: '6px' })
  box.append(note)

  const close = document.createElement('button')
  close.textContent = 'Dismiss'
  Object.assign(close.style, { marginTop: '8px', padding: '3px 10px', cursor: 'pointer' })
  close.addEventListener('click', () => host?.remove())
  box.append(close)

  root.append(box)
  document.documentElement.append(host)
  if (r.level !== 'danger') {
    const mine = host
    setTimeout(() => mine.remove(), 25_000)
  }
}

document.addEventListener(
  'paste',
  async (e) => {
    const text = e.clipboardData?.getData('text') ?? ''
    if (!extractAddress(text)) return
    try {
      const got = await chrome.storage.local.get([STORAGE_KEY, COPY_KEY])
      state = normalizeState(got[STORAGE_KEY])
      const stored = got[COPY_KEY] as CopyRecord | undefined
      if (stored && (!lastCopy || stored.ts > lastCopy.ts)) lastCopy = stored
    } catch {
      /* use what we have in memory */
    }
    const r = inspectPaste(text, lastCopy, state, Date.now())
    if (r) show(r)
  },
  true,
)
