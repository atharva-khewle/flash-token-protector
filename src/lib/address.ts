import { getAddress } from 'viem'
import type { ChainKey } from '../registry/chains'
import { CHAINS } from '../registry/chains'
import type { Hex } from '../chains/types'
import { hexToTron } from './tron'

/** The form a person reads: EIP-55 on EVM, base58 on Tron. Lookalike checks run on this form. */
export function displayAddress(chain: ChainKey, hex: Hex): string {
  return CHAINS[chain].family === 'tron' ? hexToTron(hex) : getAddress(hex)
}
