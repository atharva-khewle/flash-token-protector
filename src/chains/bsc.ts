import { CHAINS } from '../registry/chains'
import { EvmAdapter } from './evm'

export const bsc = new EvmAdapter(CHAINS.bsc)
