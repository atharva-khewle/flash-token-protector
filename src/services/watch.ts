// Live watcher: after each new block, report transfers of ANY token into or out of one address,
// so a fake "USDT" is caught seconds after it lands. Read-only polling of public RPCs.
//
// Limits (shown to the user): it sees transactions once they are mined, not the private mempool,
// and only while this page is open. It also reports how many transactions the address has pending.

import { adapterFor } from '../chains'
import type { EvmAdapter } from '../chains/evm'
import type { Hex, LogEntry } from '../chains/types'
import { CHAINS, type ChainKey } from '../registry/chains'
import { canonicalUsdt } from '../registry/usdt'
import { addressToTopic, topicToAddress, TRANSFER_TOPIC } from '../verdict/transfer'
import { errMsg } from '../chains/rpc'

export interface LiveTransfer {
  hash: string
  blockNumber: bigint
  token: Hex
  canonical: boolean
  direction: 'in' | 'out' | 'self'
  counterparty: Hex
  value: bigint
}

export type WatchStatus =
  | { state: 'watching'; block: bigint; allTokens: boolean; pending: number | null }
  | { state: 'unsupported'; reason: string }
  | { state: 'degraded'; reason: string }

/** Pure: picks the Transfer logs that touch `me` out of a block's logs. */
export function transfersTouching(chain: ChainKey, me: Hex, logs: LogEntry[]): LiveTransfer[] {
  const usdt = canonicalUsdt(chain)
  const mine = me.toLowerCase()
  const out: LiveTransfer[] = []
  for (const l of logs) {
    if (l.topics[0] !== TRANSFER_TOPIC || l.topics.length !== 3 || l.data.length !== 66) continue
    const from = topicToAddress(l.topics[1]!)
    const to = topicToAddress(l.topics[2]!)
    if (from !== mine && to !== mine) continue
    out.push({
      hash: l.txHash,
      blockNumber: l.blockNumber,
      token: l.address.toLowerCase() as Hex,
      canonical: l.address.toLowerCase() === usdt.hex,
      direction: from === mine && to === mine ? 'self' : to === mine ? 'in' : 'out',
      counterparty: (to === mine ? from : to) as Hex,
      value: BigInt(l.data),
    })
  }
  return out
}

const POLL_MS: Record<ChainKey, number> = { bsc: 3000, eth: 6000, tron: 0, local: 700 }
const MAX_CATCHUP = 12

/** Starts watching. Returns a stop function. */
export function startWatch(
  chain: ChainKey,
  me: Hex,
  on: { transfer: (t: LiveTransfer) => void; status: (s: WatchStatus) => void },
): () => void {
  if (CHAINS[chain].family === 'tron') {
    on.status({ state: 'unsupported', reason: 'Live watching is not available for Tron yet. History still loads.' })
    return () => undefined
  }
  const a = adapterFor(chain) as EvmAdapter
  const usdt = canonicalUsdt(chain)
  const meTopic = addressToTopic(me)
  let stopped = false
  let last: bigint | null = null
  let allTokens = true
  const seen = new Set<string>()

  const emit = (list: LiveTransfer[]) => {
    for (const t of list) {
      const k = `${t.hash}|${t.token}|${t.direction}|${t.counterparty}|${t.value}`
      if (seen.has(k)) continue
      seen.add(k)
      on.transfer(t)
    }
  }

  const tick = async () => {
    try {
      const head = await a.getHead()
      if (last === null) last = head
      const to = head < last + BigInt(MAX_CATCHUP) ? head : last + BigInt(MAX_CATCHUP)
      for (let b = last + 1n; b <= to && !stopped; b++) {
        const blockLogs = allTokens ? await a.getBlockLogs(b) : null
        if (blockLogs) {
          emit(transfersTouching(chain, me, blockLogs.flatMap((x) => x.logs)))
        } else {
          // This RPC cannot list a block's receipts: fall back to real-USDT logs for this address.
          allTokens = false
          const parts = await Promise.all([
            a.getLogs({ address: usdt.hex, topics: [TRANSFER_TOPIC, null, meTopic], fromBlock: b, toBlock: b }),
            a.getLogs({ address: usdt.hex, topics: [TRANSFER_TOPIC, meTopic], fromBlock: b, toBlock: b }),
          ])
          emit(transfersTouching(chain, me, parts.flat()))
        }
        last = b
      }
      const pending = await a.getPendingCount(me)
      if (!stopped) on.status({ state: 'watching', block: last, allTokens, pending })
    } catch (e) {
      if (!stopped) on.status({ state: 'degraded', reason: `Public RPC busy (${errMsg(e)}). Retrying.` })
    }
  }

  const loop = async () => {
    while (!stopped) {
      await tick()
      await new Promise((r) => setTimeout(r, POLL_MS[chain] || 4000))
    }
  }
  void loop()
  return () => {
    stopped = true
  }
}
