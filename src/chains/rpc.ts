// Minimal JSON-RPC over fetch with a timeout. Used through viem's custom
// transport for EVM, and directly for Tron's HTTP API.

export class RpcError extends Error {
  constructor(
    message: string,
    readonly provider: string,
  ) {
    super(message)
  }
}

export const TIMEOUT_MS = 12_000

export function hostOf(url: string): string {
  try {
    return new URL(url, 'http://localhost').host || url
  } catch {
    return url
  }
}

export async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
    if (!res.ok) throw new RpcError(`HTTP ${res.status}`, hostOf(url))
    return await res.json()
  } catch (e) {
    if (e instanceof RpcError) throw e
    throw new RpcError(e instanceof Error ? (e.name === 'AbortError' ? 'timeout' : e.message) : String(e), hostOf(url))
  } finally {
    clearTimeout(timer)
  }
}

let nextId = 1

export async function jsonRpc<T = unknown>(url: string, method: string, params: unknown[]): Promise<T> {
  const body = await fetchJson(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  })
  const r = body as { result?: T; error?: { message?: string; code?: number; data?: unknown } }
  if (r.error) {
    const err = new RpcError(r.error.message ?? 'rpc error', hostOf(url)) as RpcError & { data?: unknown; code?: number }
    err.data = r.error.data
    err.code = r.error.code
    throw err
  }
  return r.result as T
}

/** Tries each endpoint in order until one answers. */
export async function firstOk<I, T>(items: I[], fn: (item: I) => Promise<T>): Promise<T> {
  let last: unknown = null
  for (const u of items) {
    try {
      return await fn(u)
    } catch (e) {
      last = e
    }
  }
  throw last instanceof Error ? last : new Error('all providers failed')
}

export function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.length > 160 ? m.slice(0, 157) + '...' : m
}
