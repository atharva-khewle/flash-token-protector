// Cloudflare Pages Function: GET /api/explorer?chain=bsc&address=0x...
import { handleExplorer, type ExplorerEnv } from '../../server/explorer'

export const onRequest = (ctx: { request: Request; env: ExplorerEnv }): Promise<Response> => handleExplorer(ctx.request, ctx.env)
