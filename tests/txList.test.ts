// @vitest-environment happy-dom
// The address result's map and transaction list, on Tron where displayed addresses are base58.

import { describe, expect, it } from 'vitest'
import type { Hex, TokenTransfer } from '../src/chains/types'
import { hexToTron } from '../src/lib/tron'
import { USDT } from '../src/registry/usdt'
import type { ScanOutput } from '../src/services/scan'
import { scanDiagram } from '../src/ui/diagrams'
import { txListPanel } from '../src/ui/txList'
import { analyzeBehavior } from '../src/verdict/behavior'
import { analyzeWallet } from '../src/verdict/wallet'

const ME = '0x1111111111111111111111111111111111111111' as Hex
const FRIEND = '0x2222222222222222222222222222222222222222' as Hex
const FAKE = '0xfa4efa4efa4efa4efa4efa4efa4efa4efa4efa4e' as Hex
let n = 0
const tx = (over: Partial<TokenTransfer>): TokenTransfer => ({
  txHash: (n++).toString(16).padStart(64, '0'),
  blockNumber: null,
  timestamp: 1_700_000_000 + n,
  token: USDT.tron.hex,
  tokenName: null,
  tokenSymbol: 'USDT',
  decimals: 6,
  from: FRIEND,
  to: ME,
  value: 5_000_000n,
  txFrom: null,
  ...over,
})

function scan(transfers: TokenTransfer[]): ScanOutput {
  const wallet = analyzeWallet('tron', ME, transfers, [])
  return { chain: 'tron', address: ME, coverage: ['window'], code: null, tronPermissions: [], approvals: [], wallet, behavior: analyzeBehavior('tron', ME, transfers, wallet), tokenRisks: [], transfers, cursor: null, rounds: 1 }
}

describe('address result on Tron', () => {
  it('draws a lookalike whose real contact is given in base58 (regression: "bad tron hex")', () => {
    const s = scan([tx({})])
    s.wallet.poisoning.push({ txHash: 'ab', kind: 'lookalike', counterparty: FRIEND, match: { candidate: hexToTron(FRIEND), target: hexToTron(ME.replace('1111', '3333') as Hex), prefix: 3, suffix: 3, distance: 5 } as never, token: USDT.tron.hex, canonical: true, detail: '' })
    expect(() => scanDiagram(s)).not.toThrow()
  })

  it('lists every transfer and filters by direction and token', () => {
    const s = scan([tx({}), tx({ from: ME, to: FRIEND, value: 1_000_000n }), tx({ token: FAKE, tokenSymbol: 'USDT', tokenName: 'Tether USD', decimals: 6, value: 9_000_000_000n })])
    const el = txListPanel(s)
    el.querySelector<HTMLButtonElement>('.txl-toggle')!.click()
    expect(el.querySelectorAll('tbody tr').length).toBe(3)
    ;[...el.querySelectorAll<HTMLButtonElement>('.filter')].find((b) => b.textContent === 'Outgoing')!.click()
    expect(el.querySelectorAll('tbody tr').length).toBe(1)
    ;[...el.querySelectorAll<HTMLButtonElement>('.filter')].find((b) => b.textContent === 'All')!.click()
    const sel = el.querySelector('select')!
    sel.value = FAKE
    sel.dispatchEvent(new Event('change'))
    const rows = el.querySelectorAll('tbody tr')
    expect(rows.length).toBe(1)
    expect(rows[0]!.textContent).toContain('fake')
    expect(rows[0]!.textContent).toContain('9,000 USDT')
  })
})
