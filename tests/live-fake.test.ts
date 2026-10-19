// Real BSC mainnet transactions that moved NON-canonical tokens named like USDT.
// Skipped by default; run with  LIVE=1 npx vitest run tests/live-fake.test.ts
// Read-only. Hashes found with scripts/find-fake-usdt.ts.

import { describe, expect, it } from 'vitest'
import { createPublicClient, http, type Hex } from 'viem'
import { bsc } from 'viem/chains'
import { runTokenCheck } from '../src/services/tokenCheck'
import { runVerify } from '../src/services/verify'

const live = !!process.env.LIVE
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const CANON = '0x55d398326f99059ff775485246999027b3197955'
const client = createPublicClient({ chain: bsc, transport: http('https://bsc-dataseed.bnbchain.org') })

const FAKES: { label: string; hash: Hex }[] = [
  { label: 'token "USDT / Tether USD" at 0x6a02…8888', hash: '0xe1552e68bb1c54444eb01290996608f385595b6194487ff60b71407f1d5fd9b7' },
  { label: 'token "ՍSDT / Tether" (Armenian letter) at 0x96fb…8f5d', hash: '0xaa8c173835134c2190f61294701734eaaa45a04b9e3279d1d0c6387ce8b1a09e' },
  { label: 'token "USDT / TETHER" at 0x0929…089c', hash: '0x5b993fe379f29e439d720a55cc615f9ea232f2b0b10c61628a2e9fb7446f9b45' },
  { label: 'token "USDT / USDT" at 0x3a7a…767b', hash: '0x0531d63e72ac9150ea175fbe03244925a60a67d0f5488fe6cfa6f584aa8202e4' },
]

describe.skipIf(!live)('live BSC: fake USDT in the wild', () => {
  for (const f of FAKES) {
    it(f.label, { timeout: 90_000 }, async () => {
      const rc = await client.getTransactionReceipt({ hash: f.hash })
      const log = rc.logs.find((l) => l.topics[0] === TRANSFER && l.topics.length === 3 && l.address.toLowerCase() !== CANON)!
      const to = `0x${log.topics[2]!.slice(26)}` as Hex
      const amount = BigInt(log.data)
      const r = await runVerify({ chain: 'bsc', hash: f.hash, hiddenChars: 0, context: { recipient: to, amount }, watchlist: [] })
      console.log(`${f.label}\n  token ${log.address} to ${to} raw ${amount}\n  VERDICT ${r.verdict}\n` + r.checks.map((c) => `  ${c.id} ${c.status}`).join('\n'))
      expect(r.verdict).not.toBe('VERIFIED')
      expect(r.verdict).not.toBe('UNVERIFIED')
    })
  }

  it('control: a real canonical USDT transfer is VERIFIED', { timeout: 90_000 }, async () => {
    const r = await runVerify({
      chain: 'bsc',
      hash: '0xbe11c35efabcfd7e8ae8f349cb90395a4d3d4200de6de2b567fa374b4361b869',
      hiddenChars: 0,
      context: { recipient: '0xabf5d18ed012a814c0eedbe0ab4d31053c0cd732', amount: 230000000000000000000n },
      watchlist: [],
    })
    console.log(`control VERDICT ${r.verdict}\n` + r.checks.map((c) => `  ${c.id} ${c.status}`).join('\n'))
    expect(r.verdict).toBe('VERIFIED')
  })

  it('token address check: real USDT, the four fakes, a normal token and a non-contract', { timeout: 90_000 }, async () => {
    const cases: [string, `0x${string}`, string][] = [
      ['real USDT', '0x55d398326f99059ff775485246999027b3197955', 'REAL USDT'],
      ['fake 0x6a02', '0x6a0258127ba84b4361351be5e63e1af2c5ab8888', 'FAKE USDT'],
      ['fake Armenian', '0x96fb784986284cb6d4a8da6dd50dd7e85ef38f5d', 'FAKE USDT'],
      ['fake TETHER', '0x09293384f192a13fc355addfa6e7d3058b7c089c', 'FAKE USDT'],
      ['fake USDT/USDT', '0x3a7ae7a8ffaf4caf4e55ee78b48b12eb7e56767b', 'FAKE USDT'],
      ['WBNB', '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', 'NOT USDT'],
      ['wallet, no code', '0xabf5d18ed012a814c0eedbe0ab4d31053c0cd732', 'NOT A CONTRACT'],
    ]
    for (const [label, token, want] of cases) {
      const r = await runTokenCheck({ chain: 'bsc', token })
      console.log(`${label}: ${r.verdict} (${r.symbol ?? '-'} / ${r.name ?? '-'})`)
      expect(r.verdict, label).toBe(want)
    }
  })
})
