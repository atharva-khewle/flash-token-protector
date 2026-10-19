// Chain registry. Explorer links shown in the UI are built only from here,
// never from user input.

export type ChainKey = 'bsc' | 'eth' | 'tron'
export type ChainFamily = 'evm' | 'tron'

export interface ChainInfo {
  key: ChainKey
  family: ChainFamily
  name: string
  /** EVM chainId. Tron mainnet has no EVM chainId in this app, so null. */
  chainId: number | null
  nativeSymbol: string
  /**
   * Independent public endpoints. L1 needs at least two that answer and agree.
   * Order matters only for display. All are keyless and CORS-enabled (checked Oct 2026).
   */
  rpcs: string[]
  /** Endpoints that serve address-filtered eth_getLogs over a few thousand blocks. */
  logRpcs: string[]
  /** Max block span per eth_getLogs call that logRpcs accept. */
  logChunk: number
  explorer: {
    name: string
    tx: (hash: string) => string
    address: (addr: string) => string
  }
}

export const CHAINS: Record<ChainKey, ChainInfo> = {
  bsc: {
    key: 'bsc',
    family: 'evm',
    name: 'BNB Smart Chain (BEP20)',
    chainId: 56,
    nativeSymbol: 'BNB',
    rpcs: [
      'https://bsc-dataseed.bnbchain.org',
      'https://1rpc.io/bnb',
      'https://bsc-rpc.publicnode.com',
    ],
    logRpcs: ['https://bsc-rpc.publicnode.com'],
    logChunk: 5000,
    explorer: {
      name: 'BscScan',
      tx: (h) => `https://bscscan.com/tx/${h}`,
      address: (a) => `https://bscscan.com/address/${a}`,
    },
  },
  eth: {
    key: 'eth',
    family: 'evm',
    name: 'Ethereum (ERC20)',
    chainId: 1,
    nativeSymbol: 'ETH',
    rpcs: [
      'https://ethereum-rpc.publicnode.com',
      'https://1rpc.io/eth',
      'https://eth.drpc.org',
    ],
    logRpcs: ['https://ethereum-rpc.publicnode.com'],
    logChunk: 5000,
    explorer: {
      name: 'Etherscan',
      tx: (h) => `https://etherscan.io/tx/${h}`,
      address: (a) => `https://etherscan.io/address/${a}`,
    },
  },
  tron: {
    key: 'tron',
    family: 'tron',
    name: 'Tron (TRC20)',
    chainId: null,
    nativeSymbol: 'TRX',
    rpcs: ['https://api.trongrid.io', 'https://tron-rpc.publicnode.com'],
    logRpcs: ['https://api.trongrid.io'],
    logChunk: 0,
    explorer: {
      name: 'Tronscan',
      tx: (h) => `https://tronscan.org/#/transaction/${h}`,
      address: (a) => `https://tronscan.org/#/address/${a}`,
    },
  },
}

export const CHAIN_KEYS = Object.keys(CHAINS) as ChainKey[]
