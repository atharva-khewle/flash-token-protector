# Chrome extension

Same checks as the website, plus protection on the pages where people actually get tricked. Read-only: no keys, no signing, no wallet connection, no analytics, no remote code.

## Install (Developer mode)

1. Download `flash-token-protector-extension.zip` from the [latest release](https://github.com/atharva-khewle/flash-token-protector/releases/latest) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the unzipped folder (the one that contains `manifest.json`).
4. Pin the shield icon. Click it, open **Scan wallet**, and add your own addresses to the watchlist (your Binance deposit addresses especially). The page guards compare against that list.

To check the zip against the source: `npm ci && npm run ext:build` builds `extension/dist` from this repository.

## What it does

| Where | What | Vectors |
|---|---|---|
| Toolbar popup | The tabs of the website: Verify tx, Check token, Scan wallet, Check before sending | all |
| BscScan / Etherscan pages | Badges next to token links: **✓ real USDT contract** for the canonical one, **✗ NOT USDT** for any other contract that calls itself USDT/Tether (also catches homoglyph names). Addresses that imitate one of yours get **⚠ lookalike of your …** | A1, A2, C13, D22 |
| Binance, BscScan, Etherscan, Tronscan | **Paste guard.** When you paste an address: red banner with a character diff if it imitates a saved address; red banner if it is *not* the address you just copied (clipboard-hijacking malware); green if it is exactly a saved one; amber for a new address. It never blocks the paste | D23, E43 |
| Any page | Select a hash or address → right-click → **Check selection with Flash Token Protector** opens the popup with it filled in | all |

## Permissions, and why

| Permission | Why |
|---|---|
| `storage` | Your watchlist and the last copied address, in `chrome.storage.local` on your machine |
| `contextMenus` | The right-click entry |
| Host access to 7 RPC hosts (BSC, Ethereum, Tron public nodes) | The popup reads chain data from them. The list is generated from the same registry the code uses |
| Content scripts on `bscscan.com`, `etherscan.io`, `*.binance.com`, `tronscan.org` | Badges and the paste guard. Nothing else |

Not requested: `tabs`, `cookies`, `history`, `webRequest`, `scripting`, clipboard-read, `<all_urls>`. A test fails if any of them appears. Extension pages run under a strict CSP (`script-src 'self'`, `connect-src` = the RPC list). The paste guard sees only the text of an address you paste, and nothing leaves your machine except the RPC reads you ask for in the popup.

## Limits

- **Copy buttons** that call `navigator.clipboard.writeText` are seen through a tiny hook (`content-main.js`). Copies made some other way (a browser menu, another app) are not, so the "not the one you copied" check only works for copies made on the guarded sites. The lookalike and new-address checks work regardless.
- Malware that changes the clipboard *after* you paste, or that controls the whole browser, is out of reach.
- Badges rely on the explorers' link shape (`/token/0x…`). If BscScan or Etherscan change their markup, badges may stop appearing. They fail quiet: no badge, never a wrong "real" badge, because "real" requires the exact contract address.
- Tested on a fixture page that copies that shape and in a real browser against the extension's own pages. The live explorer sites sit behind a bot challenge that automated tests cannot pass, so check one real transaction page yourself after installing.
- Chrome only (Manifest V3). Chromium-based browsers should work; not tested.
- Wallet-signature interception (blocking a malicious `approve` / `permit` / 7702 prompt inside your wallet) is **not** built. The popup's wallet scan shows approvals and delegations after the fact.

## Reporting a problem

Open an issue with the page URL (not any private data) and what the badge said.
