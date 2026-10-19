// @vitest-environment happy-dom
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Hex, LogEntry, TokenTransfer } from '../src/chains/types'
import { ALLOWED_WALLET_METHODS, connectWallet, discoverWallets, guarded, type Eip1193 } from '../src/lib/wallet'
import { toHistory } from '../src/services/history'
import { transfersTouching } from '../src/services/watch'
import { addressToTopic, TRANSFER_TOPIC } from '../src/verdict/transfer'
import { canonicalUsdt } from '../src/registry/usdt'
import { FAKE_TOKEN, ME, OTHER, PAYER } from './helpers'

const usdt = canonicalUsdt('bsc').hex

function tr(over: Partial<TokenTransfer>): TokenTransfer {
  return { txHash: '0xaa', blockNumber: 10n, timestamp: null, token: usdt, tokenName: null, tokenSymbol: null, decimals: null, from: PAYER, to: ME, value: 5n, txFrom: null, ...over }
}

describe('toHistory', () => {
  it('labels direction, marks only the exact USDT contract as canonical, sorts newest first', () => {
    const h = toHistory('bsc', ME, [
      tr({ txHash: '0x01', blockNumber: 5n }),
      tr({ txHash: '0x02', blockNumber: 9n, token: FAKE_TOKEN, tokenSymbol: 'USDT', tokenName: 'Tether USD' }),
      tr({ txHash: '0x03', blockNumber: 7n, from: ME, to: OTHER }),
      tr({ txHash: '0x04', blockNumber: 8n, from: ME, to: ME }),
    ])
    expect(h.map((e) => e.hash)).toEqual(['0x02', '0x04', '0x03', '0x01'])
    expect(h[0]).toMatchObject({ direction: 'in', canonical: false, counterparty: PAYER })
    expect(h[1]!.direction).toBe('self')
    expect(h[2]).toMatchObject({ direction: 'out', counterparty: OTHER })
    expect(h[3]!.canonical).toBe(true)
  })

  it('drops transfers that do not touch the address and dedupes repeats', () => {
    const h = toHistory('bsc', ME, [tr({}), tr({}), tr({ from: PAYER, to: OTHER })])
    expect(h).toHaveLength(1)
  })
})

describe('transfersTouching', () => {
  const log = (token: Hex, from: Hex, to: Hex, v: bigint): LogEntry => ({
    address: token,
    topics: [TRANSFER_TOPIC, addressToTopic(from), addressToTopic(to)],
    data: `0x${v.toString(16).padStart(64, '0')}` as Hex,
    logIndex: 0,
    txHash: '0xbeef',
    blockNumber: 1n,
  })

  it('finds a fake-token transfer into the address, in any token', () => {
    const r = transfersTouching('bsc', ME, [log(FAKE_TOKEN, PAYER, ME, 99n), log(usdt, PAYER, OTHER, 1n)])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ canonical: false, direction: 'in', counterparty: PAYER, value: 99n })
  })

  it('ignores NFT-style (4 topic) logs', () => {
    const l = log(FAKE_TOKEN, PAYER, ME, 1n)
    expect(transfersTouching('bsc', ME, [{ ...l, topics: [...l.topics, addressToTopic(OTHER)] }])).toHaveLength(0)
  })
})

describe('wallet connection is read-only by construction', () => {
  it('only account-reading methods are allowed', () => {
    expect([...ALLOWED_WALLET_METHODS].sort()).toEqual(['eth_accounts', 'eth_requestAccounts'])
  })

  it('the guard rejects signing, sending, switching and permission calls', async () => {
    const calls: string[] = []
    const g = guarded({ request: async (a) => (calls.push(a.method), ['0x1']) })
    for (const m of ['personal_sign', 'eth_sign', 'eth_signTypedData_v4', 'eth_sendTransaction', 'eth_sendRawTransaction', 'wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_requestPermissions', 'eth_signTransaction']) {
      await expect(g.request({ method: m })).rejects.toThrow(/Blocked/)
    }
    expect(calls).toEqual([])
  })

  it('discovers EIP-6963 wallets and connect only calls eth_requestAccounts', async () => {
    const calls: string[] = []
    const provider: Eip1193 = { request: async (a) => (calls.push(a.method), [ME.toUpperCase().replace('0X', '0x')]) }
    const onReq = () =>
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: { info: { uuid: 'u1', name: 'Mock Wallet' }, provider } }))
    window.addEventListener('eip6963:requestProvider', onReq)
    const ws = await discoverWallets(20)
    window.removeEventListener('eip6963:requestProvider', onReq)
    expect(ws.map((w) => w.name)).toEqual(['Mock Wallet'])
    expect(await connectWallet(ws[0]!)).toBe(ME)
    expect(calls).toEqual(['eth_requestAccounts'])
  })

  it('no source file mentions a signing or sending wallet method', () => {
    const bad = /personal_sign|eth_signTypedData|eth_sendTransaction|eth_signTransaction|eth_sign\b|wallet_watchAsset|wallet_requestPermissions/
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((n) => {
        const p = join(d, n)
        return statSync(p).isDirectory() ? walk(p) : /\.(ts|js)$/.test(n) ? [p] : []
      })
    const hits = [...walk(join(__dirname, '..', 'src')), ...walk(join(__dirname, '..', 'extension', 'src'))].filter((f) => bad.test(readFileSync(f, 'utf8')))
    expect(hits).toEqual([])
  })
})

import { flagEntries, toHistory as toH } from '../src/services/history'

describe('flagEntries', () => {
  const A = '0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678' as Hex
  const A2 = '0xa1b2c3d4ffffffffffffffffffffffffff345678' as Hex
  const one = 10n ** 18n

  it('flags fake-USDT names, zero transfers, dust and a lookalike of a paid address', () => {
    const rows = toH('bsc', ME, [
      tr({ txHash: '0x01', blockNumber: 1n, from: ME, to: A, value: 50n * one }), // I paid A for real
      tr({ txHash: '0x02', blockNumber: 2n, from: A2, to: ME, value: one / 100n }), // dust from a lookalike
      tr({ txHash: '0x03', blockNumber: 3n, from: PAYER, to: ME, value: 0n }), // zero
      tr({ txHash: '0x04', blockNumber: 4n, from: PAYER, to: ME, token: FAKE_TOKEN, tokenSymbol: 'USDT', tokenName: 'Tether USD', value: 5000n }),
      tr({ txHash: '0x05', blockNumber: 5n, from: PAYER, to: ME, token: OTHER, tokenSymbol: 'WBNB', tokenName: 'Wrapped BNB', value: 1n }),
    ])
    const f = Object.fromEntries(flagEntries('bsc', rows, []).map((e) => [e.hash, e]))
    expect(f['0x02']!.flags).toEqual(expect.arrayContaining(['dust', 'lookalike']))
    expect(f['0x02']!.imitates).toBe(A)
    expect(f['0x03']!.flags).toContain('zero')
    expect(f['0x04']!.flags).toContain('fake-usdt')
    expect(f['0x05']!.flags).toEqual(['other-token'])
    expect(f['0x01']!.flags).toEqual([])
  })

  it('does not flag the address I actually paid, and honors the saved trusted list', () => {
    const rows = toH('bsc', ME, [tr({ txHash: '0x06', from: A, to: ME, value: one / 100n })])
    expect(flagEntries('bsc', rows, [A])[0]).toMatchObject({ trusted: true })
    expect(flagEntries('bsc', rows, [A])[0]!.flags).toEqual(['dust'])
  })
})
