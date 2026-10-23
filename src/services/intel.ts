// Background facts for the diagrams: who signed a transaction, who created a contract, and where
// else a fake token has been sent. Everything is best effort and read-only; a missing answer is
// shown as "unknown", never guessed.

import { adapterFor } from '../chains'
import type { EvmAdapter } from '../chains/evm'
import type { TronAdapter } from '../chains/tron'
import type { Hex } from '../chains/types'
import { CHAINS, type ChainKey } from '../registry/chains'
import { topicToAddress, TRANSFER_TOPIC } from '../verdict/transfer'

export interface Creator {
  creator: Hex | null
  txHash: string | null
  /** Plain sentence about how it was found, or why not. */
  note: string
}

export interface SpreadTransfer {
  txHash: string
  from: Hex
  to: Hex
  value: bigint
}

export interface Spread {
  transfers: SpreadTransfer[]
  /** Who signed each of the first few transactions (the person actually pushing the token around). */
  signers: Map<string, Hex>
  note: string
}

const isTron = (c: ChainKey) => CHAINS[c].family === 'tron'

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))])
}

export async function txParties(chain: ChainKey, hash: string): Promise<{ from: Hex; to: Hex | null } | null> {
  const a = adapterFor(chain) as EvmAdapter | TronAdapter
  return a.getTxParties(hash)
}

async function evmCreator(chain: ChainKey, contract: Hex): Promise<Creator> {
  const a = adapterFor(chain) as EvmAdapter
  const ex = await a.creatorFromExplorer(contract)
  if (ex) return { creator: ex.creator, txHash: ex.txHash || null, note: 'From the explorer index.' }

  // No explorer: binary search for the first block with code, on an archive-capable node.
  try {
    const head = (await a.getFinality()).head
    if ((await a.getCodeAt(contract, head)) === '0x') return { creator: null, txHash: null, note: 'Not a contract.' }
    let lo = 0n
    let hi = head
    if ((await a.getCodeAt(contract, lo)) !== '0x') return { creator: null, txHash: null, note: 'Existed from the first block.' }
    while (hi - lo > 1n) {
      const mid = (lo + hi) / 2n
      if ((await a.getCodeAt(contract, mid)) !== '0x') hi = mid
      else lo = mid
    }
    const dep = await a.findDeployment(hi, contract)
    if (dep) return { creator: dep.from, txHash: dep.txHash, note: `Deployed in block ${hi}.` }
    return { creator: null, txHash: null, note: `Created in block ${hi} by another contract (a factory). The person behind it is the signer of that block's transaction, not shown here.` }
  } catch {
    return { creator: null, txHash: null, note: 'Creator unknown: the public servers do not keep old history and no explorer key is set on this site.' }
  }
}

export async function findCreator(chain: ChainKey, contract: Hex): Promise<Creator> {
  const fallback: Creator = { creator: null, txHash: null, note: 'Creator lookup took too long.' }
  if (isTron(chain)) {
    const c = await (adapterFor(chain) as TronAdapter).getCreator(contract)
    return c ? { creator: c, txHash: null, note: 'Recorded on the contract by the Tron network.' } : { creator: null, txHash: null, note: 'Creator not readable.' }
  }
  return withTimeout(evmCreator(chain, contract), 15_000, fallback)
}

/**
 * Recent transfers of one token: who received it and who is sending it. For a fake token this is
 * the list of other people being targeted. EVM: one log window (around `aroundBlock` if given).
 */
export async function tokenSpread(chain: ChainKey, token: Hex, aroundBlock?: bigint | null): Promise<Spread> {
  const signers = new Map<string, Hex>()
  let transfers: SpreadTransfer[] = []
  let note = ''
  try {
    if (isTron(chain)) {
      transfers = await (adapterFor(chain) as TronAdapter).tokenTransfers(token, 50)
      note = `Last ${transfers.length} confirmed transfers of this token (TronGrid).`
    } else {
      const a = adapterFor(chain) as EvmAdapter
      const head = (await a.getFinality()).head
      const span = BigInt(Math.max(1, a.logChunk))
      let from = aroundBlock ? aroundBlock - span / 2n : head - span + 1n
      if (from < 0n) from = 0n
      let to = from + span - 1n
      if (to > head) to = head
      const logs = await a.getLogs({ address: token, topics: [TRANSFER_TOPIC], fromBlock: from, toBlock: to })
      transfers = logs
        .filter((l) => l.topics.length === 3 && l.data.length === 66)
        .slice(-200)
        .map((l) => ({ txHash: l.txHash, from: topicToAddress(l.topics[1]!), to: topicToAddress(l.topics[2]!), value: BigInt(l.data) }))
      note = `Transfers of this token in blocks ${from}–${to} (${transfers.length} found).`
    }
  } catch {
    return { transfers: [], signers, note: 'Could not read other transfers of this token right now.' }
  }
  const hashes = [...new Set(transfers.map((t) => t.txHash))].slice(0, 8)
  await Promise.all(
    hashes.map(async (hsh) => {
      const p = await txParties(chain, hsh).catch(() => null)
      if (p) signers.set(hsh, p.from)
    }),
  )
  return { transfers, signers, note }
}
