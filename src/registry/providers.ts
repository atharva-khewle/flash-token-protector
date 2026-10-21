// What we know about each public RPC server. This is advice shown to the user, never part of a
// verdict: verdicts come from agreement between servers and from the chain itself.
// Notes are from measurements made while building this tool (2026-10-21). Servers change.

export type Reliability = 'usually reliable' | 'sometimes limited' | 'often limited'

export interface ProviderNote {
  operator: string
  reliability: Reliability
  note: string
}

const NOTES: Record<string, ProviderNote> = {
  'bsc-dataseed.bnbchain.org': {
    operator: 'BNB Chain',
    reliability: 'usually reliable',
    note: 'Official BNB Chain endpoint. Consistent answers and up to date in our tests.',
  },
  'bsc-dataseed1.defibit.io': {
    operator: 'Defibit',
    reliability: 'usually reliable',
    note: 'Long-running public BSC endpoint. Consistent and up to date in our tests.',
  },
  'bsc-dataseed1.ninicoin.io': {
    operator: 'Ninicoin',
    reliability: 'usually reliable',
    note: 'Long-running public BSC endpoint. Consistent and up to date in our tests.',
  },
  '1rpc.io': {
    operator: '1RPC (privacy relay that forwards to other providers)',
    reliability: 'often limited',
    note: 'In our tests it rate-limited free users, sometimes replied with an empty or HTML page, and ran 8 to 14 blocks behind on BSC.',
  },
  'bsc-rpc.publicnode.com': {
    operator: 'PublicNode (Allnodes)',
    reliability: 'sometimes limited',
    note: 'Refuses receipts of older blocks without a personal token, and is blocked by some internet providers.',
  },
  'ethereum-rpc.publicnode.com': {
    operator: 'PublicNode (Allnodes)',
    reliability: 'sometimes limited',
    note: 'Works on most networks, but some internet providers block it (one served a certificate for a different company).',
  },
  'eth.drpc.org': {
    operator: 'dRPC',
    reliability: 'usually reliable',
    note: 'Up to date and consistent in our tests.',
  },
  'rpc.mevblocker.io': {
    operator: 'MEV Blocker',
    reliability: 'usually reliable',
    note: 'Up to date and consistent in our tests.',
  },
  'eth-mainnet.public.blastapi.io': {
    operator: 'Blast API',
    reliability: 'usually reliable',
    note: 'Up to date and consistent in our tests.',
  },
  'api.trongrid.io': {
    operator: 'TronGrid (TRON DAO)',
    reliability: 'usually reliable',
    note: 'Main public Tron API. Rate-limits heavy use without a key.',
  },
  'tron-rpc.publicnode.com': {
    operator: 'PublicNode (Allnodes)',
    reliability: 'sometimes limited',
    note: 'Some internet providers block PublicNode.',
  },
}

export function providerNote(host: string): ProviderNote {
  return NOTES[host] ?? { operator: host, reliability: 'sometimes limited', note: 'No track record recorded for this server.' }
}
