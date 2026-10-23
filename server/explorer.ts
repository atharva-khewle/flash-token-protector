// Thin explorer proxy shared by Cloudflare Pages Functions and Vercel Edge.
// Its only job: keep EXPLORER_API_KEY server-side, accept a strict input
// shape, and rate-limit. No database, no logs of user input, no caching.

export interface ExplorerEnv {
  EXPLORER_API_KEY?: string
  ALLOWED_ORIGINS?: string
}

const CHAIN_IDS: Record<string, number> = { bsc: 56, eth: 1 }
const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = 30

// Best effort: per-isolate memory. Good enough to stop casual abuse of the key.
const hits = new Map<string, number[]>()

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

function rateLimited(ip: string, now: number): boolean {
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  list.push(now)
  hits.set(ip, list)
  if (hits.size > 5000) hits.clear()
  return list.length > MAX_PER_WINDOW
}

function originAllowed(req: Request, env: ExplorerEnv): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true // same-origin GETs usually omit Origin
  const self = new URL(req.url).origin
  if (origin === self) return true
  const extra = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return extra.includes(origin)
}

interface EtherscanItem {
  hash: string
  blockNumber: string
  timeStamp: string
  contractAddress: string
  tokenName: string
  tokenSymbol: string
  tokenDecimal: string
  from: string
  to: string
  value: string
}

export async function handleExplorer(req: Request, env: ExplorerEnv, now = Date.now()): Promise<Response> {
  if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405)
  if (!originAllowed(req, env)) return json({ error: 'origin not allowed' }, 403)

  const url = new URL(req.url)
  const chain = url.searchParams.get('chain') ?? ''
  const address = url.searchParams.get('address') ?? ''
  const chainId = CHAIN_IDS[chain]
  if (!chainId) return json({ error: 'unsupported chain' }, 400)
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return json({ error: 'bad address' }, 400)

  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (rateLimited(ip, now)) return json({ error: 'rate limited, try again in a few minutes' }, 429)

  if (!env.EXPLORER_API_KEY) {
    return json({ available: false, reason: 'This deployment has no EXPLORER_API_KEY, so fake-token transfers cannot be listed.' })
  }

  if (url.searchParams.get('kind') === 'creator') return creator(chainId, address, env.EXPLORER_API_KEY)

  const api = new URL('https://api.etherscan.io/v2/api')
  api.search = new URLSearchParams({
    chainid: String(chainId),
    module: 'account',
    action: 'tokentx',
    address,
    page: String(Math.min(10, Math.max(1, Number(url.searchParams.get('page')) || 1))),
    offset: '200',
    sort: 'desc',
    apikey: env.EXPLORER_API_KEY,
  }).toString()

  try {
    const res = await fetch(api.toString(), { headers: { accept: 'application/json' } })
    const body = (await res.json()) as { status: string; message: string; result: EtherscanItem[] | string }
    if (!Array.isArray(body.result)) {
      const msg = typeof body.result === 'string' ? body.result : body.message
      // "No transactions found" is a valid empty answer.
      if (/no transactions/i.test(msg)) return json({ available: true, items: [] })
      return json({ available: false, reason: `Explorer said: ${String(msg).slice(0, 160)}` })
    }
    const items = body.result
      .filter((i) => typeof i.hash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(i.hash))
      .map((i) => ({
        hash: i.hash,
        blockNumber: i.blockNumber,
        timeStamp: i.timeStamp,
        contractAddress: i.contractAddress,
        tokenName: String(i.tokenName ?? '').slice(0, 120),
        tokenSymbol: String(i.tokenSymbol ?? '').slice(0, 60),
        tokenDecimal: i.tokenDecimal,
        from: i.from,
        to: i.to,
        value: /^\d+$/.test(i.value) ? i.value : '0',
      }))
    return json({ available: true, items })
  } catch {
    return json({ available: false, reason: 'Explorer request failed.' }, 502)
  }
}

/** Who deployed a contract, and in which transaction. */
async function creator(chainId: number, address: string, key: string): Promise<Response> {
  const api = new URL('https://api.etherscan.io/v2/api')
  api.search = new URLSearchParams({ chainid: String(chainId), module: 'contract', action: 'getcontractcreation', contractaddresses: address, apikey: key }).toString()
  try {
    const res = await fetch(api.toString(), { headers: { accept: 'application/json' } })
    const body = (await res.json()) as { result?: { contractCreator?: string; txHash?: string }[] | string; message?: string }
    const r = Array.isArray(body.result) ? body.result[0] : undefined
    if (!r || !/^0x[0-9a-fA-F]{40}$/.test(r.contractCreator ?? '')) {
      return json({ available: false, reason: `Explorer said: ${String(typeof body.result === 'string' ? body.result : body.message ?? 'no creator').slice(0, 160)}` })
    }
    return json({ available: true, creator: r.contractCreator, txHash: /^0x[0-9a-fA-F]{64}$/.test(r.txHash ?? '') ? r.txHash : null })
  } catch {
    return json({ available: false, reason: 'Explorer request failed.' }, 502)
  }
}
