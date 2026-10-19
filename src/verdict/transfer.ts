// L2 + L3: which logs are real USDT, and how much each address actually gained.

import type { CanonicalToken } from '../registry/usdt'
import type { Hex, NormLog } from '../chains/types'

export const TRANSFER_TOPIC: Hex = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
export const APPROVAL_TOPIC: Hex = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925'

export interface DecodedTransfer {
  token: Hex
  from: Hex
  to: Hex
  value: bigint
  logIndex: number
  canonical: boolean
}

export interface Decoy {
  token: Hex
  from: Hex | null
  to: Hex | null
  value: bigint | null
  logIndex: number
  reason: string
  /** True when the decoy credits (sends to) the address being checked. */
  touchesTarget: boolean
}

export function topicToAddress(topic: Hex): Hex {
  return `0x${topic.slice(-40).toLowerCase()}` as Hex
}

export function addressToTopic(addr: Hex): Hex {
  return `0x${addr.slice(2).toLowerCase().padStart(64, '0')}` as Hex
}

function dataToBigint(data: Hex): bigint | null {
  const h = data.slice(2)
  if (h.length !== 64) return null
  return BigInt(`0x${h}`)
}

/** Decodes only well-formed ERC20 Transfer logs (3 topics + 32-byte data). */
export function decodeTransfer(log: NormLog, usdt: CanonicalToken): DecodedTransfer | null {
  if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) return null
  if (log.topics.length !== 3) return null
  const value = dataToBigint(log.data)
  if (value === null) return null
  return {
    token: log.address.toLowerCase() as Hex,
    from: topicToAddress(log.topics[1]!),
    to: topicToAddress(log.topics[2]!),
    value,
    logIndex: log.logIndex,
    canonical: log.address.toLowerCase() === usdt.hex,
  }
}

export interface TransferAnalysis {
  canonical: DecodedTransfer[]
  decoys: Decoy[]
  /** Net canonical USDT change per address (positive = received). */
  net: Map<Hex, bigint>
}

export function analyzeTransfers(logs: NormLog[], usdt: CanonicalToken, target: Hex | null): TransferAnalysis {
  const canonical: DecodedTransfer[] = []
  const decoys: Decoy[] = []
  const net = new Map<Hex, bigint>()
  const t = target?.toLowerCase() as Hex | undefined

  for (const log of logs) {
    const isTransferTopic = log.topics[0]?.toLowerCase() === TRANSFER_TOPIC
    if (!isTransferTopic) continue
    const emitter = log.address.toLowerCase() as Hex
    const d = decodeTransfer(log, usdt)

    if (d && d.canonical) {
      canonical.push(d)
      net.set(d.from, (net.get(d.from) ?? 0n) - d.value)
      net.set(d.to, (net.get(d.to) ?? 0n) + d.value)
      continue
    }

    const from = log.topics[1] ? topicToAddress(log.topics[1]) : null
    const to = log.topics[2] ? topicToAddress(log.topics[2]) : null
    let reason: string
    if (emitter === usdt.hex) {
      reason = 'Emitted by the USDT contract but malformed (wrong topic count or data length). Ignored.'
    } else if (log.topics.length === 4) {
      reason = `NFT-style Transfer (4 topics) from ${emitter}, not USDT.`
    } else {
      reason = `Emitted by ${emitter}, not the canonical USDT contract ${usdt.hex}. Any name/symbol it shows is irrelevant.`
    }
    decoys.push({
      token: emitter,
      from,
      to,
      value: d ? d.value : null,
      logIndex: log.logIndex,
      reason,
      touchesTarget: !!t && to === t,
    })
  }
  return { canonical, decoys, net }
}

/** Formats base units with the registry decimals. Never uses the token's own decimals(). */
export function formatUnits(value: bigint, decimals: number): string {
  const neg = value < 0n
  const v = neg ? -value : value
  const base = 10n ** BigInt(decimals)
  const whole = v / base
  const frac = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  const w = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${neg ? '-' : ''}${w}${frac ? '.' + frac : ''}`
}
