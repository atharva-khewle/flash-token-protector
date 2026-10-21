import { describe, expect, it } from 'vitest'
import type { NormReceipt, ProviderResult } from '../src/chains/types'
import { analyzeProviders } from '../src/verdict/providers'
import { consensusCheck } from '../src/verdict/verifyTx'
import { ME, PAYER, receipt, transferLog, usdtUnits } from './helpers'
import { canonicalUsdt } from '../src/registry/usdt'

const usdt = canonicalUsdt('bsc').hex
const mined = receipt('bsc', [transferLog(usdt, PAYER, ME, usdtUnits('bsc', 100))], { blockNumber: 1000n, blockHash: '0xaa' })
const ok = (provider: string, value: NormReceipt, head: bigint | null = 1010n): ProviderResult<NormReceipt> => ({ provider, ok: true, value, head, ms: 100 })
const notFound = (provider: string, head: bigint | null): ProviderResult<NormReceipt> =>
  ok(provider, { ...mined, status: 'notfound', blockNumber: null, blockHash: null, logs: [] }, head)
const err = (provider: string, error: string): ProviderResult<NormReceipt> => ({ provider, ok: false, error, head: null, ms: 50 })

describe('analyzeProviders', () => {
  it('two agree, one rate-limited: passes, and the limited server is explained, not blamed', () => {
    const a = analyzeProviders([ok('a', mined), ok('b', mined), err('1rpc.io', 'Too Many Requests')])
    expect(a.outcome).toBe('agree')
    expect(a.rows[2]!.role).toBe('limited')
    expect(a.rows[2]!.why).toMatch(/Rate-limited/)
    expect(consensusCheck([ok('a', mined), ok('b', mined), err('1rpc.io', 'Too Many Requests')]).check.status).toBe('pass')
  })

  it('a server that is behind the tx block is "behind", not a disagreement', () => {
    const a = analyzeProviders([ok('a', mined), ok('b', mined), notFound('1rpc.io', 990n)])
    expect(a.outcome).toBe('agree')
    expect(a.rows[2]!.role).toBe('behind')
    expect(a.rows[2]!.why).toMatch(/10 block/)
  })

  it('one mined answer, the other behind: single answer, still a warning', () => {
    const c = consensusCheck([ok('a', mined), notFound('1rpc.io', 995n)])
    expect(c.analysis.outcome).toBe('single')
    expect(c.check.status).toBe('warn')
    // The receipt used for the report is the mined one, never the "not found" one.
    expect(c.receipt!.logs).toHaveLength(1)
  })

  it('a server that has seen the block but says "not found" is a real conflict', () => {
    const a = analyzeProviders([ok('a', mined), ok('b', mined), notFound('c', 1005n)])
    expect(a.outcome).toBe('conflict')
    expect(a.rows[2]!.role).toBe('conflicts')
    expect(a.believe).toMatch(/majority/)
  })

  it('different block hash at the same height reads as a reorganization', () => {
    const fork = { ...mined, blockHash: '0xbb' }
    const a = analyzeProviders([ok('a', mined), ok('b', mined), ok('c', fork)])
    expect(a.rows[2]!.why).toMatch(/reorganization/)
  })

  it('same block, different event data: flagged as wrong data', () => {
    const tampered = { ...mined, logs: [] }
    const a = analyzeProviders([ok('a', mined), ok('b', mined), ok('c', tampered)])
    expect(a.rows[2]!.why).toMatch(/wrong data/)
  })

  it('unreachable servers are explained as network problems', () => {
    const a = analyzeProviders([err('x', 'Failed to fetch'), ok('a', mined), ok('b', mined)])
    expect(a.rows[0]!.why).toMatch(/could not be reached/i)
  })
})
