// Real BSC mainnet transactions that moved NON-canonical tokens named like USDT.
// Skipped by default; run with  LIVE=1 npx vitest run tests/live-fake.test.ts
// Read-only. Hashes found with scripts/find-fake-usdt.ts.

import { describe, expect, it } from 'vitest'
import { createPublicClient, http, type Hex } from 'viem'
import { bsc } from 'viem/chains'
import { runVerify } from '../src/services/verify'

const live = !!process.env.LIVE
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const CANON = '0x55d398326f99059ff775485246999027b3197955'
const client = createPublicClient({ chain: bsc, transport: http('https://bsc-dataseed.bnbchain.org') })

const FAKES: { label: string; hash: Hex }[] = [
  { label: 'token "USDT / Tether USD" at 0x6a02…8888', hash: '0xe1552e68bb1c54444eb01290996608f385595b6194487ff60b71407f1d5fd9b7' },
  { label: 'token "ՍSDT / Tether" (Armenian letter) at 0x96fb…8f5d', hash: '0xaa8c173835134c2190f61294701734eaaa45a04b9e3279d1d0c6387ce8b1a09e' },
]

describe.skipIf(!live)('live BSC: fake USDT in the wild', () => {
  for (const f of FAKES) {
    it(f.label, { timeout: 90_000 }, async () => {
      const rc = await client.getTransactionReceipt({ hash: f.hash })
      const log = rc.logs.find((l) => l.topics[0] === TRANSFER && l.topics.length === 3 && l.address.toLowerCase() !== CANON)!
      const to = `0x${log.topics[2]!.slice(26)}`
      const amount = BigInt(log.data)
      const r = await runVerify({ chain: 'bsc', hash: f.hash, hiddenChars: 0, context: { recipient: to, amount }, watchlist: [] })
      console.log(`${f.label}\n  token ${log.address} to ${to} raw ${amount}\n  VERDICT ${r.verdict}\n` + r.checks.map((c) => `  ${c.id} ${c.status}`).join('\n'))
      expect(r.verdict).not.toBe('VERIFIED')
      expect(r.verdict).not.toBe('UNVERIFIED')
    })
  }
})
