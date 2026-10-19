# Real BSC transactions to try

These are real BSC mainnet transactions found by scanning blocks with `scripts/find-fake-usdt.ts`. They are not from a published study or incident report; they are what was on chain when the scan ran (2026-10-19). Nothing here was created or sent by this project.

Paste each into the **Verify tx** tab on the [website](https://flash-token-protector.pages.dev) with chain **BSC**, the hash, and the recipient shown. Leaving the amount empty is fine.

## Fake "USDT" (expected result: FAKE)

Each token below is a contract that is not the real USDT but calls itself USDT or Tether. The tool compares the contract address, not the name.

| Token as shown by the contract | Fake contract | Tx hash | Recipient |
|---|---|---|---|
| `USDT` / "Tether USD" (vanity-looking address) | `0x6a0258127ba84b4361351be5e63e1af2c5ab8888` | `0xe1552e68bb1c54444eb01290996608f385595b6194487ff60b71407f1d5fd9b7` | `0xcbb0d62609272b9bb114e6f28a70a2ccb6ddeabe` |
| `ՍSDT` / "Tether" (first letter is Armenian, not Latin) | `0x96fb784986284cb6d4a8da6dd50dd7e85ef38f5d` | `0xaa8c173835134c2190f61294701734eaaa45a04b9e3279d1d0c6387ce8b1a09e` | `0x04a967cd92e39f88ab542e387114020cf5dc7917` |
| `USDT` / "TETHER" | `0x09293384f192a13fc355addfa6e7d3058b7c089c` | `0x5b993fe379f29e439d720a55cc615f9ea232f2b0b10c61628a2e9fb7446f9b45` | `0xf7e2adbb6f364f91a151bfd24cceac0e25207c37` |
| `USDT` / "USDT" | `0x3a7ae7a8ffaf4caf4e55ee78b48b12eb7e56767b` | `0x0531d63e72ac9150ea175fbe03244925a60a67d0f5488fe6cfa6f584aa8202e4` | `0x4b6426702287e7c50bb8c9f9297228b6c8366360` |

Open the hash on BscScan next to the tool: the transfer looks like USDT there too, which is the point. Open the contract link and compare it with the real one below.

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
