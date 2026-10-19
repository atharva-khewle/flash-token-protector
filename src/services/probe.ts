// Fetches what L6 needs about an unknown token. Read-only eth_call / storage reads.

import { decodeFunctionResult, encodeFunctionData, erc20Abi, hexToString, toHex } from 'viem'
import type { ChainAdapter, Hex } from '../chains/types'
import { EIP1967_BEACON_SLOT, EIP1967_IMPL_SLOT, type TokenProbe } from '../verdict/tokenRisk'

function randomAddress(): Hex {
  const b = new Uint8Array(20)
  crypto.getRandomValues(b)
  return toHex(b)
}

async function readString(a: ChainAdapter, token: Hex, fn: 'name' | 'symbol'): Promise<string | null> {
  const r = await a.call(token, encodeFunctionData({ abi: erc20Abi, functionName: fn }))
  if (!r.ok || r.data === '0x') return null
  try {
    return decodeFunctionResult({ abi: erc20Abi, functionName: fn, data: r.data })
  } catch {
    // Some old tokens return bytes32.
    try {
      return hexToString(r.data, { size: 32 }).replace(/\0+$/, '')
    } catch {
      return null
    }
  }
}

export async function balanceOf(a: ChainAdapter, token: Hex, holder: Hex): Promise<bigint | null> {
  const r = await a.call(token, encodeFunctionData({ abi: erc20Abi, functionName: 'balanceOf', args: [holder] }))
  if (!r.ok || r.data === '0x') return null
  try {
    return decodeFunctionResult({ abi: erc20Abi, functionName: 'balanceOf', data: r.data })
  } catch {
    return null
  }
}

export async function probeToken(a: ChainAdapter, token: Hex, holder: Hex | null, loggedValue: bigint | null): Promise<TokenProbe> {
  const [code, name, symbol, implSlot, beaconSlot] = await Promise.all([
    a.getCode(token).catch(() => '0x' as Hex),
    readString(a, token, 'name'),
    readString(a, token, 'symbol'),
    a.getStorageAt(token, EIP1967_IMPL_SLOT),
    a.getStorageAt(token, EIP1967_BEACON_SLOT),
  ])
  const [holderBalance, randomBalance] = await Promise.all([
    holder ? balanceOf(a, token, holder) : Promise.resolve(null),
    balanceOf(a, token, randomAddress()),
  ])
  let transferSim: TokenProbe['transferSim'] = null
  if (holder && holderBalance !== null && holderBalance > 0n) {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [randomAddress(), 1n] })
    const r = await a.call(token, data, holder)
    transferSim = r.ok ? { ok: true } : { ok: false, error: r.error }
  }
  return { token, code, name, symbol, implSlot, beaconSlot, holderBalance, loggedValue, randomBalance, transferSim }
}
