# Real BSC transactions to try

These are real BSC mainnet transactions found by scanning blocks with `scripts/find-fake-usdt.ts`. They are not from a published study or incident report; they are what was on chain when the scan ran (2026-10-19). Nothing here was created or sent by this project.

Paste each hash into the **Analyze tx** tab (hash and chain only; it finds the tokens and addresses itself), or into the **Verify tx** tab on the [website](https://flash-token-protector.pages.dev) with chain **BSC**, the hash, and the recipient shown. Leaving the amount empty is fine.

## Fake "USDT" (expected result: FAKE)

Each token below is a contract that is not the real USDT but calls itself USDT or Tether. The tool compares the contract address, not the name.

| Token as shown by the contract | Fake contract | Tx hash | Recipient |
|---|---|---|---|
| `USDT` / "Tether USD" (vanity-looking address) | `0x6a0258127ba84b4361351be5e63e1af2c5ab8888` | `0xe1552e68bb1c54444eb01290996608f385595b6194487ff60b71407f1d5fd9b7` | `0xcbb0d62609272b9bb114e6f28a70a2ccb6ddeabe` |
| `ՍSDT` / "Tether" (first letter is Armenian, not Latin) | `0x96fb784986284cb6d4a8da6dd50dd7e85ef38f5d` | `0xaa8c173835134c2190f61294701734eaaa45a04b9e3279d1d0c6387ce8b1a09e` | `0x04a967cd92e39f88ab542e387114020cf5dc7917` |
| `USDT` / "TETHER" | `0x09293384f192a13fc355addfa6e7d3058b7c089c` | `0x5b993fe379f29e439d720a55cc615f9ea232f2b0b10c61628a2e9fb7446f9b45` | `0xf7e2adbb6f364f91a151bfd24cceac0e25207c37` |
| `USDT` / "USDT" | `0x3a7ae7a8ffaf4caf4e55ee78b48b12eb7e56767b` | `0x0531d63e72ac9150ea175fbe03244925a60a67d0f5488fe6cfa6f584aa8202e4` | `0x4b6426702287e7c50bb8c9f9297228b6c8366360` |

Open the hash on BscScan next to the tool: the transfer looks like USDT there too, which is the point. Open the contract link and compare it with the real one below.

## Check token tab

Paste just the contract address with chain BSC. Expected: the four fake contracts above give **FAKE USDT**, `0x55d398326f99059fF775485246999027B3197955` gives **REAL USDT**, WBNB `0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c` gives **NOT USDT** (a different, ordinary token), and a plain wallet address gives **NOT A CONTRACT**.

## Real USDT (expected result: VERIFIED)

| What | Tx hash | Recipient | Amount |
|---|---|---|---|
| Direct transfer from the real USDT contract | `0xbe11c35efabcfd7e8ae8f349cb90395a4d3d4200de6de2b567fa374b4361b869` | `0xabf5d18ed012a814c0eedbe0ab4d31053c0cd732` | 230 |
| Swap with real USDT and a non-USDT token leg (decoy shown) | `0x7b3aaee409a3d2e55fd363afe9a1b1a8efa4b45d805502dcf9825a2430f935ec` | `0xba85435b435c487be4b49cbe63ab8ea12669ec75` | |

The real BSC USDT contract is `0x55d398326f99059fF775485246999027B3197955` ([BscScan](https://bscscan.com/token/0x55d398326f99059ff775485246999027b3197955)).

## Notes

- A swap through a router can show FAKE or NOT RECEIVED for the router's own address, because the router receives USDT and passes it on, so its net is about zero. The tool judges what the address you name ended up holding.
- The same cases run automatically with `LIVE=1 npx vitest run tests/live-fake.test.ts` (read-only, no funds).
- To find fresh ones: `node scripts/find-fake-usdt.ts 80` lists recent non-canonical tokens named like USDT, each with a sample tx hash. Check the contract before trusting the label, since legitimate wrapped or bridged tokens (for example Venus `vUSDT`) also match.
- The "wallet scan" tab cannot list fake tokens sent to an address without an explorer API key; use Verify tx with a hash.

## More fake "USDT" tokens (found 2026-10-19, expected FAKE USDT)

Found with `node scripts/find-bad-bsc.ts 300`. In the **Check token** tab each contract gives **FAKE USDT**. Pasting the tx into **Analyze tx** gives **FAKE USDT FOUND** and "No real USDT moved".

| Token as shown | Contract | Example tx |
|---|---|---|
| `USDT` / "Tether USD" (address ends in `8888`, same look as the first fake above) | `0x11aeb9dbaf3b5d0d944e5bf351f2cd3514598888` | `0xf7a76aea5c7acc221997ee7d2b6e08f4bbf5c1a7812b039ab5fe28f3e70d0647` |
| `USDT.z` / "USDT.z" | `0x2b963af25bef74337c7bdd67d01b4a53153080d5` | `0xcfab4a29ed9c515060362fa60e7f863b7433f3e1a91fa48850a0eecc0acc7a70` |
| `USDT.z` / "ZENON USDT" | `0xa64a8f8d3bee0bd3180544bf9ab6023708479786` | `0x26aebf9f43022e19352ad33e9450d380b321a0b6d31cce3b8eb7a1ef7d5d5ea4` |
| `USDTC` / "Universal Stable Dollar Token Community" | `0x9bd1a819e773a5a7d0dde4799056d55858ace0be` | `0x0f034520a8d81772d4e264d760f29181d713c33748f3680f4c5c566b329be4ea` |
| `USDT.z` / "Tether USD Bridged ZED20" | `0x4be35ec329343d7d9f548d42b0f8c17fffe07db4` and `0x231e782591e0b1fbdfc2fc58f735fcb30953a30c` | `0x10f3c34b9b685a7aec51527112ee75715cca2c68f86dee0a82bb75e4dafc72d2` |

"Fake" here means: not the canonical USDT contract but calls itself USDT/Tether. It does not claim the creator meant harm, and some bridged or wrapped tokens are legitimate products. Never treat one as USDT.

## Address poisoning (expected: PROBLEMS FOUND, "Zero-value transfer" warnings)

Real USDT zero-value transfers where the "from" address did not sign the transaction. This is how lookalike addresses get planted in a victim's history.

| What | Tx hash | Signed by |
|---|---|---|
| One transaction that makes 22 zero-value USDT transfers between unrelated addresses, for example `0x1246ad61c989ca67ccb77e2634c7c21fef02ac0d` → `0x451eb79dfb53c87c1a99bc2ad0c768972356613c` | `0x0b6acf5385887ae4063d140e118a2d15d9ec141eccae3b6282d06412364dbcc3` | `0x2574d10f5f8ebbfe3235f8aac6218087d5e95999` (sent it to contract `0x238d6d51c64aefe9f4dda9b456029f9a671435ba`) |

The signer above is an address observed doing this on chain. It is not from an official blocklist, and a batch contract can also be used for harmless reasons, so treat it as an example of the pattern, not a verdict about a person.

Dust is common too: in the same scan thousands of real-USDT transfers under 0.01 USDT showed up, many from batch tools. The wallet tab marks these "Dust".
