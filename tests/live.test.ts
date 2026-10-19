// Live checks against public mainnet RPCs. Skipped by default; run with
//   LIVE=1 npx vitest run tests/live.test.ts
// Uses the same real transactions as the fixtures.

import { describe, expect, it } from 'vitest'
import type { Hex } from '../src/chains/types'
import { runScan } from '../src/services/scan'
import { runVerify } from '../src/services/verify'

const live = !!process.env.LIVE

describe.skipIf(!live)('live mainnet', () => {
  it('BSC: real swap tx verifies end to end', { timeout: 60_000 }, async () => {
    const r = await runVerify({
      chain: 'bsc',
      hash: '0x7b3aaee409a3d2e55fd363afe9a1b1a8efa4b45d805502dcf9825a2430f935ec',
      hiddenChars: 0,
      context: { recipient: '0xba85435b435c487be4b49cbe63ab8ea12669ec75' },
      watchlist: [],
    })
    console.log(r.verdict, r.checks.map((c) => `${c.id}:${c.status}`).join(' '))
    expect(r.netToTarget).toBe(BigInt('0xe022f61d7fa00e39f'))
    expect(['VERIFIED', 'UNVERIFIED']).toContain(r.verdict)
  })

  it('Tron: real USDT transfer verifies end to end', { timeout: 60_000 }, async () => {
    const r = await runVerify({
      chain: 'tron',
      hash: 'f4de16c6a7c695b249f1fc958b694a7ea532ef0f814966c6e5fa34211414c75a',
      hiddenChars: 0,
      context: { recipient: '0x4172b0aa7c70b79a443e752577df3c600fd2cd70', amount: 30_194_500_000n },
      watchlist: [],
    })
    console.log(r.verdict, r.checks.map((c) => `${c.id}:${c.status}`).join(' '))
    expect(r.verdict).toBe('VERIFIED')
  })

  it('BSC: unknown hash is NOT RECEIVED', { timeout: 60_000 }, async () => {
    const r = await runVerify({ chain: 'bsc', hash: `0x${'00'.repeat(31)}01`, hiddenChars: 0, context: {}, watchlist: [] })
    expect(r.verdict).toBe('NOT RECEIVED')
  })

  it('BSC: wallet scan runs and reports coverage', { timeout: 120_000 }, async () => {
    const r = await runScan('bsc', '0xba85435b435c487be4b49cbe63ab8ea12669ec75' as Hex, [])
    console.log(r.coverage.join('\n'), r.code)
    expect(r.coverage.length).toBeGreaterThan(0)
  })

  it('Tron: wallet scan runs', { timeout: 120_000 }, async () => {
    const r = await runScan('tron', '0x4172b0aa7c70b79a443e752577df3c600fd2cd70' as Hex, [])
    console.log(r.coverage.join('\n'), r.tronPermissions, r.wallet.realIn, r.wallet.fakeTokens.length)
    expect(r.coverage.length).toBeGreaterThan(0)
  })
})
