// Per-browser conveniences only: watchlist, accepted tx hashes, recent
// counterparties. Every access is wrapped, because storage can be missing
// (private window, blocked site data). Nothing here is sent anywhere.

import type { ChainKey } from '../registry/chains'

const KEY = 'ftp.v1'

export interface WatchEntry {
  chain: ChainKey
  address: string
  label: string
}

interface State {
  watchlist: WatchEntry[]
  accepted: string[]
  recent: Partial<Record<ChainKey, string[]>>
}

const empty = (): State => ({ watchlist: [], accepted: [], recent: {} })

let memory: State = empty()

function load(): State {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return memory
    const parsed = JSON.parse(raw) as Partial<State>
    memory = {
      watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist.filter((w) => w && typeof w.address === 'string') : [],
      accepted: Array.isArray(parsed.accepted) ? parsed.accepted.filter((a) => typeof a === 'string') : [],
      recent: parsed.recent && typeof parsed.recent === 'object' ? parsed.recent : {},
    }
  } catch {
    /* storage unavailable: keep in-memory state */
  }
  return memory
}

function save(s: State): void {
  memory = s
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable: in-memory only for this tab */
  }
  // Browser extension: mirror so content scripts (other origins) can read the watchlist.
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) void chrome.storage.local.set({ [KEY]: s })
  } catch {
    /* not an extension page */
  }
}

/** Extension popup: pull the saved state from chrome.storage (the source content scripts also use). */
export async function hydrateFromExtension(): Promise<void> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return
    const got = (await chrome.storage.local.get(KEY)) as Record<string, Partial<State> | undefined>
    const s = got[KEY]
    if (!s) {
      // First run after install: push whatever this page already has.
      if (load().watchlist.length > 0) save(load())
      return
    }
    memory = {
      watchlist: Array.isArray(s.watchlist) ? s.watchlist.filter((w) => w && typeof w.address === 'string') : [],
      accepted: Array.isArray(s.accepted) ? s.accepted.filter((a) => typeof a === 'string') : [],
      recent: s.recent && typeof s.recent === 'object' ? s.recent : {},
    }
    window.localStorage.setItem(KEY, JSON.stringify(memory))
  } catch {
    /* optional */
  }
}

export function getWatchlist(chain?: ChainKey): WatchEntry[] {
  const w = load().watchlist
  return chain ? w.filter((e) => e.chain === chain) : w
}

export function addWatch(entry: WatchEntry): void {
  const s = load()
  if (s.watchlist.some((w) => w.chain === entry.chain && w.address.toLowerCase() === entry.address.toLowerCase())) return
  save({ ...s, watchlist: [...s.watchlist, entry] })
}

export function removeWatch(chain: ChainKey, address: string): void {
  const s = load()
  save({ ...s, watchlist: s.watchlist.filter((w) => !(w.chain === chain && w.address.toLowerCase() === address.toLowerCase())) })
}

const acceptKey = (chain: ChainKey, hash: string) => `${chain}:${hash.toLowerCase()}`

export function wasAccepted(chain: ChainKey, hash: string): boolean {
  return load().accepted.includes(acceptKey(chain, hash))
}

export function markAccepted(chain: ChainKey, hash: string): void {
  const s = load()
  const k = acceptKey(chain, hash)
  if (!s.accepted.includes(k)) save({ ...s, accepted: [...s.accepted, k].slice(-500) })
}

export function getRecent(chain: ChainKey): string[] {
  return load().recent[chain] ?? []
}

export function addRecent(chain: ChainKey, addresses: string[]): void {
  const s = load()
  const merged = [...new Set([...addresses, ...(s.recent[chain] ?? [])])].slice(0, 200)
  save({ ...s, recent: { ...s.recent, [chain]: merged } })
}

// ---------- The address the "My wallet" tab follows (optional) ----------

const ACCOUNT_KEY = 'ftp.account'

export interface Account {
  chain: ChainKey
  /** Hex form (lowercase 0x + 40 hex; Tron: 20-byte body). */
  address: string
  /** 'wallet' = read from a connected wallet; 'watch' = pasted by the user. */
  via: 'wallet' | 'watch'
}

export function getAccount(): Account | null {
  try {
    const raw = window.localStorage.getItem(ACCOUNT_KEY)
    if (!raw) return null
    const a = JSON.parse(raw) as Partial<Account>
    if (a && typeof a.address === 'string' && typeof a.chain === 'string' && (a.via === 'wallet' || a.via === 'watch')) return a as Account
  } catch {
    /* storage unavailable */
  }
  return null
}

export function setAccount(a: Account | null): void {
  try {
    if (a) window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(a))
    else window.localStorage.removeItem(ACCOUNT_KEY)
  } catch {
    /* storage unavailable: not remembered */
  }
}
