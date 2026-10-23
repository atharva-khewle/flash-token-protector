import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getAddress } from 'viem'
import { CHAIN_KEYS, CHAINS } from '../src/registry/chains'
import { USDT } from '../src/registry/usdt'
import { tronToHex } from '../src/lib/tron'

describe('L2 registry', () => {
  it('every entry has a source and consistent hex / display forms', () => {
    for (const k of CHAIN_KEYS) {
      const t = USDT[k]
      expect(t.sources.length).toBeGreaterThan(0)
      expect(t.hex).toMatch(/^0x[0-9a-f]{40}$/)
      if (CHAINS[k].family === 'evm') expect(getAddress(t.hex)).toBe(t.address)
      else expect(tronToHex(t.address)).toBe(t.hex)
    }
  })

  it('decimals: BSC 18, Ethereum 6, Tron 6', () => {
    expect(USDT.bsc.decimals).toBe(18)
    expect(USDT.eth.decimals).toBe(6)
    expect(USDT.tron.decimals).toBe(6)
  })

  it('the Tron address seeded in the build prompt (extra "x") is invalid', () => {
    expect(tronToHex('TR7NHqjeKQxGTCi8q8ZY4pxL8otSzgjLj6t')).toBeNull()
    expect(tronToHex('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')).toBe('0xa614f803b6fd780986a42c78ec9c7f77e6ded13c')
  })

  it('every network host the app calls is allowed by the CSP (and nothing else is)', () => {
    const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')
    const csp = /Content-Security-Policy: (.*)/.exec(headers)![1]!
    const connect = /connect-src ([^;]*)/.exec(csp)![1]!.split(' ')
    const hosts = CHAIN_KEYS.flatMap((k) => [...CHAINS[k].rpcs, ...CHAINS[k].logRpcs]).map((u) => new URL(u).origin)
    for (const h of hosts) expect(connect).toContain(h)
    expect(csp).toContain("script-src 'self'")
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).not.toContain('unsafe-eval')
    const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as { headers: { headers: { key: string; value: string }[] }[] }
    expect(vercel.headers[0]!.headers.find((x) => x.key === 'Content-Security-Policy')!.value).toBe(csp)
    const firebase = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8')) as { hosting: { headers: { headers: { key: string; value: string }[] }[] } }
    expect(firebase.hosting.headers[0]!.headers.find((x) => x.key === 'Content-Security-Policy')!.value).toBe(csp)
  })

  it('explorer links are built from the registry, https only', () => {
    for (const k of CHAIN_KEYS) {
      expect(new URL(CHAINS[k].explorer.tx('ab')!).protocol).toBe('https:')
      expect(new URL(CHAINS[k].explorer.address('ab')!).protocol).toBe('https:')
    }
  })
})
