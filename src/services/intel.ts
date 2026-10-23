// Background facts for the diagrams: who signed a transaction, who created a contract, and where
// else a fake token has been sent. Everything is best effort and read-only; a missing answer is
// shown as "unknown", never guessed.

import { adapterFor } from '../chains'
import type { EvmAdapter } from '../chains/evm'
import type { TronAdapter } from '../chains/tron'
import type { Hex } from '../chains/types'
import { CHAINS, type ChainKey } from '../registry/chains'
import { topicToAddress, TRANSFER_TOPIC } from '../verdict/transfer'
import type { TxReportOutput } from './txReport'

export interface Creator {
  creator: Hex | null
  txHash: string | null
  /** The token's owner() when the creator is unknown. Usually the deployer, or whoever it was handed to. */
  owner?: Hex | null
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

/** owner() of an Ownable contract, or null. */
async function ownerOf(chain: ChainKey, contract: Hex): Promise<Hex | null> {
  const r = await adapterFor(chain).call(contract, '0x8da5cb5b')
  if (!r.ok || r.data.length !== 66) return null
  const a = `0x${r.data.slice(-40)}` as Hex
  return /^0x0{40}$/.test(a) ? null : a
}

export async function findCreator(chain: ChainKey, contract: Hex): Promise<Creator> {
  const fallback: Creator = { creator: null, txHash: null, note: 'Creator lookup took too long.' }
  let c: Creator
  if (isTron(chain)) {
    const t = await (adapterFor(chain) as TronAdapter).getCreator(contract)
    c = t ? { creator: t, txHash: null, note: 'Recorded on the contract by the Tron network.' } : { creator: null, txHash: null, note: 'Creator not readable.' }
  } else {
    c = await withTimeout(evmCreator(chain, contract), 15_000, fallback)
  }
  if (!c.creator) {
    const owner = await ownerOf(chain, contract).catch(() => null)
    if (owner) return { ...c, owner, note: `${c.note} The contract names ${owner} as its owner, which is usually the deployer.` }
  }
  return c
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
      const window = (centre: bigint | null) => {
        let from = centre !== null ? centre - span / 2n : head - span + 1n
        if (from < 0n) from = 0n
        let to = from + span - 1n
        if (to > head) to = head
        return { from, to }
      }
      // Around the transaction first; free servers refuse old blocks, so fall back to recent activity.
      let w = window(aroundBlock ?? null)
      let logs
      let recent = aroundBlock == null
      try {
        logs = await a.getLogs({ address: token, topics: [TRANSFER_TOPIC], fromBlock: w.from, toBlock: w.to })
      } catch (e) {
        if (aroundBlock == null) throw e
        w = window(null)
        recent = true
        logs = await a.getLogs({ address: token, topics: [TRANSFER_TOPIC], fromBlock: w.from, toBlock: w.to })
      }
      const from = w.from
      const to = w.to
      transfers = logs
        .filter((l) => l.topics.length === 3 && l.data.length === 66)
        .slice(-200)
        .map((l) => ({ txHash: l.txHash, from: topicToAddress(l.topics[1]!), to: topicToAddress(l.topics[2]!), value: BigInt(l.data) }))
      note = `${recent ? 'Recent transfers' : 'Transfers'} of this token in blocks ${from}–${to} (${transfers.length} found${recent && aroundBlock != null ? '; older blocks need a paid archive server' : ''}).`
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

export interface TxIntel {
  parties: { from: Hex; to: Hex | null } | null
  creators: Map<Hex, Creator>
  spreads: Map<Hex, Spread>
}

/** Signer of the tx, and for up to two suspicious tokens in it: creator and other targets. */
export async function txIntel(r: TxReportOutput): Promise<TxIntel> {
  const creators = new Map<Hex, Creator>()
  const spreads = new Map<Hex, Spread>()
  const suspects = r.tokens.filter((t) => t.verdict === 'FAKE USDT' || t.verdict === 'UNKNOWN').slice(0, 2)
  const [parties] = await Promise.all([
    r.blockNumber !== null ? txParties(r.chain, r.hash).catch(() => null) : Promise.resolve(null),
    ...suspects.map(async (t) => {
      const [c, sp] = await Promise.all([findCreator(r.chain, t.token), tokenSpread(r.chain, t.token, r.blockNumber)])
      creators.set(t.token, c)
      spreads.set(t.token, sp)
    }),
  ])
  return { parties: parties ?? null, creators, spreads }
}
