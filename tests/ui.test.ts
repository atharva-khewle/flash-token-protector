// @vitest-environment happy-dom
// Smoke test: the page mounts, tabs switch, and bad input is refused before any network call.

import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(async () => {
  document.body.innerHTML = '<main id="app"></main>' // test setup only, not app code
  await import('../src/ui/main')
})

describe('UI', () => {
  it('renders four tabs and shows the verify tab first', () => {
    const tabs = [...document.querySelectorAll('[role=tab]')].map((b) => b.textContent)
    expect(tabs).toEqual(['Verify tx', 'Check token', 'Scan wallet', 'Check before sending'])
    expect((document.getElementById('tab-verify') as HTMLElement).hidden).toBe(false)
    expect((document.getElementById('tab-scan') as HTMLElement).hidden).toBe(true)
  })

  it('switches tabs', () => {
    ;(document.getElementById('tabbtn-send') as HTMLButtonElement).click()
    expect((document.getElementById('tab-send') as HTMLElement).hidden).toBe(false)
    ;(document.getElementById('tabbtn-verify') as HTMLButtonElement).click()
  })

  it('refuses a malformed hash with a readable reason (L0)', () => {
    const tab = document.getElementById('tab-verify')!
    const input = tab.querySelectorAll('input')[0] as HTMLInputElement
    input.value = '0x1234'
    tab.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    expect(tab.querySelector('.error')!.textContent).toMatch(/64 hex/)
  })

  it('adds an address to the watchlist (stored locally, checksummed)', () => {
    const scan = document.getElementById('tab-scan')!
    const [wa] = [...scan.querySelectorAll('.card input')].filter((i) => (i as HTMLInputElement).placeholder === 'Address') as HTMLInputElement[]
    wa!.value = '0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
    const add = [...scan.querySelectorAll('button')].find((b) => b.textContent === 'Add')!
    add.click()
    expect(scan.querySelector('.watch')!.textContent!.toLowerCase()).toContain('0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678')
  })

  it('send check flags a lookalike of the watched address (no network needed for the verdict)', async () => {
    const send = document.getElementById('tab-send')!
    ;(send.querySelector('input') as HTMLInputElement).value = '0xa1b2c3d4ffffffffffffffffffffffffff345678'
    send.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await new Promise((r) => setTimeout(r, 0))
    expect(send.textContent).toContain('LOOKALIKE')
  })

  it('token tab refuses a tx hash pasted as an address', () => {
    const tab = document.getElementById('tab-token')!
    ;(tab.querySelector('input') as HTMLInputElement).value = `0x${'ab'.repeat(32)}`
    tab.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    expect(tab.querySelector('.error')!.textContent).toMatch(/40 hex/)
  })

  it('token tab says REAL USDT for the hardcoded BSC contract without network', async () => {
    const tab = document.getElementById('tab-token')!
    const input = tab.querySelector('input') as HTMLInputElement
    input.value = '0x55d398326f99059fF775485246999027B3197955'
    tab.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    await expect.poll(() => tab.querySelector('.badge')?.textContent).toBe('REAL USDT')
  })
})
