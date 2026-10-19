// Local chain helpers for the end-to-end run: start Anvil, deploy, send txs as the named accounts.

import { spawn, type ChildProcess } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  http,
  parseAbi,
  type Abi,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { mnemonicToAccount, type HDAccount } from 'viem/accounts'
import { ANVIL_MNEMONIC, artifact, deployAll, type Deployments } from '../scripts/deploy-test-contracts'

export type { Deployments }

export const RPC_PORT = 8545

export interface Anvil {
  proc: ChildProcess
  rpc: string
  stop(): Promise<void>
}

export async function startAnvil(port = RPC_PORT, extra: string[] = []): Promise<Anvil> {
  const bin = join(homedir(), '.foundry', 'bin', process.platform === 'win32' ? 'anvil.exe' : 'anvil')
  const proc = spawn(process.env.ANVIL_BIN ?? bin, ['--port', String(port), '--hardfork', 'prague', '--silent', ...extra], { stdio: 'ignore' })
  const rpc = `http://127.0.0.1:${port}`
  const client = createPublicClient({ transport: http(rpc) })
  for (let i = 0; i < 60; i++) {
    try {
      await client.getChainId()
      return {
        proc,
        rpc,
        stop: () =>
          new Promise<void>((resolve) => {
            proc.once('exit', () => resolve())
            proc.kill()
            setTimeout(resolve, 2000)
          }),
      }
    } catch {
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  proc.kill()
  throw new Error('anvil did not start. Install Foundry (https://getfoundry.sh) or set ANVIL_BIN.')
}

export interface Ctx {
  d: Deployments
  pub: PublicClient
  test: ReturnType<typeof createTestClient>
  acct: Record<'A' | 'B' | 'M' | 'C' | 'V', HDAccount>
  wallet: (who: keyof Ctx['acct']) => WalletClient
  /** Sends a contract call from an account and waits for the receipt. */
  call(who: keyof Ctx['acct'], to: Hex, abi: Abi | readonly unknown[], fn: string, args?: unknown[], opts?: { gas?: bigint }): Promise<{ hash: Hex; status: 'success' | 'reverted' }>
  /** Deploys-free helpers */
  mintUsdt(to: Hex, units: bigint): Promise<Hex>
  usdtTransfer(from: keyof Ctx['acct'], to: Hex, units: bigint): Promise<Hex>
  mine(blocks: number): Promise<void>
  /** Mines past the finalized tag (anvil: head - 64). */
  finalize(): Promise<void>
}

export const E18 = 10n ** 18n

export async function makeCtx(d: Deployments): Promise<Ctx> {
  const transport = http(d.rpc)
  const pub = createPublicClient({ transport, pollingInterval: 50 })
  const test = createTestClient({ mode: 'anvil', transport })
  const idx = { A: 0, B: 1, M: 2, C: 3, V: 5 } as const
  const acct = Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: i })])) as Ctx['acct']
  const wallet = (who: keyof Ctx['acct']) => createWalletClient({ account: acct[who], transport, chain: null as never, pollingInterval: 50 })
  const erc20 = parseAbi(['function mint(address,uint256)'])

  const ctx: Ctx = {
    d,
    pub,
    test,
    acct,
    wallet,
    async call(who, to, abi, fn, args = [], opts = {}) {
      const data = encodeFunctionData({ abi: abi as Abi, functionName: fn, args })
      const hash = await wallet(who).sendTransaction({ to, data, chain: null as never, ...(opts.gas ? { gas: opts.gas } : {}) } as never)
      const r = await pub.waitForTransactionReceipt({ hash })
      return { hash, status: r.status }
    },
    async mintUsdt(to, units) {
      return (await ctx.call('C', d.mockUsdt, erc20, 'mint', [to, units])).hash
    },
    async usdtTransfer(from, to, units) {
      return (await ctx.call(from, d.mockUsdt, erc20Abi, 'transfer', [to, units])).hash
    },
    async mine(blocks) {
      await test.mine({ blocks })
    },
    async finalize() {
      await test.mine({ blocks: 70 })
    },
  }
  return ctx
}

export async function boot(port = RPC_PORT): Promise<{ anvil: Anvil; ctx: Ctx }> {
  const anvil = await startAnvil(port)
  const d = await deployAll(anvil.rpc)
  return { anvil, ctx: await makeCtx(d) }
}

export { artifact }
export const tokenAbi = parseAbi([
  'function mint(address,uint256)',
  'function transfer(address,uint256) returns (bool)',
  'function transferFrom(address,address,uint256) returns (bool)',
  'function approve(address,uint256) returns (bool)',
  'function burn(address,uint256)',
  'function emitTransfer(address,address,uint256)',
  'function execute(address[],bytes[])',
])

/** An address that shares the first and last `n` hex chars with `target`, different in the middle. */
export function vanityOf(target: Hex, n = 6): Hex {
  const t = target.slice(2)
  const mid = 'f'.repeat(40 - 2 * n)
  const flipped = mid[0] === t[n] ? '0'.repeat(40 - 2 * n) : mid
  return `0x${t.slice(0, n)}${flipped}${t.slice(40 - n)}`.toLowerCase() as Hex
}
