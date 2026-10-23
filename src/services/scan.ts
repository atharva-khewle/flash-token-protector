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
import { analyzeBehavior, type Behavior } from '../verdict/behavior'
import { errMsg } from '../chains/rpc'

export interface ScanOutput {
  chain: ChainKey
  address: Hex
  coverage: string[]
  code: CodeState | null
  tronPermissions: TronPermissionFinding[]
  approvals: ApprovalFinding[]
  wallet: WalletAnalysis
  behavior: Behavior
  tokenRisks: { token: Hex; name: string | null; symbol: string | null; findings: RiskFinding[] }[]
  /** Every transfer looked at so far (all rounds). */
  transfers: TokenTransfer[]
  /** Where "Analyze more" continues. null = nothing older to fetch. */
  cursor: { before: bigint | null; fingerprint: string | null; oldest: bigint | null; head: bigint | null } | null
  rounds: number
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

interface Round {
  coverage: string[]
  code: CodeState | null
  tronPermissions: TronPermissionFinding[]
  approvals: ApprovalFinding[]
  transfers: TokenTransfer[]
  adapter: EvmAdapter | TronAdapter
  cursor: ScanOutput['cursor']
}

/** One window of canonical-USDT history. `before` continues an earlier scan further back. */
async function scanEvm(chain: ChainKey, me: Hex, before: bigint | null, first: boolean, knownSpenders: Set<Hex>): Promise<Round> {
  const a = adapterFor(chain) as EvmAdapter
  const usdt = canonicalUsdt(chain)
  const coverage: string[] = []
  const meTopic = addressToTopic(me)

  const [code, fin] = await Promise.all([first ? a.getCode(me).catch(() => null) : Promise.resolve(null), a.getFinality()])
  const head = fin.head
  const top = before ?? head
  const chunk = BigInt(a.logChunk)
  const logs: LogEntry[] = []
  let from = top
  let reached = top + 1n
  const maxBlocks = BigInt(CHAINS[chain].logWindow)
  while (top - from < maxBlocks && from > 0n) {
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
  const span = top - reached + 1n
  if (span <= 0n) coverage.push('Canonical USDT history: public RPC refused log queries. Try again later.')

  const transfers: TokenTransfer[] = []
  const spenders = new Set<Hex>()
  for (const l of logs) {
    if (l.topics[0] === APPROVAL_TOPIC && l.topics[2]) spenders.add(topicToAddress(l.topics[2]))
    else if (l.topics[0] === TRANSFER_TOPIC) {
      const t = logToTransfer(l)
      if (t) transfers.push(t)
    }
  }

  if (first) {
    const ex = await a.listTokenTransfers(me)
    if (ex.available) {
      const seen = new Set(transfers.map(transferKey))
      for (const t of ex.value) if (!seen.has(transferKey(t))) transfers.push(t)
      coverage.push(`All token transfers (incl. fake tokens): last ${ex.value.length} from the explorer index.`)
    } else {
      coverage.push(`Fake-token transfers to you: not checked. ${ex.reason}`)
    }
  }

  // Who signed outgoing zero-value transfers? If not me, it is poisoning.
  const zeroOut = transfers.filter((t) => t.from === me && t.value === 0n).slice(0, 20)
  await Promise.all(zeroOut.map(async (t) => (t.txFrom = await a.getTxSender(t.txHash))))

  const fresh = [...spenders].filter((x) => !knownSpenders.has(x)).slice(0, 20)
  const allowances = await Promise.all(fresh.map(async (sp) => ({ token: usdt.hex, spender: sp, amount: (await allowance(chain, me, sp)) ?? 0n })))

  return {
    coverage,
    code: code ? classifyCode(code) : null,
    tronPermissions: [],
    approvals: analyzeApprovals(chain, allowances),
    transfers,
    adapter: a,
    cursor: { before: reached > 0n && span > 0n ? reached - 1n : null, fingerprint: null, oldest: span > 0n ? reached : null, head },
  }
}

async function scanTron(me: Hex, fingerprint: string | null, first: boolean, knownSpenders: Set<Hex>): Promise<Round> {
  const a = adapterFor('tron') as TronAdapter
  const usdt = canonicalUsdt('tron')
  const coverage: string[] = []
  const base58 = displayAddress('tron', me)
  let tronPermissions: TronPermissionFinding[] = []
  if (first) {
    try {
      tronPermissions = analyzeTronPermissions(base58, await a.getOwnerPermission(base58))
    } catch (e) {
      tronPermissions = [{ level: 'info', detail: `Permissions not readable (${errMsg(e)}).` }]
    }
  }
  let transfers: TokenTransfer[] = []
  let approvals: ApprovalFinding[] = []
  let next: string | null = null
  try {
    const r = await a.listTrc20(me, fingerprint)
    transfers = r.transfers
    next = r.next
    const spenders = [...new Set(r.approvals.filter((x) => x.token === usdt.hex).map((x) => x.spender))].filter((x) => !knownSpenders.has(x)).slice(0, 20)
    const allowances = await Promise.all(spenders.map(async (sp) => ({ token: usdt.hex, spender: sp, amount: (await allowance('tron', me, sp)) ?? 0n })))
    approvals = analyzeApprovals('tron', allowances)
  } catch (e) {
    coverage.push(`TronGrid history unavailable (${errMsg(e)}).`)
  }
  return { coverage, code: null, tronPermissions, approvals, transfers, adapter: a, cursor: { before: null, fingerprint: next, oldest: null, head: null } }
}

const transferKey = (t: TokenTransfer) => `${t.txHash}|${t.token}|${t.from}|${t.to}|${t.value}`

/**
 * Scans an address. With `prev`, continues further back in history ("Analyze more") and merges
 * the new window into the earlier result.
 */
export async function runScan(chain: ChainKey, me: Hex, watchlist: Hex[], opts: { maxTokenProbes?: number; prev?: ScanOutput } = {}): Promise<ScanOutput> {
  const prev = opts.prev && opts.prev.chain === chain && opts.prev.address === me ? opts.prev : null
  const known = new Set<Hex>(prev?.approvals.map((x) => x.spender) ?? [])
  const tron = CHAINS[chain].family === 'tron'
  const r = tron ? await scanTron(me, prev?.cursor?.fingerprint ?? null, !prev, known) : await scanEvm(chain, me, prev?.cursor?.before ?? null, !prev, known)

  const seen = new Set((prev?.transfers ?? []).map(transferKey))
  const transfers = [...(prev?.transfers ?? []), ...r.transfers.filter((t) => !seen.has(transferKey(t)))]
  const approvals = [...(prev?.approvals ?? []), ...r.approvals]
  const code = prev ? prev.code : r.code
  const tronPermissions = prev ? prev.tronPermissions : r.tronPermissions
  const wallet = analyzeWallet(chain, me, transfers, watchlist)
  const rounds = (prev?.rounds ?? 0) + 1

  const cursor = tron
    ? r.cursor!
    : { before: r.cursor?.before ?? null, fingerprint: null, oldest: r.cursor?.oldest ?? prev?.cursor?.oldest ?? null, head: prev?.cursor?.head ?? r.cursor?.head ?? null }

  // First line: the window covered so far. Then the one-off notes from the first round.
  const window = tron
    ? `TRC20 transfers (incl. fake tokens) and approvals: ${transfers.length} confirmed events from TronGrid${rounds > 1 ? ` (${rounds} pages)` : ''}.`
    : cursor.oldest !== null && cursor.head !== null
      ? `Canonical USDT transfers and approvals: blocks ${cursor.oldest}–${cursor.head} (${(cursor.head - cursor.oldest + 1n).toString()} blocks) via keyless RPC.`
      : 'Canonical USDT history: not available from the public servers right now.'
  const notes = (prev ? prev.coverage.slice(1) : r.coverage).filter((c) => !c.startsWith('Approvals:'))
  const coverage = [window, ...notes, `Approvals: spenders seen in the scanned window (${approvals.length} live).`]

  // L6: explain the top fake tokens. Reuse what earlier rounds already probed.
  const tokenRisks = await Promise.all(
    wallet.fakeTokens.slice(0, opts.maxTokenProbes ?? 4).map(async (g) => {
      const old = prev?.tokenRisks.find((x) => x.token === g.token)
      if (old) return old
      const logged = transfers.filter((t) => t.token === g.token && t.to === me).reduce((sum, t) => sum + t.value, 0n)
      const p = await probeToken(r.adapter, g.token, me, logged > 0n ? logged : null)
      return { token: g.token, name: p.name ?? g.name, symbol: p.symbol ?? g.symbol, findings: tokenRisk({ ...p, name: p.name ?? g.name, symbol: p.symbol ?? g.symbol }).findings }
    }),
  )

  addRecent(chain, wallet.counterparties.map((x) => displayAddress(chain, x)))

  return {
    chain,
    address: me,
    coverage,
    code,
    tronPermissions,
    approvals,
    wallet,
    behavior: analyzeBehavior(chain, me, transfers, wallet),
    tokenRisks,
    transfers,
    cursor: tron ? (cursor.fingerprint ? cursor : null) : cursor.before !== null ? cursor : null,
    rounds,
  }
}
