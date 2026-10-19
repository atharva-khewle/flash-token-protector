// Synthetic fixture builders. Everything built here is labelled synthetic:
// no invented hash or address is presented as a real mainnet object.

import type { Finality, Hex, NormLog, NormReceipt, ProviderResult } from '../src/chains/types'
import type { ChainKey } from '../src/registry/chains'
import { USDT } from '../src/registry/usdt'
import { addressToTopic, TRANSFER_TOPIC } from '../src/verdict/transfer'
import type { TxEvidence } from '../src/verdict/verifyTx'

/** Obviously synthetic addresses: repeated nibbles. */
export const ME = '0x1111111111111111111111111111111111111111' as Hex
export const PAYER = '0x2222222222222222222222222222222222222222' as Hex
export const OTHER = '0x3333333333333333333333333333333333333333' as Hex
export const FAKE_TOKEN = '0xfa4efa4efa4efa4efa4efa4efa4efa4efa4efa4e' as Hex
export const SYNTH_HASH = `0x${'ab'.repeat(32)}`

export function usdtUnits(chain: ChainKey, n: number | bigint): bigint {
  return BigInt(n) * 10n ** BigInt(USDT[chain].decimals)
}

export function transferLog(token: Hex, from: Hex, to: Hex, value: bigint, logIndex = 0): NormLog {
  return {
    address: token,
    topics: [TRANSFER_TOPIC, addressToTopic(from), addressToTopic(to)],
    data: `0x${value.toString(16).padStart(64, '0')}` as Hex,
    logIndex,
  }
}

export function receipt(chain: ChainKey, logs: NormLog[], over: Partial<NormReceipt> = {}): NormReceipt {
  return {
    chain,
    hash: SYNTH_HASH,
    status: 'success',
    blockNumber: 1000n,
    blockHash: `0x${'cd'.repeat(32)}`,
    from: PAYER,
    to: USDT[chain].hex,
    logs,
    ...over,
  }
}

export function agree(r: NormReceipt, n = 2): ProviderResult<NormReceipt>[] {
  return Array.from({ length: n }, (_, i) => ({ provider: `rpc${i + 1}.synthetic`, ok: true as const, value: r }))
}

export const FINAL: Finality = { head: 2000n, finalized: 1500n }

export function evidence(chain: ChainKey, r: NormReceipt | ProviderResult<NormReceipt>[], over: Partial<TxEvidence> = {}): TxEvidence {
  return {
    chain,
    hash: SYNTH_HASH,
    hiddenChars: 0,
    providers: Array.isArray(r) ? r : agree(r),
    finality: FINAL,
    blockTimestamp: 1_790_000_000,
    context: { recipient: ME },
    previouslyAccepted: false,
    watchlist: [],
    senderBlacklisted: {},
    ...over,
  }
}
