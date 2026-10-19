// Release builds must not contain the test chain, and the extension manifest must stay minimal.
// These build the real artifacts, so they take a few seconds.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { build } from 'vite'

const ROOT = process.cwd()

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

const cat = (dir: string) =>
  walk(dir)
    .filter((f) => /\.(js|html|css|json)$/.test(f))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n')

// Specific to this app. (Bare "31337" or "127.0.0.1:8545" also appear inside viem's own chain definitions.)
const TESTNET_MARKERS = ['LOCAL TEST CHAIN', 'TEST BUILD', 'testnet-deployments', 'ftp-test-chain', ':5199']

describe('production website bundle', () => {
  let text = ''
  beforeAll(async () => {
    const out = mkdtempSync(join(tmpdir(), 'ftp-prod-'))
    await build({ root: ROOT, logLevel: 'silent', mode: 'production', build: { outDir: out, emptyOutDir: true } })
    text = cat(out)
  }, 120_000)

  it('contains no test chain, mock token or local RPC', () => {
    for (const m of TESTNET_MARKERS) expect(text.includes(m), `prod bundle contains "${m}"`).toBe(false)
  })

  it('still contains the mainnet registry', () => {
    expect(text).toContain('0x55d398326f99059fF775485246999027B3197955')
    expect(text).toContain('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')
  })
})

describe('testnet website bundle', () => {
  it('does contain the test chain (so the check above is meaningful)', async () => {
    const out = mkdtempSync(join(tmpdir(), 'ftp-test-'))
    await build({ root: ROOT, logLevel: 'silent', mode: 'testnet', build: { outDir: out, emptyOutDir: true } })
    expect(cat(out)).toContain('LOCAL TEST CHAIN')
  }, 120_000)
})

describe('release extension', () => {
  let dir = ''
  let manifest: Record<string, unknown>
  beforeAll(() => {
    execFileSync(process.execPath, [join(ROOT, 'scripts', 'build-extension.ts')], { stdio: 'ignore' })
    dir = join(ROOT, 'extension', 'dist')
    manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Record<string, unknown>
  }, 180_000)

  it('requests only storage + contextMenus, no tabs, no cookies, no <all_urls>', () => {
    expect(manifest.permissions).toEqual(['storage', 'contextMenus'])
    expect(JSON.stringify(manifest)).not.toMatch(/<all_urls>|"\*:\/\/\*\/\*"|"https:\/\/\*\/\*"|webRequest|cookies|"tabs"|history|clipboardRead|scripting/)
  })

  it('host permissions are exactly the RPC hosts from the chain registry', () => {
    const hosts = manifest.host_permissions as string[]
    expect(hosts.length).toBeGreaterThan(3)
    for (const h of hosts) expect(h).toMatch(/^https:\/\/[a-z0-9.-]+\/\*$/)
  })

  it('content scripts run only on explorers, Binance and Tronscan, never on the test page', () => {
    const cs = manifest.content_scripts as { matches: string[] }[]
    for (const m of cs.flatMap((c) => c.matches)) {
      expect(m).toMatch(/^https:\/\/(\*\.)?(bscscan\.com|etherscan\.io|binance\.com|tronscan\.org)\/\*$/)
    }
  })

  it('extension pages have a strict CSP (no unsafe-*, no remote script)', () => {
    const csp = (manifest.content_security_policy as { extension_pages: string }).extension_pages
    expect(csp).toContain("script-src 'self'")
    expect(csp).not.toMatch(/unsafe-|\*\s|http:/)
  })

  it('has no test chain or local RPC in any file', () => {
    const text = cat(dir)
    for (const m of TESTNET_MARKERS) expect(text.includes(m), `extension contains "${m}"`).toBe(false)
  })

  it('has no eval, remote code or innerHTML sinks', () => {
    const text = cat(dir)
    expect(text).not.toMatch(/\beval\(|new Function\(|\.innerHTML\s*=|document\.write/)
  })

  it('every file the manifest names exists', () => {
    const files = new Set(walk(dir).map((f) => f.slice(dir.length + 1).replace(/\\/g, '/')))
    const cs = manifest.content_scripts as { js: string[] }[]
    const named = [
      ...cs.flatMap((c) => c.js),
      (manifest.background as { service_worker: string }).service_worker,
      (manifest.action as { default_popup: string }).default_popup,
      ...Object.values(manifest.icons as Record<string, string>),
    ]
    for (const f of named) expect(files.has(f), f).toBe(true)
  })
})
