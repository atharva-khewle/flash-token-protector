// Token name / symbol analysis. Used to explain why a token that *says*
// "USDT" is not USDT. Never used to decide identity: identity is the
// contract address only (L2).

export interface NameFinding {
  code: 'non-ascii' | 'invisible' | 'bidi' | 'url' | 'usdt-lookalike' | 'instructions'
  detail: string
}

const CONFUSABLES: Record<string, string> = {
  // Cyrillic
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'Ѕ': 'S', 'І': 'I', 'Ј': 'J', 'Ԁ': 'D', 'Ү': 'Y',
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'ѕ': 's', 'і': 'i', 'ј': 'j', 'у': 'y',
  // Greek
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X', 'Ζ': 'Z',
  'ο': 'o', 'ν': 'v',
  // Currency / letterlike
  '₮': 'T', '＄': '$', 'Ｕ': 'U', 'Ｓ': 'S', 'Ｄ': 'D', 'Ｔ': 'T',
}

const INVISIBLE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u200B-\u200D\u2060-\u2064\uFEFF]/
const BIDI = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/
const URLISH = /(https?:\/\/|www\.|\.(com|io|net|org|xyz|top|app|site|online|claim|vip|cc|me|link|finance|pro)\b|t\.me\/)/i
const INSTRUCTIONS = /(claim|reward|airdrop|visit|swap at|redeem|bonus|gift|activate|unlock)/i

/** Maps lookalike characters to ASCII and strips invisible/bidi characters. */
export function skeleton(s: string): string {
  let out = ''
  for (const ch of s.normalize('NFKC')) {
    if (INVISIBLE.test(ch) || BIDI.test(ch)) continue
    out += CONFUSABLES[ch] ?? ch
  }
  return out
}

export function analyzeName(name: string, symbol: string): NameFinding[] {
  const findings: NameFinding[] = []
  const both = `${name} ${symbol}`
  if (INVISIBLE.test(both)) findings.push({ code: 'invisible', detail: 'Contains zero-width or invisible characters.' })
  if (BIDI.test(both)) findings.push({ code: 'bidi', detail: 'Contains right-to-left / bidi control characters that reorder text.' })
  const nonAscii = Array.from(both).filter((c) => c.charCodeAt(0) > 0x7e && !INVISIBLE.test(c) && !BIDI.test(c))
  if (nonAscii.length > 0) {
    const list = [...new Set(nonAscii)].map((c) => `${c} (U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')})`)
    findings.push({ code: 'non-ascii', detail: `Non-ASCII characters: ${list.join(', ')}.` })
  }
  if (URLISH.test(both)) findings.push({ code: 'url', detail: 'Name or symbol contains a link. Token names with links are a common drainer lure.' })
  if (INSTRUCTIONS.test(both)) findings.push({ code: 'instructions', detail: 'Name or symbol contains instructions (claim, reward, visit...).' })
  const sk = skeleton(both).toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (/USDT|TETHER|USD₮/.test(sk) || /USDT|TETHER/.test(skeleton(symbol).toUpperCase())) {
    findings.push({ code: 'usdt-lookalike', detail: 'Presents itself as USDT / Tether, but the contract is not the canonical one.' })
  }
  return findings
}
