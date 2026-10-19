import { CHAINS } from '../registry/chains'
import { EvmAdapter } from './evm'

export const eth = new EvmAdapter(CHAINS.eth)
