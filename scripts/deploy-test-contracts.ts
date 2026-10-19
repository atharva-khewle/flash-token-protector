// Deploys the test contracts to a LOCAL Anvil node (chainId 31337) or BSC testnet (97).
// Refuses any other chain, twice: here, and in every contract constructor (TestOnly.sol).
//
//   node scripts/deploy-test-contracts.ts            # writes public/testnet-deployments.json
//
// Run `anvil --hardfork prague` in another terminal first.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createPublicClient, createWalletClient, encodeFunctionData, http, type Abi, type Hex } from 'viem'
import { mnemonicToAccount } from 'viem/accounts'

const ROOT = join(import.meta.dirname, '..')
const ALLOWED_CHAIN_IDS = [31337, 97]
// Anvil's public default mnemonic. These keys are known to everyone: never put real funds on them.
export const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk'

export interface Artifact {
  abi: Abi
  bytecode: Hex
}

export function forgeBuild(): void {
  const bin = join(homedir(), '.foundry', 'bin')
  const env = { ...process.env, PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}` }
  execFileSync('forge', ['build', '--root', join(ROOT, 'contracts')], { env, stdio: 'ignore' })
}

export function artifact(file: string, name: string): Artifact {
  const p = join(ROOT, 'contracts', 'out', file, `${name}.json`)
  if (!existsSync(p)) throw new Error(`missing ${p}; run forge build`)
  const j = JSON.parse(readFileSync(p, 'utf8')) as { abi: Abi; bytecode: { object: Hex } }
  return { abi: j.abi, bytecode: j.bytecode.object }
}

export interface Deployments {
  chainId: number
  rpc: string
  rpcAlias: string
  mockUsdt: Hex
  tokens: Record<string, Hex>
  accounts: Record<string, Hex>
}

export async function assertTestChain(rpc: string): Promise<number> {
  const id = await createPublicClient({ transport: http(rpc) }).getChainId()
  if (!ALLOWED_CHAIN_IDS.includes(id)) {
    throw new Error(`refusing to deploy test contracts to chainId ${id}. Allowed: ${ALLOWED_CHAIN_IDS.join(', ')}`)
  }
  return id
}

export const ACCOUNT_NAMES = ['A_payer', 'B_receiver', 'M_attacker', 'C_other', 'D_spare', 'V7702'] as const

export async function deployAll(rpc = 'http://127.0.0.1:8545'): Promise<Deployments> {
  const chainId = await assertTestChain(rpc)
  forgeBuild()
  const deployer = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 9 })
  const pub = createPublicClient({ transport: http(rpc), pollingInterval: 50 })
  const wallet = createWalletClient({ account: deployer, transport: http(rpc) })

  const deploy = async (name: string, args: unknown[] = []): Promise<Hex> => {
    const a = artifact('Tokens.sol', name)
    const hash = await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode, args, chain: null })
    const r = await pub.waitForTransactionReceipt({ hash })
    if (!r.contractAddress) throw new Error(`${name} did not deploy`)
    return r.contractAddress.toLowerCase() as Hex
  }

  const mockUsdt = await deploy('MockUSDT')
  const tokens: Record<string, Hex> = {
    fakeUsdt: await deploy('TestToken', ['Tether USD', 'USDT', 18]),
    // "USDT" with Cyrillic Dze and Te: identical to the eye in most fonts
    homoglyph: await deploy('TestToken', ['Tether USD', 'UЅDТ', 18]),
    tugrik: await deploy('TestToken', ['Tether USD', 'USD₮', 18]),
    bridged: await deploy('TestToken', ['Tether USD', 'USDT.e', 18]),
    sixDecimals: await deploy('TestToken', ['Tether USD', 'USDT', 6]),
    urlName: await deploy('TestToken', ['Claim reward at usdt-bonus.xyz', 'USDT', 18]),
    honeypot: await deploy('Honeypot'),
    kitchenSink: await deploy('KitchenSink'),
    liar: await deploy('Liar'),
    feeToken: await deploy('FeeToken'),
    forger: await deploy('Forger'),
    batcher: await deploy('Batcher'),
    delegate: await deploy('TestDelegate'),
  }
  const impl = await deploy('UpgradeableToken')
  const init = encodeFunctionData({ abi: artifact('Tokens.sol', 'UpgradeableToken').abi, functionName: 'initialize', args: ['Tether USD', 'USDT'] })
  tokens.proxyToken = await deploy('Proxy1967', [impl, init])
  tokens.proxyImpl = impl

  const accounts = {} as Record<string, Hex>
  ACCOUNT_NAMES.forEach((n, i) => (accounts[n] = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: i }).address.toLowerCase() as Hex))

  return { chainId, rpc, rpcAlias: rpc.replace('127.0.0.1', 'localhost'), mockUsdt, tokens, accounts }
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const rpc = process.argv[2] ?? 'http://127.0.0.1:8545'
  deployAll(rpc)
    .then((d) => {
      mkdirSync(join(ROOT, 'public'), { recursive: true })
      writeFileSync(join(ROOT, 'public', 'testnet-deployments.json'), JSON.stringify(d, null, 2) + '\n')
      console.log(`deployed on chainId ${d.chainId}; mock USDT ${d.mockUsdt}`)
    })
    .catch((e: Error) => {
      console.error(e.message)
      process.exit(1)
    })
}
