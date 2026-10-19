import { CHAINS, type ChainKey } from '../registry/chains'
import { bsc } from './bsc'
import { eth } from './eth'
import { EvmAdapter } from './evm'
import { tron, type TronAdapter } from './tron'

const extra = new Map<ChainKey, EvmAdapter>()

export function adapterFor(chain: ChainKey): EvmAdapter | TronAdapter {
  switch (chain) {
    case 'bsc':
      return bsc
    case 'eth':
      return eth
    case 'tron':
      return tron
    default: {
      // Test chains registered at runtime (testnet build only).
      let a = extra.get(chain)
      if (!a) {
        a = new EvmAdapter(CHAINS[chain], null)
        extra.set(chain, a)
      }
      return a
    }
  }
}
