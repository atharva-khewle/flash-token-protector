// Test-only chain. This module is imported dynamically behind `__TESTNET__`
// (vite `--mode testnet`), so a normal build never contains it.
//
// The "canonical USDT" on this chain is a mock token deployed by
// scripts/deploy-test-contracts.ts on a local Anvil node (chainId 31337).

import { registerChain } from '../registry/chains'
import { registerUsdt } from '../registry/usdt'

export interface Deployments {
  chainId: number
  rpc: string
  rpcAlias: string
  mockUsdt: `0x${string}`
  tokens: Record<string, `0x${string}`>
  accounts?: Record<string, `0x${string}`>
}

/** Registers the local test chain and its mock canonical USDT. Test builds and e2e only. */
export function registerLocal(d: Deployments): void {
  if (d.chainId !== 31337) throw new Error('testnet deployments must be for chainId 31337')
  registerChain({
    key: 'local',
    family: 'evm',
    name: 'LOCAL TEST CHAIN (Anvil 31337)',
    chainId: 31337,
    nativeSymbol: 'ETH',
    // Same node under two hostnames, so the 2-provider rule can be exercised. Test only.
    rpcs: [d.rpc, d.rpcAlias],
    logRpcs: [d.rpc],
    logChunk: 100_000,
    logWindow: 1_000_000,
    unrestrictedLogs: true,
    test: true,
    explorer: { name: 'none (local)', tx: () => null, address: () => null },
  })
  registerUsdt({
    chain: 'local',
    symbol: 'USDT',
    address: d.mockUsdt,
    hex: d.mockUsdt.toLowerCase() as `0x${string}`,
    decimals: 18,
    hasBlacklistGetter: false,
    sources: ['contracts/src/Tokens.sol (MockUSDT), deployed by scripts/deploy-test-contracts.ts'],
    note: 'Mock canonical token for the local test chain only.',
  })
}

export async function setupTestnet(): Promise<Deployments | null> {
  let d: Deployments
  try {
    const res = await fetch('/testnet-deployments.json', { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    d = (await res.json()) as Deployments
  } catch {
    return null
  }
  registerLocal(d)
  return d
}

export function testBanner(): HTMLElement {
  const d = document.createElement('div')
  d.className = 'testbanner'
  d.setAttribute('role', 'alert')
  d.textContent = 'TEST BUILD: local chain with a mock USDT token. Not for real funds. The production site does not contain this.'
  return d
}
