# Flash Token Protector

[![ci](https://github.com/atharva-khewle/flash-token-protector/actions/workflows/ci.yml/badge.svg)](https://github.com/atharva-khewle/flash-token-protector/actions/workflows/ci.yml)

A read-only web app that answers three questions for people who send or receive USDT, mostly around Binance on **BNB Smart Chain (BEP20)**. Ethereum and Tron are supported too.

1. **Verify tx**: the buyer says "I sent you 5,000 USDT, here is the hash". Is it real, final, sent to *my* address, and actually USDT?
2. **Scan wallet**: does my history show fake USDT, zero-value transfers or lookalike addresses? Is someone poisoning me? Do I have risky approvals, or an EIP-7702 delegation I did not set?
3. **Check before sending**: is the address I'm about to withdraw to a lookalike of one I use?

It never holds keys, never asks for a signature and never connects a wallet. It only reads public chain data.

> It never says "safe". **VERIFIED** means one thing: canonical USDT reached your address in a final block, and two independent RPC providers agree on it. For deposits to Binance, the final truth is always your **Binance deposit history**.

## Use it

| | |
|---|---|
| **Website** | <https://flash-token-protector.pages.dev> *(Cloudflare Pages; link updated after deploy)* |
| **Chrome extension** | [Download the zip](https://github.com/atharva-khewle/flash-token-protector/releases/latest/download/flash-token-protector-extension.zip) → unzip → `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → pick the unzipped folder. Details and permissions: [`docs/EXTENSION.md`](docs/EXTENSION.md) |
| **Proof it works** | [`docs/PROOF.md`](docs/PROOF.md): 31 attack scenarios built with real transactions on a local chain, plus real-browser tests of the site and the extension. One command reruns them. |

Bookmark the real site. Clones of checker sites exist, and a clone that always says VERIFIED is itself an attack (F32d).

- [How it works](#how-it-works)
- [Attack vectors (Phase 1)](#attack-vectors)
- [Chained attacks](#chained-attacks)
- [Residual risk](#residual-risk)
- [Defense layers (Phase 2)](#defense-layers)
- [Limits](#limits)
- [Development](#development)
- Threat matrix: [`docs/THREAT_MATRIX.md`](docs/THREAT_MATRIX.md)
- Deploy: [`DEPLOY.md`](DEPLOY.md)

---

## How it works

```
input ──L0──> chain adapter (2+ RPCs) ──> normalized receipt ──> pure verdict rules ──> VERIFIED / FAKE / UNVERIFIED / NOT RECEIVED
                src/chains/*.ts                                   src/verdict/*.ts
```

- `src/registry/` holds the canonical USDT contract for each chain, with its decimals and where it was checked. **A token is USDT only if chain + contract address match.** Name, symbol, logo and price are never used for identity.
- `src/chains/` fetches data (viem for EVM, TronGrid HTTP for Tron). Each adapter exposes `getReceipt`, `getLogs`, `getCode`, `call` and `getFinality`.
- `src/verdict/` contains the rules. They are pure functions with no network calls, so every rule is unit-tested.
- `functions/api/explorer.ts` (Cloudflare) and `api/explorer.ts` (Vercel) wrap one thin proxy, `server/explorer.ts`. It exists only to keep an optional explorer API key server-side. Everything else runs in the browser against keyless public RPCs.

Canonical USDT used (all re-checked Oct 2026; see `src/registry/usdt.ts`):

| Chain | Contract | Decimals | Note |
|---|---|---|---|
| BSC (56) | `0x55d398326f99059fF775485246999027B3197955` | 18 | Binance-Peg BSC-USD. Tether does not issue natively on BSC. |
| Ethereum (1) | `0xdAC17F958D2ee523a2206206994597C13D831ec7` | 6 | Has `isBlackListed(address)` |
| Tron | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` | 6 | Has `isBlackListed(address)` (confirmed by a live call) |

The original build prompt seeded the Tron address as `TR7NHqjeKQxGTCi8q8ZY4p**x**L8otSzgjLj6t`. That string has 35 characters and fails the base58 checksum. The registry uses the value TronGrid returns for Tether USD, which passes the checksum (`tests/registry.test.ts`).

---

## Attack vectors

The attacker's goal: make the victim believe they received real USDT when they did not, or make them send real USDT to the attacker.

IDs keep the numbering of the build prompt (A1 … G35). Vectors added while trying to break the list start at 36. Severity: **Critical** = direct loss is likely, **High** = loss is plausible, **Medium** = it supports another attack.

Claims marked **(verify)** could not be confirmed from a primary source while writing this.

### A. Token identity

| ID | Name | Chains | How the attacker does it | What the victim sees | Why naive checks fail | Detection rule | Layer | Severity |
|---|---|---|---|---|---|---|---|---|
| A1 | Fake "Tether USD" token | All EVM, Tron | Deploys an ERC20/TRC20 named "Tether USD", symbol "USDT", and transfers it to the victim | Wallet shows "+5,000 USDT", sometimes with the Tether logo | Wallets and many explorers show name/symbol; anyone can choose them | Only `chain + contract` in the registry counts. Any other emitter is a decoy | L2 | Critical |
| A2 | Homoglyph / invisible name | All | Name or symbol uses Cyrillic `Ѕ`/`Т`, zero-width chars, RTL override, `USD₮`, `USDT.e`, `USDT0`, trailing spaces | Looks exactly like USDT, or sorts next to it | String comparison on the symbol is fooled, and so are people | Identity ignores names (L2). L6 maps names to an ASCII skeleton and reports non-ASCII, invisible and bidi characters. L0 rejects non-ASCII in hashes/addresses | L0, L2, L6 | High |
| A3 | Fake $1 price | EVM (DEX) | Seeds a tiny PancakeSwap/Uniswap pool of fake-USDT/USDT or fake-USDT/BNB, so price feeds show ~$1 | Wallet shows a dollar value next to the balance | "It has a price, so it's real" | Price is never an input to the verdict. Identity is the contract address only | L2 | High |
| A4 | Bridged / pegged / dead-bridge copy | BSC, ETH, L2s | Pays with a token that once had value (e.g. Multichain-era bridged USDT) or a different "USDT" peg on the same chain | A token called USDT, maybe with real history | It *was* real somewhere, so it looks legitimate | Not in the registry for this chain, so it is a decoy | L2 | High |
| A5 | Chain confusion | All | Sends on another chain, on a testnet (BSC testnet chainId 97) or a fork, then shares that hash | Explorer page of a "successful USDT transfer" | The same hash format exists on every EVM chain | The user chooses the chain. Ambiguous formats are refused (0x vs Tron). The hash must exist on that chain's mainnet RPCs, otherwise NOT RECEIVED. Explorer links come from the registry | L0, L1, L2 | High |
| A6 | Decimals confusion | BSC vs ETH/Tron | Relies on BSC USDT having 18 decimals while ETH/Tron have 6. A raw value of `5000000000` is 5,000 USDT on Tron but 0.000000005 USDT on BSC | "5000000000" in a raw explorer view or a script | Hardcoded 6 decimals, or the token's own `decimals()` | Registry decimals only, per chain | L2, L3 | High |
| A7 | Token name carries a lure | All | Name like "Claim reward at usdt-bonus.xyz" | A link/instructions in the wallet's token list, leading to a drainer site | Wallets render the name | L6 flags URLs and instruction words in name/symbol. Text is rendered as plain text, never as a link | L6, L8 | High |
| A36 | Tampered address in the request | All | Gives an "expected recipient" or destination with one character changed, or EIP-55 casing broken by an edit | Their own address, apparently | People check the first and last few characters | Mixed-case EVM input must pass EIP-55. Tron input must pass the base58check checksum. Otherwise refused | L0 | Medium |

### B. "Flash USDT" behaviours (appear, then vanish or cannot move)

| ID | Name | Chains | How | Victim sees | Why naive checks fail | Detection rule | Layer | Severity |
|---|---|---|---|---|---|---|---|---|
| B8 | Expiring / revocable balance | EVM, Tron | Custom token whose `balanceOf` depends on time, or the owner later burns, blacklists or pauses | Balance present today, gone or frozen later | A balance read at time T says nothing about T+1 | Not canonical, so already FAKE (L2). L6 explains it: `burn(address,uint256)`, `mint`, `pause`, blacklist selectors, `owner()`, current balance lower than the logged amount | L2, L6 | Critical |
| B9 | Honeypot | EVM, Tron | `transfer` reverts for everyone except the owner/whitelist | Balance shows; sending or selling fails | You only learn it when you try to move it | L6 simulates `transfer(random, 1)` from the holder with `eth_call`. A revert is flagged | L2, L6 | High |
| B10 | Upgradeable proxy | EVM | Harmless today, swapped for malicious logic after the victim relies on it | Normal-looking token | Code review of today's implementation is not enough | L6 reads EIP-1967 implementation/beacon slots, detects EIP-1167 minimal proxies and `upgradeTo` selectors | L2, L6 | Medium |
| B11 | Lying `balanceOf` / events with no balance | EVM, Tron | `balanceOf` returns a big number for everyone, or the contract emits `Transfer` without changing storage | Explorer token tab and wallet both show the amount | Both read what the contract says about itself | L6 calls `balanceOf(random fresh address)`. A non-zero answer means the balances are fiction. It also compares the holder's balance with the event amount | L2, L6 | Critical |
| B12 | Fee-on-transfer / rebasing | EVM | The token takes a fee or rebases, so the received amount differs from the event | Event says 1,000, balance grew by 950 | The parser sums event values | Canonical USDT has no fee today (verify before each release: Tether's contract has a fee switch set to 0). For decoys, L6 flags balance < logged amount | L3, L6 | Medium |
| B49 | Token that self-destructs or changes code | EVM | Token contract removed or replaced after the "payment" | Token disappears, history is odd | Old explorer pages still show the transfer | L6 reports "no code at this address now" | L6 | Medium |

### C. Transaction-level deception

| ID | Name | Chains | How | Victim sees | Why naive checks fail | Detection rule | Layer | Severity |
|---|---|---|---|---|---|---|---|---|
| C13 | Forged Transfer events | EVM, Tron | A non-USDT contract emits `Transfer(from = <exchange hot wallet>, to = victim, 10,000)` | Explorer token-transfer tab shows "From: Binance" | Explorers index any log with the Transfer topic | Only logs whose **emitting address** is the canonical contract are decoded. Every other Transfer-like log is listed under "Decoys found" with the reason | L2, L3 | Critical |
| C14 | Mixed tx | EVM, Tron | One tx moves 1 real USDT plus 4,999 fake USDT to the victim | "5,000 USDT received" | The parser adds up all Transfer events | Sum canonical logs only. Decoys that credit the target make the verdict at least UNVERIFIED. The expected-amount check then FAILs | L3, L4 | Critical |
| C15 | Reverted tx as proof | All | Sends a tx that reverts (status 0). Input data still decodes to `transfer(victim, 5000)` | Screenshot or decoded input showing the transfer | Decoding input data instead of reading the receipt | `status` must be success. Reverted = FAKE | L1 | High |
| C16 | Pending / replaced tx | EVM | Broadcasts with a low fee, shows the pending hash, then replaces it (same nonce) or lets it drop | "Pending" tx with the right amount | Pending looks like "on its way" | Pending or unknown = NOT RECEIVED | L1 | High |
| C17 | Not final / reorg | All | Shows a tx in a block that is not final yet, hoping for a reorg or minority fork | 1–2 confirmations | "It's in a block" | Must be ≤ `finalized` block (BSC fast finality, ETH finalized, Tron solidified). Otherwise UNVERIFIED. Fallback: 30 / 96 / 20 confirmations | L1 | Medium |
| C18 | Real tx, wrong context | All | Shows a real payment to someone else, an old payment, the same tx to several victims, or a smaller amount | A genuine explorer page | The tx *is* real, just not for you | Expected recipient (required for VERIFIED), expected amount, "deal started at" vs block time, and a local list of already-accepted hashes | L4 | Critical |
| C19 | In and out in the same tx | EVM | USDT goes to the victim and is pulled back (via a prior approval) inside the same tx | Incoming Transfer event | Looking at single events | Net canonical change for the target address per tx | L3 | High |
| C20 | Malformed / wrong-object hash | All | Shares a hash of the wrong length, a block hash, or an address | "Here's the hash" | A lookup that fails silently, or an explorer showing a block page | L0 validates length/format and refuses addresses. If no tx is found, the hash is checked as a block hash and reported | L0 | Medium |
| C37 | Payment via router / multicall | EVM | Pays through a contract, so `tx.to` is not the USDT contract | Real tx with an odd "to" | A checker that requires `tx.to == USDT` rejects it (or a scammer exploits a checker that trusts `tx.to`) | Decisions use logs only, never `tx.to` | L3 | Low |
| C38 | Native coin / TRC10 "USDT" | Tron, EVM | Sends TRX/BNB, or a TRC10 asset named "USDT" (TRC10 transfers emit no TRC20 log) | "USDT" in a wallet that lists TRC10 assets | Name-based checks | No canonical TRC20 log, so FAKE | L2 | High |
| C40 | Split view / minority fork | All | Gets the victim to look at a node or explorer following a minority chain | A tx that "exists" | One data source | Two independent RPCs must agree, plus finality | L1 | Medium |

### D. Address poisoning

| ID | Name | Chains | How | Victim sees | Why naive checks fail | Detection rule | Layer | Severity |
|---|---|---|---|---|---|---|---|---|
| D21 | Zero-value `transferFrom` from the victim | EVM, Tron | Calls `transferFrom(victim, lookalike, 0)`. Many tokens allow zero-amount transfers without allowance | A 0-value outgoing transfer "from me" to an address that looks like one I use | It really is in my history | Wallet scan: an outgoing zero-value transfer that I did not sign (tx sender ≠ me) | L5, L7 | High |
| D22 | Vanity dust | EVM, Tron | Sends tiny real or fake USDT from a vanity address matching the first/last 4–6 characters of an address the victim uses (including their Binance deposit address) | Small incoming transfer from a "familiar" address | Wallets truncate addresses to `0x1234…abcd` | Prefix/suffix match (≥3 each, ≥7 total) or edit distance ≤2 against watchlist + addresses the user really paid. Dust < 0.01 USDT reported. In Verify tx, net < 1 USDT = UNVERIFIED | L3, L5 | Critical |
| D23 | Poisoned address copied at withdrawal | All | Waits for the victim to copy the lookalike from history | Their "usual" address | Visual check of a truncated address | "Check before sending" tab: LOOKALIKE warning with a per-character diff. Watchlist. Reminder to use the Binance withdrawal whitelist | L5 | Critical |
| D41 | Weak lookalike (prefix only) | All | Matches only the first 4 characters, betting the victim checks only the start | Partially familiar address | — | **Not caught** by the lookalike rule (too many false positives). The send check still says "NEW address" | Residual | Medium |
| D42 | Poisoning with fake tokens | EVM, Tron | Same as D22 but with a fake-USDT transfer of a matching amount | "Payment" from a familiar address | Fake transfers don't need real funds | Wallet scan, when the indexer is available (TronGrid on Tron; explorer key on EVM) | L5, L6 | High |

### E. Approvals and account control (sending side)

| ID | Name | Chains | How | Victim sees | Why naive checks fail | Detection rule | Layer | Severity |
|---|---|---|---|---|---|---|---|---|
| E24 | Approval / permit phishing | EVM, Tron | Tricks the victim into `approve`/`increaseAllowance`, a `permit` signature, or Permit2 with an unlimited allowance | Nothing until the drain | The signature looked like a login | Wallet scan lists live USDT allowances (from Approval logs plus a current `allowance()` call). Unlimited = high | L7 | Critical |
| E25 | EIP-7702 delegation phishing | ETH, BSC | Gets the EOA to sign a 7702 authorization that delegates to a drainer contract. BSC enabled 7702 with the Pascal hardfork (verify) | Nothing, until funds move automatically | The address still "is an EOA" | `getCode(address)` starting with `0xef0100` = delegated, with the target shown | L7 | Critical |
| E26 | Leaked-seed "free wallet with USDT" bait | Tron, EVM | Posts a seed phrase for a wallet holding USDT. On Tron the owner permission was moved to the attacker's key. On EVM a sweeper bot takes any gas you send | "Free" USDT you can't move; you send TRX/BNB for fees and lose it | The balance is real | Tron: owner permission keys ≠ the account itself → high risk. EVM sweeper: residual (behavioural) | L7, residual | High |
| E27 | Tron energy scams / multi-sig hijack | Tron | Sells fake "energy" or adds itself to the account permissions | Account behaves normally until it doesn't | Permissions aren't shown in most wallets | Same permission check as E26 | L7 | High |
| E43 | Clipboard hijacker | All | Malware replaces a copied address | A different address in the paste | The user trusts copy-paste | The send check says NEW or LOOKALIKE. Device compromise itself is residual | L5, residual | Critical |
| E44 | Approvals on other tokens / NFTs | EVM | `setApprovalForAll`, approvals on other tokens | — | — | **Not covered**: the scan lists canonical-USDT approvals only. Use a dedicated revoke tool | Residual | Medium |

### F. Off-chain and infrastructure

| ID | Name | Chains | How | Victim sees | Why naive checks fail | Detection rule | Layer | Severity |
|---|---|---|---|---|---|---|---|---|
| F28 | Edited screenshots, fake receipts, fake "Binance" messages | — | Photoshop, fake PDF, spoofed email/SMS/support chat | A convincing "payment confirmed" | People trust visuals and brands | The tool only accepts a hash and reads the chain. Binance deposit history is named as the final truth | L1, residual | Critical |
| F29 | Fake explorer site | All | Sends a link to a bscscan lookalike showing a fake tx | A real-looking explorer page | The domain is one letter off | Explorer links are built from the registry, never from input. The user pastes a hash, not a link | L0, L8 | High |
| F30 | Lying / hijacked RPC | All | A malicious RPC (or a hijacked public one) returns a fake receipt | — | Single source of truth | Receipts from ≥2 independent providers must match byte-for-byte (status, block, block hash, logs). Disagreement or a single answer = UNVERIFIED | L1 | High |
| F31 | "Dirty" real USDT | ETH, Tron | Real USDT from a hacked, sanctioned or Tether-blacklisted source | Real money arrives | It *is* real USDT | On ETH and Tron, `isBlackListed(sender)` → UNVERIFIED with a warning. BSC-USD has no getter: reported as not checked. No free public sanctions API is used (none identified that is reliable and CORS-friendly) | L5 | High |
| F32a | XSS via token names | — | Token name `<img onerror=…>` | — | Rendering chain strings as HTML | All chain strings are text nodes. No `innerHTML` in `src/` (test-enforced). Strict CSP | L8 | High |
| F32b | Leaked API keys | — | Reads keys from the JS bundle | — | `VITE_` env vars are public | No keys in the frontend. The explorer key lives in the serverless function only (test-enforced) | L8 | Medium |
| F32c | Cache poisoning of verdicts | — | Gets a CDN to cache a crafted response | — | Cached API responses | Verdicts are computed in the browser. The proxy sends `Cache-Control: no-store`, validates input, refuses cross-origin calls and rate-limits | L8 | Medium |
| F32d | Phishing clones of this site | — | Hosts a copy that always says VERIFIED | A familiar UI | Users don't check domains | The current domain is shown prominently with a "bookmark it" prompt. Otherwise residual | L8, residual | High |
| F32e | Dependency supply chain | — | Compromises an npm package | — | Floating versions | Exact version pins, a lockfile, one runtime dependency (`viem`), no third-party scripts or analytics (test-enforced). `npm audit` clean at release | L8 | High |
| F45 | Screenshot of *this tool* saying VERIFIED | — | Runs the tool on a different tx, or edits the screenshot | "Your own tool says it's fine" | Trusting someone else's run | Residual: run it yourself, with your own address | Residual | High |
| F46 | Time pressure / social engineering | — | "Release now or the deal is off" | — | — | Residual. The UI says: pending/unfinalized = not received | Residual | High |
| F47 | Network MITM / DNS hijack | — | Intercepts RPC traffic on hostile Wi-Fi | — | — | HTTPS to every provider, plus the two-provider agreement (F30) | L1, L8 | Medium |

### G. Other chains

| ID | Name | Chains | How | Detection rule | Layer | Severity |
|---|---|---|---|---|---|---|
| G33 | Solana: fake mint with copied metadata; Token-2022 extensions (permanent delegate pulls tokens back, transfer hook, freeze authority, non-transferable, transfer fee); owner vs token-account confusion; zero-value poisoning | Solana | **Not supported yet.** Planned: canonical mint registry, reject Token-2022 mints with permanent delegate / freeze authority on non-canonical mints, resolve the token-account owner, `finalized` commitment | Residual (future) | — |
| G34 | Tron: fake TRC20 USDT; unconfirmed vs solidified; permission hijack | Tron | Registry identity, solidified block as finality, owner-permission check | L1, L2, L7 | High |
| G35 | Any new chain | — | Policy: before adding a chain, list its specific tricks here and add a registry entry with a primary source | Registry | — |

**Vector count:** A 8 · B 6 · C 11 · D 5 · E 6 · F 12 · G 3 = **51** (35 from the prompt, with F32 split into 5 sub-vectors, plus 12 new ones).

---

## Chained attacks

Each chain is caught at the first layer that breaks it. A chain is only as strong as its weakest link *for the attacker*.

1. **Fake token + lookalike sender + fake explorer link + time pressure** (A1 + D22 + F29 + F46). Caught at L2: the emitter is not canonical, so FAKE whatever the link or sender looks like. The user pastes the hash, not the link.
2. **Tiny real payment + big fake payment in one tx + screenshot of the token tab** (C14 + A1 + F28). L3 counts canonical logs only. The decoy that credits you turns the verdict into UNVERIFIED. With an expected amount it is FAKE.
3. **Real old payment + edited timestamp + "same buyer, second order"** (C18 + F28). Caught by L4 "deal started at" and the local accepted-hash list.
4. **Dust poisoning → user withdraws from Binance to the lookalike** (D22 + D23). Scan wallet flags the lookalike. The send check shows the per-character diff. Main mitigation: the Binance withdrawal whitelist.
5. **"Free wallet with USDT" seed + "send 50 TRX for fees"** (E26 + E27). Scan wallet reports that the owner permission belongs to someone else.
6. **Honeypot fake USDT with a $1 pool + "swap it yourself"** (A3 + B9 + A7). L2 = FAKE. L6 shows the honeypot simulation result. The name-URL lure is flagged.
7. **Real but unfinalized tx + quick release + reorg/replacement** (C16/C17 + F46). L1 finality: UNVERIFIED until finalized.
8. **Clone of this site that always says VERIFIED + link sent by the "buyer"** (F32d + F45). Residual. Mitigation: bookmark the real domain and never use a checker link sent by the counterparty.
9. **Lying RPC + forged receipt for a hash that does not exist** (F30 + C13). Two independent providers must return identical receipts.

---

## Residual risk

What this tool **cannot** detect, and what you must do yourself:

- **Fiat-side fraud on P2P**: chargebacks, stolen bank accounts, triangulation fraud. The USDT leg can be perfectly real. Follow Binance P2P rules and only release after the platform confirms.
- **A compromised device**: clipboard hijackers, malicious browser extensions, remote access. If your device is compromised, every screen (including this one) can lie.
- **Clones of this site** (F32d) and **someone else's screenshot of it** (F45). Run it yourself, on a domain you bookmarked.
- **Weak lookalikes** (D41) that only match a few leading characters. Always compare the full address with the original source.
- **Approvals on other tokens / NFTs** (E44) and **EVM sweeper bots** (E26 on EVM).
- **Wallet-history depth**: keyless public RPCs serve only recent logs (about an hour of BSC blocks). Older poisoning, and fake tokens on BSC/ETH, need an indexer (see [Limits](#limits)).
- **Dirty-funds screening on BSC** (no on-chain blacklist getter) and **sanctions screening** (no reliable free source is used).
- **Solana and other chains** are not supported yet.
- **Registry correctness**: if the canonical address list is wrong, everything downstream is wrong. Re-verify `src/registry/usdt.ts` against Tether and the explorers before each release.

---

## Defense layers

A verdict of **VERIFIED** needs every required check to pass. Any hard fail = **FAKE**. A pending or unknown tx = **NOT RECEIVED**. Anything the tool cannot check = **UNVERIFIED**, never "safe". If RPC providers disagree, the result is UNVERIFIED, never FAKE or VERIFIED.

| Layer | What it does | Code |
|---|---|---|
| **L0 Input** | Strips zero-width/bidi/space characters and reports how many. Rejects non-ASCII. Validates hash length and address format. Rejects mixed-case EVM addresses with a bad EIP-55 checksum, and Tron addresses with a bad base58 checksum. Refuses an EVM-style hash on Tron and the reverse. Detects block hashes | `src/lib/input.ts`, `src/lib/tron.ts` |
| **L1 Chain truth** | Asks every configured provider for the receipt. Needs ≥2 identical answers (status, block, block hash, logs). Status must be success. Finality: ≤ `finalized` block (EVM) or the solidified block (Tron), with a confirmation fallback | `src/verdict/verifyTx.ts`, `src/verdict/finality.ts` |
| **L2 Token identity** | Canonical USDT = chain + contract in `src/registry/usdt.ts`. Decimals come from the registry | `src/registry/`, `src/verdict/transfer.ts` |
| **L3 Transfer semantics** | Decodes only well-formed Transfer logs from the canonical emitter. Computes the **net** change per address. Lists every other Transfer log as a decoy with a reason. Flags decoys that credit you and dust amounts | `src/verdict/transfer.ts` |
| **L4 Context binding** | Expected recipient (required for VERIFIED), expected amount, "deal started at" vs block time, and reuse of an already-accepted hash (localStorage) | `src/verdict/verifyTx.ts` |
| **L5 Counterparty & address risk** | Lookalike check against the watchlist and addresses you actually paid. Zero-value and dust patterns. Tether `isBlackListed` where the contract has it (ETH, Tron) | `src/lib/lookalike.ts`, `src/verdict/wallet.ts` |
| **L6 Unknown-token risk** | For decoys and fake tokens: proxy slots, EIP-1167, owner/mint/burn/pause/blacklist/upgrade selectors, a lying `balanceOf`, event vs balance, honeypot `eth_call` simulation, homoglyphs/URLs in the name. Verified-source status is not checked (it would need an explorer API) | `src/verdict/tokenRisk.ts`, `src/services/probe.ts` |
| **L7 Account state** | EIP-7702 delegation (`0xef0100‖address`), live USDT allowances, Tron owner-permission takeover, poisoning attempts in recent history | `src/verdict/wallet.ts`, `src/services/scan.ts` |
| **L8 App hardening** | Text-only rendering, strict CSP (`script-src 'self'`, `connect-src` = the RPC allowlist), no secrets in the bundle, exact pins + lockfile, no analytics or third-party scripts, the domain shown prominently, `no-store` proxy | `public/_headers`, `vercel.json`, `src/ui/dom.ts` |

Full mapping, vector → layer → rule → test: [`docs/THREAT_MATRIX.md`](docs/THREAT_MATRIX.md).

---

## Limits

- **RPC providers** (keyless, CORS-enabled, checked Oct 2026):
  - BSC: `bsc-dataseed.bnbchain.org`, `1rpc.io/bnb`, `bsc-rpc.publicnode.com`
  - Ethereum: `ethereum-rpc.publicnode.com`, `1rpc.io/eth`, `eth.drpc.org`
  - Tron: `api.trongrid.io`, `tron-rpc.publicnode.com`

  Some refuse old receipts (PublicNode BSC answers "archive requests require a personal token"). That provider is then skipped, and the remaining two must still agree.
- **Wallet scan depth on BSC/ETH**: address-filtered `eth_getLogs` works keylessly only for recent blocks. On BSC with ~0.45 s blocks that is under ~10,000 blocks (≈1 hour). The scan walks back in 5,000-block chunks until a provider refuses, and the page says exactly which range it covered.
- **Fake tokens sent to a BSC/ETH wallet** can't be listed without an indexer, because public RPCs refuse "any token, to this address" log queries. Set `EXPLORER_API_KEY` (Etherscan V2) on the deployment to enable it. As of Oct 2026, Etherscan's free tier covers Ethereum but **not BSC** ("Free API access is not supported for this chain"). BSC needs a paid plan. Ask before adding one.
- **Tron** history comes from TronGrid's keyless index (last 200 confirmed TRC20 events), so fake TRC20 tokens *are* listed.
- **Approvals**: only spenders seen in the scanned window are checked.

---

## Development

```bash
npm ci
npm run dev              # http://localhost:5173 (the explorer proxy is not available in plain vite dev)
npm test                 # 125+ unit and bundle tests: verdict rules, input, registry, L6, wallet, extension logic, release-bundle hygiene
npm run build            # typecheck + production build into dist/
npm run ext:build        # extension -> extension/dist and extension/flash-token-protector-extension.zip
```

End-to-end (needs [Foundry](https://getfoundry.sh) and a Chromium; details in [`docs/PROOF.md`](docs/PROOF.md#reproduce)):

```bash
npm run e2e              # 31 attack scenarios against a fresh local Anvil chain
npm run e2e:web          # the website in a real browser, every scenario entered into the real form
npm run e2e:ext          # the extension loaded unpacked in a real browser
LIVE=1 npx vitest run tests/live.test.ts   # optional: real BSC / Tron mainnet reads
```

**Test mode.** `npm run dev:test` / `npm run build:test` build the site with a local test chain and a mock USDT (chainId 31337) so you can try every attack by hand: start `anvil --hardfork prague`, run `npm run deploy:local`, then `npm run dev:test`. The test chain only exists in `--mode testnet` builds. A test checks that the production site and the release extension contain none of it.

**Test contracts** (`contracts/`) refuse to deploy anywhere except chainId 31337 (local) and 97 (BSC testnet): in the deploy script and in every constructor. Do not remove that.

Fixtures in `tests/fixtures/` are real mainnet data:

- `bsc-real-swap-receipt.json`: [BscScan](https://bscscan.com/tx/0x7b3aaee409a3d2e55fd363afe9a1b1a8efa4b45d805502dcf9825a2430f935ec), a swap with a canonical USDT leg and a non-USDT token leg
- `tron-real-usdt-info.json`: [Tronscan](https://tronscan.org/#/transaction/f4de16c6a7c695b249f1fc958b694a7ea532ef0f814966c6e5fa34211414c75a), 30,194.5 USDT

Unit-test receipts are **synthetic** (`tests/helpers.ts`, obviously fake addresses). The end-to-end scenarios use real transactions on a local chain instead. No real fake-token or poisoning mainnet tx is included, because none could be confirmed from a primary source while writing this.

## Hard rules this project follows

- Defensive only. No code that creates, sends or sells fake tokens, poisons addresses or drains wallets. Attack vectors are described in words and caught in tests.
- Read-only. No private keys, seed phrases, wallet connection or signing.
- No invented addresses, hashes, incidents or numbers. Unconfirmed claims are marked **(verify)**.
- No paid services, database or tracking without asking first.

## License

MIT
