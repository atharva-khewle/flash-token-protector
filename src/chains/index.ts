import type { ChainKey } from '../registry/chains'
import { bsc } from './bsc'
import { eth } from './eth'
import type { EvmAdapter } from './evm'
import { tron, type TronAdapter } from './tron'

export function adapterFor(chain: ChainKey): EvmAdapter | TronAdapter {
  switch (chain) {
    case 'bsc':
      return bsc
    case 'eth':
      return eth
    case 'tron':
      return tron
  }
}
