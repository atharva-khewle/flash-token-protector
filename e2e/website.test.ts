// Drives the website (testnet build mode) in a real browser against a local Anvil chain.
// Every attack scenario is built on chain first (same code as e2e/vectors.test.ts), then each
// "verify tx" / "scan wallet" case is entered into the real form and the screen is checked.
//
//   npm run e2e:web        screenshots go to docs/proof/website/

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright-core'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deployAll } from '../scripts/deploy-test-contracts'
import { registerLocal } from '../src/testnet'
import { makeCtx, startAnvil, type Anvil } from './chain'
import { scenarios, type Outcome } from './scenarios'

const ROOT = process.cwd()
const PORT = 5174
const CHROME = process.env.FTP_CHROMIUM ?? chromium.executablePath()
const SHOTS = join(ROOT, 'docs', 'proof', 'website')

let anvil: Anvil
let vite: ViteDevServer
let browser: Browser
let page: Page
const outcomes = new Map<string, Outcome>()

/** What must be visible on screen after submitting the form, per scan case. */
const SCAN_EXPECT: Record<string, string> = {
  'B8-revocable': 'FAKE USDT',
  'D21-zero-value': 'Zero-value transfer',
  'D22-vanity-dust': 'imitates',
  'E24-approvals': 'can spend 50',
  'E25-7702': 'has delegated its code',
}
const SHOT_IDS = new Set(['baseline', 'A1-fake-tether', 'B9-honeypot', 'C14-mixed', 'C20-block-hash', 'D21-zero-value', 'E25-7702'])

let deployed: Awaited<ReturnType<typeof deployAll>>

beforeAll(async () => {
  if (!existsSync(CHROME)) throw new Error('Chromium not found. Set FTP_CHROMIUM or run: npx playwright-core install chromium')
  anvil = await startAnvil()
  const d = await deployAll(anvil.rpc)
  deployed = d
  registerLocal(d)
  const ctx = await makeCtx(d)
  for (const s of scenarios) {
    if (s.id === 'SAFETY-test-only-contracts' || s.id === 'A5-chain-confusion') continue
    outcomes.set(s.id, await s.run(ctx))
  }
  writeFileSync(join(ROOT, 'public', 'testnet-deployments.json'), JSON.stringify(d, null, 2) + '\n')
  vite = await createServer({ root: ROOT, mode: 'testnet', logLevel: 'silent', server: { port: PORT, host: '127.0.0.1', strictPort: true } })
  await vite.listen()
  browser = await chromium.launch({ executablePath: CHROME, headless: true })
  page = await browser.newPage({ viewport: { width: 1000, height: 900 } })
  mkdirSync(SHOTS, { recursive: true })
}, 180_000)

afterAll(async () => {
  await browser?.close()
  await vite?.close()
  await anvil?.stop()
})

async function submit(tab: 'verify' | 'scan', fill: (inputs: string[]) => Promise<void>): Promise<void> {
  await page.goto(`http://127.0.0.1:${PORT}/`)
  await page.locator(`#tabbtn-${tab}`).click()
  const form = page.locator(`#tab-${tab} form`).first()
  await form.locator('select').selectOption('local')
  await fill([])
  await form.locator('button[type=submit]').click()
  await page.locator(`#tab-${tab} .result .card`).waitFor({ timeout: 30_000 })
}

describe('website (testnet build) in a real browser', () => {
  it('shows the test banner and offers the local chain', async () => {
    await page.goto(`http://127.0.0.1:${PORT}/`)
    await expect.poll(() => page.locator('.testbanner').textContent()).toContain('TEST BUILD')
    expect(await page.locator('#tab-verify select option').allTextContents()).toContain('LOCAL TEST CHAIN (Anvil 31337)')
  })

  for (const s of scenarios) {
    it(`UI: ${s.id}`, async (t) => {
      const o = outcomes.get(s.id)
      if (!o?.ui) return t.skip()
      const ui = o.ui
      if (ui.tab === 'verify') {
        await submit('verify', async () => {
          const inputs = page.locator('#tab-verify form input')
          await inputs.nth(0).fill(ui.hash!)
          await inputs.nth(1).fill(ui.recipient ?? '')
          if (ui.amount) await inputs.nth(2).fill(ui.amount)
        })
        const verdict = (await page.locator('#tab-verify .verdict .badge').textContent())!
        expect(ui.expect.startsWith(verdict), `${s.id}: screen says ${verdict}, expected ${ui.expect}`).toBe(true)
        if (ui.expect.includes('honeypot')) await expect.poll(() => page.locator('#tab-verify .risks').textContent()).toContain('transfer by the holder reverts')
      } else if (ui.tab === 'scan') {
        await submit('scan', async () => {
          await page.locator('#tab-scan form input').first().fill(ui.address!)
        })
        await expect.poll(() => page.locator('#tab-scan .result').textContent()).toContain(SCAN_EXPECT[s.id] ?? ui.expect)
      }
      if (SHOT_IDS.has(s.id)) {
        await page.locator(`#tab-${ui.tab} .result`).scrollIntoViewIfNeeded()
        await page.screenshot({ path: join(SHOTS, `${s.id}.png`), fullPage: true })
      }
    })
  }

  it('Check token tab: mock USDT is REAL, every fake named USDT is FAKE USDT, a non-contract is NOT A CONTRACT', async () => {
    await page.goto(`http://127.0.0.1:${PORT}/`)
    await page.locator('#tabbtn-token').click()
    const form = page.locator('#tab-token form')
    await form.locator('select').selectOption('local')
    const badge = page.locator('#tab-token .verdict .badge')
    const cases: [string, string][] = [
      [deployed.mockUsdt, 'REAL USDT'],
      [deployed.tokens.fakeUsdt!, 'FAKE USDT'],
      [deployed.tokens.homoglyph!, 'FAKE USDT'],
      [deployed.tokens.tugrik!, 'FAKE USDT'],
      [deployed.tokens.sixDecimals!, 'FAKE USDT'],
      [deployed.tokens.proxyToken!, 'FAKE USDT'],
      [deployed.accounts!.B_receiver!, 'NOT A CONTRACT'],
    ]
    for (const [address, want] of cases) {
      await form.locator('input').fill(address)
      await form.locator('button[type=submit]').click()
      await expect.poll(() => badge.textContent(), { timeout: 30_000, message: address }).toBe(want)
    }
    await form.locator('input').fill(deployed.tokens.fakeUsdt!)
    await form.locator('button[type=submit]').click()
    await expect.poll(() => badge.textContent()).toBe('FAKE USDT')
    await page.screenshot({ path: join(SHOTS, 'token-fake.png'), fullPage: true })
  })

  it('check-before-sending flags a lookalike of a saved address (no chain call needed for the verdict)', async () => {
    await page.goto(`http://127.0.0.1:${PORT}/`)
    await page.locator('#tabbtn-scan').click()
    const watch = page.locator('#tab-scan .card', { hasText: 'Watchlist' })
    await watch.locator('select').selectOption('local')
    await watch.locator('input[placeholder="Address"]').fill('0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678')
    await watch.getByRole('button', { name: 'Add' }).click()
    await page.locator('#tabbtn-send').click()
    const form = page.locator('#tab-send form')
    await form.locator('select').selectOption('local')
    await form.locator('input').fill('0xa1b2c3d4ffffffffffffffffffffffffff345678')
    await form.locator('button[type=submit]').click()
    await expect.poll(() => page.locator('#tab-send .verdict .badge').textContent()).toBe('LOOKALIKE')
    await page.screenshot({ path: join(SHOTS, 'send-lookalike.png'), fullPage: true })
  })

  it('a hostile token name is shown as text, not markup', async () => {
    const url = outcomes.get('A7-url-name')!.ui!
    await submit('verify', async () => {
      const inputs = page.locator('#tab-verify form input')
      await inputs.nth(0).fill(url.hash!)
      await inputs.nth(1).fill(url.recipient!)
    })
    expect(await page.locator('#tab-verify .result a').count()).toBe(0) // the "link" in the token name is not clickable
  })
})
