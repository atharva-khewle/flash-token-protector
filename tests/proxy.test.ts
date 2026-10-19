// F32c: the explorer proxy (Cloudflare / Vercel share this handler).

import { describe, expect, it } from 'vitest'
import { handleExplorer } from '../server/explorer'

describe('F32c explorer proxy', () => {
  const env = { EXPLORER_API_KEY: '' }
  const req = (q: string, headers: Record<string, string> = {}) =>
    new Request(`https://ftp.example/api/explorer?${q}`, { headers: { 'cf-connecting-ip': `ip-${Math.random()}`, ...headers } })

  it('rejects bad input', async () => {
    expect((await handleExplorer(req('chain=sol&address=0x1'), env)).status).toBe(400)
    expect((await handleExplorer(req(`chain=bsc&address=${'0x' + 'zz'.repeat(20)}`), env)).status).toBe(400)
  })

  it('without a key it says so instead of failing silently', async () => {
    const r = await handleExplorer(req(`chain=bsc&address=0x${'11'.repeat(20)}`), env)
    expect(await r.json()).toMatchObject({ available: false })
  })

  it('responses are never cacheable (no verdict cache poisoning)', async () => {
    const r = await handleExplorer(req(`chain=bsc&address=0x${'11'.repeat(20)}`), env)
    expect(r.headers.get('cache-control')).toBe('no-store')
  })

  it('cross-origin callers are refused', async () => {
    const r = await handleExplorer(req(`chain=bsc&address=0x${'11'.repeat(20)}`, { origin: 'https://evil.example' }), env)
    expect(r.status).toBe(403)
  })

  it('rate limits per IP', async () => {
    const r0 = (i: number) => new Request(`https://ftp.example/api/explorer?chain=bsc&address=0x${'22'.repeat(20)}`, { headers: { 'cf-connecting-ip': 'same-ip' } })
    let last = 200
    for (let i = 0; i < 31; i++) last = (await handleExplorer(r0(i), env, 1_000_000)).status
    expect(last).toBe(429)
  })
})
