// Finds recent BSC mainnet transfers of non-canonical tokens whose symbol or name looks like USDT/Tether.
// Read-only; uses eth_getBlockReceipts because public nodes refuse address-less eth_getLogs.
// Used to pick real examples for manual testing:  node scripts/find-fake-usdt.ts [blocks]

import { createPublicClient, http, parseAbi, type Address } from 'viem'
import { bsc } from 'viem/chains'

const CANON = '0x55d398326f99059ff775485246999027b3197955'
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const RPC = 'https://bsc-dataseed.bnbchain.org'
const blocks = Number(process.argv[2] ?? '60')

type Receipt = { transactionHash: string; logs: { address: string; topics: string[] }[] }

async function receipts(block: bigint): Promise<Receipt[]> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockReceipts', params: ['0x' + block.toString(16)] }),
  })
  const j = (await res.json()) as { result?: Receipt[] }
  return j.result ?? []
}

const c = createPublicClient({ chain: bsc, transport: http(RPC) })
const erc20 = parseAbi(['function symbol() view returns (string)', 'function name() view returns (string)'])

const head = await c.getBlockNumber()
const emitters = new Map<string, { tx: string; count: number }>()
for (let b = head - BigInt(blocks); b < head; b++) {
  for (const r of await receipts(b)) {
    for (const l of r.logs) {
      if (l.topics[0] !== TRANSFER || l.topics.length !== 3) continue
      const a = l.address.toLowerCase()
      const e = emitters.get(a)
      if (e) e.count++
      else emitters.set(a, { tx: r.transactionHash, count: 1 })
    }
  }
}
console.log(`scanned ${blocks} blocks up to ${head}, ${emitters.size} token emitters`)

for (const [addr, info] of emitters) {
  if (addr === CANON) continue
  try {
    const [symbol, name] = await Promise.all([
      c.readContract({ address: addr as Address, abi: erc20, functionName: 'symbol' }),
      c.readContract({ address: addr as Address, abi: erc20, functionName: 'name' }),
    ])
    if (/usd|tether/i.test(symbol + name)) console.log(`${symbol} / ${name}  ${addr}  tx ${info.tx}  (${info.count} transfers)`)
  } catch {
    // not an ERC-20 with string symbol; ignore
  }
}
