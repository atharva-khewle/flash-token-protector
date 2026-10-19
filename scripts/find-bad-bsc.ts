// Read-only scan of recent BSC blocks for real examples of what this tool warns about:
//   1. non-canonical tokens that call themselves USDT / Tether
//   2. real-USDT zero-value transfers where the sender did not sign the tx (address-poisoning "transferFrom" spoof)
//   3. tiny real-USDT dust transfers (< 0.01 USDT)
// Nothing is deployed or sent. Uses eth_getBlockReceipts because public nodes refuse address-less eth_getLogs.
//   node scripts/find-bad-bsc.ts [blocks]

import { createPublicClient, http, parseAbi, type Address } from 'viem'
import { bsc } from 'viem/chains'

const CANON = '0x55d398326f99059ff775485246999027b3197955'
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const RPC = 'https://bsc-dataseed.bnbchain.org'
const blocks = Number(process.argv[2] ?? '300')

type Receipt = { transactionHash: string; from: string; to: string | null; status: string; logs: { address: string; topics: string[]; data: string }[] }

async function receipts(block: bigint): Promise<Receipt[]> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockReceipts', params: ['0x' + block.toString(16)] }),
  })
  return ((await res.json()) as { result?: Receipt[] }).result ?? []
}

const c = createPublicClient({ chain: bsc, transport: http(RPC) })
const erc20 = parseAbi(['function symbol() view returns (string)', 'function name() view returns (string)'])
const addr = (t: string) => `0x${t.slice(26)}`

const fakeTokens = new Map<string, { tx: string; to: string; value: bigint }>()
const spoofed: { tx: string; from: string; to: string; signer: string }[] = []
const dust: { tx: string; from: string; to: string; value: bigint }[] = []

const head = await c.getBlockNumber()
for (let b = head - BigInt(blocks); b < head; b++) {
  for (const r of await receipts(b)) {
    if (r.status === '0x0') continue
    for (const l of r.logs) {
      if (l.topics[0] !== TRANSFER || l.topics.length !== 3) continue
      const emitter = l.address.toLowerCase()
      const value = BigInt(l.data)
      if (emitter === CANON) {
        const from = addr(l.topics[1]!)
        const to = addr(l.topics[2]!)
        if (value === 0n && r.from.toLowerCase() !== from) spoofed.push({ tx: r.transactionHash, from, to, signer: r.from })
        else if (value > 0n && value < 10n ** 16n) dust.push({ tx: r.transactionHash, from, to, value })
      } else if (!fakeTokens.has(emitter)) {
        fakeTokens.set(emitter, { tx: r.transactionHash, to: addr(l.topics[2]!), value })
      }
    }
  }
}
console.log(`scanned ${blocks} blocks up to ${head}`)

console.log('\n== tokens calling themselves USDT/Tether (not the canonical contract) ==')
for (const [token, info] of fakeTokens) {
  try {
    const [symbol, name] = await Promise.all([
      c.readContract({ address: token as Address, abi: erc20, functionName: 'symbol' }),
      c.readContract({ address: token as Address, abi: erc20, functionName: 'name' }),
    ])
    if (/usdt|tether/i.test(symbol + name)) console.log(`${JSON.stringify(symbol)} / ${JSON.stringify(name)}\n  token ${token}\n  tx    ${info.tx}\n  to    ${info.to}`)
  } catch {
    /* not a readable ERC-20 */
  }
}

console.log(`\n== zero-value real-USDT transfers the sender did not sign (poisoning spoof): ${spoofed.length} ==`)
for (const s of spoofed.slice(0, 6)) console.log(`tx ${s.tx}\n  shown as from ${s.from}\n  to ${s.to}\n  actually signed by ${s.signer}`)

console.log(`\n== real-USDT dust (< 0.01 USDT): ${dust.length} ==`)
for (const d of dust.slice(0, 6)) console.log(`tx ${d.tx}\n  from ${d.from}\n  to ${d.to}\n  raw ${d.value}`)
