// Follow-the-money analysis: a splitter fans USDT out to mules, the mules forward it to one
// collector. The map must find each role and lay the money out left to right.

import { describe, expect, it } from 'vitest'
import type { Hex, TokenTransfer } from '../src/chains/types'
import { USDT } from '../src/registry/usdt'
import { extractAddresses } from '../src/ui/trackerTab'
import { buildTrace } from '../src/verdict/trace'

const A = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as Hex
const SPLIT = A(1)
const MULES = [A(2), A(3), A(4)]
const SINK = A(9)
const FAKE = A(0xfa4e)
const u = (n: number) => BigInt(n) * 1_000_000n

let i = 0
const tx = (from: Hex, to: Hex, value: bigint, over: Partial<TokenTransfer> = {}): TokenTransfer => ({
  txHash: `t${i++}`,
  blockNumber: null,
  timestamp: 1_700_000_000 + i,
  token: USDT.tron.hex,
  tokenName: 'Tether USD',
  tokenSymbol: 'USDT',
  decimals: 6,
  from,
  to,
  value,
  txFrom: null,
  ...over,
})

function scenario() {
  const fanOut = MULES.map((m) => tx(SPLIT, m, u(1000)))
  const fanIn = MULES.map((m) => tx(m, SINK, u(990)))
  const histories = new Map<Hex, TokenTransfer[]>([
    [SPLIT, fanOut],
    ...MULES.map((m, k) => [m, [fanOut[k]!, fanIn[k]!]] as [Hex, TokenTransfer[]]),
  ])
  return histories
}

describe('follow the money', () => {
  it('finds the splitter, the pass-through mules and the collector, in flow order', () => {
    const g = buildTrace({ chain: 'tron', histories: scenario(), inputs: [SPLIT] })
    const node = (a: Hex) => g.nodes.find((n) => n.address === a)!
    expect(node(SPLIT).roles).toEqual(expect.arrayContaining(['input', 'splitter', 'source']))
    for (const m of MULES) expect(node(m).roles).toContain('pass-through')
    expect(node(SINK).roles).toEqual(expect.arrayContaining(['collector', 'unexplored']))
    expect([node(SPLIT).layer, node(MULES[0]!).layer, node(SINK).layer]).toEqual([0, 1, 2])
    expect(g.moved).toBe(u(3000) + u(2970))
    expect(g.patterns.join(' ')).toMatch(/splits money to 3/)
    expect(g.patterns.join(' ')).toMatch(/3 addresses send to/)
  })

  it('counts a transfer once even when both wallets’ histories contain it', () => {
    const g = buildTrace({ chain: 'tron', histories: scenario(), inputs: [SPLIT] })
    expect(g.transfersSeen).toBe(6)
    expect(g.flows.find((f) => f.from === SPLIT && f.to === MULES[0])!.count).toBe(1)
  })

  it('keeps fake USDT out of the real-USDT view and labels it fake in the all-tokens view', () => {
    const h = scenario()
    h.set(SPLIT, [...h.get(SPLIT)!, tx(SPLIT, A(7), u(50_000), { token: FAKE, tokenName: 'Tether USD', tokenSymbol: 'USDT' })])
    expect(buildTrace({ chain: 'tron', histories: h, inputs: [SPLIT] }).flows.some((f) => f.token === FAKE)).toBe(false)
    const all = buildTrace({ chain: 'tron', histories: h, inputs: [SPLIT], token: 'all' })
    expect(all.flows.find((f) => f.token === FAKE)!.kind).toBe('fake')
  })

  it('survives a cycle (money sent back) without looping', () => {
    const h = scenario()
    h.set(SINK, [tx(SINK, SPLIT, u(10))])
    const g = buildTrace({ chain: 'tron', histories: h, inputs: [SPLIT] })
    expect(g.nodes.length).toBe(5)
  })

  it('pulls addresses out of any pasted text, without duplicates', () => {
    const text = `send to 0x${'ab'.repeat(20)}, then TJDENsfBJs4RFETt1X1W8wMDc8M5XnJhCe; again 0x${'ab'.repeat(20)}`
    expect(extractAddresses(text)).toEqual([`0x${'ab'.repeat(20)}`, 'TJDENsfBJs4RFETt1X1W8wMDc8M5XnJhCe'])
  })
})
