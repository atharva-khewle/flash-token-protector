# Proof of work

Nothing here asks you to trust a screenshot. Every row below is produced by code in this repository, and you can rerun all of it on your own machine with the commands in [Reproduce](#reproduce).

**Result: 31 / 31 attack scenarios pass on a real EVM chain** (Anvil, chainId 31337, `anvil Version: 1.8.3`, `forge Version: 1.8.3`).

## What was actually done

- Test contracts (`contracts/src/Tokens.sol`) were compiled with Foundry and deployed to a **local Anvil node**. They include a fake "Tether USD", homoglyph-named tokens, a honeypot, a revocable/expiring token, an EIP-1967 proxy token, a lying `balanceOf`, a fee-on-transfer token, a forged-event contract and a batcher.
- Real transactions between funded accounts (A pays B; M is the attacker) were sent to build each attack.
- The same services that the website and the extension use (`src/services/verify.ts`, `src/services/scan.ts`) were then asked for a verdict, and the result was asserted.
- **No test token was deployed to any mainnet or public testnet.** Every test contract's constructor reverts unless `block.chainid` is 31337 or 97, and the deploy script refuses other chains too. Scenario `SAFETY-test-only-contracts` proves both on a chainId-56 node.

## Results

| | Scenario | Vectors | Attack built on chain | What the app said | Local tx |
|---|---|---|---|---|---|
| PASS | `baseline` | happy path | Real payment A to B, full context, finalized | VERIFIED; net 5,000 USDT | `0xa985c6f3…3b3f` |
| PASS | `C17-not-final` | C17 | Included in a block but not finalized, then finalized | UNVERIFIED (L1.finality warn) right after; VERIFIED once finalized | `0xc7d60b18…4b0f` |
| PASS | `A1-fake-tether` | A1, A3 | Fake token named "Tether USD"/"USDT" sent A to B | FAKE; L2.identity fail; L6: impersonates-usdt, mint | `0x86bd3d8f…686a` |
| PASS | `A2-homoglyph` | A2 | Symbol uses Cyrillic letters (looks like USDT) | FAKE; L2.identity fail; L6: impersonates-usdt, mint | `0x7d091139…cd69` |
| PASS | `A2-tugrik` | A2 | Symbol "USD₮" | FAKE; L2.identity fail; L6: impersonates-usdt, mint | `0xf74702dd…10c0` |
| PASS | `A4-bridged` | A4 | Lookalike "USDT.e" token on the same chain | FAKE; L2.identity fail; L6: impersonates-usdt, mint | `0x909a2a27…24ff` |
| PASS | `A6-six-decimals` | A6 | Fake USDT with 6 decimals, 5,000 units | FAKE; L2.identity fail; L6: impersonates-usdt, mint | `0xc4ec05af…f53f` |
| PASS | `A7-url-name` | A7 | Token name carries a link and a lure | FAKE; L2.identity fail; L6: name-url, name-instructions, impersonates-usdt, mint | `0xe9b2e6ac…795c` |
| PASS | `A6-canonical-raw` | A6, D22 | Canonical USDT, raw value 5,000,000,000 on an 18-decimal chain is dust | UNVERIFIED; net 0.000000005 (dust), not 5,000 | `0x0dd87714…6294` |
| PASS | `A5-chain-confusion` | A5 | The local tx hash checked against real BSC mainnet | NOT RECEIVED: a tx on another chain proves nothing on BSC | `0xc55dcd18…0a1f` |
| PASS | `B8-revocable` | B8 | Token the owner can burn / pause / blacklist, with expiring balance | FAKE; L6: burn-from, pause, blacklist, owner. After 2h the balance is 0 while the event said 5,000: event-without-balance | `0xc8376c32…592e` |
| PASS | `B9-honeypot` | B9 | Honeypot: B holds a balance but cannot transfer it | FAKE; L6: honeypot (simulated transfer by B reverts) | `0xa9ad51fd…9193` |
| PASS | `B10-proxy` | B10 | Token behind an EIP-1967 proxy | FAKE; L6: proxy (EIP-1967 implementation slot set) | `0x876459b7…009b` |
| PASS | `B11-liar` | B11 | balanceOf lies; transfer only emits an event | FAKE; L6: fake-balance (a random fresh address "has" 1,000,000) | `0xe08ea1fb…104b` |
| PASS | `B12-fee-token` | B12 | Fee-on-transfer token: event says 1,000, balance grows by 950 | FAKE; L6: event-without-balance (950 held vs 1,000 logged) | `0xbea87a6e…11a2` |
| PASS | `C13-forged-event` | C13 | Forger contract emits Transfer(A, B, 10,000) and moves nothing | FAKE; decoy listed: "Emitted by 0x..., not the canonical USDT contract" | `0x8bdd8627…7ac2` |
| PASS | `C14-mixed` | C14 | One tx: 1 real USDT + 4,999 fake USDT to B | FAKE with expected 5,000 (net is 1); UNVERIFIED without expected amount (decoy credits you) | `0x2749d4d2…2a2e` |
| PASS | `C15-reverted` | C15 | Reverted transfer(B, 5,000) shown as proof | FAKE; L1.status fail (reverted) | `0x461b024b…5e8b` |
| PASS | `C16-pending` | C16 | Pending tx shown as proof, then dropped | NOT RECEIVED while pending; NOT RECEIVED after it is dropped | `0xf202288a…0f53` |
| PASS | `C18-wrong-context` | C18 | Real payment to someone else; old payment reused; same hash twice | wrong recipient: FAKE; old payment vs deal start: FAKE; reused hash: UNVERIFIED; no recipient given: UNVERIFIED | `0x23253d83…b884` `0x09e703e2…b481` `0x5b876f96…e114` |
| PASS | `C19-in-and-out` | C19, E24 | USDT credited to B and pulled back in the same tx | FAKE; net 0 (100 in, 100 out in one tx) | `0x04a64589…519a` |
| PASS | `C20-block-hash` | C20 | A block hash given instead of a tx hash | FAKE; "This is a block hash, not a transaction hash" | `0xd0937b97…555d` |
| PASS | `C37-router` | C37 | Payment routed through a contract (tx.to is not USDT) | VERIFIED; decisions use logs, never tx.to | `0x51d73fa8…855a` |
| PASS | `D21-zero-value` | D21, D23 | Zero-value transferFrom(B, lookalike, 0) planted by the attacker | scan: zero-value poisoning from 0xf39fd6ff..., imitates A (first/last 6/9 chars). Send check: LOOKALIKE | `0x4fc557ec…d6da` |
| PASS | `D22-vanity-dust` | D22, D23 | Dust of real USDT from a vanity lookalike | scan: lookalike dust flagged. Verify: UNVERIFIED (0.001 USDT is dust) | `0x8bdb6d90…ef9b` |
| PASS | `D41-weak-lookalike` | D41 | Known limit: only the first 4 characters match | NOT flagged (documented residual risk D41); the send check still calls it a NEW address | `0x4e7d88c7…4ae8` |
| PASS | `D42-fake-token-poison` | D42, A1 | Fake-USDT dust from a vanity lookalike, scanned | scan: fake "Tether USD" listed as FAKE USDT; its sender flagged as a lookalike of A | `0x2c809ef5…b8d4` |
| PASS | `E24-approvals` | E24 | Unlimited and bounded USDT approvals, then revoke | scan: unlimited approval to attacker = high; 50 USDT = medium; after revoke it is gone | `0x1719d10c…3f4a` `0x50dc96cc…c089` |
| PASS | `E25-7702` | E25 | EOA delegated to a contract with an EIP-7702 authorization | scan: delegated to 0x05b4cb12... | `0xe81d51fd…9932` |
| PASS | `F30-lying-rpc` | F30, C40 | One RPC provider lies about the receipt; another is down | liar + honest: UNVERIFIED (providers disagree). honest + dead: UNVERIFIED (one answer). honest + honest: VERIFIED | `0x61ee2991…615d` |
| PASS | `SAFETY-test-only-contracts` | hard rule | Test contracts and the deploy script refuse any non-test chain | chainId 56: script refuses; raw deploy of the bytecode reverts with "TEST ONLY: refusing to deploy on this chain" | - |

Transaction hashes are from a throwaway local chain, so they cannot be opened in an explorer. They are listed so a rerun can be compared line by line. Reproduce instead of trusting them.

## Real mainnet checks (read-only, free)

These need no funds. They run the same code against public RPCs (`LIVE=1 npx vitest run tests/live.test.ts`):

- BSC swap with a canonical USDT leg and a non-USDT token leg: [BscScan](https://bscscan.com/tx/0x7b3aaee409a3d2e55fd363afe9a1b1a8efa4b45d805502dcf9825a2430f935ec) → VERIFIED, the other token listed as a decoy.
- Tron USDT transfer, 30,194.5 USDT: [Tronscan](https://tronscan.org/#/transaction/f4de16c6a7c695b249f1fc958b694a7ea532ef0f814966c6e5fa34211414c75a) → VERIFIED.
- An unknown hash → NOT RECEIVED.
- The local-chain tx hash checked against real BSC → NOT RECEIVED (chain confusion, A5).

## The tests can fail

Breaking the identity rule on purpose (`canonical: true` for every emitter in `src/verdict/transfer.ts`) makes 13 of the 31 scenarios fail. That mutation check was run once by hand while building; the tests would catch the same mistake in CI.

## Browser tests

Both run in a real Chromium, driving the real UI.

**Website** (testnet build mode, `npm run e2e:web`): every scenario with a UI case is entered into the real form and the screen is checked.

- [`A1-fake-tether.png`](proof/website/A1-fake-tether.png)
- [`B9-honeypot.png`](proof/website/B9-honeypot.png)
- [`C14-mixed.png`](proof/website/C14-mixed.png)
- [`C20-block-hash.png`](proof/website/C20-block-hash.png)
- [`D21-zero-value.png`](proof/website/D21-zero-value.png)
- [`E25-7702.png`](proof/website/E25-7702.png)
- [`analyze-fake.png`](proof/website/analyze-fake.png)
- [`baseline.png`](proof/website/baseline.png)
- [`help.png`](proof/website/help.png)
- [`send-lookalike.png`](proof/website/send-lookalike.png)
- [`token-fake.png`](proof/website/token-fake.png)
- [`wallet-detail.png`](proof/website/wallet-detail.png)
- [`wallet-live-fake.png`](proof/website/wallet-live-fake.png)

**Chrome extension** (release code, loaded unpacked, `npm run e2e:ext`):

| Check | Result |
|---|---|
| Explorer-style page: real USDT contract badged, fake "Tether USD" contract badged "NOT USDT", unrelated token and logo-only link left alone | PASS |
| Lookalike of a saved address on the page badged | PASS |
| Hostile token name in a page link cannot inject markup into a badge | PASS |
| Paste guard: lookalike of a saved address → red banner with character diff | PASS |
| Paste guard: clipboard changed by another site after copying → "NOT the one you copied" | PASS |
| Paste guard: saved address pasted unchanged → OK banner | PASS |
| Popup: `?q=<hash>` prefill and a **real BSC mainnet verification** → VERIFIED | PASS |
| Popup: watchlist mirrored to `chrome.storage` for the content scripts | PASS |
| Popup makes requests only to the allowed RPC hosts | PASS |

- [`explorer-badges.png`](proof/extension/explorer-badges.png)
- [`paste-lookalike.png`](proof/extension/paste-lookalike.png)
- [`paste-ok.png`](proof/extension/paste-ok.png)
- [`paste-swapped.png`](proof/extension/paste-swapped.png)
- [`popup-verified-real-bsc-tx.png`](proof/extension/popup-verified-real-bsc-tx.png)

## Not covered here (and why)

- **Tron-only vectors** (C38 TRC10 "USDT", E26/E27 permission hijack) and **Tether blacklist on Ethereum/Tron** (F31): there is no local Tron chain, and a mock of the blacklist getter would prove nothing. They are covered by unit tests in `tests/` and by the two real mainnet transactions above.
- **Public testnets**: faucets sit behind CAPTCHAs and rate limits, so everything ran on a local chain instead. The contracts and deploy script also allow BSC testnet (97) if you want to repeat it there.
- **Live BscScan / Etherscan pages**: they sit behind Cloudflare's bot challenge, so the extension's explorer badges were tested on a fixture page that copies the markup shape (`/token/0x…` links with a title attribute), not on the live sites. Check them once by hand after installing.
- **A real clipboard-hijacker**: simulated by writing different text to the clipboard from another origin after a copy.
- **Wallet-signature interception** (approve / permit / 7702 prompts inside the wallet): not built.

## Continuous integration

Everything above also runs on GitHub Actions for every push ([workflow](../.github/workflows/ci.yml)): unit and bundle tests, the 31 scenarios on a fresh Anvil chain, the website in a browser, and the extension in a browser under a virtual display. The two popup tests that read real BSC mainnet are skipped there, because public RPCs sometimes refuse datacenter IPs and one provider's answer is (correctly) not enough for VERIFIED. They run locally.

## Reproduce

```bash
# once: Foundry (anvil, forge) and a Chromium that still allows --load-extension
curl -L https://foundry.paradigm.xyz | bash && foundryup
npx playwright-core install chromium          # Chrome 137+ ignores --load-extension, so tests use this build

npm ci
npm test                 # unit + bundle tests (no network, no Foundry)
npm run e2e              # 31 attack scenarios on a fresh local Anvil chain, rewrites docs/proof/results.json
npm run e2e:web          # website UI in a real browser (screenshots in docs/proof/website)
npm run e2e:ext          # extension in a real browser (screenshots in docs/proof/extension)
node scripts/make-proof.ts   # regenerate this file
```
