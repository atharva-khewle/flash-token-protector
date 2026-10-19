// Canonical USDT per chain. A token is USDT only if chain + contract address
// match an entry here. Name, symbol, logo and price never count.
//
// Every entry lists where it was checked. Re-check before each release.

import type { ChainKey } from './chains'

export interface CanonicalToken {
  chain: ChainKey
  symbol: string
  /** Display form: checksummed 0x address on EVM, base58 on Tron. */
  address: string
  /** Lowercase 0x + 40 hex. On Tron this is the 20-byte body without the 0x41 prefix. */
  hex: `0x${string}`
  decimals: number
  /** True if the contract exposes Tether's isBlackListed(address) getter. */
  hasBlacklistGetter: boolean
  sources: string[]
  note?: string
}

export const USDT: Record<ChainKey, CanonicalToken> = {
  bsc: {
    chain: 'bsc',
    symbol: 'USDT',
    address: '0x55d398326f99059fF775485246999027B3197955',
    hex: '0x55d398326f99059ff775485246999027b3197955',
    decimals: 18,
    hasBlacklistGetter: false,
    sources: [
      'https://bscscan.com/token/0x55d398326f99059ff775485246999027b3197955',
      'https://www.binance.com/en/support/faq (Binance lists BEP20 USDT with this contract) (verify)',
    ],
    note: 'Binance-Peg BSC-USD. Issued by Binance as a peg, not minted by Tether on BSC. 18 decimals.',
  },
  eth: {
    chain: 'eth',
    symbol: 'USDT',
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    hex: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    decimals: 6,
    hasBlacklistGetter: true,
    sources: [
      'https://tether.to/en/supported-protocols/',
      'https://etherscan.io/token/0xdac17f958d2ee523a2206206994597c13d831ec7',
    ],
  },
  tron: {
    chain: 'tron',
    symbol: 'USDT',
    address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    hex: '0xa614f803b6fd780986a42c78ec9c7f77e6ded13c',
    decimals: 6,
    hasBlacklistGetter: true,
    sources: [
      'https://tether.to/en/supported-protocols/',
      'https://tronscan.org/#/token20/TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    ],
    note: 'The build prompt seeded "TR7NHqjeKQxGTCi8q8ZY4pxL8otSzgjLj6t" (35 chars, extra "x"). That fails the base58 checksum. The value here is what TronGrid returns for Tether USD and passes the checksum (see tests/registry.test.ts).',
  },
}

export function canonicalUsdt(chain: ChainKey): CanonicalToken {
  return USDT[chain]
}
