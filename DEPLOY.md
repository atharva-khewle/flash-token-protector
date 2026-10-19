# Deploy

The app is a static Vite build (`dist/`) plus one optional serverless function, `/api/explorer`. Without the function everything still works except listing **fake-token** transfers in the BSC/ETH wallet scan. The page says so when it's missing.

## Environment variables

Set these as **server-side** variables only. Never use a `VITE_` prefix: Vite would bake them into the public bundle.

| Name | Required | What |
|---|---|---|
| `EXPLORER_API_KEY` | no | Etherscan V2 API key, used by `/api/explorer` to list all token transfers for an address (that's how fake USDT sent to you shows up). The free tier covers Ethereum. As of Oct 2026 BSC (chainid 56) returns "Free API access is not supported for this chain", so BSC needs a paid plan: check <https://etherscan.io/apis>. |
| `ALLOWED_ORIGINS` | no | Comma-separated extra origins allowed to call the proxy. Default: same origin only. |

The RPC endpoints are public and keyless. They're listed in `src/registry/chains.ts` and must match `connect-src` in `public/_headers` and `vercel.json` (a test checks this).

## Cloudflare Pages (preferred)

`public/_headers` (CSP and security headers) is copied into `dist/` and applied by Pages. `functions/api/explorer.ts` becomes `/api/explorer`.

### Dashboard

1. Push this repo to GitHub.
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → pick the repo.
3. Build settings:
   - Framework preset: **None** (or Vite)
   - Build command: `npm ci && npm run build`
   - Build output directory: `dist`
   - Environment variable `NODE_VERSION` = `22` (or newer)
4. **Settings → Variables and Secrets** → add `EXPLORER_API_KEY` as a **Secret** (optional).
5. Deploy. Open `https://<project>.pages.dev`, then check the response headers include `content-security-policy`.

### CLI

```bash
npm ci && npm run build
npx wrangler@4 pages project create flash-token-protector --production-branch main
npx wrangler@4 pages secret put EXPLORER_API_KEY --project-name flash-token-protector   # optional
npx wrangler@4 pages deploy dist --project-name flash-token-protector
```

`wrangler pages deploy` run from the repo root also bundles the `functions/` directory.

Local run with the function:

```bash
npm run build
npx wrangler@4 pages dev dist --binding EXPLORER_API_KEY=<key>
```

**Free-tier limits (Cloudflare, check the current pricing page):** unlimited static requests and bandwidth, 500 builds/month, and Pages Functions count against the Workers free plan (100,000 requests/day).

## Vercel

`vercel.json` sets the build, the output directory and the same security headers. `api/explorer.ts` runs as an Edge Function at `/api/explorer`.

1. **Add New → Project** → import the GitHub repo.
2. Framework preset: **Vite**. Build command and output come from `vercel.json` (`npm run build`, `dist`).
3. **Settings → Environment Variables** → `EXPLORER_API_KEY` (Production + Preview), optional.
4. Deploy. Check the CSP header on the response.

CLI:

```bash
npm i -g vercel@latest
vercel link
vercel env add EXPLORER_API_KEY production   # optional
vercel --prod
```

**Free-tier limits (Vercel Hobby, check the current pricing page):** non-commercial use only, a monthly cap on Edge/Function invocations and bandwidth (100 GB at the time of writing).

## After deploying

- [ ] Open the site and run the real BSC example from the README: it should be VERIFIED with the expected recipient.
- [ ] Check DevTools → Console for CSP violations (there should be none).
- [ ] `curl -I https://<your-domain>/` shows `content-security-policy`, `x-frame-options: DENY`, `referrer-policy: no-referrer`.
- [ ] `curl "https://<your-domain>/api/explorer?chain=bsc&address=0x0000000000000000000000000000000000000000"` returns JSON with `cache-control: no-store`.
- [ ] Put the canonical domain in your bio/links so users can tell clones apart.
- [ ] Re-verify `src/registry/usdt.ts` against Tether and the explorers before each release, and run `npm audit`.
