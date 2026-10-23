// Simple or Advanced view. Simple (the default) shows the plain summary of every result with the
// technical details folded away; Advanced opens the details and shows the extra form fields.
// Stored per browser only.

export type Mode = 'simple' | 'advanced'

const KEY = 'ftp.mode'
const listeners = new Set<(m: Mode) => void>()

function load(): Mode {
  try {
    return window.localStorage.getItem(KEY) === 'advanced' ? 'advanced' : 'simple'
  } catch {
    return 'simple'
  }
}

let mode: Mode = load()

export function getMode(): Mode {
  return mode
}

export function setMode(m: Mode): void {
  mode = m
  try {
    window.localStorage.setItem(KEY, m)
  } catch {
    /* not remembered */
  }
  applyMode()
  for (const f of listeners) f(m)
}

export function onMode(f: (m: Mode) => void): void {
  listeners.add(f)
}

/** Marks the page so CSS can hide `.adv` elements in the simple view. */
export function applyMode(): void {
  document.documentElement.dataset.mode = mode
}
