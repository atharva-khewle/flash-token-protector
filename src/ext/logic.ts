// Pure logic shared by the extension's content scripts. No DOM, no chrome.* calls,
// so it is unit-tested like the verdict rules.

import { CHAINS, type ChainFamily, type ChainKey } from '../registry/chains'
import { USDT } from '../registry/usdt'
import { analyzeName } from '../lib/homoglyph'
import { familyOfAddress, parseAddress } from '../lib/input'
import { findLookalikes, type LookalikeMatch } from '../lib/lookalike'
import { checkDestination } from '../verdict/wallet'

/** Same shape the website stores under STORAGE_KEY (see src/lib/storage.ts). */
export interface ExtState {
  watchlist: { chain: ChainKey; address: string; label: string }[]
  recent: Partial<Record<ChainKey, string[]>>
}

export const STORAGE_KEY = 'ftp.v1'
export const COPY_KEY = 'ftp.lastCopy'
/** A copied address is only compared with a paste for this long. */
export const COPY_TTL_MS = 10 * 60 * 1000

export const emptyState = (): ExtState => ({ watchlist: [], recent: {} })

export function normalizeState(raw: unknown): ExtState {
  const r = (raw ?? {}) as Partial<ExtState>
  return {
    watchlist: Array.isArray(r.watchlist) ? r.watchlist.filter((w) => w && typeof w.address === 'string') : [],
    recent: r.recent && typeof r.recent === 'object' ? r.recent : {},
  }
}

// ---------- explorer pages ----------

const HOST_CHAIN: [RegExp, ChainKey][] = [
  [/(^|\.)bscscan\.com$/i, 'bsc'],
  [/(^|\.)etherscan\.io$/i, 'eth'],
]

export function chainOfHost(hostname: string): ChainKey | null {
  return HOST_CHAIN.find(([re]) => re.test(hostname))?.[1] ?? null
}

const TOKEN_HREF = /\/token\/(0x[0-9a-fA-F]{40})(?:[/?#]|$)/
const ADDRESS_HREF = /\/address\/(0x[0-9a-fA-F]{40})(?:[/?#]|$)/

export function tokenAddressFromHref(href: string): string | null {
  return TOKEN_HREF.exec(href)?.[1]?.toLowerCase() ?? null
}

export function addressFromHref(href: string): string | null {
  return ADDRESS_HREF.exec(href)?.[1] ?? null
}

export interface Badge {
  kind: 'real' | 'fake'
  text: string
  title: string
}

/**
 * Badge for a token link on an explorer page. Real = the canonical contract for this chain.
 * Fake = looks like USDT / Tether by name but is a different contract. Anything else gets no badge,
 * so the page is not littered with noise.
 */
export function classifyTokenLink(chain: ChainKey, href: string, label: string): Badge | null {
  const addr = tokenAddressFromHref(href)
  if (!addr) return null
  const usdt = USDT[chain]
  if (addr === usdt.hex) {
    return { kind: 'real', text: '✓ real USDT contract', title: `Matches the canonical USDT for ${CHAINS[chain].name}: ${usdt.address}` }
  }
  const findings = analyzeName(label, label)
  if (findings.some((f) => f.code === 'usdt-lookalike')) {
    return {
      kind: 'fake',
      text: '✗ NOT USDT (fake lookalike)',
      title: `This contract is not the canonical USDT (${usdt.address}). Its name only says USDT. ${findings.map((f) => f.detail).join(' ')}`,
    }
  }
  return null
}

export interface LookalikeBadge {
  text: string
  title: string
  match: LookalikeMatch
}

/** Warns when an address shown on a page imitates one of the user's saved addresses. */
export function lookalikeOnPage(chain: ChainKey, address: string, state: ExtState): LookalikeBadge | null {
  const family = CHAINS[chain].family
  const mine = state.watchlist.filter((w) => CHAINS[w.chain].family === family).map((w) => w.address)
  const m = findLookalikes(address, mine)[0]
  if (!m) return null
  const entry = state.watchlist.find((w) => w.address.toLowerCase() === m.target.toLowerCase())
  return {
    text: `⚠ lookalike of your ${entry?.label || 'saved address'}`,
    title: `Not your address. It copies the first ${m.prefix} and last ${m.suffix} characters of ${m.target}.`,
    match: m,
  }
}

// ---------- paste guard ----------

export interface CopyRecord {
  text: string
  ts: number
}

export interface PasteResult {
  address: string
  family: ChainFamily
  level: 'ok' | 'warn' | 'danger'
  headline: string
  details: string[]
  /** Saved address the pasted one imitates, for a character diff. */
  lookalikeOf?: string
}

export function extractAddress(text: string): string | null {
  const t = text.trim()
  if (/^(0x[0-9a-fA-F]{40}|T[1-9A-HJ-NP-Za-km-z]{33})$/.test(t)) return t
  return null
}

export function inspectPaste(pasted: string, lastCopy: CopyRecord | null, state: ExtState, now: number): PasteResult | null {
  const raw = extractAddress(pasted)
  if (!raw) return null
  const family = familyOfAddress(raw)!
  const parsed = parseAddress(raw, family)
  if (!parsed.ok) {
    return { address: raw, family, level: 'danger', headline: 'Invalid address', details: [parsed.reason] }
  }
  const display = parsed.display
  const details: string[] = []

  if (lastCopy && now - lastCopy.ts <= COPY_TTL_MS) {
    const copied = extractAddress(lastCopy.text)
    if (copied && copied.toLowerCase() !== display.toLowerCase()) {
      return {
        address: display,
        family,
        level: 'danger',
        headline: 'The pasted address is NOT the one you copied',
        details: [`You copied ${copied}`, `You pasted ${display}`, 'Something changed your clipboard (clipboard-hijacking malware). Do not send. Check your device.'],
      }
    }
  }

  const saved = state.watchlist.filter((w) => CHAINS[w.chain].family === family).map((w) => w.address)
  const recent = (Object.keys(state.recent) as ChainKey[]).filter((k) => CHAINS[k] && CHAINS[k].family === family).flatMap((k) => state.recent[k] ?? [])
  const res = checkDestination(display, saved, recent)
  if (res.level === 'danger') {
    const t = res.matches[0]?.target
    // Show the saved address the way the user saved it (checksum casing intact).
    const original = t ? [...saved, ...recent].find((a) => a.toLowerCase() === t.toLowerCase()) ?? t : undefined
    return { address: display, family, level: 'danger', headline: 'LOOKALIKE of an address you use', details: [res.detail], lookalikeOf: original }
  }
  if (res.level === 'known') {
    const label = state.watchlist.find((w) => w.address.toLowerCase() === display.toLowerCase())?.label
    return { address: display, family, level: 'ok', headline: label ? `Matches your saved address: ${label}` : 'Matches an address you saved or paid before', details: [res.detail] }
  }
  details.push(res.detail)
  return { address: display, family, level: 'warn', headline: 'New address', details }
}

/** First and last 6 characters, shown large so a human can compare them with the source. */
export function edges(address: string, n = 6): { head: string; tail: string } {
  const body = address.startsWith('0x') ? address.slice(2) : address.slice(1)
  const prefix = address.startsWith('0x') ? '0x' : 'T'
  return { head: prefix + body.slice(0, n), tail: body.slice(-n) }
}
