import { describe, expect, it } from 'vitest'
import bscReal from './fixtures/bsc-real-swap-receipt.json'
import tronReal from './fixtures/tron-real-usdt-info.json'
import { normalizeEvmReceipt } from '../src/chains/evm'
import { normalizeTronInfo } from '../src/chains/tron'
import type { Hex } from '../src/chains/types'
import { hexToTron } from '../src/lib/tron'
import { USDT } from '../src/registry/usdt'
import { verifyTx } from '../src/verdict/verifyTx'
import { agree, evidence, FAKE_TOKEN, ME, OTHER, PAYER, receipt, transferLog, usdtUnits } from './helpers'

const bsc = USDT.bsc.hex
const check = (r: ReturnType<typeof verifyTx>, id: string) => r.checks.find((c) => c.id === id)

describe('real mainnet fixtures', () => {
  // BSC swap: https://bscscan.com/tx/0x7b3aaee409a3d2e55fd363afe9a1b1a8efa4b45d805502dcf9825a2430f935ec
  const hash = '0x7b3aaee409a3d2e55fd363afe9a1b1a8efa4b45d805502dcf9825a2430f935ec'
  const r = normalizeEvmReceipt('bsc', hash, bscReal.result)
  const target = '0xba85435b435c487be4b49cbe63ab8ea12669ec75' as Hex

  it('BSC real swap: canonical USDT credited, other token leg listed as decoy, not added', () => {
    const out = verifyTx(evidence('bsc', r, { hash, context: { recipient: target }, finality: { head: r.blockNumber! + 100n, finalized: r.blockNumber! } }))
    expect(out.netToTarget).toBe(BigInt('0xe022f61d7fa00e39f'))
    expect(out.decoys.map((d) => d.token)).toContain('0x0a092e544da31150b439a1aaa1a3a2214a867f46')
    expect(out.decoys.every((d) => !d.touchesTarget)).toBe(true)
    expect(out.verdict).toBe('VERIFIED')
  })

  // Tron USDT transfer: https://tronscan.org/#/transaction/f4de16c6a7c695b249f1fc958b694a7ea532ef0f814966c6e5fa34211414c75a
  it('Tron real USDT transfer: 30,194.5 USDT to TFwGKLSJirTnVobHf9DXkzwbZNZA841jWy', () => {
    const id = tronReal.id
    const tr = normalizeTronInfo(id, tronReal)
    const to = '0x4172b0aa7c70b79a443e752577df3c600fd2cd70' as Hex
    expect(hexToTron(to)).toBe('TFwGKLSJirTnVobHf9DXkzwbZNZA841jWy')
    const out = verifyTx(
      evidence('tron', tr, { hash: id, context: { recipient: to, amount: 30_194_500_000n }, finality: { head: 87_241_900n, finalized: 87_241_850n } }),
    )
    expect(out.netFormatted).toBe('30,194.5')
    expect(out.verdict).toBe('VERIFIED')
  })
})

describe('A. token identity', () => {
  it('A1 fake token named Tether USD: no canonical log -> FAKE', () => {
    const out = verifyTx(evidence('bsc', receipt('bsc', [transferLog(FAKE_TOKEN, PAYER, ME, usdtUnits('bsc', 5000))])))
    expect(out.verdict).toBe('FAKE')
    expect(check(out, 'L2.identity')?.status).toBe('fail')
    expect(out.decoys[0]?.touchesTarget).toBe(true)
  })

  it('A3 fake token with a self-funded $1 pool: price never enters the verdict', () => {
    // Identity is chain + contract address. There is no price input to the rules at all.
    const out = verifyTx(evidence('bsc', receipt('bsc', [transferLog(FAKE_TOKEN, PAYER, ME, usdtUnits('bsc', 5000))]), { context: { recipient: ME, amount: usdtUnits('bsc', 5000) } }))
    expect(out.verdict).toBe('FAKE')
    expect(out.netToTarget).toBe(0n)
  })

  it('A4 bridged/pegged lookalike contract on the same chain -> FAKE (identity is address only)', () => {
    const pegged = '0x5555555555555555555555555555555555555555' as Hex
    const out = verifyTx(evidence('bsc', receipt('bsc', [transferLog(pegged, PAYER, ME, usdtUnits('bsc', 100))])))
    expect(out.verdict).toBe('FAKE')
  })

  it('A5 chain confusion: tx unknown on the chosen chain -> NOT RECEIVED', () => {
    const missing = receipt('bsc', [], { status: 'notfound', blockNumber: null, blockHash: null })
    const out = verifyTx(evidence('bsc', agree(missing)))
    expect(out.verdict).toBe('NOT RECEIVED')
  })

  it('A5 Ethereum USDT address appearing on BSC is not BSC USDT', () => {
    const out = verifyTx(evidence('bsc', receipt('bsc', [transferLog(USDT.eth.hex, PAYER, ME, 5_000_000_000n)])))
    expect(out.verdict).toBe('FAKE')
  })

  it('A6 decimals: BSC uses 18, Ethereum and Tron use 6', () => {
    const b = verifyTx(evidence('bsc', receipt('bsc', [transferLog(bsc, PAYER, ME, 5_000_000_000n)])))
    expect(b.netFormatted).toBe('0.000000005') // 5e9 wei-units on BSC is dust, not 5,000 USDT
    expect(check(b, 'L3.net')?.status).toBe('warn')
    const e = verifyTx(evidence('eth', receipt('eth', [transferLog(USDT.eth.hex, PAYER, ME, 5_000_000_000n)])))
    expect(e.netFormatted).toBe('5,000')
  })
})

describe('C. transaction-level deception', () => {
  it('C13 Transfer event "from Binance" emitted by a non-USDT contract -> FAKE', () => {
    const famousLooking = '0x9999999999999999999999999999999999999999' as Hex // synthetic stand-in for an exchange hot wallet
    const out = verifyTx(evidence('bsc', receipt('bsc', [transferLog(FAKE_TOKEN, famousLooking, ME, usdtUnits('bsc', 10_000))])))
    expect(out.verdict).toBe('FAKE')
    expect(out.decoys[0]?.reason).toMatch(/not the canonical USDT/)
  })

  it('C14 mixed tx: tiny real USDT + big fake: amount is the real part only, decoy warned', () => {
    const r = receipt('bsc', [transferLog(bsc, PAYER, ME, usdtUnits('bsc', 1)), transferLog(FAKE_TOKEN, PAYER, ME, usdtUnits('bsc', 4999), 1)])
    const out = verifyTx(evidence('bsc', r, { context: { recipient: ME, amount: usdtUnits('bsc', 5000) } }))
    expect(out.netFormatted).toBe('1')
    expect(check(out, 'L4.amount')?.status).toBe('fail')
    expect(check(out, 'L3.decoys')?.status).toBe('warn')
    expect(out.verdict).toBe('FAKE')
  })

  it('C14 mixed tx without expected amount is still not VERIFIED (decoy credits you)', () => {
    const r = receipt('bsc', [transferLog(bsc, PAYER, ME, usdtUnits('bsc', 10)), transferLog(FAKE_TOKEN, PAYER, ME, usdtUnits('bsc', 4990), 1)])
    expect(verifyTx(evidence('bsc', r)).verdict).toBe('UNVERIFIED')
  })

  it('C15 reverted tx whose input says transfer(victim, 5000) -> FAKE', () => {
    const out = verifyTx(evidence('bsc', receipt('bsc', [], { status: 'reverted' })))
    expect(out.verdict).toBe('FAKE')
    expect(check(out, 'L1.status')?.reason).toMatch(/reverted/)
  })

  it('C16 pending tx shown as proof -> NOT RECEIVED', () => {
    const p = receipt('bsc', [], { status: 'pending', blockNumber: null, blockHash: null })
    expect(verifyTx(evidence('bsc', agree(p))).verdict).toBe('NOT RECEIVED')
  })

  it('C17 included but not finalized -> UNVERIFIED', () => {
    const r = receipt('bsc', [transferLog(bsc, PAYER, ME, usdtUnits('bsc', 50))], { blockNumber: 1900n })
    const out = verifyTx(evidence('bsc', r, { finality: { head: 1905n, finalized: 1890n } }))
    expect(check(out, 'L1.finality')?.status).toBe('warn')
    expect(out.verdict).toBe('UNVERIFIED')
  })

  it('C17 fallback to confirmation count when finalized tag is missing', () => {
    const r = receipt('bsc', [transferLog(bsc, PAYER, ME, usdtUnits('bsc', 50))], { blockNumber: 1990n })
    expect(check(verifyTx(evidence('bsc', r, { finality: { head: 2000n, finalized: null } })), 'L1.finality')?.status).toBe('warn')
    expect(check(verifyTx(evidence('bsc', r, { finality: { head: 2100n, finalized: null } })), 'L1.finality')?.status).toBe('pass')
  })

  it('C18 real payment to someone else -> FAKE for my address', () => {
    const out = verifyTx(evidence('bsc', receipt('bsc', [transferLog(bsc, PAYER, OTHER, usdtUnits('bsc', 5000))])))
    expect(check(out, 'L4.recipient')?.status).toBe('fail')
    expect(out.verdict).toBe('FAKE')
  })

  it('C18 old payment reused for a new deal (not-before) -> FAKE', () => {
    const r = receipt('bsc', [transferLog(bsc, PAYER, ME, usdtUnits('bsc', 5000))])
    const out = verifyTx(evidence('bsc', r, { blockTimestamp: 1_700_000_000, context: { recipient: ME, notBefore: 1_790_000_000 } }))
    expect(check(out, 'L4.time')?.status).toBe('fail')
    expect(out.verdict).toBe('FAKE')
  })

  it('C18 same hash shown twice -> UNVERIFIED with reuse warning', () => {
    const r = receipt('bsc', [transferLog(bsc, PAYER, ME, usdtUnits('bsc', 5000))])
    const out = verifyTx(evidence('bsc', r, { previouslyAccepted: true }))
    expect(check(out, 'L4.reuse')?.status).toBe('warn')
    expect(out.verdict).toBe('UNVERIFIED')
  })

  it('C18 no recipient given -> UNVERIFIED (cannot bind context)', () => {
    const r = receipt('bsc', [transferLog(bsc, PAYER, ME, usdtUnits('bsc', 5000))])
    expect(verifyTx(evidence('bsc', r, { context: {} })).verdict).toBe('UNVERIFIED')
  })

  it('C19 USDT in and out in the same tx: net zero -> FAKE', () => {
    const r = receipt('bsc', [transferLog(bsc, PAYER, ME, usdtUnits('bsc', 5000)), transferLog(bsc, ME, PAYER, usdtUnits('bsc', 5000), 1)])
    const out = verifyTx(evidence('bsc', r))
    expect(out.netToTarget).toBe(0n)
    expect(out.verdict).toBe('FAKE')
  })

  it('C20 block hash given instead of tx hash -> FAKE with explanation', () => {
    const missing = receipt('bsc', [], { status: 'notfound', blockNumber: null })
    const out = verifyTx(evidence('bsc', agree(missing), { isBlockHash: true }))
    expect(out.verdict).toBe('FAKE')
    expect(check(out, 'L0.kind')?.reason).toMatch(/block hash/)
  })

  it('C37 payment through a router/multicall (tx.to is not USDT) still counts by logs', () => {
    const router = '0x4444444444444444444444444444444444444444' as Hex
    const r = receipt('bsc', [transferLog(bsc, router, ME, usdtUnits('bsc', 700))], { to: router })
    expect(verifyTx(evidence('bsc', r)).verdict).toBe('VERIFIED')
  })

  it('C38 Tron TRC10 / native "USDT" (no TRC20 log from the canonical contract) -> FAKE', () => {
    const out = verifyTx(evidence('tron', receipt('tron', [])))
    expect(out.verdict).toBe('FAKE')
    expect(check(out, 'L2.identity')?.status).toBe('fail')
  })

  it('malformed Transfer log from the canonical contract is ignored', () => {
    const bad = { ...transferLog(bsc, PAYER, ME, usdtUnits('bsc', 5)), data: '0x01' as Hex }
    const out = verifyTx(evidence('bsc', receipt('bsc', [bad])))
    expect(out.verdict).toBe('FAKE')
  })
})

describe('G34 Tron specifics', () => {
  it('fake TRC20 "USDT" on Tron -> FAKE', () => {
    const out = verifyTx(evidence('tron', receipt('tron', [transferLog(FAKE_TOKEN, PAYER, ME, 5_000_000_000n)])))
    expect(out.verdict).toBe('FAKE')
  })
  it('in a block but not yet solidified -> UNVERIFIED', () => {
    const r = receipt('tron', [transferLog(USDT.tron.hex, PAYER, ME, 5_000_000_000n)], { blockNumber: 1990n })
    expect(verifyTx(evidence('tron', r, { finality: { head: 2000n, finalized: 1980n } })).verdict).toBe('UNVERIFIED')
  })
})

describe('D / F. counterparty and infrastructure', () => {
  it('D22 dust from a vanity address -> UNVERIFIED (dust)', () => {
    const out = verifyTx(evidence('bsc', receipt('bsc', [transferLog(bsc, PAYER, ME, 10n ** 15n)])))
    expect(check(out, 'L3.net')?.status).toBe('warn')
    expect(out.verdict).toBe('UNVERIFIED')
  })

  it('D23 my expected recipient is a lookalike of my watched address -> warn', () => {
    const mine = '0xabcd1234000000000000000000000000000ef567' as Hex
    const lookalike = '0xabcd12349999999999999999999999999990f567' as Hex
    const r = receipt('bsc', [transferLog(bsc, PAYER, lookalike, usdtUnits('bsc', 5000))])
    const out = verifyTx(evidence('bsc', r, { context: { recipient: lookalike }, watchlist: [mine] }))
    expect(check(out, 'L5.lookalike')?.status).toBe('warn')
    expect(out.verdict).toBe('UNVERIFIED')
  })

  it('F30 RPC providers disagree -> UNVERIFIED, never VERIFIED or FAKE', () => {
    const good = receipt('bsc', [transferLog(bsc, PAYER, ME, usdtUnits('bsc', 5000))])
    const lie = receipt('bsc', [transferLog(bsc, PAYER, ME, usdtUnits('bsc', 50000))])
    const out = verifyTx(
      evidence('bsc', [
        { provider: 'a', ok: true, value: good },
        { provider: 'b', ok: true, value: lie },
      ]),
    )
    expect(out.verdict).toBe('UNVERIFIED')
  })

  it('F30 only one provider answered -> UNVERIFIED', () => {
    const good = receipt('bsc', [transferLog(bsc, PAYER, ME, usdtUnits('bsc', 5000))])
    const out = verifyTx(evidence('bsc', [{ provider: 'a', ok: true, value: good }, { provider: 'b', ok: false, error: 'timeout' }]))
    expect(out.verdict).toBe('UNVERIFIED')
  })

  it('F30 one provider has the tx, the other does not -> UNVERIFIED', () => {
    const good = receipt('bsc', [transferLog(bsc, PAYER, ME, usdtUnits('bsc', 5000))])
    const none = receipt('bsc', [], { status: 'notfound', blockNumber: null, blockHash: null })
    const out = verifyTx(evidence('bsc', [{ provider: 'a', ok: true, value: good }, { provider: 'b', ok: true, value: none }]))
    expect(out.verdict).toBe('UNVERIFIED')
  })

  it('F31 sender on Tether blacklist (Ethereum) -> UNVERIFIED with warning', () => {
    const r = receipt('eth', [transferLog(USDT.eth.hex, PAYER, ME, usdtUnits('eth', 5000))])
    const out = verifyTx(evidence('eth', r, { senderBlacklisted: { [PAYER]: true } }))
    expect(check(out, 'L5.blacklist')?.status).toBe('warn')
    expect(out.verdict).toBe('UNVERIFIED')
  })

  it('clean BSC payment with all context -> VERIFIED', () => {
    const r = receipt('bsc', [transferLog(bsc, PAYER, ME, usdtUnits('bsc', 5000))])
    const out = verifyTx(evidence('bsc', r, { context: { recipient: ME, amount: usdtUnits('bsc', 5000), notBefore: 1_780_000_000 } }))
    expect(out.verdict).toBe('VERIFIED')
    expect(out.netFormatted).toBe('5,000')
  })
})
