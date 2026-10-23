// Chain-agnostic shapes. Every chain adapter normalizes into these, so the
// verdict rules in src/verdict/ never see provider-specific JSON.

import type { ChainKey } from '../registry/chains'

export type Hex = `0x${string}`

export interface NormLog {
  /** Emitting contract. Lowercase 0x + 40 hex (Tron: without the 41 prefix). */
  address: Hex
  topics: Hex[]
  data: Hex
  logIndex: number
}

export type TxStatus = 'success' | 'reverted' | 'pending' | 'notfound'

export interface NormReceipt {
  chain: ChainKey
  hash: string
  status: TxStatus
  blockNumber: bigint | null
  blockHash: string | null
  from: Hex | null
  to: Hex | null
  logs: NormLog[]
}

/** What one server said, plus how fresh it was. `head` = the latest block that server knew about. */
export interface ProviderMeta {
  head?: bigint | null
  ms?: number
}

export type ProviderResult<T> =
  | ({ provider: string; ok: true; value: T } & ProviderMeta)
  | ({ provider: string; ok: false; error: string } & ProviderMeta)

export interface Finality {
  head: bigint
  /** Highest finalized / solidified block, or null when the chain/provider does not expose it. */
  finalized: bigint | null
}

export interface LogEntry extends NormLog {
  txHash: string
  blockNumber: bigint
}

export interface LogFilter {
  /** Omit only on a local dev node (ChainInfo.unrestrictedLogs). */
  address?: Hex
  topics: (Hex | null)[]
  fromBlock: bigint
  toBlock: bigint
}

/** One token transfer as seen in an account history (explorer-style). */
export interface TokenTransfer {
  txHash: string
  blockNumber: bigint | null
  timestamp: number | null
  token: Hex
  tokenName: string | null
  tokenSymbol: string | null
  decimals: number | null
  from: Hex
  to: Hex
  value: bigint
  /** Who signed the tx, when known. */
  txFrom: Hex | null
}

export type CallResult = { ok: true; data: Hex } | { ok: false; error: string }

export type Maybe<T> = { available: true; value: T } | { available: false; reason: string }

export interface ChainAdapter {
  chain: ChainKey
  /** Asks every configured provider. L1 compares the answers. */
  getReceipt(hash: string): Promise<ProviderResult<NormReceipt>[]>
  getLogs(filter: LogFilter): Promise<LogEntry[]>
  getCode(address: Hex): Promise<Hex>
  call(to: Hex, data: Hex, from?: Hex): Promise<CallResult>
  getFinality(): Promise<Finality>
  getBlockTimestamp(block: bigint): Promise<number | null>
  getStorageAt(address: Hex, slot: Hex): Promise<Hex | null>
  /** True if the hash is a block hash rather than a tx hash. */
  isBlockHash(hash: string): Promise<boolean>
  /** All token transfers touching an address, including fake tokens. Needs an indexer. */
  listTokenTransfers(address: Hex, page?: number): Promise<Maybe<TokenTransfer[]>>
}
