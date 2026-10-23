// Scenes for groups D (address poisoning), E (approvals and control), F (off-chain and infrastructure) and G (other chains).

import { attacker, contract, edge, fake, real, type Scene, unknown, victim, wallet } from './sceneKit'

const REAL = 'Real USDT contract (Tether)'

export const SCENES_B: Record<string, Scene> = {
  D21: {
    steps: [
      'The attacker generates an address that matches the first and last characters of an address you really use.',
      'They call transferFrom(you, lookalike, 0). Many tokens allow a zero-amount transfer without any allowance.',
      'Your history now shows an outgoing transfer of 0 from you to the lookalike, though you signed nothing.',
      'When you later copy "the last address you paid" from history, you copy the lookalike.',
      'This tool flags an outgoing zero-value transfer where the transaction sender is not you.',
    ],
    nodes: [
      attacker('atk', 'Attacker', 0, 'SENDER OF THE TX', 'Signs the transaction and pays gas.'),
      attacker('look', 'Lookalike address', 2, 'MATCHES YOUR START AND END', 'Controlled by the attacker.'),
      wallet('good', 'Your real contact', 1, 'ADDRESS YOU USE'),
      victim('you', 'Your wallet', 3, 'VICTIM', 'History shows "you sent 0".'),
    ],
    edges: [edge('atk', 'you', 'call', 'signs transferFrom'), edge('you', 'look', 'zero', '0 USDT (not signed by you)'), edge('good', 'look', 'lookalike', 'looks the same')],
  },
  D22: {
    steps: [
      'The attacker watches who you pay, then grinds out a vanity address with the same first and last characters.',
      'They send you a tiny amount (dust) of real or fake USDT from that address.',
      'It shows in your history. A truncated view like 0x1234…abcd looks like your contact.',
      'This tool compares addresses with your watchlist and people you really paid, and flags prefix and suffix matches.',
    ],
    nodes: [
      attacker('atk', 'Attacker', 0, 'GENERATES LOOKALIKES'),
      attacker('look', 'Vanity lookalike', 1, 'FAKE CONTACT', 'First and last characters match.'),
      wallet('good', 'Contact you really pay', 2, 'REAL ADDRESS'),
      victim('you', 'Your wallet', 3, 'VICTIM'),
    ],
    edges: [edge('atk', 'look', 'created', 'creates'), edge('look', 'you', 'dust', 'dust payment'), edge('good', 'look', 'lookalike', 'same start and end')],
  },
  D23: {
    steps: [
      'The lookalike address is already in your history from step D21 or D22.',
      'When you make a withdrawal you copy "the usual address" from recent transactions.',
      'You copy the attacker\'s address instead and send real USDT there.',
      'This tool\'s "Before you send" check compares the destination with your saved addresses and shows a per-character diff.',
    ],
    nodes: [
      victim('you', 'You (sending)', 0, 'SENDER', 'Copies from history.'),
      attacker('look', 'Poisoned address', 2, 'ATTACKER\'S', 'Looks like your contact.'),
      wallet('good', 'Intended receiver', 1, 'WHO YOU MEANT'),
      real('usdt', REAL, 3, 'REAL USDT'),
    ],
    edges: [edge('you', 'look', 'real', 'real USDT sent by mistake'), edge('good', 'look', 'lookalike', 'looks the same'), edge('usdt', 'look', 'real', 'moves to attacker')],
  },
  D41: {
    steps: [
      'The attacker matches only the first four characters of an address you use.',
      'It is a weaker lookalike, relying on people who only check the start.',
      'This tool does not flag a prefix-only match, because it would raise too many false alarms.',
      'It still tells you "NEW address" before you send, which is your cue to check the whole thing.',
    ],
    nodes: [
      attacker('look', 'Prefix-only lookalike', 1, 'NOT FLAGGED', 'Only the first 4 characters match.'),
      wallet('good', 'Your real contact', 2, 'REAL ADDRESS'),
      victim('you', 'You', 3, 'SENDER'),
    ],
    edges: [edge('good', 'look', 'lookalike', 'same first 4 only'), edge('look', 'you', 'dust', 'dust payment')],
    foot: 'Documented residual risk: this tool tells you the address is new, not that it is hostile.',
  },
  D42: {
    steps: [
      'Same as D22, but the dust is a fake-token transfer that costs the attacker nothing real.',
      'The fake token is named like USDT with an amount that matches a past payment.',
      'Your history shows what looks like a payment from a familiar address.',
      'This tool groups fake tokens that impersonate USDT and reports them with the lookalike.',
    ],
    nodes: [
      attacker('atk', 'Attacker', 0, 'SCAMMER'),
      fake('fk', 'Fake USDT token', 1, 'FAKE TOKEN'),
      attacker('look', 'Lookalike address', 2, 'SENDER SHOWN'),
      victim('you', 'Your wallet', 3, 'VICTIM'),
    ],
    edges: [edge('atk', 'fk', 'created', 'deploys'), edge('fk', 'you', 'fake', 'fake transfer from lookalike'), edge('look', 'you', 'lookalike', 'looks like your contact')],
  },
  E24: {
    steps: [
      'You visit a fake claim or mint site and are asked to sign a message that looks like a login.',
      'The message is a permit or a Permit2 transfer authorisation for USDT, or you send an approve() transaction with an unlimited amount.',
      'The attacker\'s spender contract now has permission to move your USDT. No funds have moved yet.',
      'Later, or at once, the attacker calls transferFrom and sweeps your balance.',
      'This tool lists live allowances (Approval logs plus a current allowance() call) and flags unlimited ones.',
    ],
    nodes: [
      attacker('site', 'Phishing site', 0, 'SCAMMER', 'Fake claim, mint or login page.'),
      victim('you', 'Your wallet', 1, 'VICTIM', 'Signs or approves.'),
      real('usdt', REAL, 2, 'REAL USDT', 'Holds the allowance record.'),
      attacker('sp', 'Attacker spender', 3, 'CAN SPEND YOUR USDT', 'Gets an unlimited allowance.'),
    ],
    edges: [edge('site', 'you', 'call', 'asks you to sign'), edge('you', 'usdt', 'approval', 'approve(unlimited)'), edge('usdt', 'sp', 'approval', 'allowance recorded'), edge('you', 'sp', 'real', 'later: all USDT pulled')],
  },
  E25: {
    steps: [
      'You are tricked into signing an EIP-7702 authorisation that points your account to a drainer contract.',
      'Your address now has contract code that starts with 0xef0100 followed by the drainer\'s address.',
      'It still looks like a normal wallet. Funds sent to it, or gas you add, can be swept automatically.',
      'This tool reads getCode(your address) and shows the delegation target if there is one.',
    ],
    nodes: [
      attacker('site', 'Phishing site', 0, 'SCAMMER'),
      victim('you', 'Your account (EOA)', 1, 'VICTIM', 'Code starts with 0xef0100.'),
      contract('dr', 'Drainer contract', 2, 'DELEGATION TARGET', 'Code that now runs as your account.'),
      attacker('sink', 'Attacker wallet', 3, 'RECEIVES FUNDS'),
    ],
    edges: [edge('site', 'you', 'call', 'asks you to sign 7702'), edge('you', 'dr', 'approval', 'delegates to'), edge('dr', 'sink', 'real', 'sweeps funds out')],
  },
  E26: {
    steps: [
      'The attacker posts a seed phrase for a "free" wallet that holds USDT.',
      'You import it. You can see USDT, but to move it you need gas (TRX or ETH or BNB).',
      'You send gas to that wallet. A script that watches it sends the gas out before your transaction runs. On Tron the attacker may also have moved the owner permission to their own key.',
      'You lose your gas and the USDT stays locked.',
      'This tool checks Tron owner permissions. A sweeper bot on EVM is behaviour it cannot see (residual).',
    ],
    nodes: [
      attacker('atk', 'Attacker', 0, 'POSTS THE SEED'),
      wallet('bait', 'Bait wallet with USDT', 1, 'HONEYPOT', 'Owner key or sweeper belongs to the attacker.'),
      victim('you', 'You', 2, 'VICTIM', 'Imports the seed and adds gas.'),
      attacker('sink', 'Attacker\'s other wallet', 3, 'COLLECTS GAS'),
    ],
    edges: [edge('atk', 'you', 'call', 'shares the seed'), edge('you', 'bait', 'real', 'you add gas'), edge('bait', 'sink', 'real', 'gas swept out at once')],
  },
  E27: {
    steps: [
      'The attacker gets a way to edit the account\'s permissions: leaked key, a signed permission change, or a fake "energy" service.',
      'They add their key and raise the signing threshold so the owner alone can no longer sign.',
      'The account still receives deposits and still looks normal.',
      'This tool checks that the owner permission holds only your key with enough weight.',
    ],
    nodes: [
      attacker('atk', 'Attacker', 0, 'ADDS A KEY'),
      victim('acc', 'Your Tron account', 1, 'VICTIM', 'Owner permission now includes the attacker.'),
      wallet('dep', 'Anyone sending you USDT', 2, 'DEPOSITS STILL ARRIVE'),
    ],
    edges: [edge('atk', 'acc', 'approval', 'adds own key, raises threshold'), edge('dep', 'acc', 'real', 'deposits keep coming')],
  },
  E43: {
    steps: [
      'Malware runs on your device and watches the clipboard.',
      'You copy your recipient\'s address.',
      'The malware swaps it for the attacker\'s address.',
      'You paste without checking and send real USDT to the attacker.',
      'This tool\'s send check shows NEW or LOOKALIKE. The malware itself is on your device and is out of its reach.',
    ],
    nodes: [
      attacker('mal', 'Clipper malware', 0, 'ON YOUR DEVICE', 'Watches the clipboard.'),
      victim('you', 'You', 1, 'VICTIM', 'Copies the right address.'),
      attacker('atk', 'Attacker address', 2, 'PASTED INSTEAD'),
      wallet('good', 'Intended receiver', 3, 'WHO YOU MEANT'),
    ],
    edges: [edge('you', 'mal', 'call', 'copies address'), edge('mal', 'atk', 'lookalike', 'replaces it'), edge('you', 'atk', 'real', 'USDT sent to attacker')],
  },
  E44: {
    steps: [
      'You approve an NFT collection or another token, for example setApprovalForAll for a marketplace.',
      'Phishing makes you sign something that lets the attacker use that approval.',
      'The attacker moves your NFTs or tokens, not USDT.',
      'This tool lists USDT approvals only. For other tokens and NFTs use a dedicated revoke tool.',
    ],
    nodes: [
      attacker('site', 'Phishing site', 0, 'SCAMMER'),
      victim('you', 'Your wallet', 1, 'VICTIM'),
      contract('mk', 'Marketplace or other contract', 2, 'EXISTING APPROVAL'),
      attacker('atk', 'Attacker', 3, 'TAKES THE ASSETS'),
    ],
    edges: [edge('site', 'you', 'call', 'asks you to sign'), edge('you', 'mk', 'approval', 'approval exists'), edge('mk', 'atk', 'other', 'assets moved')],
  },
  F28: {
    steps: [
      'The attacker edits a screenshot, makes a fake PDF receipt, or messages as "support".',
      'You see a convincing "payment confirmed".',
      'Nothing is on the chain.',
      'This tool accepts only a hash and reads the chain. The exchange\'s deposit history is the final word.',
    ],
    nodes: [
      attacker('atk', 'Scammer', 0, 'SCAMMER'),
      fake('img', 'Edited screenshot or fake receipt', 1, 'NOT ON CHAIN'),
      victim('you', 'You', 3, 'VICTIM'),
      real('chain', 'The chain', 2, 'TRUTH', 'No such transaction.'),
    ],
    edges: [edge('atk', 'img', 'created', 'makes'), edge('img', 'you', 'fake', '"payment confirmed"'), edge('chain', 'you', 'other', 'nothing there')],
  },
  F29: {
    steps: [
      'The attacker registers a domain one letter off from a real explorer and copies its look.',
      'They send you a link to a "transaction" page on that domain.',
      'The page shows whatever the attacker wants. It may also ask you to connect a wallet.',
      'This tool builds explorer links only from its registry and never from your input. You paste a hash, not a link.',
    ],
    nodes: [
      attacker('atk', 'Scammer', 0, 'SENDS THE LINK'),
      fake('site', 'Fake explorer site', 1, 'LOOKALIKE DOMAIN', 'Shows an invented transaction.'),
      real('exp', 'Real explorer', 2, 'REAL SITE', 'No such transaction.'),
      victim('you', 'You', 3, 'VICTIM'),
    ],
    edges: [edge('atk', 'you', 'call', 'sends link'), edge('site', 'you', 'fake', 'invented page'), edge('exp', 'you', 'other', 'nothing there')],
  },
  F30: {
    steps: [
      'A malicious node, or one the attacker controls, answers your wallet\'s questions.',
      'It returns a receipt or a balance that does not exist on the real chain.',
      'The wallet or checker trusts that single source.',
      'This tool asks at least two independent providers and requires byte-identical answers. Disagreement gives UNVERIFIED.',
    ],
    nodes: [
      attacker('rpc', 'Malicious RPC node', 1, 'LYING SOURCE', 'Returns invented data.'),
      real('good', 'Honest RPC node', 2, 'TRUTH'),
      victim('you', 'Checker', 3, 'ASKS BOTH'),
    ],
    edges: [edge('rpc', 'you', 'fake', 'fake receipt'), edge('good', 'you', 'other', 'different answer: mismatch')],
  },
  F31: {
    steps: [
      'The USDT is real and was sent from an address linked to theft or sanctions.',
      'It arrives normally. Later, Tether can add the sender or the receiver to its blacklist and freeze the funds.',
      'A payment that was real can become unusable.',
      'This tool checks isBlackListed(sender) on Ethereum and Tron and shows a warning. BSC has no getter.',
    ],
    nodes: [
      attacker('dirty', 'Sender with dirty funds', 0, 'TAINTED SOURCE'),
      real('usdt', REAL, 1, 'REAL USDT', 'Has a blacklist function.'),
      victim('you', 'Receiver', 2, 'RECEIVER', 'May later be frozen.'),
      unknown('tether', 'Tether', 3, 'CAN FREEZE'),
    ],
    edges: [edge('dirty', 'you', 'real', 'real USDT arrives'), edge('tether', 'usdt', 'call', 'addToBlacklist'), edge('usdt', 'you', 'other', 'funds frozen')],
  },
  F32a: {
    steps: [
      'The attacker deploys a token whose name or symbol contains HTML, like an img tag with an onerror handler.',
      'An app that renders the name with innerHTML runs the script in the visitor\'s browser.',
      'The script can ask to connect or sign, or read page data.',
      'This tool only inserts chain strings as text nodes and uses a strict content security policy.',
    ],
    nodes: [
      attacker('atk', 'Attacker', 0, 'SCAMMER'),
      fake('fk', 'Token with a script in its name', 1, 'HTML IN THE NAME'),
      contract('app', 'A web app that renders names as HTML', 2, 'VULNERABLE'),
      victim('you', 'Visitor', 3, 'VICTIM'),
    ],
    edges: [edge('atk', 'fk', 'created', 'deploys'), edge('fk', 'app', 'fake', 'name is read'), edge('app', 'you', 'call', 'script runs')],
  },
  F32b: {
    steps: [
      'A site is built with an API key inside its JavaScript bundle.',
      'Anyone can open the bundle and copy the key.',
      'They use your quota, or access paid features, or read private data.',
      'This tool keeps no keys in the frontend. The optional explorer key lives only in the serverless function.',
    ],
    nodes: [
      contract('bundle', 'Public JavaScript bundle', 1, 'CONTAINS A KEY'),
      attacker('atk', 'Anyone', 0, 'COPIES THE KEY'),
      contract('api', 'Provider API', 2, 'YOUR QUOTA'),
    ],
    edges: [edge('atk', 'bundle', 'call', 'reads'), edge('atk', 'api', 'call', 'uses the key')],
  },
  F32c: {
    steps: [
      'The attacker finds an input that changes the response but is not part of the cache key.',
      'They send a crafted request so the CDN stores the poisoned response.',
      'Other visitors receive it from the cache.',
      'This tool computes verdicts in your browser, and its API proxy sends Cache-Control: no-store.',
    ],
    nodes: [
      attacker('atk', 'Attacker', 0, 'SENDS CRAFTED REQUEST'),
      contract('cdn', 'CDN cache', 1, 'STORES THE RESPONSE'),
      victim('you', 'Other visitors', 2, 'GET THE POISONED PAGE'),
    ],
    edges: [edge('atk', 'cdn', 'fake', 'poisoned response'), edge('cdn', 'you', 'fake', 'served to everyone')],
  },
  F32d: {
    steps: [
      'The attacker copies this site\'s look and hosts it on another domain.',
      'The clone always answers VERIFIED.',
      'You trust the familiar look and release goods.',
      'This tool shows the domain you are on and asks you to bookmark it. A clone remains a residual risk.',
    ],
    nodes: [
      attacker('atk', 'Attacker', 0, 'HOSTS A CLONE'),
      fake('clone', 'Clone of this site', 1, 'ALWAYS "VERIFIED"', 'Different domain.'),
      real('site', 'The real site', 2, 'YOUR BOOKMARK'),
      victim('you', 'You', 3, 'VICTIM'),
    ],
    edges: [edge('atk', 'clone', 'created', 'builds'), edge('clone', 'you', 'fake', 'says VERIFIED'), edge('site', 'you', 'real', 'would say the truth')],
  },
  F32e: {
    steps: [
      'The attacker takes over an npm package the site depends on, or slips a malicious update into it.',
      'The next build pulls the malicious version.',
      'The site ships code that changes results or steals data.',
      'This tool pins exact versions, has a lockfile and one runtime dependency, and loads no third-party scripts.',
    ],
    nodes: [
      attacker('atk', 'Attacker', 0, 'TAKES OVER A PACKAGE'),
      contract('pkg', 'npm package', 1, 'MALICIOUS UPDATE'),
      contract('site', 'A website that uses it', 2, 'SHIPS BAD CODE'),
      victim('you', 'Visitors', 3, 'VICTIMS'),
    ],
    edges: [edge('atk', 'pkg', 'call', 'publishes'), edge('pkg', 'site', 'fake', 'installed'), edge('site', 'you', 'fake', 'served')],
  },
  F45: {
    steps: [
      'The attacker runs a checker on some other transaction, or edits the screenshot to say VERIFIED.',
      'They send you the screenshot as proof that "even your tool agrees".',
      'The image proves nothing about your payment.',
      'Run the tool yourself with your own address and the hash you were given.',
    ],
    nodes: [
      attacker('atk', 'Scammer', 0, 'SCAMMER'),
      fake('img', 'Screenshot saying VERIFIED', 1, 'EDITED OR UNRELATED'),
      victim('you', 'You', 3, 'VICTIM'),
    ],
    edges: [edge('atk', 'img', 'created', 'makes'), edge('img', 'you', 'fake', '"even the tool says OK"')],
  },
  F46: {
    steps: [
      'The attacker creates a deadline: release now or the deal is off.',
      'Pressure makes you skip the check.',
      'You release funds or goods against a payment that is pending, failed or fake.',
      'This tool treats pending and not-final as not received. A real payment can wait a few minutes.',
    ],
    nodes: [
      attacker('atk', 'Scammer', 0, 'SCAMMER'),
      unknown('p', 'A payment that is not final', 1, 'PENDING OR FAKE'),
      victim('you', 'You', 3, 'UNDER PRESSURE'),
    ],
    edges: [edge('atk', 'you', 'call', '"release now!"'), edge('p', 'you', 'fake', 'looks nearly done')],
  },
  F47: {
    steps: [
      'The attacker hijacks DNS or a network route on the path between you and the server.',
      'Your requests go to a copy of the service that answers what the attacker wants.',
      'You accept a false balance or approve a malicious contract.',
      'This tool uses HTTPS to every provider and the two-provider agreement of F30.',
    ],
    nodes: [
      attacker('atk', 'Attacker', 0, 'HIJACKS THE ROUTE'),
      fake('mitm', 'Fake copy of the service', 1, 'MAN IN THE MIDDLE'),
      real('real', 'Real server', 2, 'NEVER SEES YOU'),
      victim('you', 'You', 3, 'VICTIM'),
    ],
    edges: [edge('atk', 'mitm', 'call', 'redirects traffic'), edge('you', 'mitm', 'fake', 'your request goes here'), edge('real', 'you', 'other', 'no answer')],
  },
  G33: {
    steps: [
      'Solana tokens can have extensions: a permanent delegate, a transfer hook, a freeze authority, a transfer fee.',
      'A permanent delegate can burn or move tokens from any holder.',
      'A token that looks fine can destroy or take what you hold.',
      'This tool does not support Solana yet. The planned rules reject risky mints that are not the canonical one.',
    ],
    nodes: [
      attacker('atk', 'Mint authority (attacker)', 0, 'PERMANENT DELEGATE'),
      fake('mint', 'Token-2022 mint with extensions', 1, 'RISKY EXTENSIONS'),
      victim('you', 'Holder', 2, 'VICTIM'),
    ],
    edges: [edge('atk', 'mint', 'created', 'creates'), edge('atk', 'you', 'call', 'burns or takes your balance'), edge('mint', 'you', 'fake', 'looks like a normal token')],
    foot: 'Not supported yet.',
  },
  G34: {
    steps: [
      'On Tron the attacker issues a TRC20 named USDT, or changes account permissions.',
      'A balance appears. Or the account\'s owner permission now needs a key the owner does not control.',
      'Unconfirmed transfers can also be shown as done.',
      'This tool uses a registry address, the solidified block for finality, and a permission check.',
    ],
    nodes: [
      attacker('atk', 'Attacker', 0, 'SCAMMER'),
      fake('fk', 'Fake TRC20 "USDT"', 1, 'NOT THE REGISTRY ADDRESS'),
      real('usdt', 'Official TRC20 USDT', 2, 'REAL USDT'),
      victim('you', 'Receiver', 3, 'VICTIM'),
    ],
    edges: [edge('atk', 'fk', 'created', 'deploys'), edge('fk', 'you', 'fake', 'fake balance'), edge('usdt', 'you', 'other', 'nothing real')],
  },
  G35: {
    steps: [
      'Every chain has its own tricks: different token standards, finality rules, account models.',
      'A checker built for one chain can be wrong on another.',
      'This project\'s policy: before a chain is added, its specific attacks are written down here, and a registry entry with a primary source is added.',
    ],
    nodes: [
      unknown('new', 'A new chain', 1, 'NEW RULES', 'New token standard, new finality, new tricks.'),
      real('reg', 'Registry plus this list', 2, 'ADD BOTH FIRST'),
      victim('you', 'Users', 3, 'PROTECTED LATER'),
    ],
    edges: [edge('new', 'reg', 'call', 'study first'), edge('reg', 'you', 'real', 'then support')],
  },
}
