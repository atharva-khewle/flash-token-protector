// Address lookalike detection (address poisoning).
// Attackers generate vanity addresses that share the first and last few
// characters of an address the victim uses, then plant them in history.

export interface LookalikeMatch {
  candidate: string
  target: string
  prefix: number
  suffix: number
  distance: number
}

function body(addr: string): string {
  // Compare the part a human actually reads. Drop "0x" on EVM; keep Tron as is
  // (the leading T is constant, so it adds 1 to every prefix and is ignored).
  const a = addr.trim()
  if (/^0x/i.test(a)) return a.slice(2).toLowerCase()
  if (/^T/.test(a)) return a.slice(1)
  return a
}

export function commonPrefix(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

export function commonSuffix(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++
  return i
}

export function levenshtein(a: string, b: string): number {
  const prev = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]!
}

/**
 * True when `candidate` is a different address that a person could mistake for `target`.
 * Rule: not equal, and (prefix >= 3 and suffix >= 3 and prefix + suffix >= 7), or
 * edit distance <= 2 (one or two characters swapped).
 */
export function isLookalike(candidate: string, target: string): LookalikeMatch | null {
  const a = body(candidate)
  const b = body(target)
  if (a === b) return null
  const prefix = commonPrefix(a, b)
  const suffix = commonSuffix(a, b)
  const distance = a.length === b.length ? hamming(a, b) : levenshtein(a, b)
  const visual = prefix >= 3 && suffix >= 3 && prefix + suffix >= 7
  if (visual || distance <= 2) return { candidate, target, prefix, suffix, distance }
  return null
}

function hamming(a: string, b: string): number {
  let d = 0
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++
  return d
}

export function findLookalikes(candidate: string, targets: Iterable<string>): LookalikeMatch[] {
  const out: LookalikeMatch[] = []
  for (const t of targets) {
    const m = isLookalike(candidate, t)
    if (m) out.push(m)
  }
  return out.sort((x, y) => y.prefix + y.suffix - (x.prefix + x.suffix))
}

/** Per-character diff for highlighting. `same` marks characters equal at that position. */
export function charDiff(candidate: string, target: string): { ch: string; same: boolean }[] {
  return Array.from(candidate, (ch, i) => ({ ch, same: target[i]?.toLowerCase() === ch.toLowerCase() }))
}
