// Wallet-scan orchestration (EVM: public RPC logs + optional explorer; Tron: TronGrid).

import { decodeFunctionResult, encodeFunctionData, erc20Abi } from 'viem'
import { adapterFor } from '../chains'
import type { EvmAdapter } from '../chains/evm'
import type { TronAdapter } from '../chains/tron'
import type { Hex, LogEntry, TokenTransfer } from '../chains/types'
import { CHAINS, type ChainKey } from '../registry/chains'
import { canonicalUsdt } from '../registry/usdt'
import { displayAddress } from '../lib/address'
import { addRecent } from '../lib/storage'
import { tokenRisk, type RiskFinding } from '../verdict/tokenRisk'
import { addressToTopic, APPROVAL_TOPIC, topicToAddress, TRANSFER_TOPIC } from '../verdict/transfer'
import {
  analyzeApprovals,
  analyzeTronPermissions,
  analyzeWallet,
  classifyCode,
  type ApprovalFinding,
  type CodeState,
  type TronPermissionFinding,
  type WalletAnalysis,
} from '../verdict/wallet'
import { probeToken } from './probe'
import { errMsg } from '../chains/rpc'

export interface ScanOutput {
  chain: ChainKey
  address: Hex
  coverage: string[]
  code: CodeState | null
  tronPermissions: TronPermissionFinding[]
  approvals: ApprovalFinding[]
  wallet: WalletAnalysis
  tokenRisks: { token: Hex; name: string | null; symbol: string | null; findings: RiskFinding[] }[]
}

async function allowance(chain: ChainKey, owner: Hex, spender: Hex): Promise<bigint | null> {
  const usdt = canonicalUsdt(chain)
  const r = await adapterFor(chain).call(usdt.hex, encodeFunctionData({ abi: erc20Abi, functionName: 'allowance', args: [owner, spender] }))
  if (!r.ok || r.data === '0x') return null
  try {
    return decodeFunctionResult({ abi: erc20Abi, functionName: 'allowance', data: r.data })
  } catch {
    return null
  }
}

function logToTransfer(l: LogEntry): TokenTransfer | null {
  if (l.topics.length !== 3 || l.data.length !== 66) return null
  return {
    txHash: l.txHash,
    blockNumber: l.blockNumber,
    timestamp: null,
    token: l.address,
    tokenName: null,
    tokenSymbol: null,
    decimals: null,
    from: topicToAddress(l.topics[1]!),
    to: topicToAddress(l.topics[2]!),
    value: BigInt(l.data),
    txFrom: null,
  }
}

async function scanEvm(chain: ChainKey, me: Hex) {
  const a = adapterFor(chain) as EvmAdapter
  const usdt = canonicalUsdt(chain)
  const coverage: string[] = []
  const meTopic = addressToTopic(me)

  const [code, fin] = await Promise.all([a.getCode(me).catch(() => null), a.getFinality()])
  const head = fin.head
  const chunk = BigInt(a.logChunk)
  const logs: LogEntry[] = []
  let from = head
  let reached = head + 1n
  const maxBlocks = BigInt(CHAINS[chain].logWindow)
  while (head - from < maxBlocks && from > 0n) {
    const lo = from >= chunk ? from - chunk + 1n : 0n
    try {
      const parts = await Promise.all([
        a.getLogs({ address: usdt.hex, topics: [TRANSFER_TOPIC, null, meTopic], fromBlock: lo, toBlock: from }),
        a.getLogs({ address: usdt.hex, topics: [TRANSFER_TOPIC, meTopic], fromBlock: lo, toBlock: from }),
        a.getLogs({ address: usdt.hex, topics: [APPROVAL_TOPIC, meTopic], fromBlock: lo, toBlock: from }),
      ])
      for (const p of parts) logs.push(...p)
      reached = lo
      from = lo - 1n
    } catch {
      break
    }
  }
  const span = head - reached + 1n
  coverage.push(
    span > 0n
      ? `Canonical USDT transfers and approvals: last ${span.toString()} blocks (${reached}–${head}) via keyless RPC. Older history needs an indexer.`
      : 'Canonical USDT history: public RPC refused log queries. Try again later.',
  )

  const transfers: TokenTransfer[] = []
  const spenders = new Set<Hex>()
  for (const l of logs) {
    if (l.topics[0] === APPROVAL_TOPIC && l.topics[2]) spenders.add(topicToAddress(l.topics[2]))
    else if (l.topics[0] === TRANSFER_TOPIC) {
      const t = logToTransfer(l)
      if (t) transfers.push(t)
    }
  }

  // Who signed outgoing zero-value transfers? If not me, it is poisoning.
  const ex = await a.listTokenTransfers(me)
  if (ex.available) {
    const seen = new Set(transfers.map((t) => `${t.txHash}|${t.token}|${t.from}|${t.to}|${t.value}`))
    for (const t of ex.value) if (!seen.has(`${t.txHash}|${t.token}|${t.from}|${t.to}|${t.value}`)) transfers.push(t)
    coverage.push(`All token transfers (incl. fake tokens): last ${ex.value.length} from the explorer index.`)
  } else {
    coverage.push(`Fake-token transfers to you: not checked. ${ex.reason}`)
  }

  const zeroOut = transfers.filter((t) => t.from === me && t.value === 0n).slice(0, 20)
  await Promise.all(zeroOut.map(async (t) => (t.txFrom = await a.getTxSender(t.txHash))))

  const allowances = await Promise.all(
    [...spenders].slice(0, 20).map(async (s) => ({ token: usdt.hex, spender: s, amount: (await allowance(chain, me, s)) ?? 0n })),
  )
  coverage.push(`Approvals: spenders seen in the scanned window (${spenders.size}); older approvals are not listed.`)

  return {
    coverage,
    code: code ? classifyCode(code) : null,
    tronPermissions: [] as TronPermissionFinding[],
    approvals: analyzeApprovals(chain, allowances),
    transfers,
    adapter: a,
  }
}

async function scanTron(me: Hex) {
  const a = adapterFor('tron') as TronAdapter
  const usdt = canonicalUsdt('tron')
  const coverage: string[] = []
  const base58 = displayAddress('tron', me)
  let tronPermissions: TronPermissionFinding[] = []
  try {
    tronPermissions = analyzeTronPermissions(base58, await a.getOwnerPermission(base58))
  } catch (e) {
    tronPermissions = [{ level: 'info', detail: `Permissions not readable (${errMsg(e)}).` }]
  }
  let transfers: TokenTransfer[] = []
  let approvals: ApprovalFinding[] = []
  try {
    const r = await a.listTrc20(me)
    transfers = r.transfers
    const spenders = [...new Set(r.approvals.filter((x) => x.token === usdt.hex).map((x) => x.spender))].slice(0, 20)
    const allowances = await Promise.all(spenders.map(async (s) => ({ token: usdt.hex, spender: s, amount: (await allowance('tron', me, s)) ?? 0n })))
    approvals = analyzeApprovals('tron', allowances)
    coverage.push(`TRC20 transfers (incl. fake tokens) and approvals: last ${r.transfers.length} confirmed events from TronGrid.`)
  } catch (e) {
    coverage.push(`TronGrid history unavailable (${errMsg(e)}).`)
  }
  return { coverage, code: null, tronPermissions, approvals, transfers, adapter: a }
}

export async function runScan(chain: ChainKey, me: Hex, watchlist: Hex[], opts: { maxTokenProbes?: number } = {}): Promise<ScanOutput> {
  const r = CHAINS[chain].family === 'tron' ? await scanTron(me) : await scanEvm(chain, me)
  const wallet = analyzeWallet(chain, me, r.transfers, watchlist)

  // L6: explain the top fake tokens.
  const tokenRisks = await Promise.all(
    wallet.fakeTokens.slice(0, opts.maxTokenProbes ?? 4).map(async (g) => {
      const logged = r.transfers.filter((t) => t.token === g.token && t.to === me).reduce((s, t) => s + t.value, 0n)
      const p = await probeToken(r.adapter, g.token, me, logged > 0n ? logged : null)
      return { token: g.token, name: p.name ?? g.name, symbol: p.symbol ?? g.symbol, findings: tokenRisk({ ...p, name: p.name ?? g.name, symbol: p.symbol ?? g.symbol }).findings }
    }),
  )

  addRecent(chain, wallet.counterparties.map((h) => displayAddress(chain, h)))

  return {
    chain,
    address: me,
    coverage: r.coverage,
    code: r.code,
    tronPermissions: r.tronPermissions,
    approvals: r.approvals,
    wallet,
    tokenRisks,
  }
}
