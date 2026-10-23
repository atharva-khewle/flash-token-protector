// Every attack vector this tool defends against (text from the README table).
// Generated from README.md's table; edit the README and the flows together.

export interface Vector {
  id: string
  group: string
  name: string
  chains: string
  how: string
  sees: string
  det: string
  layer: string
  sev: string
}

export const VECTORS: Vector[] = [
  {
    "id": "A1",
    "group": "Token identity",
    "name": "Fake \"Tether USD\" token",
    "chains": "All EVM, Tron",
    "how": "Deploys an ERC20/TRC20 named \"Tether USD\", symbol \"USDT\", and transfers it to the victim",
    "sees": "Wallet shows \"+5,000 USDT\", sometimes with the Tether logo",
    "det": "Only chain + contract in the registry counts. Any other emitter is a decoy",
    "layer": "L2",
    "sev": "Critical"
  },
  {
    "id": "A2",
    "group": "Token identity",
    "name": "Homoglyph / invisible name",
    "chains": "All",
    "how": "Name or symbol uses Cyrillic Ѕ/Т, zero-width chars, RTL override, USD₮, USDT.e, USDT0, trailing spaces",
    "sees": "Looks exactly like USDT, or sorts next to it",
    "det": "Identity ignores names (L2). L6 maps names to an ASCII skeleton and reports non-ASCII, invisible and bidi characters. L0 rejects non-ASCII in hashes/addresses",
    "layer": "L0, L2, L6",
    "sev": "High"
  },
  {
    "id": "A3",
    "group": "Token identity",
    "name": "Fake $1 price",
    "chains": "EVM (DEX)",
    "how": "Seeds a tiny PancakeSwap/Uniswap pool of fake-USDT/USDT or fake-USDT/BNB, so price feeds show ~$1",
    "sees": "Wallet shows a dollar value next to the balance",
    "det": "Price is never an input to the verdict. Identity is the contract address only",
    "layer": "L2",
    "sev": "High"
  },
  {
    "id": "A4",
    "group": "Token identity",
    "name": "Bridged / pegged / dead-bridge copy",
    "chains": "BSC, ETH, L2s",
    "how": "Pays with a token that once had value (e.g. Multichain-era bridged USDT) or a different \"USDT\" peg on the same chain",
    "sees": "A token called USDT, maybe with real history",
    "det": "Not in the registry for this chain, so it is a decoy",
    "layer": "L2",
    "sev": "High"
  },
  {
    "id": "A5",
    "group": "Token identity",
    "name": "Chain confusion",
    "chains": "All",
    "how": "Sends on another chain, on a testnet (BSC testnet chainId 97) or a fork, then shares that hash",
    "sees": "Explorer page of a \"successful USDT transfer\"",
    "det": "The user chooses the chain. Ambiguous formats are refused (0x vs Tron). The hash must exist on that chain's mainnet RPCs, otherwise NOT RECEIVED. Explorer links come from the registry",
    "layer": "L0, L1, L2",
    "sev": "High"
  },
  {
    "id": "A6",
    "group": "Token identity",
    "name": "Decimals confusion",
    "chains": "BSC vs ETH/Tron",
    "how": "Relies on BSC USDT having 18 decimals while ETH/Tron have 6. A raw value of 5000000000 is 5,000 USDT on Tron but 0.000000005 USDT on BSC",
    "sees": "\"5000000000\" in a raw explorer view or a script",
    "det": "Registry decimals only, per chain",
    "layer": "L2, L3",
    "sev": "High"
  },
  {
    "id": "A7",
    "group": "Token identity",
    "name": "Token name carries a lure",
    "chains": "All",
    "how": "Name like \"Claim reward at usdt-bonus.xyz\"",
    "sees": "A link/instructions in the wallet's token list, leading to a drainer site",
    "det": "L6 flags URLs and instruction words in name/symbol. Text is rendered as plain text, never as a link",
    "layer": "L6, L8",
    "sev": "High"
  },
  {
    "id": "A36",
    "group": "Token identity",
    "name": "Tampered address in the request",
    "chains": "All",
    "how": "Gives an \"expected recipient\" or destination with one character changed, or EIP-55 casing broken by an edit",
    "sees": "Their own address, apparently",
    "det": "Mixed-case EVM input must pass EIP-55. Tron input must pass the base58check checksum. Otherwise refused",
    "layer": "L0",
    "sev": "Medium"
  },
  {
    "id": "B8",
    "group": "Flash-USDT behaviours",
    "name": "Expiring / revocable balance",
    "chains": "EVM, Tron",
    "how": "Custom token whose balanceOf depends on time, or the owner later burns, blacklists or pauses",
    "sees": "Balance present today, gone or frozen later",
    "det": "Not canonical, so already FAKE (L2). L6 explains it: burn(address,uint256), mint, pause, blacklist selectors, owner(), current balance lower than the logged amount",
    "layer": "L2, L6",
    "sev": "Critical"
  },
  {
    "id": "B9",
    "group": "Flash-USDT behaviours",
    "name": "Honeypot",
    "chains": "EVM, Tron",
    "how": "transfer reverts for everyone except the owner/whitelist",
    "sees": "Balance shows; sending or selling fails",
    "det": "L6 simulates transfer(random, 1) from the holder with eth_call. A revert is flagged",
    "layer": "L2, L6",
    "sev": "High"
  },
  {
    "id": "B10",
    "group": "Flash-USDT behaviours",
    "name": "Upgradeable proxy",
    "chains": "EVM",
    "how": "Harmless today, swapped for malicious logic after the victim relies on it",
    "sees": "Normal-looking token",
    "det": "L6 reads EIP-1967 implementation/beacon slots, detects EIP-1167 minimal proxies and upgradeTo selectors",
    "layer": "L2, L6",
    "sev": "Medium"
  },
  {
    "id": "B11",
    "group": "Flash-USDT behaviours",
    "name": "Lying balanceOf / events with no balance",
    "chains": "EVM, Tron",
    "how": "balanceOf returns a big number for everyone, or the contract emits Transfer without changing storage",
    "sees": "Explorer token tab and wallet both show the amount",
    "det": "L6 calls balanceOf(random fresh address). A non-zero answer means the balances are fiction. It also compares the holder's balance with the event amount",
    "layer": "L2, L6",
    "sev": "Critical"
  },
  {
    "id": "B12",
    "group": "Flash-USDT behaviours",
    "name": "Fee-on-transfer / rebasing",
    "chains": "EVM",
    "how": "The token takes a fee or rebases, so the received amount differs from the event",
    "sees": "Event says 1,000, balance grew by 950",
    "det": "Canonical USDT has no fee today (verify before each release: Tether's contract has a fee switch set to 0). For decoys, L6 flags balance < logged amount",
    "layer": "L3, L6",
    "sev": "Medium"
  },
  {
    "id": "B49",
    "group": "Flash-USDT behaviours",
    "name": "Token that self-destructs or changes code",
    "chains": "EVM",
    "how": "Token contract removed or replaced after the \"payment\"",
    "sees": "Token disappears, history is odd",
    "det": "L6 reports \"no code at this address now\"",
    "layer": "L6",
    "sev": "Medium"
  },
  {
    "id": "C13",
    "group": "Transaction deception",
    "name": "Forged Transfer events",
    "chains": "EVM, Tron",
    "how": "A non-USDT contract emits Transfer(from = <exchange hot wallet>, to = victim, 10,000)",
    "sees": "Explorer token-transfer tab shows \"From: Binance\"",
    "det": "Only logs whose emitting address is the canonical contract are decoded. Every other Transfer-like log is listed under \"Decoys found\" with the reason",
    "layer": "L2, L3",
    "sev": "Critical"
  },
  {
    "id": "C14",
    "group": "Transaction deception",
    "name": "Mixed tx",
    "chains": "EVM, Tron",
    "how": "One tx moves 1 real USDT plus 4,999 fake USDT to the victim",
    "sees": "\"5,000 USDT received\"",
    "det": "Sum canonical logs only. Decoys that credit the target make the verdict at least UNVERIFIED. The expected-amount check then FAILs",
    "layer": "L3, L4",
    "sev": "Critical"
  },
  {
    "id": "C15",
    "group": "Transaction deception",
    "name": "Reverted tx as proof",
    "chains": "All",
    "how": "Sends a tx that reverts (status 0). Input data still decodes to transfer(victim, 5000)",
    "sees": "Screenshot or decoded input showing the transfer",
    "det": "status must be success. Reverted = FAKE",
    "layer": "L1",
    "sev": "High"
  },
  {
    "id": "C16",
    "group": "Transaction deception",
    "name": "Pending / replaced tx",
    "chains": "EVM",
    "how": "Broadcasts with a low fee, shows the pending hash, then replaces it (same nonce) or lets it drop",
    "sees": "\"Pending\" tx with the right amount",
    "det": "Pending or unknown = NOT RECEIVED",
    "layer": "L1",
    "sev": "High"
  },
  {
    "id": "C17",
    "group": "Transaction deception",
    "name": "Not final / reorg",
    "chains": "All",
    "how": "Shows a tx in a block that is not final yet, hoping for a reorg or minority fork",
    "sees": "1–2 confirmations",
    "det": "Must be ≤ finalized block (BSC fast finality, ETH finalized, Tron solidified). Otherwise UNVERIFIED. Fallback: 30 / 96 / 20 confirmations",
    "layer": "L1",
    "sev": "Medium"
  },
  {
    "id": "C18",
    "group": "Transaction deception",
    "name": "Real tx, wrong context",
    "chains": "All",
    "how": "Shows a real payment to someone else, an old payment, the same tx to several victims, or a smaller amount",
    "sees": "A genuine explorer page",
    "det": "Expected recipient (required for VERIFIED), expected amount, \"deal started at\" vs block time, and a local list of already-accepted hashes",
    "layer": "L4",
    "sev": "Critical"
  },
  {
    "id": "C19",
    "group": "Transaction deception",
    "name": "In and out in the same tx",
    "chains": "EVM",
    "how": "USDT goes to the victim and is pulled back (via a prior approval) inside the same tx",
    "sees": "Incoming Transfer event",
    "det": "Net canonical change for the target address per tx",
    "layer": "L3",
    "sev": "High"
  },
  {
    "id": "C20",
    "group": "Transaction deception",
    "name": "Malformed / wrong-object hash",
    "chains": "All",
    "how": "Shares a hash of the wrong length, a block hash, or an address",
    "sees": "\"Here's the hash\"",
    "det": "L0 validates length/format and refuses addresses. If no tx is found, the hash is checked as a block hash and reported",
    "layer": "L0",
    "sev": "Medium"
  },
  {
    "id": "C37",
    "group": "Transaction deception",
    "name": "Payment via router / multicall",
    "chains": "EVM",
    "how": "Pays through a contract, so tx.to is not the USDT contract",
    "sees": "Real tx with an odd \"to\"",
    "det": "Decisions use logs only, never tx.to",
    "layer": "L3",
    "sev": "Low"
  },
  {
    "id": "C38",
    "group": "Transaction deception",
    "name": "Native coin / TRC10 \"USDT\"",
    "chains": "Tron, EVM",
    "how": "Sends TRX/BNB, or a TRC10 asset named \"USDT\" (TRC10 transfers emit no TRC20 log)",
    "sees": "\"USDT\" in a wallet that lists TRC10 assets",
    "det": "No canonical TRC20 log, so FAKE",
    "layer": "L2",
    "sev": "High"
  },
  {
    "id": "C40",
    "group": "Transaction deception",
    "name": "Split view / minority fork",
    "chains": "All",
    "how": "Gets the victim to look at a node or explorer following a minority chain",
    "sees": "A tx that \"exists\"",
    "det": "Two independent RPCs must agree, plus finality",
    "layer": "L1",
    "sev": "Medium"
  },
  {
    "id": "D21",
    "group": "Address poisoning",
    "name": "Zero-value transferFrom from the victim",
    "chains": "EVM, Tron",
    "how": "Calls transferFrom(victim, lookalike, 0). Many tokens allow zero-amount transfers without allowance",
    "sees": "A 0-value outgoing transfer \"from me\" to an address that looks like one I use",
    "det": "Wallet scan: an outgoing zero-value transfer that I did not sign (tx sender ≠ me)",
    "layer": "L5, L7",
    "sev": "High"
  },
  {
    "id": "D22",
    "group": "Address poisoning",
    "name": "Vanity dust",
    "chains": "EVM, Tron",
    "how": "Sends tiny real or fake USDT from a vanity address matching the first/last 4–6 characters of an address the victim uses (including their Binance deposit address)",
    "sees": "Small incoming transfer from a \"familiar\" address",
    "det": "Prefix/suffix match (≥3 each, ≥7 total) or edit distance ≤2 against watchlist + addresses the user really paid. Dust < 0.01 USDT reported. In Verify tx, net < 1 USDT = UNVERIFIED",
    "layer": "L3, L5",
    "sev": "Critical"
  },
  {
    "id": "D23",
    "group": "Address poisoning",
    "name": "Poisoned address copied at withdrawal",
    "chains": "All",
    "how": "Waits for the victim to copy the lookalike from history",
    "sees": "Their \"usual\" address",
    "det": "\"Check before sending\" tab: LOOKALIKE warning with a per-character diff. Watchlist. Reminder to use the Binance withdrawal whitelist",
    "layer": "L5",
    "sev": "Critical"
  },
  {
    "id": "D41",
    "group": "Address poisoning",
    "name": "Weak lookalike (prefix only)",
    "chains": "All",
    "how": "Matches only the first 4 characters, betting the victim checks only the start",
    "sees": "Partially familiar address",
    "det": "Not caught by the lookalike rule (too many false positives). The send check still says \"NEW address\"",
    "layer": "Residual",
    "sev": "Medium"
  },
  {
    "id": "D42",
    "group": "Address poisoning",
    "name": "Poisoning with fake tokens",
    "chains": "EVM, Tron",
    "how": "Same as D22 but with a fake-USDT transfer of a matching amount",
    "sees": "\"Payment\" from a familiar address",
    "det": "Wallet scan, when the indexer is available (TronGrid on Tron; explorer key on EVM)",
    "layer": "L5, L6",
    "sev": "High"
  },
  {
    "id": "E24",
    "group": "Approvals and account control",
    "name": "Approval / permit phishing",
    "chains": "EVM, Tron",
    "how": "Tricks the victim into approve/increaseAllowance, a permit signature, or Permit2 with an unlimited allowance",
    "sees": "Nothing until the drain",
    "det": "Wallet scan lists live USDT allowances (from Approval logs plus a current allowance() call). Unlimited = high",
    "layer": "L7",
    "sev": "Critical"
  },
  {
    "id": "E25",
    "group": "Approvals and account control",
    "name": "EIP-7702 delegation phishing",
    "chains": "ETH, BSC",
    "how": "Gets the EOA to sign a 7702 authorization that delegates to a drainer contract. BSC enabled 7702 with the Pascal hardfork (verify)",
    "sees": "Nothing, until funds move automatically",
    "det": "getCode(address) starting with 0xef0100 = delegated, with the target shown",
    "layer": "L7",
    "sev": "Critical"
  },
  {
    "id": "E26",
    "group": "Approvals and account control",
    "name": "Leaked-seed \"free wallet with USDT\" bait",
    "chains": "Tron, EVM",
    "how": "Posts a seed phrase for a wallet holding USDT. On Tron the owner permission was moved to the attacker's key. On EVM a sweeper bot takes any gas you send",
    "sees": "\"Free\" USDT you can't move; you send TRX/BNB for fees and lose it",
    "det": "Tron: owner permission keys ≠ the account itself → high risk. EVM sweeper: residual (behavioural)",
    "layer": "L7, residual",
    "sev": "High"
  },
  {
    "id": "E27",
    "group": "Approvals and account control",
    "name": "Tron energy scams / multi-sig hijack",
    "chains": "Tron",
    "how": "Sells fake \"energy\" or adds itself to the account permissions",
    "sees": "Account behaves normally until it doesn't",
    "det": "Same permission check as E26",
    "layer": "L7",
    "sev": "High"
  },
  {
    "id": "E43",
    "group": "Approvals and account control",
    "name": "Clipboard hijacker",
    "chains": "All",
    "how": "Malware replaces a copied address",
    "sees": "A different address in the paste",
    "det": "The send check says NEW or LOOKALIKE. Device compromise itself is residual",
    "layer": "L5, residual",
    "sev": "Critical"
  },
  {
    "id": "E44",
    "group": "Approvals and account control",
    "name": "Approvals on other tokens / NFTs",
    "chains": "EVM",
    "how": "setApprovalForAll, approvals on other tokens",
    "sees": "—",
    "det": "Not covered: the scan lists canonical-USDT approvals only. Use a dedicated revoke tool",
    "layer": "Residual",
    "sev": "Medium"
  },
  {
    "id": "F28",
    "group": "Off-chain and infrastructure",
    "name": "Edited screenshots, fake receipts, fake \"Binance\" messages",
    "chains": "—",
    "how": "Photoshop, fake PDF, spoofed email/SMS/support chat",
    "sees": "A convincing \"payment confirmed\"",
    "det": "The tool only accepts a hash and reads the chain. Binance deposit history is named as the final truth",
    "layer": "L1, residual",
    "sev": "Critical"
  },
  {
    "id": "F29",
    "group": "Off-chain and infrastructure",
    "name": "Fake explorer site",
    "chains": "All",
    "how": "Sends a link to a bscscan lookalike showing a fake tx",
    "sees": "A real-looking explorer page",
    "det": "Explorer links are built from the registry, never from input. The user pastes a hash, not a link",
    "layer": "L0, L8",
    "sev": "High"
  },
  {
    "id": "F30",
    "group": "Off-chain and infrastructure",
    "name": "Lying / hijacked RPC",
    "chains": "All",
    "how": "A malicious RPC (or a hijacked public one) returns a fake receipt",
    "sees": "—",
    "det": "Receipts from ≥2 independent providers must match byte-for-byte (status, block, block hash, logs). Disagreement or a single answer = UNVERIFIED",
    "layer": "L1",
    "sev": "High"
  },
  {
    "id": "F31",
    "group": "Off-chain and infrastructure",
    "name": "\"Dirty\" real USDT",
    "chains": "ETH, Tron",
    "how": "Real USDT from a hacked, sanctioned or Tether-blacklisted source",
    "sees": "Real money arrives",
    "det": "On ETH and Tron, isBlackListed(sender) → UNVERIFIED with a warning. BSC-USD has no getter: reported as not checked. No free public sanctions API is used (none identified that is reliable and CORS-friendly)",
    "layer": "L5",
    "sev": "High"
  },
  {
    "id": "F32a",
    "group": "Off-chain and infrastructure",
    "name": "XSS via token names",
    "chains": "—",
    "how": "Token name <img onerror=…>",
    "sees": "—",
    "det": "All chain strings are text nodes. No innerHTML in src/ (test-enforced). Strict CSP",
    "layer": "L8",
    "sev": "High"
  },
  {
    "id": "F32b",
    "group": "Off-chain and infrastructure",
    "name": "Leaked API keys",
    "chains": "—",
    "how": "Reads keys from the JS bundle",
    "sees": "—",
    "det": "No keys in the frontend. The explorer key lives in the serverless function only (test-enforced)",
    "layer": "L8",
    "sev": "Medium"
  },
  {
    "id": "F32c",
    "group": "Off-chain and infrastructure",
    "name": "Cache poisoning of verdicts",
    "chains": "—",
    "how": "Gets a CDN to cache a crafted response",
    "sees": "—",
    "det": "Verdicts are computed in the browser. The proxy sends Cache-Control: no-store, validates input, refuses cross-origin calls and rate-limits",
    "layer": "L8",
    "sev": "Medium"
  },
  {
    "id": "F32d",
    "group": "Off-chain and infrastructure",
    "name": "Phishing clones of this site",
    "chains": "—",
    "how": "Hosts a copy that always says VERIFIED",
    "sees": "A familiar UI",
    "det": "The current domain is shown prominently with a \"bookmark it\" prompt. Otherwise residual",
    "layer": "L8, residual",
    "sev": "High"
  },
  {
    "id": "F32e",
    "group": "Off-chain and infrastructure",
    "name": "Dependency supply chain",
    "chains": "—",
    "how": "Compromises an npm package",
    "sees": "—",
    "det": "Exact version pins, a lockfile, one runtime dependency (viem), no third-party scripts or analytics (test-enforced). npm audit clean at release",
    "layer": "L8",
    "sev": "High"
  },
  {
    "id": "F45",
    "group": "Off-chain and infrastructure",
    "name": "Screenshot of *this tool* saying VERIFIED",
    "chains": "—",
    "how": "Runs the tool on a different tx, or edits the screenshot",
    "sees": "\"Your own tool says it's fine\"",
    "det": "Residual: run it yourself, with your own address",
    "layer": "Residual",
    "sev": "High"
  },
  {
    "id": "F46",
    "group": "Off-chain and infrastructure",
    "name": "Time pressure / social engineering",
    "chains": "—",
    "how": "\"Release now or the deal is off\"",
    "sees": "—",
    "det": "Residual. The UI says: pending/unfinalized = not received",
    "layer": "Residual",
    "sev": "High"
  },
  {
    "id": "F47",
    "group": "Off-chain and infrastructure",
    "name": "Network MITM / DNS hijack",
    "chains": "—",
    "how": "Intercepts RPC traffic on hostile Wi-Fi",
    "sees": "—",
    "det": "HTTPS to every provider, plus the two-provider agreement (F30)",
    "layer": "L1, L8",
    "sev": "Medium"
  },
  {
    "id": "G33",
    "group": "Other chains",
    "name": "Solana tricks (not supported yet)",
    "chains": "Solana",
    "how": "Solana: fake mint with copied metadata; Token-2022 extensions (permanent delegate pulls tokens back, transfer hook, freeze authority, non-transferable, transfer fee); owner vs token-account confusion; zero-value poisoning",
    "sees": "",
    "det": "Not supported yet. Planned: canonical mint registry, reject Token-2022 mints with permanent delegate / freeze authority on non-canonical mints, resolve the token-account owner, finalized commitment",
    "layer": "Residual (future)",
    "sev": "Medium"
  },
  {
    "id": "G34",
    "group": "Other chains",
    "name": "Tron: fake TRC20 USDT",
    "chains": "Tron",
    "how": "Fake TRC20 USDT, unconfirmed vs solidified blocks, and permission hijack.",
    "sees": "",
    "det": "Registry identity, solidified block as finality, owner-permission check",
    "layer": "L1, L2, L7",
    "sev": "High"
  },
  {
    "id": "G35",
    "group": "Other chains",
    "name": "Any new chain",
    "chains": "—",
    "how": "Policy: before adding a chain, list its specific tricks here and add a registry entry with a primary source",
    "sees": "",
    "det": "Policy: before adding a chain, list its specific tricks here and add a registry entry with a primary source",
    "layer": "Registry",
    "sev": "Medium"
  }
]
