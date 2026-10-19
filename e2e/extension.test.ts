// Loads the real built extension into real Chrome and drives it.
//   npm run e2e:ext        (needs Chrome; set FTP_CHROMIUM if it is not in the default place)
//
// The explorer fixture is served on 127.0.0.1:5199. The --test build of the extension also
// injects there; the release build does not (see tests/extension-manifest.test.ts).

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type BrowserContext, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getAddress } from 'viem'

const ROOT = process.cwd()
const EXT = join(ROOT, 'extension', 'dist-test')
const PORT = 5199
// Branded Chrome 137+ ignores --load-extension (and CI images set CHROME_BIN to it), so tests use Playwright's Chromium
// (`npx playwright-core install chromium`) unless FTP_CHROMIUM points at a build that still allows it.
const CHROME = process.env.FTP_CHROMIUM ?? chromium.executablePath()

const SAVED = '0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const LOOK = '0xa1b2c3d4ffffffffffffffffffffffffff345678'
const SWAPPED = '0x9999999999999999999999999999999999999999'
// Real BSC mainnet tx (see tests/fixtures): canonical USDT leg to 0xba85...ec75.
const REAL_HASH = '0x7b3aaee409a3d2e55fd363afe9a1b1a8efa4b45d805502dcf9825a2430f935ec'
const REAL_TO = '0xba85435b435c487be4b49cbe63ab8ea12669ec75'

let server: Server
let ctx: BrowserContext
let extId = ''
const shots = join(ROOT, 'docs', 'proof', 'extension')

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(shots, { recursive: true })
  try {
    await page.screenshot({ path: join(shots, `${name}.png`) })
  } catch {
    // Screenshots are evidence, not assertions: some virtual displays (xvfb) cannot capture.
  }
}

beforeAll(async () => {
  if (!existsSync(CHROME)) throw new Error('Chromium not found. Run: npx playwright-core install chromium')
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'build-extension.ts'), '--test'], { stdio: 'ignore' })
  server = createServer((req, res) => {
    const f = req.url?.startsWith('/blank') ? 'blank.html' : 'bscscan-like.html'
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(readFileSync(join(ROOT, 'e2e', 'fixtures', f)))
  })
  await new Promise<void>((r) => server.listen(PORT, r))

  const profile = mkdtempSync(join(tmpdir(), 'ftp-chrome-'))
  ctx = await chromium.launchPersistentContext(profile, {
    executablePath: CHROME,
    headless: false,
    // Playwright passes --disable-extensions by default, which would stop the extension loading.
    ignoreDefaultArgs: ['--disable-extensions'],
    viewport: { width: 1100, height: 800 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--disable-features=DisableLoadExtensionCommandLineSwitch', ...(process.env.HEADED ? ['--disable-gpu'] : ['--headless=new'])],
  })
  let sw = ctx.serviceWorkers()[0]
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 20_000 })
  extId = new URL(sw.url()).host
  for (const origin of [`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]) await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin })

  // Save the user's address in the extension, the same place the popup writes to.
  const page = await ctx.newPage()
  await page.goto(`chrome-extension://${extId}/popup.html`)
  await page.evaluate(
    (addr) => chrome.storage.local.set({ 'ftp.v1': { watchlist: [{ chain: 'bsc', address: addr, label: 'My Binance deposit' }], accepted: [], recent: {} } }),
    getAddress(SAVED),
  )
  await page.close()
}, 120_000)

afterAll(async () => {
  await ctx?.close()
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()))
})

const open = async (): Promise<Page> => {
  const p = await ctx.newPage()
  await p.goto(`http://127.0.0.1:${PORT}/`)
  return p
}

describe('extension in real Chrome', () => {
  it('loads with the expected id and service worker', () => {
    expect(extId).toMatch(/^[a-p]{32}$/)
  })

  it('explorer page: real USDT, fake USDT, lookalike address; other tokens and logo links get nothing', async () => {
    const p = await open()
    await p.waitForSelector('[data-ftp-badge]', { timeout: 10_000 })
    const badges = (row: string) => p.locator(`#${row} [data-ftp-badge]`).allTextContents()
    expect((await badges('row-real')).join(' ')).toContain('real USDT contract')
    expect((await badges('row-fake')).join(' ')).toContain('NOT USDT')
    expect(await badges('row-other')).toEqual([])
    expect((await badges('row-look')).join(' ')).toContain('lookalike of your My Binance deposit')
    expect(await badges('row-logo')).toEqual([])
    await shot(p, 'explorer-badges')
    await p.close()
  })

  it('badges are text only: a hostile token name cannot inject markup', async () => {
    const p = await open()
    await p.waitForSelector('[data-ftp-badge]')
    await p.evaluate(() => {
      const a = document.createElement('a')
      a.href = '/token/0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead'
      a.textContent = '<img src=x onerror=window.__pwned=1> USDT'
      document.body.append(a)
    })
    await p.waitForSelector('a[href*="deaddead"] + [data-ftp-badge]')
    expect(await p.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()
    expect(await p.locator('[data-ftp-badge] img').count()).toBe(0)
    await p.close()
  })

  it('paste guard: a lookalike of the saved address is flagged DANGER with a character diff', async () => {
    const p = await open()
    await p.evaluate((t) => navigator.clipboard.writeText(t), LOOK)
    await p.click('#dest')
    await p.keyboard.press('Control+V')
    await p.getByText('LOOKALIKE of an address you use').waitFor({ timeout: 5000 })
    expect(await p.locator('span', { hasText: /^f$/ }).count()).toBeGreaterThan(5)
    await shot(p, 'paste-lookalike')
    await p.close()
  })

  it('paste guard: clipboard swapped after copying -> "NOT the one you copied"', async () => {
    const p = await open()
    await p.click('#copybtn') // the page copies the saved address with navigator.clipboard.writeText
    // "Malware" on another site replaces the clipboard content.
    const other = await ctx.newPage()
    await other.goto(`http://localhost:${PORT}/blank`)
    await other.bringToFront()
    await other.evaluate((t) => navigator.clipboard.writeText(t), SWAPPED)
    await other.close()
    await p.bringToFront()
    await p.click('#dest')
    await p.keyboard.press('Control+V')
    await p.getByText('NOT the one you copied').waitFor({ timeout: 5000 })
    await shot(p, 'paste-swapped')
    await p.close()
  })

  it('paste guard: the saved address pasted unchanged is OK', async () => {
    const p = await open()
    await p.click('#copybtn')
    await p.click('#dest')
    await p.keyboard.press('Control+V')
    await p.getByText('Matches your saved address: My Binance deposit').waitFor({ timeout: 5000 })
    await shot(p, 'paste-ok')
    await p.close()
  })

  // These two read real BSC mainnet through public RPCs. Datacenter IPs (CI) are often refused by some of
  // them, and one answer is not enough for VERIFIED (that is the tool working as designed), so CI skips them.
  it.skipIf(!!process.env.CI)('popup: right-click style prefill (?q=hash) and a real BSC mainnet verification', async () => {
    const p = await ctx.newPage()
    await p.goto(`chrome-extension://${extId}/popup.html?q=${REAL_HASH}`)
    // A selected hash lands in "Analyze tx" (hash only). Then verify it for a specific recipient.
    const hash = p.locator('#tab-tx form input').first()
    await expect.poll(() => hash.inputValue()).toBe(REAL_HASH)
    await p.getByRole('button', { name: 'Analyze' }).click()
    await p.locator('#tab-tx .verdict .badge').waitFor({ timeout: 45_000 })
    expect(['NO RED FLAGS', 'PROBLEMS FOUND']).toContain((await p.locator('#tab-tx .verdict .badge').textContent())!)
    await p.locator('#tabbtn-verify').click()
    await p.locator('#tab-verify form input').first().fill(REAL_HASH)
    await p.locator('#tab-verify form input').nth(1).fill(REAL_TO)
    await p.getByRole('button', { name: 'Verify', exact: true }).click()
    await p.locator('#tab-verify .verdict .badge').waitFor({ timeout: 45_000 })
    expect(await p.locator('#tab-verify .verdict .badge').textContent()).toBe('VERIFIED')
    await shot(p, 'popup-verified-real-bsc-tx')
    await p.close()
  }, 90_000)

  it('popup: watchlist is mirrored to chrome.storage for the content scripts', async () => {
    const p = await ctx.newPage()
    await p.goto(`chrome-extension://${extId}/popup.html`)
    await p.locator('#tabbtn-scan').click()
    const add = p.locator('#tab-scan .card', { hasText: 'Watchlist' })
    await add.locator('input[placeholder="Address"]').fill('0x1234567890123456789012345678901234567890')
    await add.locator('input[placeholder^="Label"]').fill('Test label')
    await add.getByRole('button', { name: 'Add' }).click()
    const stored = (await p.evaluate(async () => (await chrome.storage.local.get('ftp.v1'))['ftp.v1'])) as { watchlist: unknown[] }
    expect(JSON.stringify(stored.watchlist)).toContain('Test label')
    await p.close()
  })

  it.skipIf(!!process.env.CI)('popup page makes no request outside the RPC allowlist', async () => {
    const p = await ctx.newPage()
    const hosts = new Set<string>()
    p.on('request', (r) => hosts.add(new URL(r.url()).protocol === 'chrome-extension:' ? 'self' : new URL(r.url()).host))
    await p.goto(`chrome-extension://${extId}/popup.html?q=${REAL_HASH}`)
    await p.getByRole('button', { name: 'Analyze' }).click()
    await p.locator('#tab-tx .verdict .badge').waitFor({ timeout: 45_000 })
    await p.locator('#tabbtn-verify').click()
    await p.locator('#tab-verify form input').first().fill(REAL_HASH)
    await p.locator('#tab-verify form input').nth(1).fill(REAL_TO)
    await p.getByRole('button', { name: 'Verify', exact: true }).click()
    await p.locator('#tab-verify .verdict .badge').waitFor({ timeout: 45_000 })
    const allowed = new Set(['self', 'bsc-dataseed.bnbchain.org', '1rpc.io', 'bsc-rpc.publicnode.com'])
    for (const h of hosts) expect(allowed.has(h), `unexpected host ${h}`).toBe(true)
    await p.close()
  }, 90_000)
})

