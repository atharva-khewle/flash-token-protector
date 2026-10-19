# Threat matrix

One row per vector from the README's [attack-vector list](../README.md#attack-vectors). Each row gives the layer(s) that catch the vector, the exact rule, and the test that proves it. Test names are the `it(...)` titles, prefixed with their file under `tests/`.

Rows marked **Residual** are not (fully) detectable by this tool. They are listed in the README's [Residual risk](../README.md#residual-risk) section.

Check IDs (`L1.consensus` etc.) are the `id` fields produced by `src/verdict/verifyTx.ts`.

## A. Token identity

| ID | Layer(s) | Rule | Test(s) |
|---|---|---|---|
| A1 | L2, L6 | `L2.identity`: a log counts as USDT only if `log.address == USDT[chain].hex`. No canonical log → fail → FAKE. L6 `impersonates-usdt` explains it | `verifyTx`: "A1 fake token named Tether USD: no canonical log -> FAKE"; `tokenRisk`: "A1 named Tether USD / USDT -> impersonates-usdt"; `wallet`: "A1 fake USDT received is separated from real USDT totals" |
| A2 | L0, L2, L6 | L0 rejects non-ASCII in hashes and addresses. L2 ignores names. L6 `analyzeName` reports `non-ascii`, `invisible`, `bidi` and maps the name to a skeleton for `usdt-lookalike` | `input`: "A2 rejects homoglyph characters inside a hash", "A2 rejects Cyrillic lookalike letters in a Tron address"; `tokenRisk`: "Cyrillic letters map to the ASCII skeleton USDT", "USD₮, zero-width and RTL tricks are reported", "USDT.e / USDT0 / trailing spaces still read as USDT lookalikes" |
| A3 | L2 | Price is not an input to any rule. Identity = contract address | `verifyTx`: "A3 fake token with a self-funded $1 pool: price never enters the verdict" |
| A4 | L2 | Same as A1: any non-registry contract is a decoy | `verifyTx`: "A4 bridged/pegged lookalike contract on the same chain -> FAKE (identity is address only)" |
| A5 | L0, L1, L2 | L0 refuses a 0x hash on Tron and a bare 64-hex hash on EVM. L1: unknown on this chain's mainnet RPCs → NOT RECEIVED. L2 uses the per-chain registry entry | `input`: "A5 refuses ambiguous chain: Tron-style hash on BSC, 0x hash on Tron"; `verifyTx`: "A5 chain confusion: tx unknown on the chosen chain -> NOT RECEIVED", "A5 Ethereum USDT address appearing on BSC is not BSC USDT" |
| A6 | L2, L3 | `formatUnits(value, USDT[chain].decimals)`. The token's own `decimals()` is never used. Net < 1 USDT → `L3.net` warn | `verifyTx`: "A6 decimals: BSC uses 18, Ethereum and Tron use 6"; `input`: "parses decimals exactly"; `registry`: "decimals: BSC 18, Ethereum 6, Tron 6" |
| A7 | L6, L8 | `name-url` / `name-instructions` findings. Names render as text only | `tokenRisk`: "A7 URL / instructions in token name"; `security`: "a token name with HTML is rendered as text, never parsed" |
| A36 | L0 | Mixed-case EVM address must pass EIP-55. Tron address must pass base58check | `input`: "A36 rejects an EIP-55 checksum mismatch (one character case-flipped)", "Tron base58check round-trip, and a one-char typo fails the checksum" |

## B. Flash-USDT behaviours

| ID | Layer(s) | Rule | Test(s) |
|---|---|---|---|
| B8 | L2, L6 | Non-canonical → FAKE. L6 flags `burn(address,uint256)`, `mint`, `pause()`, blacklist selectors, and `holderBalance < loggedValue` | `tokenRisk`: "B8 expiring / revocable balance: burn-from, mint, pause, blacklist are flagged", "B8 event claims more than the holder has now -> event-without-balance" |
| B9 | L2, L6 | `eth_call transfer(random, 1)` from the holder. Revert → `honeypot` | `tokenRisk`: "B9 honeypot: simulated transfer by holder reverts" |
| B10 | L2, L6 | Non-zero EIP-1967 implementation/beacon slot, EIP-1167 bytecode, or `upgradeTo` selectors → `proxy` / `upgradeable` | `tokenRisk`: "B10 upgradeable proxy via EIP-1967 slot", "B10 minimal proxy (EIP-1167) detected", "EIP-1967 implementation slot constant is correct" |
| B11 | L2, L6 | `balanceOf(fresh random address) > 0` → `fake-balance`. Event amount > holder balance → `event-without-balance` | `tokenRisk`: "B11 balanceOf lies: random fresh address has a balance" |
| B12 | L3, L6 | Canonical: the net amount comes from events (canonical USDT fee is 0; verify each release). Decoys: balance < logged → flagged | `tokenRisk`: "B12 fee-on-transfer / rebasing: credited less than the event said" |
| B49 | L6 | `getCode(token) == 0x` → `no-code` | `tokenRisk`: "B49 token code gone (self-destructed) -> no-code" |

## C. Transaction-level deception

| ID | Layer(s) | Rule | Test(s) |
|---|---|---|---|
| C13 | L2, L3 | Only canonical-emitter logs are decoded. Others go to `decoys[]` with a reason | `verifyTx`: "C13 Transfer event \"from Binance\" emitted by a non-USDT contract -> FAKE" (synthetic sender) |
| C14 | L3, L4 | Sum canonical logs only. A decoy crediting the target → `L3.decoys` warn. `L4.amount` compares the net amount with the expected amount | `verifyTx`: "C14 mixed tx: tiny real USDT + big fake: amount is the real part only, decoy warned", "C14 mixed tx without expected amount is still not VERIFIED (decoy credits you)"; real fixture: "BSC real swap: canonical USDT credited, other token leg listed as decoy, not added" |
| C15 | L1 | `receipt.status != success` → `L1.status` fail → FAKE | `verifyTx`: "C15 reverted tx whose input says transfer(victim, 5000) -> FAKE" |
| C16 | L1 | Every answering provider says pending/notfound → `L1.found` fail (notReceived) → NOT RECEIVED | `verifyTx`: "C16 pending tx shown as proof -> NOT RECEIVED" |
| C17 | L1 | `block ≤ finalized` (EVM `finalized` tag, Tron solidified), else warn. Fallback confirmations: BSC 30, ETH 96, Tron 20 | `verifyTx`: "C17 included but not finalized -> UNVERIFIED", "C17 fallback to confirmation count when finalized tag is missing"; "in a block but not yet solidified -> UNVERIFIED" |
| C18 | L4 | `L4.recipient` (required), `L4.amount`, `L4.time` (block time ≥ deal start), `L4.reuse` (localStorage) | `verifyTx`: "C18 real payment to someone else -> FAKE for my address", "C18 old payment reused for a new deal (not-before) -> FAKE", "C18 same hash shown twice -> UNVERIFIED with reuse warning", "C18 no recipient given -> UNVERIFIED (cannot bind context)" |
| C19 | L3 | Net canonical change per address within the tx | `verifyTx`: "C19 USDT in and out in the same tx: net zero -> FAKE" |
| C20 | L0 | Length/format validation. Address-as-hash refused. Not found → `isBlockHash` check → `L0.kind` fail | `input`: "C20 accepts a well-formed EVM hash and lowercases it", "C20 rejects wrong length", "C20 rejects an address pasted as a hash"; `verifyTx`: "C20 block hash given instead of tx hash -> FAKE with explanation" |
| C37 | L3 | Logs only; `tx.to` is never used in a decision | `verifyTx`: "C37 payment through a router/multicall (tx.to is not USDT) still counts by logs" |
| C38 | L2 | No canonical TRC20 log → `L2.identity` fail | `verifyTx`: "C38 Tron TRC10 / native \"USDT\" (no TRC20 log from the canonical contract) -> FAKE" |
| C40 | L1 | Byte-identical receipts from ≥2 providers + finality | `verifyTx`: the F30 tests, "C17 included but not finalized -> UNVERIFIED" |
| — | L3 | Malformed Transfer logs (wrong topic count / data length), even from the canonical address, are ignored | `verifyTx`: "malformed Transfer log from the canonical contract is ignored" |

## D. Address poisoning

| ID | Layer(s) | Rule | Test(s) |
|---|---|---|---|
| D21 | L5, L7 | Outgoing `value == 0` transfer where the tx sender ≠ the scanned address → `zero-value` | `wallet`: "D21 zero-value transfer \"from me\" that I did not sign" |
| D22 | L3, L5 | `isLookalike`: prefix ≥3 and suffix ≥3 and sum ≥7, or edit distance ≤2, against watchlist + addresses really paid. Dust < 0.01 USDT reported. Verify tx: net < 1 USDT → warn | `wallet`: "D22 dust from a vanity lookalike of an address I paid", "D22 plain dust from an unrelated address is still reported", "prefix+suffix vanity match is a lookalike; identical or unrelated are not", "one swapped character is a lookalike (edit distance)", "Tron lookalikes are judged on the base58 form people read"; `verifyTx`: "D22 dust from a vanity address -> UNVERIFIED (dust)" |
| D23 | L5 | `checkDestination` → LOOKALIKE with a per-character diff. `L5.lookalike` in Verify tx | `wallet`: "D23 lookalike of a watchlist address (e.g. my Binance deposit address)", "danger on lookalike, known on exact, unknown otherwise"; `verifyTx`: "D23 my expected recipient is a lookalike of my watched address -> warn" |
| D41 | **Residual** | Prefix-only matches are deliberately not flagged (false positives). The send check says NEW | `wallet`: "a match on the first 4 characters only is NOT flagged (documented residual risk)" |
| D42 | L5, L6 | Lookalike rule applies to any token. Fake tokens grouped with `impersonatesUsdt`. Needs an indexer on EVM | `wallet`: "D42 poisoning with a fake token from a lookalike counts too" |

## E. Approvals and account control

| ID | Layer(s) | Rule | Test(s) |
|---|---|---|---|
| E24 | L7 | Approval logs (owner = me) → current `allowance(me, spender)`. ≥ 2^255 = unlimited/high, > 0 = medium | `wallet`: "E24 unlimited USDT approval to an unknown spender is high risk" |
| E25 | L7 | `code == 0xef0100 ‖ 20 bytes` → delegated, target shown | `wallet`: "E25 EIP-7702 delegation code on an EOA is detected" |
| E26 | L7 (Tron); **Residual** (EVM sweeper) | Tron: the owner permission must include the account's own key with weight ≥ threshold, and no other keys | `wallet`: "E26 leaked-seed bait / E27 permission hijack on Tron: owner key is someone else" |
| E27 | L7 | Same permission rule | `wallet`: same test as E26 |
| E43 | L5; **Residual** (device) | The send check never says KNOWN for an address outside the watchlist and recent payments | `wallet`: "E43 clipboard hijack to an unrelated address shows as NEW, never KNOWN" |
| E44 | **Residual** | Only canonical-USDT approvals are scanned | — (documented limit) |

## F. Off-chain and infrastructure

| ID | Layer(s) | Rule | Test(s) |
|---|---|---|---|
| F28 | L1; **Residual** | Input is a hash, never an image. The verdict comes from chain data. The UI names Binance deposit history as the final truth | Covered indirectly by every L1/L2 test. Screenshots themselves: residual |
| F29 | L0, L8 | Explorer URLs are built only from `CHAINS[chain].explorer`, https only. User input is never turned into a link | `registry`: "explorer links are built from the registry, https only"; `security`: "anchors cannot be created with an href attribute from data; link() allows https only" |
| F30 | L1 | `L1.consensus`: ≥2 ok answers with identical fingerprints (status, block, block hash, logs). Otherwise warn → UNVERIFIED (overrides FAKE/VERIFIED) | `verifyTx`: "F30 RPC providers disagree -> UNVERIFIED, never VERIFIED or FAKE", "F30 only one provider answered -> UNVERIFIED", "F30 one provider has the tx, the other does not -> UNVERIFIED" |
| F31 | L5 | `isBlackListed(sender)` on ETH/Tron → `L5.blacklist` warn. BSC: skip (no getter) | `verifyTx`: "F31 sender on Tether blacklist (Ethereum) -> UNVERIFIED with warning" |
| F32a | L8 | Text nodes only. No `innerHTML`/`eval`. CSP without `unsafe-inline`/`unsafe-eval` | `security`: "a token name with HTML is rendered as text, never parsed", "no innerHTML / outerHTML / insertAdjacentHTML / eval / new Function / document.write in src"; `registry`: "every network host the app calls is allowed by the CSP (and nothing else is)" |
| F32b | L8 | No `import.meta.env` and no key reads in `src/`. The key is read only in `server/` | `security`: "no VITE_ env vars and no api key reads in frontend code" |
| F32c | L8 | Proxy: `no-store`, strict input validation, same-origin only, per-IP rate limit | `proxy`: "rejects bad input", "without a key it says so instead of failing silently", "responses are never cacheable (no verdict cache poisoning)", "cross-origin callers are refused", "rate limits per IP" |
| F32d | L8; **Residual** | The current host is shown in the header with a "bookmark it" prompt | — (UI; clones themselves are residual) |
| F32e | L8 | Exact pins, lockfile, no third-party scripts | `security`: "all dependencies are pinned to exact versions and a lockfile exists", "index.html loads no third-party scripts" |
| F45 | **Residual** | Run it yourself, with your own address | — |
| F46 | **Residual** | UI wording: pending/unfinalized = not received | — |
| F47 | L1, L8 | HTTPS-only providers + F30 agreement | `verifyTx`: the F30 tests |

## G. Other chains

| ID | Layer(s) | Rule | Test(s) |
|---|---|---|---|
| G33 | **Residual** (not supported yet) | Solana is not offered in the UI. See README for the planned rules | — |
| G34 | L1, L2, L7 | Tron registry identity, solidified-block finality, owner-permission check | `verifyTx`: "fake TRC20 \"USDT\" on Tron -> FAKE", "in a block but not yet solidified -> UNVERIFIED", "Tron real USDT transfer: 30,194.5 USDT to TFwGKLSJirTnVobHf9DXkzwbZNZA841jWy"; `wallet`: "E26 leaked-seed bait / E27 permission hijack on Tron: owner key is someone else" |
| G35 | Registry policy | Every registry entry needs a source. Hex and display forms must agree | `registry`: "every entry has a source and consistent hex / display forms" |

## Live checks (optional)

`LIVE=1 npx vitest run tests/live.test.ts` runs the real BSC and Tron transactions from `tests/fixtures/` end to end against public RPCs, plus a NOT RECEIVED case and both wallet scans.
