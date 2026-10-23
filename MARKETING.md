# Social media and marketing kit

Everything here is free to do. Copy, paste, adjust the voice to sound like you. Nothing below needs a paid plan, an ad budget or a sponsor.

**Links used in every post**

- Website: https://flashguard-usdt.web.app
- Source: https://github.com/atharva-khewle/flash-token-protector
- Chrome / Brave extension: https://github.com/atharva-khewle/flash-token-protector/releases/latest
- Real examples to try (fake USDT tokens found on BSC): https://github.com/atharva-khewle/flash-token-protector/blob/main/docs/TEST_TXS.md
- Proof it works: https://github.com/atharva-khewle/flash-token-protector/blob/main/docs/PROOF.md

**What is true and safe to say** (keep to these; they are all backed by the repo)

- Free, open source (MIT), no account, no keys, no signing, no tracking. Connecting a wallet is optional and only reads which account is selected.
- It tells you whether a USDT payment is real by checking the contract address, not the name. Supports BNB Chain (BEP20), Ethereum and Tron.
- Tested on real BSC transactions with fake "USDT" tokens, plus 31 attack scenarios on a local chain.

**What not to say**

- Never say "100% safe", "guaranteed" or "stops all scams". The tool says what the chain shows; it cannot see bank chargebacks or a hacked phone.
- No fake testimonials, no fake numbers, no "thousands of users" until it is true. Add real numbers later (GitHub stars, installs) when you have them.
- Do not name a person or a company as a scammer. Say "a token that is not the real USDT contract but calls itself USDT".
- Say you built it. Hiding that you are the author gets posts removed and hurts trust.

---

## 1. Where to post, and whether it is free

| Platform | Free? | Best format | Watch out for |
|---|---|---|---|
| X (Twitter) | Free | One launch post, then a thread | Do not tag many accounts. Pin the launch post. |
| Farcaster (Warpcast) | Free | Cast with a link and a short demo clip | Crypto-native crowd. Be technical and honest. Casts have a length limit, so keep them short. |
| LinkedIn | Free | Story post (why you built it) | Good for the interview/portfolio angle. Add the link in a comment if reach drops. |
| Medium | Free | Article in section 9 | Free to publish. Import the same article to Dev.to and Hashnode. |
| Dev.to / Hashnode | Free | Same article | Tags help: security, blockchain, webdev, opensource. |
| Hacker News (Show HN) | Free | Section 8 | Post once. No upvote requests. Reply to every comment for the first hours. |
| Product Hunt | Free | Section 7 | Needs a PH account. A weekday launch is best. Prepare the first comment. |
| Reddit | Free | Value-first posts, sections 5 and 6 | Every sub has its own self-promotion rule. Read it first. Many crypto subs remove links. |
| Binance Square | Free | Section 10 | This is where Binance users actually read. Keep it educational. |
| Threads / Facebook / Instagram (Meta) | Free | Sections 11 and 12 | Facebook groups about crypto scams or P2P trading often allow helpful posts but ban ads. Ask an admin if unsure. |
| Telegram / Discord | Free | Section 13 | Only post where self-promotion is allowed. Never DM strangers. |
| YouTube / Shorts / Reels / TikTok | Free | Script in section 14 | A 30 second screen recording beats text for this kind of tool. |
| Quora / Stack Exchange (Ethereum, Bitcoin, Crypto) | Free | Answer real questions, link when relevant | Do not drop links without answering. |
| GitHub | Free | Topics, social preview, release notes (section 15) | Free discoverability. |
| AlternativeTo, Indie Hackers, BetaList | Free listings | Short description | Some have review queues. |
| Microsoft Edge Add-ons | Free | Upload the extension zip | Same Chromium extension. Review takes days. |
| Chrome Web Store | **Not free**: one-time developer registration fee (about USD 5, verify the current amount) | Listing | Skip until you want it. Brave and Chrome developer-mode install works without it. |
| Paid ads, influencers, "airdrop" promos | **Not free** | None | Skip. Giveaways and token promos also invite scammers to your replies. |

Start with: X, LinkedIn, Binance Square, Farcaster, Reddit (r/SideProject first), Dev.to/Medium, Show HN, Product Hunt. That alone is a full launch week at zero cost.

---

## 2. X (Twitter)

### Launch post (single post)

```
Fake USDT is easy to make and looks identical in a wallet or explorer.

I built a free, open-source checker: paste a tx hash or token address and it tells you if it is the REAL USDT contract or a lookalike.

BNB Chain, Ethereum, Tron. No keys, no signing.

https://flashguard-usdt.web.app
```

### Thread (post each numbered item as a reply to the previous one)

```
1/ Anyone can deploy a token called "USDT" or "Tether USD". Wallets show the name the token chooses.

So a payment can look real and be worth nothing. I built a free tool to check it. 🧵
```

```
2/ The rule it uses: real USDT is ONE contract per chain. The name does not matter.

BNB Chain: 0x55d398326f99059fF775485246999027B3197955
Ethereum: 0xdAC17F958D2ee523a2206206994597C13D831ec7

Anything else calling itself USDT is a lookalike.
```

```
3/ Paste a transaction hash and it lists every token that moved, who sent what to whom, and flags what is wrong: fake USDT, zero-value "poisoning" transfers, failed or not-final transactions.

https://flashguard-usdt.web.app
```

```
4/ I found real fake "USDT" tokens on BSC by scanning recent blocks. One has "Tether USD" as its name and a vanity address ending in 8888. Another uses an Armenian letter instead of a U.

Real examples to try yourself:
https://github.com/atharva-khewle/flash-token-protector/blob/main/docs/TEST_TXS.md
```

```
5/ Address poisoning: an attacker sends you a zero-value or dust transfer from an address that looks like one you use, hoping you copy it next time.

The wallet view marks dust, zero-value transfers and addresses that imitate ones you paid.
```

```
6/ "My wallet" tab: paste any address (or optionally connect a wallet) to see balance and history. New transfers are checked automatically while the page is open. Tap one to see if it is real.

Connecting only reads the selected account. It never asks you to sign.
```

```
7/ Also a Chrome/Brave extension: badges on BscScan/Etherscan token links ("real USDT" or "NOT USDT") and a paste guard that warns when an address you paste is not the one you copied.

https://github.com/atharva-khewle/flash-token-protector/releases/latest
```

```
8/ It is MIT-licensed and tested: 31 attack scenarios on a local chain, plus real BSC transactions. It does not say "safe"; it says what the chain shows.

Feedback and bug reports welcome: https://github.com/atharva-khewle/flash-token-protector
```

### Short follow-up posts (use over the following weeks, one at a time)

```
If someone says "I sent you USDT" and shows a screenshot, the only thing that matters is the transaction hash and the contract. Check it here, takes 10 seconds: https://flashguard-usdt.web.app
```

```
Never copy a receiving address from your wallet history. Attackers plant lookalike addresses there with zero-value transfers. Paste addresses from the original source, then compare. Free checker: https://flashguard-usdt.web.app
```

```
Test it yourself, no wallet needed: open the site, choose BNB Chain, paste 0x5b993fe379f29e439d720a55cc615f9ea232f2b0b10c61628a2e9fb7446f9b45 into "Analyze tx". It is a real BSC tx where a fake "USDT" token was sent.
```

### Reply templates

- "Is this safe?": "It is read-only: no keys, no signing, nothing to approve. Source is public so you can check: github.com/atharva-khewle/flash-token-protector"
- "Why is it not on the Chrome Web Store?": "Not yet; it is free to install in developer mode from the GitHub release, and the code is open to read. I may list it later."
- "Does it catch everything?": "No. It checks what the chain shows. It cannot see chargebacks or a compromised device, and it never claims a payment is safe."

---

## 3. Farcaster (Warpcast)

### Cast 1: launch (stay under the cast length limit; trim if the client complains)

```
Built a free, open-source checker for fake USDT.

Anyone can deploy a token named "USDT". This tool compares the contract address, so a lookalike can't pass. BNB Chain, Ethereum, Tron. Read-only: no keys, no signing.

https://flashguard-usdt.web.app
```

### Cast 2: technical angle

```
How it decides: real USDT is one contract per chain. It reads the receipt from 2 independent public RPCs, checks finality, nets the transfers for the address, then judges every token by address only.

Also flags zero-value poisoning transfers and failed txs. Code + tests: https://github.com/atharva-khewle/flash-token-protector
```

### Cast 3: ask for feedback

```
What scam patterns around USDT should a checker like this catch that I haven't thought of? I've covered fake tokens, homoglyph names, dust/zero-value poisoning, unfinalized txs. Open to PRs.
```

Channels to look for (confirm the exact names in the app before posting): developer, security, and BNB Chain related channels. Post where self-promotion is welcome. If a channel has a rules cast, read it first.

---

## 4. LinkedIn

### Main post (story)

```
I built a free tool to catch fake USDT. Here is why.

When someone says "I sent you 5,000 USDT", the wallet or screenshot can look perfect, and still be a token with a copied name. Anyone can deploy one.

So I wrote Flash Token Protector. You paste a transaction hash and it tells you:
• which tokens really moved, who sent what to whom
• whether the token is the genuine USDT contract (it compares the contract address, never the name)
• whether anything looks like address poisoning, a failed or not-yet-final transaction

What I am proud of:
• It is read-only. No keys, no signatures, and connecting a wallet is optional.
• It is tested against real fake tokens found on BNB Chain, plus 31 attack scenarios on a local chain.
• It is open source (MIT).

Works on BNB Chain, Ethereum and Tron, as a website and a Chrome/Brave extension.

Try it: https://flashguard-usdt.web.app
Code: https://github.com/atharva-khewle/flash-token-protector

I would like honest feedback, especially from people who trade P2P or work in security.

#blockchain #web3 #security #opensource #crypto
```

### Short version

```
Shipped: a free, open-source checker that tells you if a USDT payment is real or a lookalike token. Read-only, no keys. BNB Chain, Ethereum, Tron. https://flashguard-usdt.web.app  Feedback welcome.
```

---

## 5. Reddit: builder posts

Read each subreddit's rules first. Use the "I built" or "Show" flair where it exists. Post one subreddit at a time, a day or more apart, and answer comments.

### r/SideProject, r/opensource, r/chrome_extensions

Title: `I built a free, open-source checker for fake USDT (website + Chrome/Brave extension)`

```
Hi all, I built Flash Token Protector after seeing how easy it is to fake a USDT payment: anyone can deploy a token named "USDT", and wallets show whatever name it chooses.

What it does:
- Paste a tx hash: lists every token that moved, who sent what to whom, and flags what is wrong.
- Paste a token address: tells you if it is the real USDT contract for that chain or a lookalike.
- Optional "My wallet" view: balance, history, and every new transfer checked automatically while the page is open.
- Extension: badges on BscScan/Etherscan token links and a paste guard for lookalike addresses.

Details: read-only (no keys, no signing, wallet connect is optional and only reads the selected account), MIT licensed, supports BNB Chain, Ethereum and Tron. Tested on real fake tokens found on BSC and 31 scripted attack scenarios.

Site: https://flashguard-usdt.web.app
Code: https://github.com/atharva-khewle/flash-token-protector

I am the author. Feedback, bug reports and "you missed this scam pattern" comments are very welcome.
```

### r/ethdev (check the sub's rules about projects first; frame it as a technical write-up)

Title: `How I detect fake USDT on-chain: contract address only, 2-provider receipt consensus, finality, net transfers`

```
Write-up of the approach in an open-source checker I built.

1. Identity: real USDT is one contract per chain. Names and symbols are only used to explain why something is fake (homoglyphs like Cyrillic/Armenian letters, "Tether USD" names), never to decide.
2. Chain truth: the receipt must match from at least 2 independent public RPCs, and the block must be finalized.
3. Transfer semantics: net the canonical Transfer logs per address, so a router that passes USDT through shows ~0.
4. Poisoning: zero-value and dust transfers, and addresses that match the first/last characters of ones you paid.
5. Live watching: eth_getBlockReceipts for each new block, filtered for transfers touching an address.

Code and tests (including real BSC fake tokens): https://github.com/atharva-khewle/flash-token-protector
Happy to hear what I got wrong.
```

### Value-first posts for scam-awareness communities (no link in the body; put the link in a comment if the sub allows it)

Title: `How to check if "USDT" someone sent you is real (takes 10 seconds)`

```
A pattern that keeps hurting people: someone "pays" you USDT and the wallet or explorer shows "USDT" in the transfer. But anyone can create a token with that name.

How to check:
1. Get the transaction hash (not a screenshot).
2. Open it on the chain's explorer and click the token name. Compare the contract address with the real one.
   - BNB Chain USDT: 0x55d398326f99059fF775485246999027B3197955
   - Ethereum USDT: 0xdAC17F958D2ee523a2206206994597C13D831ec7
3. If it is any other address, it is not USDT.
4. Never copy a receiving address from your wallet history. Attackers plant lookalike addresses there with zero-value transfers.

I made a free tool that does these checks automatically (open source). Link in the first comment if the mods allow it.
```

Subreddit ideas to check rules for (self-promotion limits vary a lot): r/SideProject, r/opensource, r/chrome_extensions, r/ethdev, r/BinanceSmartChain, r/CryptoScams, r/BinanceP2P-type communities. Do not post in places that ban all tools or links.

---

## 6. Reddit: a follow-up a week later

Title: `Update: found real fake "USDT" tokens on BNB Chain while testing my checker`

```
While testing my open-source USDT checker I scanned recent BNB Chain blocks and found several tokens that are not the real USDT contract but call themselves USDT/Tether, including one with an Armenian letter in its symbol and a few with vanity addresses ending in 8888. I also found a transaction that makes 22 zero-value "USDT" transfers between unrelated addresses (the address-poisoning pattern).

I put the examples in the repo so anyone can paste them into the tool and see what it says: https://github.com/atharva-khewle/flash-token-protector/blob/main/docs/TEST_TXS.md

Not an accusation about anyone: some of those tokens may be legitimate bridged products. The point is that the name proves nothing; only the contract address does.
```

---

## 7. Product Hunt

- **Name:** Flash Token Protector
- **Tagline (60 characters or fewer):** `Check if a USDT payment is real or fake`
- **Description (260 characters or fewer):** `Free, open-source checker for fake/flash USDT and address poisoning. Paste a tx hash or token address on BNB Chain, Ethereum or Tron. Read-only: no keys, no signing. Website plus Chrome/Brave extension.`
- **Topics:** Crypto, Security, Open Source, Chrome Extensions, Developer Tools
- **Gallery ideas:** screenshot of a FAKE USDT FOUND result, the My wallet view, the extension badge. Screenshots are in `docs/proof/website/` and `docs/proof/extension/` in the repo.
- **First comment (post as the maker):**

```
Hi, I'm the maker. I built this after seeing how easily a payment can be faked with a token that only copies the name "USDT". 

What makes it different: it never trusts names. A token is real USDT only if the contract address matches the official one for that chain. It also reads receipts from two independent RPCs, checks finality, and flags address-poisoning patterns.

It's free, MIT licensed, read-only (no keys, no signing; wallet connect is optional). I'd love to hear which scam patterns you've seen that I should add.
```

---

## 8. Hacker News: Show HN

Title: `Show HN: Free open-source checker for fake USDT (website and browser extension)`

URL: https://github.com/atharva-khewle/flash-token-protector (or the site; pick one and put the other in the first comment)

First comment:

```
Author here. Anyone can deploy an ERC-20 named "USDT", and wallets/explorers render the name the contract chooses. So "I sent you 5,000 USDT" with a convincing screenshot can be a worthless token.

The checker decides identity by contract address only (one canonical contract per chain: BSC, Ethereum, Tron). It requires matching receipts from two independent public RPCs, checks finality, nets Transfer logs per address, and flags zero-value/dust poisoning and lookalike addresses. For unknown tokens it explains how they can hurt you (proxy, mint, blacklist, honeypot via eth_call, lying balanceOf).

Everything is read-only: no keys, no signing; connecting a wallet is optional and only reads the selected account. Tests: 31 attack scenarios against test contracts on a local Anvil chain (test contracts refuse to deploy on any non-test chain id), plus real BSC transactions with fake tokens I found by scanning blocks.

Known limits: public RPCs only cover real USDT history for about a day on BSC; listing every fake token ever sent to an address needs an indexer key. It cannot see off-chain things like chargebacks.

Site: https://flashguard-usdt.web.app
Happy to take criticism, especially about what scam patterns I missed.
```

Tips: post on a weekday morning US time. Do not ask anyone to upvote. Answer every comment calmly.

---

## 9. Article for Medium, Dev.to and Hashnode

**Title:** `Fake USDT is just a token with a copied name. Here is how to check any transfer in 10 seconds`

**Subtitle:** `What flash USDT and address poisoning really are, and a free open-source tool that checks them`

```markdown
Someone says they paid you 5,000 USDT. You open your wallet and see "USDT" with the right icon and a plausible amount. You release the goods. The next day you find out the "USDT" was worthless.

This is not magic and it is not a bug in your wallet. It is how tokens work.

## Why a fake can look exactly like the real thing

A token on BNB Chain or Ethereum is just a smart contract. When you deploy one, you choose its name and symbol. Nothing stops you from naming it "Tether USD" with the symbol "USDT". Wallets and explorers display the name the contract reports, so the fake looks like the real one.

The only thing that identifies the real USDT is its contract address:

- BNB Chain (BEP20): `0x55d398326f99059fF775485246999027B3197955`
- Ethereum: `0xdAC17F958D2ee523a2206206994597C13D831ec7`
- Tron: `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`

Any other address is not that chain's USDT, no matter what it is called.

## Tricks to look out for

1. **Copied names.** A token named "USDT" at a different address.
2. **Lookalike letters.** A symbol like "ՍSDT" where the first letter is Armenian, or Cyrillic letters that look Latin. I found one of these on BNB Chain while testing.
3. **Vanity addresses.** Fake tokens with addresses that end in something memorable like `8888`.
4. **Address poisoning.** The attacker sends you a zero-value or tiny transfer from an address that matches the first and last characters of one you use. Later you copy "your usual address" from your history and send money to the attacker. In one scan I found a single transaction that creates 22 zero-value "USDT" transfers between unrelated addresses.
5. **Not final yet.** A transaction that is pending or recently mined can still disappear.

## How to check in 10 seconds

1. Get the transaction hash, not a screenshot.
2. Open it on the explorer and click the token. Compare the contract address with the real one above.
3. Or paste the hash into a checker that does it for you.

## The tool I built

I wrote Flash Token Protector to automate this. It is free and open source. You paste a transaction hash and it lists every token that moved and who sent what to whom, judges each token by contract address, and flags what looks wrong: fake USDT, poisoning-style transfers, failed or not-final transactions, lookalike addresses.

You can also follow a wallet address: it shows the real USDT balance and history, marks dust and zero-value transfers, and checks each new transfer automatically while the page is open. Connecting a wallet is optional and only reads which account is selected; the app never asks you to sign or approve anything.

It also comes as a Chrome/Brave extension that badges token links on BscScan and Etherscan ("real USDT" or "NOT USDT") and warns when a pasted address is not the one you copied.

- Website: https://flashguard-usdt.web.app
- Code and tests: https://github.com/atharva-khewle/flash-token-protector
- Real fake tokens to try it on: https://github.com/atharva-khewle/flash-token-protector/blob/main/docs/TEST_TXS.md

## What it cannot do

It reads the chain. It cannot see a bank chargeback, a hacked phone or an off-chain scam, and it will never tell you a payment is "safe". If your exchange has not credited a deposit, its deposit history is the final truth.

If you know a scam pattern I have not covered, I would like to hear it.
```

Tags: `blockchain`, `security`, `crypto`, `opensource`, `webdev`. Add a screenshot of the fake-USDT result from `docs/proof/website/token-fake.png` as the cover image.

---

## 10. Binance Square

Post this as plain text. Binance Square rewards short educational posts. Add the relevant coin tag $USDT and #BNBChain, #Security, #P2P if they exist in the app.

```
Did someone "pay" you USDT on BEP20? Check it before you release anything.

Anyone can create a token called "USDT". Wallets show the name, not proof.

The only proof: the contract address.
Real USDT on BNB Chain: 0x55d398326f99059fF775485246999027B3197955

If the token contract is different, it is fake.

Never trust a screenshot. Ask for the transaction hash and check it here (free, read-only, no wallet needed):
https://flashguard-usdt.web.app

Also: never copy a receiving address from your wallet history. Scammers plant lookalike addresses there with zero-value transfers.

Always confirm in your exchange's deposit history. 
```

Short follow-up posts: "3 signs a USDT transfer is fake", "What is address poisoning?", "How to verify a P2P payment on BNB Chain" using the same facts.

---

## 11. Threads and Facebook

### Threads (short)

```
Fake USDT is just a token with a copied name. 

Real BNB Chain USDT is one contract: 0x55d398326f99059fF775485246999027B3197955. Anything else calling itself USDT is a lookalike.

Free checker I built, paste a tx hash and it tells you: https://flashguard-usdt.web.app
```

### Facebook (post and groups)

```
Sharing something I built that might save someone money.

Scammers send "USDT" that is actually a worthless token with a copied name. It looks identical in a wallet. The only way to be sure is to check the contract address.

I made a free, open-source tool that does it for you: paste a transaction hash and it says if the USDT is real. Works for BNB Chain (BEP20), Ethereum and Tron. No login, no wallet connection needed, no keys.

https://flashguard-usdt.web.app

If you do P2P trading or get paid in crypto, please share this with someone who does.
```

For Facebook groups: join groups about crypto safety, scam awareness or P2P trading, read the pinned rules, and post the same text only if self-made tools are allowed. If not, comment helpfully on scam questions instead.

---

## 12. Instagram (carousel and caption)

Carousel (one idea per slide, large text on a dark background; make it in Canva free or any free design tool):

1. **"Fake USDT looks real."** Anyone can create a token called USDT.
2. **"The name proves nothing."** Wallets show whatever name the token picks.
3. **"Only the contract address does."** BNB Chain USDT: 0x55d3…7955.
4. **"Never trust a screenshot."** Ask for the transaction hash.
5. **"Never copy an address from history."** Scammers plant lookalikes with zero-value transfers.
6. **"Check it free."** flashguard-usdt.web.app (link in bio).

Caption:

```
Fake USDT is just a token with a copied name. Save this and share it with someone who gets paid in crypto. Free open-source checker: link in bio. Read-only, no wallet connection needed. #crypto #usdt #scamawareness #bnbchain #web3security
```

---

## 13. Telegram, Discord and WhatsApp

Only in groups where tools are welcome. Ask an admin if unsure, and never message people privately.

### Short message

```
Free tool for checking if a USDT payment is real (BNB Chain, Ethereum, Tron). Paste the tx hash, it checks the contract address and flags fake tokens and address poisoning. No wallet needed, open source: https://flashguard-usdt.web.app
```

### Message for P2P and trading groups

```
Tip for anyone receiving USDT outside an exchange's own system: a "payment" can be a token that only copies the name "USDT". Ask for the transaction hash and check it at https://flashguard-usdt.web.app (free, read-only). Also confirm in your exchange's deposit history before releasing anything.
```

### Hindi / Hinglish version (optional; adjust to your own voice)

```
Dhyan do: koi bhi "USDT" naam ka token bana sakta hai. Wallet me naam same dikhta hai, par asli USDT sirf ek contract address hai.
BNB Chain (BEP20) ka asli USDT: 0x55d398326f99059fF775485246999027B3197955
Screenshot pe bharosa mat karo, tx hash lo aur yahan check karo (free, koi login ya wallet connect nahi): https://flashguard-usdt.web.app
```

---

## 14. Video (YouTube, Shorts, Reels, TikTok)

Format: screen recording of the website with your voice or captions. Free tools: your phone/PC screen recorder, CapCut free, YouTube Studio.

### 40 second script

```
[0-5s] "Someone sent you USDT. The wallet says USDT. But is it real?"
[5-12s] Show a real fake-token transaction on BscScan. "This token is named Tether USD, but look at the contract address."
[12-22s] Open the website. Paste the tx hash into Analyze tx. Show "FAKE USDT FOUND" and "No real USDT moved."
[22-32s] Show the Check token tab and paste 0x55d398326f99059fF775485246999027B3197955 → "REAL USDT".
[32-40s] "It is free, open source, and never asks for your keys. Link in the description."
```

Description:

```
Free checker for fake/flash USDT (BNB Chain, Ethereum, Tron): https://flashguard-usdt.web.app
Code: https://github.com/atharva-khewle/flash-token-protector
Read-only. No keys, no signing. I am the author.
```

Video ideas for later: "3 ways fake USDT tricks you", "What is address poisoning (with a real example)", "How to verify a P2P payment on BNB Chain", "I scanned BNB Chain for fake USDT tokens".

---

## 15. GitHub (free and often forgotten)

Run these once to improve discoverability:

```bash
gh repo edit atharva-khewle/flash-token-protector --homepage "https://flashguard-usdt.web.app"
gh repo edit atharva-khewle/flash-token-protector --add-topic usdt,tether,bsc,bnb-chain,ethereum,tron,scam-detection,address-poisoning,chrome-extension,web3-security,crypto-security,erc20,bep20
```

Also:

- Add a **social preview image** (Settings → General → Social preview): a screenshot of a FAKE USDT FOUND result works well. 1280x640 is the recommended size.
- Pin the repository on your GitHub profile.
- Release notes blurb for the next release:

```
Flash Token Protector: free, read-only checker for fake/flash USDT and address poisoning.
New: My wallet view (optional read-only connect), Analyze tx (hash only), Check token (address only), Help tab. Chrome/Brave extension zip attached: unzip it, then load the folder in developer mode.
```

- Ask for feedback in an issue titled "Which scam patterns should I add?" and pin it. It shows the project is alive.
- Look for curated lists to suggest it to (open a pull request following each list's rules). Search GitHub for "awesome web3 security", "awesome crypto security", "awesome chrome extensions". Check the list is active and your project fits before submitting.

---

## 16. Q&A sites (Quora, Ethereum Stack Exchange, Bitcoin/Crypto communities)

Search for questions such as "how to check if USDT is fake", "how to verify a USDT transaction", "what is address poisoning", "fake USDT in my wallet". Answer properly first, then link at the end.

Answer template:

```
Short answer: the name and the symbol prove nothing, only the contract address does.

Open the transaction on the explorer, click the token and compare its contract address with the official USDT address for that chain:
- BNB Chain: 0x55d398326f99059fF775485246999027B3197955
- Ethereum: 0xdAC17F958D2ee523a2206206994597C13D831ec7
- Tron: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t

If it is a different address, it is not USDT even if it is named USDT. Also check the transaction is confirmed and final, and confirm in your exchange's deposit history before releasing goods.

Disclosure: I wrote a free open-source tool that automates these checks: https://flashguard-usdt.web.app
```

Always disclose that you are the author.

---

## 17. Reply bank (for comments and DMs)

- **"Is it safe to use?"** "It only reads public chain data. No keys, no signing, and connecting a wallet is optional (it only reads which account is selected). The code is public so you can read it."
- **"How is it different from BscScan?"** "BscScan shows what a token calls itself. This checks the contract address against the official USDT address and explains what looks wrong in the transaction, such as fake tokens and poisoning transfers."
- **"Does it work on mobile?"** "The website is responsive. The extension is for desktop Chrome/Brave."
- **"Why does it say UNVERIFIED?"** "Usually the transaction is not final yet. Wait a minute and check again; the My wallet tab re-checks new transfers for you."
- **"It missed a scam / false alarm."** "Thank you. Please open an issue with the transaction hash: github.com/atharva-khewle/flash-token-protector/issues. That is the most useful feedback I can get."
- **"Do you collect data?"** "No accounts and no analytics. Your saved addresses stay in your browser."
- **"Can you recover my funds?"** "No, and nobody can reverse an on-chain transfer. Report it to your exchange and the relevant authorities."

---

## 18. Posting plan (about two weeks, around 30 minutes a day)

| Day | Do |
|---|---|
| 1 | Run the GitHub commands (section 15). Post on X (launch post), LinkedIn, and pin both. |
| 2 | Binance Square post. Farcaster cast 1. |
| 3 | Publish the article (section 9) on Dev.to, then Medium and Hashnode with the canonical link set to the first one. |
| 4 | Reddit: r/SideProject. Reply to every comment. |
| 5 | X thread (section 2). |
| 6 | Reddit: r/opensource or r/chrome_extensions. |
| 7 | Show HN (weekday morning). Stay online to answer. |
| 8 | Product Hunt launch (schedule it a few days ahead and prepare screenshots). |
| 9 | Record the 40 second video. Post to YouTube Shorts, Reels and TikTok. |
| 10 | Threads, Facebook groups where allowed, Instagram carousel. |
| 11 | Reddit follow-up post (section 6). Farcaster cast 3. |
| 12 | Quora / Stack Exchange answers (section 16). |
| 13 | AlternativeTo, Indie Hackers, Edge Add-ons listing. |
| 14 | Read all feedback, fix the top issues, ship a release, and post "what I learned from launch week". |

Reply to every comment in the first 24 hours of each post. Early replies decide how far a post travels.

---

## 19. More free ways to get users

1. **Be present where the problem appears.** Search X and Reddit for "fake USDT", "flash USDT", "address poisoning" and "USDT not received". Reply helpfully (explain how to check), mention the tool only when it fits, and disclose that you built it.
2. **Make scam-awareness content, not ads.** One real example a week ("here is a fake USDT token I found on BNB Chain this week") performs better than product posts. Use `node scripts/find-bad-bsc.ts 300` to find fresh ones. Describe the pattern, do not accuse people.
3. **Open an issue or a discussion asking for scam patterns.** Contributors become advocates.
4. **Write for people searching.** Titles like "How to check if USDT is real on BscScan" and "What is address poisoning" bring steady search traffic over months.
5. **Ask exchanges' and wallets' community forums.** Many have free community boards or Discords where educational tools are welcome. Read the rules and disclose you are the author.
6. **Portfolio and interviews.** Link the repo, PROOF.md and the live site in your resume and LinkedIn Featured section. "I built and tested a security tool against real on-chain data" is a strong story.
7. **Offer a security researcher or a Web3 educator a heads-up.** A short, polite message ("I built this, I would value your critique") works better than asking for a share. Do not spam.
8. **Hackathons and grants (free to apply).** BNB Chain and other ecosystems run builder programs and hackathons from time to time. Look at their official sites for current ones; do not trust anyone who messages you about "grants".
9. **Keep it measurable without adding trackers.** The site promises no analytics. Use GitHub Insights (Traffic shows visits and referrers), release download counts, and stars. Do not add tracking scripts.

## 20. Safety rules for your own promotion

- Never share your seed phrase, private keys or API keys with anyone who contacts you about the tool. Nobody legitimate needs them.
- Anyone who DMs you offering to "promote your project for a fee", "list it on a top site" or "airdrop it" is almost certainly a scammer.
- Do not run giveaways or token promotions. They attract scammers.
- Do not buy followers, stars, or upvotes. They get detected and ruin trust.
- Report impersonation: if someone clones the site, report it to the host and to Cloudflare, and post the real link in your pinned posts.
