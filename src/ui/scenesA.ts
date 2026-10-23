// Scenes for groups A (token identity), B (flash behaviours) and C (transaction deception).
// Red arrows are fake or attacker-controlled; green arrows are real USDT; dashed grey is "signed / called".

import { attacker, contract, edge, fake, real, type Scene, unknown, victim, wallet } from './sceneKit'

const REAL = 'Real USDT contract (Tether)'

export const SCENES_A: Record<string, Scene> = {
  A1: {
    steps: [
      'The attacker deploys their own ERC-20 contract. They pick the name "Tether USD" and the symbol USDT. It costs only gas, and the attacker needs no real USDT.',
      'The attacker calls the contract so its own storage says your address holds 5,000, and it emits a Transfer event. Those numbers exist only inside the attacker\'s contract.',
      'Your wallet and the block explorer read the name and symbol from that contract, so they show "+5,000 USDT". Nothing was taken from the real Tether contract.',
      'The attacker now pressures you: release the goods, ship the order, or send a "fee" to unlock the funds. The real money flows from you to them.',
      'This tool: only the official contract address counts as USDT. This contract is not that address, so the result is FAKE USDT.',
    ],
    nodes: [
      attacker('atk', 'Attacker wallet', 0, 'SCAMMER', 'Pays gas only. Holds no real USDT.'),
      fake('fk', 'Fake "Tether USD" contract', 1, 'DEPLOYED BY ATTACKER', 'The attacker chose the name, symbol and decimals.', 'Balances are numbers in its own storage. It can emit a Transfer event with no value behind it.'),
      real('usdt', REAL, 2, 'REAL USDT', 'Nothing moved here. Real USDT has one address per chain.'),
      victim('you', 'Your wallet', 3, 'VICTIM', 'Shows "+5,000 USDT" because it trusts the name the contract reports.'),
      attacker('next', 'Attacker again', 4, 'THE REAL GOAL', 'Asks for goods, a fee, or real USDT in return.'),
    ],
    edges: [
      edge('atk', 'fk', 'created', 'deploys'),
      edge('atk', 'fk', 'call', 'calls transfer'),
      edge('fk', 'you', 'fake', '"5,000 USDT" (a number, not money)'),
      edge('usdt', 'you', 'other', 'nothing arrived'),
      edge('you', 'next', 'real', 'you pay with real value'),
    ],
    foot: 'Why wallets fall for it: the name and symbol are data the contract itself reports, so anyone can choose them.',
  },
  A2: {
    steps: [
      'The attacker deploys a token whose name looks like USDT but uses a different letter (Cyrillic Т or Ѕ), a zero-width space, USD₮, or a trailing space.',
      'It is sent to you or a victim. In a list of tokens it sits next to or looks identical to the real one.',
      'A person checking by eye, or a script comparing the symbol string, is fooled.',
      'This tool ignores names completely. L2 only accepts the exact official address, and L6 reports invisible or non-ASCII characters in the name.',
    ],
    nodes: [
      attacker('atk', 'Attacker wallet', 0, 'SCAMMER'),
      fake('fk', 'Token "USDТ" (Cyrillic Т)', 1, 'HOMOGLYPH NAME', 'Looks the same on screen.', 'Different Unicode code point, so a different string.'),
      victim('you', 'Victim wallet', 3, 'VICTIM', 'Token list shows two "USDT" rows.'),
      real('usdt', REAL, 2, 'REAL USDT', 'Only this address is USDT.'),
    ],
    edges: [edge('atk', 'fk', 'created', 'deploys'), edge('fk', 'you', 'fake', 'looks like USDT'), edge('usdt', 'you', 'other', 'no payment from here')],
    foot: 'Fix: compare contract addresses, never names.',
  },
  A3: {
    steps: [
      'The attacker deploys a fake token and creates a small trading pool pairing it with a real asset.',
      'By adding a tiny amount on the real side and trading with themselves, they set a price near $1.',
      'A wallet or tracker reads the pool price and shows "$5,000" beside the balance, which makes the fake token look valuable and real.',
      'The pool holds almost nothing, so there is nothing real to sell into. Price is not proof of identity.',
      'This tool never uses price in a verdict. Identity is the contract address only.',
    ],
    nodes: [
      attacker('atk', 'Attacker wallet', 0, 'SCAMMER', 'Seeds the pool and trades with themselves.'),
      fake('fk', 'Fake USDT token', 1, 'FAKE TOKEN'),
      contract('pool', 'Tiny trading pool', 2, 'PRICE FAKED', 'Almost no liquidity.', 'Price set by the attacker\'s own trades.'),
      victim('you', 'Victim wallet', 3, 'VICTIM', 'Shows a dollar value next to the balance.'),
    ],
    edges: [edge('atk', 'pool', 'call', 'adds dust liquidity'), edge('atk', 'fk', 'created', 'deploys'), edge('fk', 'pool', 'fake', 'paired'), edge('fk', 'you', 'fake', 'airdropped balance'), edge('pool', 'you', 'other', 'price feed says $1')],
  },
  A4: {
    steps: [
      'A token once had real value somewhere, for example a bridged copy of USDT, and its bridge later broke or was shut down.',
      'The token keeps its name, logo and history, so it looks legitimate.',
      'The attacker pays with it, or sells it as "USDT", and the victim sees a real-looking asset.',
      'This tool checks the official address for the chosen chain. A bridged or pegged copy is a different contract, so it is a decoy.',
    ],
    nodes: [
      attacker('atk', 'Payer', 0, 'SENDER'),
      fake('old', 'Bridged "USDT" copy', 1, 'NOT THE OFFICIAL ADDRESS', 'Was redeemable through a bridge that no longer works.'),
      real('usdt', REAL, 2, 'REAL USDT'),
      victim('you', 'Receiver', 3, 'RECEIVER', 'Sees a token called USDT with history.'),
    ],
    edges: [edge('atk', 'old', 'call', 'transfers'), edge('old', 'you', 'fake', 'bridged copy'), edge('usdt', 'you', 'other', 'nothing real moved')],
  },
  A5: {
    steps: [
      'The attacker pays on a different network, such as a testnet, a fork, or another EVM chain, and shares the transaction hash.',
      'The same hash format exists on every EVM chain, so opening it on the wrong explorer shows a "successful USDT transfer".',
      'You believe the money arrived. On the real chain you use, the hash does not exist.',
      'This tool makes you choose the chain and only reads that chain\'s mainnet nodes. If the hash is not there, the result is NOT RECEIVED.',
    ],
    nodes: [
      attacker('atk', 'Attacker', 0, 'SENDER'),
      unknown('other', 'Another chain or testnet', 1, 'WRONG NETWORK', 'The transfer is real there, worth nothing to you.'),
      real('main', 'Your chain\'s mainnet', 2, 'WHERE YOU ARE PAID', 'Hash not found.'),
      victim('you', 'Receiver', 3, 'RECEIVER'),
    ],
    edges: [edge('atk', 'other', 'fake', 'pays here'), edge('other', 'you', 'fake', 'hash looks valid'), edge('main', 'you', 'other', 'nothing arrived')],
  },
  A6: {
    steps: [
      'USDT on BSC has 18 decimals. On Ethereum and Tron it has 6. The same raw number means very different amounts.',
      'The attacker shows a raw value such as 5000000000. On Tron it is 5,000 USDT. On BSC it is 0.000000005 USDT.',
      'Or a fake token sets its own decimals, for example 0, so a small raw number is displayed as a huge one.',
      'This tool uses the decimals stored in its registry for each chain, never the token\'s own claim.',
    ],
    nodes: [
      attacker('atk', 'Attacker', 0, 'SENDER'),
      fake('fk', 'Token with custom decimals', 1, 'DECIMALS = 0', 'Raw 1,000,000 displays as 1,000,000 units.'),
      real('usdt', 'Real USDT', 2, 'REAL USDT', 'BSC: 18 decimals. Ethereum and Tron: 6.'),
      victim('you', 'Receiver', 3, 'RECEIVER', 'Sees a big number.'),
    ],
    edges: [edge('atk', 'fk', 'created', 'sets decimals'), edge('fk', 'you', 'fake', 'huge displayed amount'), edge('usdt', 'you', 'other', 'real amount is tiny')],
  },
  A7: {
    steps: [
      'The attacker names the token something like "Claim reward at usdt-bonus.xyz" or puts instructions in the symbol.',
      'The token is airdropped to many wallets. It appears in the wallet\'s token list.',
      'Curious holders open the link. The site asks them to connect and sign, which drains them.',
      'This tool flags URLs and instruction words in token names and shows names only as plain text, never as links.',
    ],
    nodes: [
      attacker('atk', 'Attacker', 0, 'SCAMMER'),
      fake('fk', 'Token named with a link', 1, 'LURE TOKEN', 'Name carries a URL or "claim now".'),
      victim('you', 'Many wallets', 3, 'TARGETS', 'See the lure in their token list.'),
      attacker('site', 'Drainer website', 4, 'PHISHING SITE', 'Asks to connect and sign.'),
    ],
    edges: [edge('atk', 'fk', 'created', 'deploys'), edge('fk', 'you', 'fake', 'airdrop'), edge('you', 'site', 'approval', 'victim clicks and signs')],
  },
  A36: {
    steps: [
      'The attacker gives you an address that differs from the real one by a single character.',
      'People compare only the first and last characters, so the changed character is missed.',
      'A mixed-case EVM address carries a checksum in its capital letters. A manual edit usually breaks it.',
      'This tool refuses a mixed-case address with a wrong checksum, and a Tron address with a bad checksum.',
    ],
    nodes: [
      attacker('atk', 'Attacker', 0, 'SCAMMER'),
      fake('bad', 'Address with one character changed', 1, 'CHECKSUM FAILS', 'Looks almost identical.'),
      wallet('good', 'Your real address', 2, 'EXPECTED'),
      victim('you', 'You (sending)', 3, 'SENDER'),
    ],
    edges: [edge('atk', 'bad', 'lookalike', 'edits one char'), edge('bad', 'you', 'lookalike', 'copy-paste'), edge('good', 'bad', 'lookalike', 'differs by 1 char')],
  },
  B8: {
    steps: [
      'The attacker builds a token whose balance depends on time, or that the owner can burn, freeze or pause later.',
      'Today the victim sees a balance. Tomorrow the owner burns it, blacklists the victim, or pauses transfers.',
      'The balance was never backed by Tether. It only looked real for a while.',
      'This tool already marks any non-official token FAKE. L6 adds the reasons: mint, burn, pause and blacklist functions, and a balance lower than the logged amount.',
    ],
    nodes: [
      attacker('atk', 'Token owner (attacker)', 0, 'OWNER', 'Holds burn, mint and pause powers.'),
      fake('fk', 'Revocable "USDT" token', 1, 'CONTROLLED TOKEN', 'Owner can change balances later.'),
      victim('you', 'Victim wallet', 3, 'VICTIM', 'Balance appears, then disappears or is frozen.'),
      real('usdt', REAL, 2, 'REAL USDT', 'No revoke by a random owner.'),
    ],
    edges: [edge('atk', 'fk', 'call', 'burn / pause / blacklist'), edge('fk', 'you', 'fake', 'balance today'), edge('usdt', 'you', 'other', 'nothing real')],
  },
  B9: {
    steps: [
      'The attacker deploys a token where transfer() reverts for everyone except the owner or a whitelist.',
      'The victim receives or buys it and sees a balance.',
      'When the victim tries to send or sell, every attempt fails.',
      'This tool simulates transfer(random, 1) from the holder with eth_call. A revert is flagged as a honeypot.',
    ],
    nodes: [
      attacker('atk', 'Attacker (owner)', 0, 'OWNER', 'Whitelisted. Can move the token.'),
      fake('fk', 'Honeypot token', 1, 'TRANSFER REVERTS', 'Blocks everyone except the owner.'),
      victim('you', 'Victim', 3, 'HOLDER', 'Can see the balance but cannot move it.'),
    ],
    edges: [edge('atk', 'fk', 'created', 'deploys with a trap'), edge('fk', 'you', 'fake', 'balance shown'), edge('you', 'fk', 'call', 'tries to send: reverts')],
  },
  B10: {
    steps: [
      'The attacker deploys a token behind an upgradeable proxy. Its code looks harmless at the time you look.',
      'After you trust it, the owner upgrades the implementation to different code.',
      'The new code can freeze balances, mint more, or steal approvals.',
      'This tool reads the EIP-1967 implementation and beacon slots, spots EIP-1167 minimal proxies, and flags upgrade functions.',
    ],
    nodes: [
      attacker('atk', 'Proxy admin (attacker)', 0, 'ADMIN'),
      contract('proxy', 'Token proxy', 1, 'UPGRADEABLE', 'Holds balances. Logic can be replaced.'),
      fake('v2', 'New malicious logic', 2, 'AFTER UPGRADE', 'Freeze, mint, or sweep.'),
      victim('you', 'Holder', 3, 'HOLDER'),
    ],
    edges: [edge('atk', 'proxy', 'call', 'upgradeTo(new)'), edge('proxy', 'v2', 'call', 'delegates to'), edge('v2', 'you', 'fake', 'balance changes')],
  },
  B11: {
    steps: [
      'The attacker deploys a token where balanceOf returns a large number for any address, or emits Transfer events without changing storage.',
      'The wallet and explorer ask the contract for balances. The contract lies.',
      'The victim believes the balance exists. It is never backed by anything.',
      'This tool calls balanceOf on a fresh random address. If that is not zero, the balances are fiction.',
    ],
    nodes: [
      attacker('atk', 'Attacker', 0, 'SCAMMER'),
      fake('fk', 'Lying token', 1, 'balanceOf LIES', 'Returns a big number for everyone.'),
      victim('you', 'Victim', 3, 'VICTIM', 'Sees a balance.'),
      unknown('rnd', 'Random fresh address', 2, 'THE TEST', 'A real token returns 0 here.'),
    ],
    edges: [edge('atk', 'fk', 'created', 'deploys'), edge('fk', 'you', 'fake', 'balanceOf says 5,000'), edge('fk', 'rnd', 'fake', 'also says a big number: caught')],
  },
  B12: {
    steps: [
      'A token takes a fee on transfer, or changes balances itself (rebasing).',
      'A transfer event says 1,000, but the receiver ends up with 950.',
      'Software that adds up the event amounts credits too much.',
      'Official USDT has no fee today. For decoys, this tool flags a balance that is lower than the logged amount.',
    ],
    nodes: [
      attacker('atk', 'Sender', 0, 'SENDER'),
      fake('fk', 'Fee-on-transfer token', 1, 'TAKES A FEE', 'Event says 1,000. Receiver gets 950.'),
      wallet('fee', 'Fee collector', 2, 'GETS 50'),
      victim('you', 'Receiver', 3, 'RECEIVER', 'Credited less than logged.'),
    ],
    edges: [edge('atk', 'fk', 'call', 'transfer 1,000'), edge('fk', 'you', 'fake', '950 arrives'), edge('fk', 'fee', 'other', '50 skimmed')],
  },
  B49: {
    steps: [
      'The attacker deploys a token and later removes the contract with selfdestruct, or replaces its code.',
      'Old transactions still show the transfer in explorers.',
      'But the token no longer exists, or behaves differently.',
      'This tool checks whether there is code at the token address now and reports "no code at this address".',
    ],
    nodes: [
      attacker('atk', 'Attacker', 0, 'SCAMMER'),
      fake('fk', 'Token that vanishes', 1, 'CODE REMOVED', 'No code at this address now.'),
      victim('you', 'Holder', 3, 'HOLDER', 'Old history still shows a transfer.'),
    ],
    edges: [edge('atk', 'fk', 'call', 'selfdestruct / replace'), edge('fk', 'you', 'fake', 'history only')],
  },
  C13: {
    steps: [
      'The attacker deploys a contract that can emit any event. They emit Transfer(from = a known exchange wallet, to = you, 10,000).',
      'Block explorers index every log with the Transfer topic, so the token transfers tab shows "From: Binance".',
      'No balance changed and no exchange sent anything. The event is theatre.',
      'This tool only decodes logs emitted by the official USDT contract. Every other log is listed under decoys.',
    ],
    nodes: [
      attacker('atk', 'Attacker', 0, 'SCAMMER'),
      fake('fk', 'Contract that emits fake events', 1, 'EMITS Transfer'),
      wallet('ex', 'Exchange hot wallet', 2, 'NOT INVOLVED', 'Never sent anything.'),
      victim('you', 'You', 3, 'VICTIM', 'Explorer shows "From: exchange".'),
      real('usdt', REAL, 4, 'REAL USDT', 'Emitted no log.'),
    ],
    edges: [edge('atk', 'fk', 'call', 'calls emit()'), edge('fk', 'you', 'fake', 'event "from exchange"'), edge('ex', 'you', 'lookalike', 'claimed sender'), edge('usdt', 'you', 'other', 'no real log')],
  },
  C14: {
    steps: [
      'One transaction sends you 1 real USDT and 4,999 of a fake token.',
      'A parser that adds up all Transfer events reports "5,000 USDT received".',
      'Only 1 USDT is real.',
      'This tool sums only the official contract\'s logs and lists decoys that credit you. The expected amount check then fails.',
    ],
    nodes: [
      attacker('atk', 'Sender', 0, 'ATTACKER'),
      real('usdt', REAL, 2, 'REAL USDT', '1 USDT in this transaction.'),
      fake('fk', 'Fake token', 1, 'DECOY', '4,999 in the same transaction.'),
      victim('you', 'You', 3, 'RECEIVER'),
    ],
    edges: [edge('atk', 'usdt', 'call', 'transfer 1'), edge('atk', 'fk', 'call', 'transfer 4,999'), edge('usdt', 'you', 'real', '1 real USDT'), edge('fk', 'you', 'fake', '4,999 fake')],
  },
  C15: {
    steps: [
      'The attacker sends a transaction that reverts (status 0). Its input data still reads transfer(you, 5000).',
      'A screenshot or a decoded-input view shows the intended transfer.',
      'The chain recorded a failure. No state changed and no USDT moved.',
      'This tool reads the receipt. If the status is not success, the result is FAKE.',
    ],
    nodes: [
      attacker('atk', 'Sender', 0, 'ATTACKER'),
      unknown('tx', 'Reverted transaction', 1, 'STATUS: FAILED', 'Input says transfer(you, 5000). Execution reverted.'),
      real('usdt', REAL, 2, 'REAL USDT', 'No transfer happened.'),
      victim('you', 'You', 3, 'RECEIVER'),
    ],
    edges: [edge('atk', 'tx', 'call', 'signed'), edge('tx', 'usdt', 'other', 'reverted'), edge('usdt', 'you', 'other', 'nothing arrived')],
  },
  C16: {
    steps: [
      'The attacker broadcasts a payment with a low fee and shows you the pending hash.',
      'They then replace it (same nonce) or let it drop, so the payment never lands.',
      'You release goods against a transaction that was never mined.',
      'This tool treats pending or unknown as NOT RECEIVED, and only accepts finalized blocks.',
    ],
    nodes: [
      attacker('atk', 'Sender', 0, 'ATTACKER'),
      unknown('pend', 'Pending transaction', 1, 'NOT MINED', 'Low fee. Can be replaced or dropped.'),
      unknown('rep', 'Replacement transaction', 2, 'SAME NONCE', 'Pays the attacker back.'),
      victim('you', 'You', 3, 'RECEIVER'),
    ],
    edges: [edge('atk', 'pend', 'call', 'broadcasts'), edge('atk', 'rep', 'call', 'replaces it'), edge('pend', 'you', 'other', '"on its way"')],
  },
  C17: {
    steps: [
      'The attacker shows a transaction that is only one or two blocks deep.',
      'A short fork or a reorg removes the block that held it.',
      'Your "received" payment disappears.',
      'This tool requires the block to be at or below the chain\'s finalized height (or a confirmation fallback). Otherwise the result is UNVERIFIED.',
    ],
    nodes: [
      attacker('atk', 'Sender', 0, 'ATTACKER'),
      unknown('blk', 'Recent, not final block', 1, 'MAY BE REORGED', '1-2 confirmations.'),
      real('fin', 'Finalized chain', 2, 'WHAT COUNTS', 'The payment must be here.'),
      victim('you', 'You', 3, 'RECEIVER'),
    ],
    edges: [edge('atk', 'blk', 'fake', 'payment included'), edge('blk', 'fin', 'other', 'reorg removes it'), edge('blk', 'you', 'fake', 'looks received')],
  },
  C18: {
    steps: [
      'The attacker finds a real payment from someone else, an old payment, or a smaller payment.',
      'They show you the genuine explorer page. The transaction is real.',
      'But it was not to your address, not for this deal, or not this amount. Or the same hash is shown to many victims.',
      'This tool needs your address and checks the recipient, amount, time, and whether the hash was used before.',
    ],
    nodes: [
      attacker('atk', 'Scammer', 0, 'SCAMMER'),
      wallet('other', 'Someone else\'s wallet', 2, 'REAL RECIPIENT', 'The payment was genuinely sent here.'),
      real('usdt', REAL, 1, 'REAL USDT', 'Real transfer, real tx.'),
      victim('you', 'You', 3, 'WAITING FOR PAYMENT'),
    ],
    edges: [edge('usdt', 'other', 'real', 'real payment to someone else'), edge('atk', 'you', 'call', 'shows you this tx'), edge('usdt', 'you', 'other', 'nothing for you')],
  },
  C19: {
    steps: [
      'In one transaction USDT goes to you, and is pulled back out using a prior approval.',
      'The Transfer event "to you" is visible. The pull-back is another event.',
      'Net, you received nothing.',
      'This tool computes the net change of the official USDT per address inside the transaction.',
    ],
    nodes: [
      attacker('atk', 'Attacker', 0, 'ATTACKER'),
      real('usdt', REAL, 2, 'REAL USDT'),
      victim('you', 'You', 3, 'RECEIVER', 'Net change: 0.'),
    ],
    edges: [edge('atk', 'you', 'real', '+5,000 in'), edge('you', 'atk', 'real', '-5,000 pulled back'), edge('atk', 'usdt', 'call', 'both in one tx')],
  },
  C20: {
    steps: [
      'The attacker gives you a block hash, an address, or a hash of the wrong length as "the transaction hash".',
      'An explorer opens a block or address page that looks official.',
      'It is not a payment.',
      'This tool validates length and kind, refuses addresses, and says when you pasted a block hash.',
    ],
    nodes: [
      attacker('atk', 'Scammer', 0, 'SCAMMER'),
      unknown('obj', 'Block hash or address', 1, 'WRONG OBJECT', 'Not a transaction.'),
      victim('you', 'You', 3, 'VICTIM'),
    ],
    edges: [edge('atk', 'obj', 'call', 'shares as "tx hash"'), edge('obj', 'you', 'fake', 'looks official')],
  },
  C37: {
    steps: [
      'A payment is made through a router or multicall contract, so the transaction\'s "to" is not the USDT contract.',
      'A checker that requires tx.to == USDT rejects a real payment, or one that trusts tx.to can be fooled.',
      'The truth is in the logs, not in tx.to.',
      'This tool only reads the official contract\'s logs and never uses tx.to.',
    ],
    nodes: [
      wallet('payer', 'Payer', 0, 'SENDER'),
      contract('rt', 'Router or multicall', 1, 'tx.to', 'Not the USDT contract.'),
      real('usdt', REAL, 2, 'REAL USDT', 'Emits the Transfer log.'),
      victim('you', 'Receiver', 3, 'RECEIVER'),
    ],
    edges: [edge('payer', 'rt', 'call', 'calls'), edge('rt', 'usdt', 'call', 'calls transfer'), edge('usdt', 'you', 'real', 'real USDT')],
  },
  C38: {
    steps: [
      'The attacker sends TRX, BNB, or a TRC10 asset named "USDT".',
      'A wallet that lists many asset types shows "USDT".',
      'No TRC20 transfer from the official contract happened.',
      'This tool requires a log from the official TRC20 contract. Anything else is FAKE.',
    ],
    nodes: [
      attacker('atk', 'Attacker', 0, 'SCAMMER'),
      fake('t10', 'TRC10 asset named "USDT"', 1, 'NOT TRC20', 'No contract and no log.'),
      real('usdt', 'Official TRC20 USDT', 2, 'REAL USDT', 'Emitted no log.'),
      victim('you', 'Receiver', 3, 'RECEIVER'),
    ],
    edges: [edge('atk', 't10', 'created', 'issues'), edge('t10', 'you', 'fake', 'shown as USDT'), edge('usdt', 'you', 'other', 'no real log')],
  },
  C40: {
    steps: [
      'The attacker controls a node or explorer on a minority fork, or a private chain with a longer history.',
      'It shows a transaction that does not exist on the main chain.',
      'Looking at one data source, you accept it.',
      'This tool asks two independent providers and requires identical answers plus finality.',
    ],
    nodes: [
      attacker('atk', 'Attacker', 0, 'SCAMMER'),
      unknown('fork', 'Minority fork or fake node', 1, 'NOT THE MAIN CHAIN', 'Shows the transaction.'),
      real('main', 'Main chain', 2, 'WHAT COUNTS', 'No such transaction.'),
      victim('you', 'You', 3, 'VICTIM'),
    ],
    edges: [edge('atk', 'fork', 'call', 'controls'), edge('fork', 'you', 'fake', 'shows a payment'), edge('main', 'you', 'other', 'no payment')],
  },
}
