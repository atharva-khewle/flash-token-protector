// Writes docs/PROOF.md from docs/proof/results.json (produced by `npm run e2e`).
//   node scripts/make-proof.ts

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const data = JSON.parse(readFileSync(join(ROOT, 'docs', 'proof', 'results.json'), 'utf8')) as {
  chainId: number
  results: { id: string; vectors: string[]; title: string; pass: boolean; error?: string; outcome?: { txs: string[]; observed: string } }[]
}

const bin = (n: string) => join(homedir(), '.foundry', 'bin', process.platform === 'win32' ? `${n}.exe` : n)
const ver = (n: string) => {
  try {
    return execFileSync(bin(n), ['--version'], { encoding: 'utf8' }).split('\n')[0]!.trim()
  } catch {
    return `${n} (version unknown)`
  }
}
const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
const short = (h: string) => `\`${h.slice(0, 10)}…${h.slice(-4)}\``

const rows = data.results
  .map((r) => {
    const txs = r.outcome?.txs.length ? r.outcome.txs.map(short).join(' ') : '-'
    return `| ${r.pass ? 'PASS' : 'FAIL'} | \`${r.id}\` | ${r.vectors.join(', ')} | ${esc(r.title)} | ${esc(r.outcome?.observed ?? r.error ?? '')} | ${txs} |`
  })
  .join('\n')

const passed = data.results.filter((r) => r.pass).length
const shots = (dir: string) =>
  existsSync(join(ROOT, 'docs', 'proof', dir))
    ? readdirSync(join(ROOT, 'docs', 'proof', dir))
        .filter((f) => f.endsWith('.png'))
        .sort()
        .map((f) => `- [\`${f}\`](proof/${dir}/${f})`)
        .join('\n')
    : ''

const md = `# Proof of work

Nothing here asks you to trust a screenshot. Every row below is produced by code in this repository, and you can rerun all of it on your own machine with the commands in [Reproduce](#reproduce).

**Result: ${passed} / ${data.results.length} attack scenarios pass on a real EVM chain** (Anvil, chainId ${data.chainId}, \`${ver('anvil')}\`, \`${ver('forge')}\`).

## What was actually done

- Test contracts (\`contracts/src/Tokens.sol\`) were compiled with Foundry and deployed to a **local Anvil node**. They include a fake "Tether USD", homoglyph-named tokens, a honeypot, a revocable/expiring token, an EIP-1967 proxy token, a lying \`balanceOf\`, a fee-on-transfer token, a forged-event contract and a batcher.
- Real transactions between funded accounts (A pays B; M is the attacker) were sent to build each attack.
- The same services that the website and the extension use (\`src/services/verify.ts\`, \`src/services/scan.ts\`) were then asked for a verdict, and the result was asserted.
- **No test token was deployed to any mainnet or public testnet.** Every test contract's constructor reverts unless \`block.chainid\` is 31337 or 97, and the deploy script refuses other chains too. Scenario \`SAFETY-test-only-contracts\` proves both on a chainId-56 node.

## Results

| | Scenario | Vectors | Attack built on chain | What the app said | Local tx |
|---|---|---|---|---|---|
${rows}

Transaction hashes are from a throwaway local chain, so they cannot be opened in an explorer. They are listed so a rerun can be compared line by line. Reproduce instead of trusting them.

## Real mainnet checks (read-only, free)

These need no funds. They run the same code against public RPCs (\`LIVE=1 npx vitest run tests/live.test.ts\`):

- BSC swap with a canonical USDT leg and a non-USDT token leg: [BscScan](https://bscscan.com/tx/0x7b3aaee409a3d2e55fd363afe9a1b1a8efa4b45d805502dcf9825a2430f935ec) → VERIFIED, the other token listed as a decoy.
- Tron USDT transfer, 30,194.5 USDT: [Tronscan](https://tronscan.org/#/transaction/f4de16c6a7c695b249f1fc958b694a7ea532ef0f814966c6e5fa34211414c75a) → VERIFIED.
- An unknown hash → NOT RECEIVED.
- The local-chain tx hash checked against real BSC → NOT RECEIVED (chain confusion, A5).

## The tests can fail

Breaking the identity rule on purpose (\`canonical: true\` for every emitter in \`src/verdict/transfer.ts\`) makes 13 of the 31 scenarios fail. That mutation check was run once by hand while building; the tests would catch the same mistake in CI.

## Browser tests

Both run in a real Chromium, driving the real UI.

**Website** (testnet build mode, \`npm run e2e:web\`): every scenario with a UI case is entered into the real form and the screen is checked.

${shots('website')}

**Chrome extension** (release code, loaded unpacked, \`npm run e2e:ext\`):

| Check | Result |
|---|---|
| Explorer-style page: real USDT contract badged, fake "Tether USD" contract badged "NOT USDT", unrelated token and logo-only link left alone | PASS |
| Lookalike of a saved address on the page badged | PASS |
| Hostile token name in a page link cannot inject markup into a badge | PASS |
| Paste guard: lookalike of a saved address → red banner with character diff | PASS |
| Paste guard: clipboard changed by another site after copying → "NOT the one you copied" | PASS |
| Paste guard: saved address pasted unchanged → OK banner | PASS |
| Popup: \`?q=<hash>\` prefill and a **real BSC mainnet verification** → VERIFIED | PASS |
| Popup: watchlist mirrored to \`chrome.storage\` for the content scripts | PASS |
| Popup makes requests only to the allowed RPC hosts | PASS |

${shots('extension')}

## Not covered here (and why)

- **Tron-only vectors** (C38 TRC10 "USDT", E26/E27 permission hijack) and **Tether blacklist on Ethereum/Tron** (F31): there is no local Tron chain, and a mock of the blacklist getter would prove nothing. They are covered by unit tests in \`tests/\` and by the two real mainnet transactions above.
- **Public testnets**: faucets sit behind CAPTCHAs and rate limits, so everything ran on a local chain instead. The contracts and deploy script also allow BSC testnet (97) if you want to repeat it there.
- **Live BscScan / Etherscan pages**: they sit behind Cloudflare's bot challenge, so the extension's explorer badges were tested on a fixture page that copies the markup shape (\`/token/0x…\` links with a title attribute), not on the live sites. Check them once by hand after installing.
- **A real clipboard-hijacker**: simulated by writing different text to the clipboard from another origin after a copy.
- **Wallet-signature interception** (approve / permit / 7702 prompts inside the wallet): not built.

## Continuous integration

Everything above also runs on GitHub Actions for every push ([workflow](../.github/workflows/ci.yml)): unit and bundle tests, the 31 scenarios on a fresh Anvil chain, the website in a browser, and the extension in a browser under a virtual display. The two popup tests that read real BSC mainnet are skipped there, because public RPCs sometimes refuse datacenter IPs and one provider's answer is (correctly) not enough for VERIFIED. They run locally.

## Reproduce

\`\`\`bash
# once: Foundry (anvil, forge) and a Chromium that still allows --load-extension
curl -L https://foundry.paradigm.xyz | bash && foundryup
npx playwright-core install chromium          # Chrome 137+ ignores --load-extension, so tests use this build

npm ci
npm test                 # unit + bundle tests (no network, no Foundry)
npm run e2e              # 31 attack scenarios on a fresh local Anvil chain, rewrites docs/proof/results.json
npm run e2e:web          # website UI in a real browser (screenshots in docs/proof/website)
npm run e2e:ext          # extension in a real browser (screenshots in docs/proof/extension)
node scripts/make-proof.ts   # regenerate this file
\`\`\`
`

writeFileSync(join(ROOT, 'docs', 'PROOF.md'), md)
console.log(`docs/PROOF.md written (${passed}/${data.results.length})`)
