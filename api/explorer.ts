// Vercel Edge Function: GET /api/explorer?chain=bsc&address=0x...
import { handleExplorer } from '../server/explorer'

declare const process: { env: Record<string, string | undefined> }

export const config = { runtime: 'edge' }

export default function handler(req: Request): Promise<Response> {
  return handleExplorer(req, { EXPLORER_API_KEY: process.env.EXPLORER_API_KEY, ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS })
}
