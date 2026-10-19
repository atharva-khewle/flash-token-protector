// One scenario per attack vector, run against a real (local) chain.
// Each scenario builds the attack on Anvil with real transactions, then asks the
// app's own services (the same code the website and extension run) for a verdict.
// Scenarios assert with node:assert and return what was observed, for docs/PROOF.md.

import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { createWalletClient, encodeFunctionData, erc20Abi, http, type Hex } from 'viem'
import { EvmAdapter } from '../src/chains/evm'
import { CHAINS } from '../src/registry/chains'
import { markAccepted } from '../src/lib/storage'
import { runScan, type ScanOutput } from '../src/services/scan'
import { runVerify, type VerifyOutput } from '../src/services/verify'
import { verifyTx } from '../src/verdict/verifyTx'
import { checkDestination } from '../src/verdict/wallet'
import { assertTestChain, deployAll } from '../scripts/deploy-test-contracts'
import { E18, startAnvil, tokenAbi, vanityOf, type Ctx } from './chain'

export interface Outcome {
  txs: string[]
  /** One line: what the app said. */
  observed: string
  /** Inputs to repeat this check by hand in the browser UI. */
  ui?: { tab: 'verify' | 'scan' | 'send'; hash?: string; address?: string; recipient?: string; amount?: string; expect: string }
}

export interface Scenario {
  id: string
  vectors: string[]
  title: string
  run(ctx: Ctx): Promise<Outcome>
}

const lc = (h: string) => h.toLowerCase() as Hex
const units = (n: number | bigint) => BigInt(n) * E18

const vfy = (ctx: Ctx, hash: string, over: Partial<Parameters<typeof runVerify>[0]['context']> = {}, recipient: Hex | null = null) =>
  runVerify({ chain: 'local', hash, hiddenChars: 0, context: { recipient: recipient ?? undefined, ...over }, watchlist: [] })

const codes = (r: VerifyOutput) => r.decoyRisks.flatMap((d) => d.findings.map((f) => f.code))
const status = (r: VerifyOutput, id: string) => r.checks.find((c) => c.id === id)?.status
const B = (ctx: Ctx) => lc(ctx.acct.B.address)
const A = (ctx: Ctx) => lc(ctx.acct.A.address)

/** Fake-token payment: mint to A, A transfers to B. Returns the transfer tx. */
async function fakePay(ctx: Ctx, token: Hex, amount: bigint): Promise<Hex> {
  await ctx.call('C', token, tokenAbi, 'mint', [A(ctx), amount])
  return (await ctx.call('A', token, tokenAbi, 'transfer', [B(ctx), amount])).hash
}

function fakeCase(id: string, vectors: string[], title: string, token: (ctx: Ctx) => Hex, amount: bigint | ((ctx: Ctx) => bigint), expectFindings: string[]): Scenario {
  return {
    id,
    vectors,
    title,
    async run(ctx) {
      const amt = typeof amount === 'function' ? amount(ctx) : amount
      const hash = await fakePay(ctx, token(ctx), amt)
      await ctx.finalize()
      const r = await vfy(ctx, hash, {}, B(ctx))
      assert.equal(r.verdict, 'FAKE')
      assert.equal(status(r, 'L2.identity'), 'fail')
      assert.equal(r.netToTarget, 0n)
      for (const f of expectFindings) assert.ok(codes(r).includes(f), `expected L6 finding ${f}, got ${codes(r).join(',')}`)
      return {
        txs: [hash],
        observed: `FAKE; L2.identity fail; L6: ${[...new Set(codes(r))].join(', ') || 'none'}`,
        ui: { tab: 'verify', hash, recipient: B(ctx), expect: 'FAKE' },
      }
    },
  }
}

async function liarRpc(upstream: string, port: number): Promise<Server> {
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', async () => {
      const up = await fetch(upstream, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
      const json = (await up.json()) as { result?: { logs?: { data: string }[] } }
      // The lie: inflate every amount in every receipt by one nibble.
      if (JSON.parse(body).method === 'eth_getTransactionReceipt' && json.result?.logs) {
        for (const l of json.result.logs) if (l.data.length === 66) l.data = '0x' + 'f' + l.data.slice(3)
      }
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
      res.end(JSON.stringify(json))
    })
  })
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r))
  return server
}

export const scenarios: Scenario[] = [
  {
    id: 'baseline',
    vectors: ['happy path'],
    title: 'Real payment A to B, full context, finalized',
    async run(ctx) {
      await ctx.mintUsdt(A(ctx), units(1_000_000))
      const before = (await ctx.pub.getBlock()).timestamp
      const hash = await ctx.usdtTransfer('A', B(ctx), units(5000))
      await ctx.finalize()
      const r = await vfy(ctx, hash, { amount: units(5000), notBefore: Number(before) - 5 }, B(ctx))
      assert.equal(r.verdict, 'VERIFIED')
      assert.equal(r.netFormatted, '5,000')
      return { txs: [hash], observed: 'VERIFIED; net 5,000 USDT', ui: { tab: 'verify', hash, recipient: B(ctx), amount: '5000', expect: 'VERIFIED' } }
    },
  },
  {
    id: 'C17-not-final',
    vectors: ['C17'],
    title: 'Included in a block but not finalized, then finalized',
    async run(ctx) {
      const hash = await ctx.usdtTransfer('A', B(ctx), units(10))
      const early = await vfy(ctx, hash, {}, B(ctx))
      assert.equal(early.verdict, 'UNVERIFIED')
      assert.equal(status(early, 'L1.finality'), 'warn')
      await ctx.finalize()
      const late = await vfy(ctx, hash, {}, B(ctx))
      assert.equal(late.verdict, 'VERIFIED')
      return { txs: [hash], observed: 'UNVERIFIED (L1.finality warn) right after; VERIFIED once finalized', ui: { tab: 'verify', hash, recipient: B(ctx), expect: 'VERIFIED (it is finalized now)' } }
    },
  },
  fakeCase('A1-fake-tether', ['A1', 'A3'], 'Fake token named "Tether USD"/"USDT" sent A to B', (c) => c.d.tokens.fakeUsdt!, units(5000), ['impersonates-usdt']),
  fakeCase('A2-homoglyph', ['A2'], 'Symbol uses Cyrillic letters (looks like USDT)', (c) => c.d.tokens.homoglyph!, units(5000), ['impersonates-usdt']),
  fakeCase('A2-tugrik', ['A2'], 'Symbol "USD₮"', (c) => c.d.tokens.tugrik!, units(5000), ['impersonates-usdt']),
  fakeCase('A4-bridged', ['A4'], 'Lookalike "USDT.e" token on the same chain', (c) => c.d.tokens.bridged!, units(5000), ['impersonates-usdt']),
  fakeCase('A6-six-decimals', ['A6'], 'Fake USDT with 6 decimals, 5,000 units', (c) => c.d.tokens.sixDecimals!, 5000n * 10n ** 6n, ['impersonates-usdt']),
  fakeCase('A7-url-name', ['A7'], 'Token name carries a link and a lure', (c) => c.d.tokens.urlName!, units(5000), ['name-url', 'name-instructions']),
  {
    id: 'A6-canonical-raw',
    vectors: ['A6', 'D22'],
    title: 'Canonical USDT, raw value 5,000,000,000 on an 18-decimal chain is dust',
    async run(ctx) {
      const hash = await ctx.usdtTransfer('A', B(ctx), 5_000_000_000n)
      await ctx.finalize()
      const r = await vfy(ctx, hash, {}, B(ctx))
      assert.equal(r.netFormatted, '0.000000005')
      assert.equal(r.verdict, 'UNVERIFIED')
      assert.equal(status(r, 'L3.net'), 'warn')
      return { txs: [hash], observed: 'UNVERIFIED; net 0.000000005 (dust), not 5,000', ui: { tab: 'verify', hash, recipient: B(ctx), expect: 'UNVERIFIED (dust)' } }
    },
  },
  {
    id: 'A5-chain-confusion',
    vectors: ['A5'],
    title: 'The local tx hash checked against real BSC mainnet',
    async run(ctx) {
      const hash = await ctx.usdtTransfer('A', B(ctx), units(1))
      const r = await runVerify({ chain: 'bsc', hash, hiddenChars: 0, context: { recipient: B(ctx) }, watchlist: [] })
      if (r.checks.find((c) => c.id === 'L1.consensus')?.status === 'skip') return { txs: [hash], observed: 'skipped: BSC mainnet RPCs not reachable from here' }
      assert.equal(r.verdict, 'NOT RECEIVED')
      return { txs: [hash], observed: 'NOT RECEIVED: a tx on another chain proves nothing on BSC' }
    },
  },
  {
    id: 'B8-revocable',
    vectors: ['B8'],
    title: 'Token the owner can burn / pause / blacklist, with expiring balance',
    async run(ctx) {
      const t = ctx.d.tokens.kitchenSink!
      const hash = await fakePay(ctx, t, units(5000))
      const r = await vfy(ctx, hash, {}, B(ctx))
      assert.equal(r.verdict, 'FAKE')
      for (const c of ['burn-from', 'pause', 'blacklist', 'owner', 'impersonates-usdt']) assert.ok(codes(r).includes(c), `missing ${c}: ${codes(r)}`)
      await ctx.test.increaseTime({ seconds: 2 * 3600 })
      await ctx.test.mine({ blocks: 1 })
      const scan = await runScan('local', B(ctx), [], { maxTokenProbes: 50 })
      const risk = scan.tokenRisks.find((x) => x.token === t)
      assert.ok(risk?.findings.some((f) => f.code === 'event-without-balance'), 'balance expiry not detected')
      return { txs: [hash], observed: 'FAKE; L6: burn-from, pause, blacklist, owner. After 2h the balance is 0 while the event said 5,000: event-without-balance', ui: { tab: 'scan', address: B(ctx), expect: 'fake token KitchenSink flagged' } }
    },
  },
  {
    id: 'B9-honeypot',
    vectors: ['B9'],
    title: 'Honeypot: B holds a balance but cannot transfer it',
    async run(ctx) {
      const hash = (await ctx.call('C', ctx.d.tokens.honeypot!, tokenAbi, 'mint', [B(ctx), units(5000)])).hash
      const r = await vfy(ctx, hash, {}, B(ctx))
      assert.equal(r.verdict, 'FAKE')
      assert.ok(codes(r).includes('honeypot'), `got ${codes(r)}`)
      return { txs: [hash], observed: 'FAKE; L6: honeypot (simulated transfer by B reverts)', ui: { tab: 'verify', hash, recipient: B(ctx), expect: 'FAKE + honeypot' } }
    },
  },
  {
    id: 'B10-proxy',
    vectors: ['B10'],
    title: 'Token behind an EIP-1967 proxy',
    async run(ctx) {
      const hash = (await ctx.call('C', ctx.d.tokens.proxyToken!, tokenAbi, 'mint', [B(ctx), units(5000)])).hash
      const r = await vfy(ctx, hash, {}, B(ctx))
      assert.equal(r.verdict, 'FAKE')
      assert.ok(codes(r).includes('proxy'), `got ${codes(r)}`)
      return { txs: [hash], observed: 'FAKE; L6: proxy (EIP-1967 implementation slot set)', ui: { tab: 'verify', hash, recipient: B(ctx), expect: 'FAKE + proxy' } }
    },
  },
  {
    id: 'B11-liar',
    vectors: ['B11'],
    title: 'balanceOf lies; transfer only emits an event',
    async run(ctx) {
      const hash = (await ctx.call('A', ctx.d.tokens.liar!, tokenAbi, 'transfer', [B(ctx), units(5000)])).hash
      const r = await vfy(ctx, hash, {}, B(ctx))
      assert.equal(r.verdict, 'FAKE')
      assert.ok(codes(r).includes('fake-balance'), `got ${codes(r)}`)
      return { txs: [hash], observed: 'FAKE; L6: fake-balance (a random fresh address "has" 1,000,000)', ui: { tab: 'verify', hash, recipient: B(ctx), expect: 'FAKE + fake-balance' } }
    },
  },
  {
    id: 'B12-fee-token',
    vectors: ['B12'],
    title: 'Fee-on-transfer token: event says 1,000, balance grows by 950',
    async run(ctx) {
      const hash = await fakePay(ctx, ctx.d.tokens.feeToken!, units(1000))
      const r = await vfy(ctx, hash, {}, B(ctx))
      assert.equal(r.verdict, 'FAKE')
      assert.ok(codes(r).includes('event-without-balance'), `got ${codes(r)}`)
      return { txs: [hash], observed: 'FAKE; L6: event-without-balance (950 held vs 1,000 logged)' }
    },
  },
  {
    id: 'C13-forged-event',
    vectors: ['C13'],
    title: 'Forger contract emits Transfer(A, B, 10,000) and moves nothing',
    async run(ctx) {
      const hash = (await ctx.call('M', ctx.d.tokens.forger!, tokenAbi, 'emitTransfer', [A(ctx), B(ctx), units(10_000)])).hash
      await ctx.finalize()
      const r = await vfy(ctx, hash, {}, B(ctx))
      assert.equal(r.verdict, 'FAKE')
      assert.match(r.decoys[0]!.reason, /not the canonical/)
      return { txs: [hash], observed: 'FAKE; decoy listed: "Emitted by 0x..., not the canonical USDT contract"', ui: { tab: 'verify', hash, recipient: B(ctx), expect: 'FAKE' } }
    },
  },
  {
    id: 'C14-mixed',
    vectors: ['C14'],
    title: 'One tx: 1 real USDT + 4,999 fake USDT to B',
    async run(ctx) {
      const { batcher, fakeUsdt } = ctx.d.tokens
      await ctx.mintUsdt(batcher!, units(1))
      const hash = (
        await ctx.call('M', batcher!, tokenAbi, 'execute', [
          [ctx.d.mockUsdt, fakeUsdt!],
          [
            encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [B(ctx), units(1)] }),
            encodeFunctionData({ abi: tokenAbi, functionName: 'mint', args: [B(ctx), units(4999)] }),
          ],
        ])
      ).hash
      await ctx.finalize()
      const withAmount = await vfy(ctx, hash, { amount: units(5000) }, B(ctx))
      assert.equal(withAmount.verdict, 'FAKE')
      assert.equal(withAmount.netFormatted, '1')
      assert.equal(status(withAmount, 'L3.decoys'), 'warn')
      const without = await vfy(ctx, hash, {}, B(ctx))
      assert.equal(without.verdict, 'UNVERIFIED')
      return { txs: [hash], observed: 'FAKE with expected 5,000 (net is 1); UNVERIFIED without expected amount (decoy credits you)', ui: { tab: 'verify', hash, recipient: B(ctx), amount: '5000', expect: 'FAKE' } }
    },
  },
  {
    id: 'C15-reverted',
    vectors: ['C15'],
    title: 'Reverted transfer(B, 5,000) shown as proof',
    async run(ctx) {
      const { hash, status: s } = await ctx.call('A', ctx.d.mockUsdt, tokenAbi, 'transfer', [B(ctx), units(10n ** 12n)], { gas: 120_000n })
      assert.equal(s, 'reverted')
      await ctx.finalize()
      const r = await vfy(ctx, hash, {}, B(ctx))
      assert.equal(r.verdict, 'FAKE')
      assert.equal(status(r, 'L1.status'), 'fail')
      return { txs: [hash], observed: 'FAKE; L1.status fail (reverted)', ui: { tab: 'verify', hash, recipient: B(ctx), expect: 'FAKE' } }
    },
  },
  {
    id: 'C16-pending',
    vectors: ['C16'],
    title: 'Pending tx shown as proof, then dropped',
    async run(ctx) {
      await ctx.test.setAutomine(false)
      try {
        const data = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [B(ctx), units(5000)] })
        const hash = await ctx.wallet('A').sendTransaction({ to: ctx.d.mockUsdt, data, chain: null as never } as never)
        const pending = await vfy(ctx, hash, {}, B(ctx))
        assert.equal(pending.verdict, 'NOT RECEIVED')
        assert.match(pending.checks.find((c) => c.id === 'L1.found')!.reason, /pending/)
        await ctx.test.dropTransaction({ hash })
        const dropped = await vfy(ctx, hash, {}, B(ctx))
        assert.equal(dropped.verdict, 'NOT RECEIVED')
        return { txs: [hash], observed: 'NOT RECEIVED while pending; NOT RECEIVED after it is dropped' }
      } finally {
        await ctx.test.setAutomine(true)
      }
    },
  },
  {
    id: 'C18-wrong-context',
    vectors: ['C18'],
    title: 'Real payment to someone else; old payment reused; same hash twice',
    async run(ctx) {
      const toOther = await ctx.usdtTransfer('A', lc(ctx.acct.M.address), units(5000))
      await ctx.finalize()
      const a = await vfy(ctx, toOther, {}, B(ctx))
      assert.equal(a.verdict, 'FAKE')
      assert.equal(status(a, 'L4.recipient'), 'fail')

      const old = await ctx.usdtTransfer('A', B(ctx), units(5000))
      await ctx.finalize()
      const dealStart = Number((await ctx.pub.getBlock()).timestamp) + 100
      const b = await vfy(ctx, old, { notBefore: dealStart }, B(ctx))
      assert.equal(b.verdict, 'FAKE')
      assert.equal(status(b, 'L4.time'), 'fail')

      const again = await ctx.usdtTransfer('A', B(ctx), units(5000))
      await ctx.finalize()
      markAccepted('local', again)
      const c = await vfy(ctx, again, {}, B(ctx))
      assert.equal(c.verdict, 'UNVERIFIED')
      assert.equal(status(c, 'L4.reuse'), 'warn')

      const none = await vfy(ctx, again)
      assert.equal(none.verdict, 'UNVERIFIED')
      return { txs: [toOther, old, again], observed: 'wrong recipient: FAKE; old payment vs deal start: FAKE; reused hash: UNVERIFIED; no recipient given: UNVERIFIED', ui: { tab: 'verify', hash: toOther, recipient: B(ctx), expect: 'FAKE (paid to someone else)' } }
    },
  },
  {
    id: 'C19-in-and-out',
    vectors: ['C19', 'E24'],
    title: 'USDT credited to B and pulled back in the same tx',
    async run(ctx) {
      const batcher = ctx.d.tokens.batcher!
      await ctx.call('B', ctx.d.mockUsdt, tokenAbi, 'approve', [batcher, 2n ** 256n - 1n])
      await ctx.mintUsdt(batcher, units(100))
      const hash = (
        await ctx.call('M', batcher, tokenAbi, 'execute', [
          [ctx.d.mockUsdt, ctx.d.mockUsdt],
          [
            encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [B(ctx), units(100)] }),
            encodeFunctionData({ abi: tokenAbi, functionName: 'transferFrom', args: [B(ctx), lc(ctx.acct.M.address), units(100)] }),
          ],
        ])
      ).hash
      await ctx.finalize()
      const r = await vfy(ctx, hash, {}, B(ctx))
      assert.equal(r.netToTarget, 0n)
      assert.equal(r.verdict, 'FAKE')
      return { txs: [hash], observed: 'FAKE; net 0 (100 in, 100 out in one tx)', ui: { tab: 'verify', hash, recipient: B(ctx), expect: 'FAKE' } }
    },
  },
  {
    id: 'C20-block-hash',
    vectors: ['C20'],
    title: 'A block hash given instead of a tx hash',
    async run(ctx) {
      const hash = (await ctx.pub.getBlock()).hash!
      const r = await vfy(ctx, hash, {}, B(ctx))
      assert.equal(r.verdict, 'FAKE')
      assert.match(r.checks.find((c) => c.id === 'L0.kind')!.reason, /block hash/)
      return { txs: [hash], observed: 'FAKE; "This is a block hash, not a transaction hash"', ui: { tab: 'verify', hash, recipient: B(ctx), expect: 'FAKE (block hash)' } }
    },
  },
  {
    id: 'C37-router',
    vectors: ['C37'],
    title: 'Payment routed through a contract (tx.to is not USDT)',
    async run(ctx) {
      const batcher = ctx.d.tokens.batcher!
      await ctx.mintUsdt(batcher, units(700))
      const hash = (
        await ctx.call('M', batcher, tokenAbi, 'execute', [
          [ctx.d.mockUsdt],
          [encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [B(ctx), units(700)] })],
        ])
      ).hash
      await ctx.finalize()
      const r = await vfy(ctx, hash, { amount: units(700) }, B(ctx))
      assert.equal(r.verdict, 'VERIFIED')
      return { txs: [hash], observed: 'VERIFIED; decisions use logs, never tx.to', ui: { tab: 'verify', hash, recipient: B(ctx), amount: '700', expect: 'VERIFIED' } }
    },
  },
  {
    id: 'D21-zero-value',
    vectors: ['D21', 'D23'],
    title: 'Zero-value transferFrom(B, lookalike, 0) planted by the attacker',
    async run(ctx) {
      // B pays A once, so A is an address B "uses".
      await ctx.usdtTransfer('B', A(ctx), units(100))
      const look = vanityOf(A(ctx), 6)
      const hash = (await ctx.call('M', ctx.d.mockUsdt, tokenAbi, 'transferFrom', [B(ctx), look, 0n])).hash
      const scan = await runScan('local', B(ctx), [])
      const p = scan.wallet.poisoning.find((x) => x.counterparty === look && x.kind === 'zero-value')
      assert.ok(p, `no zero-value finding: ${JSON.stringify(scan.wallet.poisoning.map((x) => x.kind))}`)
      assert.ok(p.match, 'lookalike match missing')
      const send = checkDestination(look, [A(ctx)], [])
      assert.equal(send.level, 'danger')
      return { txs: [hash], observed: `scan: zero-value poisoning from ${look.slice(0, 10)}..., imitates A (first/last ${p.match.prefix}/${p.match.suffix} chars). Send check: LOOKALIKE`, ui: { tab: 'scan', address: B(ctx), expect: 'zero-value poisoning' } }
    },
  },
  {
    id: 'D22-vanity-dust',
    vectors: ['D22', 'D23'],
    title: 'Dust of real USDT from a vanity lookalike',
    async run(ctx) {
      const look = vanityOf(A(ctx), 5)
      await ctx.test.impersonateAccount({ address: look })
      await ctx.test.setBalance({ address: look, value: units(1) })
      await ctx.mintUsdt(look, units(1))
      const w = createWalletClient({ account: look, transport: http(ctx.d.rpc), chain: null as never })
      const hash = await w.sendTransaction({ to: ctx.d.mockUsdt, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [B(ctx), 10n ** 15n] }) } as never)
      await ctx.pub.waitForTransactionReceipt({ hash })
      const scan = await runScan('local', B(ctx), [])
      assert.ok(scan.wallet.poisoning.some((p) => p.counterparty === look && p.kind === 'lookalike'))
      await ctx.finalize()
      const v = await vfy(ctx, hash, {}, B(ctx))
      assert.equal(v.verdict, 'UNVERIFIED')
      return { txs: [hash], observed: 'scan: lookalike dust flagged. Verify: UNVERIFIED (0.001 USDT is dust)', ui: { tab: 'scan', address: B(ctx), expect: 'lookalike poisoning' } }
    },
  },
  {
    id: 'D41-weak-lookalike',
    vectors: ['D41'],
    title: 'Known limit: only the first 4 characters match',
    async run(ctx) {
      const a = A(ctx).slice(2)
      const weak = `0x${a.slice(0, 4)}${'9'.repeat(32)}${'abcd'.repeat(1)}` as Hex
      await ctx.test.impersonateAccount({ address: weak })
      await ctx.test.setBalance({ address: weak, value: units(1) })
      await ctx.mintUsdt(weak, units(5))
      const w = createWalletClient({ account: weak, transport: http(ctx.d.rpc), chain: null as never })
      const hash = await w.sendTransaction({ to: ctx.d.mockUsdt, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [B(ctx), units(2)] }) } as never)
      await ctx.pub.waitForTransactionReceipt({ hash })
      const scan = await runScan('local', B(ctx), [])
      assert.ok(!scan.wallet.poisoning.some((p) => p.counterparty === weak), 'weak lookalike unexpectedly flagged')
      return { txs: [hash], observed: 'NOT flagged (documented residual risk D41); the send check still calls it a NEW address' }
    },
  },
  {
    id: 'D42-fake-token-poison',
    vectors: ['D42', 'A1'],
    title: 'Fake-USDT dust from a vanity lookalike, scanned',
    async run(ctx) {
      const look = vanityOf(A(ctx), 6)
      const fake = ctx.d.tokens.fakeUsdt!
      await ctx.test.impersonateAccount({ address: look })
      await ctx.test.setBalance({ address: look, value: units(1) })
      await ctx.call('C', fake, tokenAbi, 'mint', [look, units(100)])
      const w = createWalletClient({ account: look, transport: http(ctx.d.rpc), chain: null as never })
      const hash = await w.sendTransaction({ to: fake, data: encodeFunctionData({ abi: tokenAbi, functionName: 'transfer', args: [B(ctx), units(100)] }) } as never)
      await ctx.pub.waitForTransactionReceipt({ hash })
      const scan: ScanOutput = await runScan('local', B(ctx), [], { maxTokenProbes: 50 })
      const g = scan.wallet.fakeTokens.find((t) => t.token === fake)
      assert.ok(g?.impersonatesUsdt, 'fake USDT group missing')
      assert.ok(scan.wallet.poisoning.some((p) => p.counterparty === look && !p.canonical))
      return { txs: [hash], observed: 'scan: fake "Tether USD" listed as FAKE USDT; its sender flagged as a lookalike of A' }
    },
  },
  {
    id: 'E24-approvals',
    vectors: ['E24'],
    title: 'Unlimited and bounded USDT approvals, then revoke',
    async run(ctx) {
      const me = lc(ctx.acct.C.address)
      const M = lc(ctx.acct.M.address)
      const V = lc(ctx.acct.V.address)
      const t1 = (await ctx.call('C', ctx.d.mockUsdt, tokenAbi, 'approve', [M, 2n ** 256n - 1n])).hash
      await ctx.call('C', ctx.d.mockUsdt, tokenAbi, 'approve', [V, units(50)])
      const scan = await runScan('local', me, [])
      const hi = scan.approvals.find((a) => a.spender === M)
      assert.ok(hi?.unlimited && hi.level === 'high')
      assert.equal(scan.approvals.find((a) => a.spender === V)?.formatted, '50')
      const t2 = (await ctx.call('C', ctx.d.mockUsdt, tokenAbi, 'approve', [M, 0n])).hash
      const after = await runScan('local', me, [])
      assert.ok(!after.approvals.some((a) => a.spender === M), 'revoked approval still listed')
      return { txs: [t1, t2], observed: 'scan: unlimited approval to attacker = high; 50 USDT = medium; after revoke it is gone', ui: { tab: 'scan', address: me, expect: 'approval to V (50 USDT) listed' } }
    },
  },
  {
    id: 'E25-7702',
    vectors: ['E25'],
    title: 'EOA delegated to a contract with an EIP-7702 authorization',
    async run(ctx) {
      const v = ctx.acct.V
      const w = createWalletClient({ account: v, transport: http(ctx.d.rpc), chain: null as never })
      const authorization = await w.signAuthorization({ account: v, contractAddress: ctx.d.tokens.delegate!, executor: 'self', chainId: 31337 } as never)
      const hash = await w.sendTransaction({ authorizationList: [authorization], to: v.address, data: '0x', chain: null as never } as never)
      await ctx.pub.waitForTransactionReceipt({ hash })
      const scan = await runScan('local', lc(v.address), [])
      assert.equal(scan.code?.kind, 'delegated')
      assert.equal((scan.code as { to: Hex }).to, ctx.d.tokens.delegate)
      return { txs: [hash], observed: `scan: delegated to ${ctx.d.tokens.delegate!.slice(0, 10)}...`, ui: { tab: 'scan', address: lc(v.address), expect: 'EIP-7702 delegation warning' } }
    },
  },
  {
    id: 'F30-lying-rpc',
    vectors: ['F30', 'C40'],
    title: 'One RPC provider lies about the receipt; another is down',
    async run(ctx) {
      const hash = await ctx.usdtTransfer('A', B(ctx), units(5000))
      await ctx.finalize()
      const server = await liarRpc(ctx.d.rpc, 8547)
      try {
        const ev = async (rpcs: string[]) => {
          const adapter = new EvmAdapter({ ...CHAINS.local, rpcs }, null)
          const providers = await adapter.getReceipt(hash)
          return verifyTx({
            chain: 'local',
            hash,
            hiddenChars: 0,
            providers,
            finality: await adapter.getFinality(),
            blockTimestamp: null,
            context: { recipient: B(ctx) },
            previouslyAccepted: false,
            watchlist: [],
            senderBlacklisted: {},
          })
        }
        const lied = await ev([ctx.d.rpc, 'http://127.0.0.1:8547'])
        assert.equal(lied.verdict, 'UNVERIFIED')
        assert.match(lied.checks.find((c) => c.id === 'L1.consensus')!.reason, /disagree/)
        const down = await ev([ctx.d.rpc, 'http://127.0.0.1:9'])
        assert.equal(down.verdict, 'UNVERIFIED')
        const honest = await ev([ctx.d.rpc, ctx.d.rpcAlias])
        assert.equal(honest.verdict, 'VERIFIED')
        return { txs: [hash], observed: 'liar + honest: UNVERIFIED (providers disagree). honest + dead: UNVERIFIED (one answer). honest + honest: VERIFIED' }
      } finally {
        server.close()
      }
    },
  },
  {
    id: 'SAFETY-test-only-contracts',
    vectors: ['hard rule'],
    title: 'Test contracts and the deploy script refuse any non-test chain',
    async run() {
      const other = await startAnvil(8546, ['--chain-id', '56'])
      try {
        await assert.rejects(() => assertTestChain(other.rpc), /refusing to deploy/)
        await assert.rejects(() => deployAll(other.rpc), /refusing to deploy/)
        // Bypass the script entirely: send the creation bytecode straight to a chainId-56 node.
        const { artifact } = await import('../scripts/deploy-test-contracts')
        const a = artifact('Tokens.sol', 'MockUSDT')
        const { mnemonicToAccount } = await import('viem/accounts')
        const acct = mnemonicToAccount('test test test test test test test test test test test junk')
        const w = createWalletClient({ account: acct, transport: http(other.rpc), chain: null as never })
        await assert.rejects(() => w.deployContract({ abi: a.abi, bytecode: a.bytecode } as never), /TEST ONLY: refusing to deploy on this chain/)
        return { txs: [], observed: 'chainId 56: script refuses; raw deploy of the bytecode reverts with "TEST ONLY: refusing to deploy on this chain"' }
      } finally {
        await other.stop()
      }
    },
  },
]

