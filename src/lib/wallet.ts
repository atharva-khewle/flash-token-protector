// Optional wallet connection. Read-only by construction: the only things this app ever asks a
// wallet are "which account is selected?" (eth_requestAccounts / eth_accounts). It never asks for
// a signature, a transaction, a chain switch or a permission to spend. The guard below enforces it.

import type { Hex } from '../chains/types'

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
  on?(event: string, handler: (...args: unknown[]) => void): void
  removeListener?(event: string, handler: (...args: unknown[]) => void): void
}

export interface DiscoveredWallet {
  id: string
  /** Chosen by the wallet. Untrusted text: show it as text only. */
  name: string
  provider: Eip1193
}

/** The complete list of wallet methods this app may call. Anything else throws. */
export const ALLOWED_WALLET_METHODS: ReadonlySet<string> = new Set(['eth_requestAccounts', 'eth_accounts'])

export function guarded(provider: Eip1193): Eip1193 {
  return {
    request(args) {
      if (!ALLOWED_WALLET_METHODS.has(args.method)) {
        return Promise.reject(new Error(`Blocked: this app never calls ${args.method.slice(0, 40)} on a wallet.`))
      }
      return provider.request(args)
    },
    on: provider.on?.bind(provider),
    removeListener: provider.removeListener?.bind(provider),
  }
}

/** EIP-6963 discovery (lists every installed wallet), with window.ethereum as the fallback. */
export function discoverWallets(waitMs = 250): Promise<DiscoveredWallet[]> {
  return new Promise((resolve) => {
    const found = new Map<string, DiscoveredWallet>()
    const onAnnounce = (e: Event) => {
      const d = (e as CustomEvent<{ info?: { uuid?: string; name?: string }; provider?: Eip1193 }>).detail
      if (!d?.provider || typeof d.provider.request !== 'function') return
      const id = String(d.info?.uuid ?? d.info?.name ?? found.size).slice(0, 80)
      found.set(id, { id, name: String(d.info?.name ?? 'Wallet').slice(0, 40), provider: d.provider })
    }
    window.addEventListener('eip6963:announceProvider', onAnnounce)
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce)
      const legacy = (window as unknown as { ethereum?: Eip1193 }).ethereum
      if (found.size === 0 && legacy && typeof legacy.request === 'function') {
        found.set('window.ethereum', { id: 'window.ethereum', name: 'Browser wallet', provider: legacy })
      }
      resolve([...found.values()])
    }, waitMs)
  })
}

function firstAccount(v: unknown): Hex | null {
  if (!Array.isArray(v)) return null
  const a = v[0]
  return typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a) ? (a.toLowerCase() as Hex) : null
}

/** Asks the wallet for the selected account. The user approves in the wallet's own window. */
export async function connectWallet(w: DiscoveredWallet): Promise<Hex> {
  const acct = firstAccount(await guarded(w.provider).request({ method: 'eth_requestAccounts' }))
  if (!acct) throw new Error('The wallet did not return an account.')
  return acct
}

/** Calls back when the user switches account in the wallet (null = disconnected). */
export function onAccountChange(w: DiscoveredWallet, cb: (account: Hex | null) => void): () => void {
  const h = (accounts: unknown) => cb(firstAccount(accounts))
  w.provider.on?.('accountsChanged', h)
  return () => w.provider.removeListener?.('accountsChanged', h)
}
