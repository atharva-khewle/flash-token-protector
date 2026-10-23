import { canonicalUsdt } from '../registry/usdt'
import { h } from './dom'

interface Item {
  q: string
  a: (string | Node)[]
}

function items(): { group: string; list: Item[] }[] {
  const bsc = canonicalUsdt('bsc')
  const eth = canonicalUsdt('eth')
  const tron = canonicalUsdt('tron')
  return [
    {
      group: 'Start here',
      list: [
        {
          q: 'Where do I start?',
          a: [
            'Quick check is for anything you were handed. Transaction: someone says they paid you and gave a hash. Wallet address: is this wallet being attacked, or attacking others? Token address: is this token the real USDT?',
            'Detailed analysis is for your own funds. Verify a payment gives a final yes or no that real USDT reached your address. Monitor a wallet follows an address live. Before you send catches lookalike addresses. Saved addresses is the list every check compares against.',
          ],
        },
        {
          q: 'What is the difference between Simple and Advanced?',
          a: [
            'Simple (the default) shows the plain answer, the map and the explorer link, with the technical details folded under "Show full details".',
            'Advanced opens those details on every result and shows extra fields, such as the deal start time when verifying a payment. The checks are the same in both.',
          ],
        },
        {
          q: 'How do I read the map?',
          a: [
            'Each box is an address, a contract or the transaction itself. Arrows show what moved: green is real USDT, red is a fake token, yellow dashes are dust or zero-value transfers, grey dashes mean "signed" or "called", and dotted purple means "created".',
            'Box colours: red is an attacker or a fake token, yellow is someone being targeted, purple is the checked address or a contract creator, green is the real USDT contract.',
            'Drag the board to move around, scroll or pinch to zoom, and drag a box to tidy it. Tap a box to see the full address, copy it, open it on the explorer, or check it here.',
          ],
        },
        {
          q: 'How does it tell an attacker from a victim?',
          a: [
            'Being attacked: zero-value transfers "from" the address that its owner did not sign, transfers from addresses that imitate ones it really uses, tiny dust payments from strangers, or fake USDT sent to it.',
            'Attacking others: tiny USDT amounts sprinkled to many different addresses, zero-value transfers collected from many addresses (the trace a lookalike address leaves), or a fake USDT token sent to several people.',
            'These are the patterns real campaigns leave on chain. They are strong hints, not a court verdict: an exchange or payment processor can also send small amounts to many addresses.',
          ],
        },
        {
          q: 'Why does a wallet check only look at recent history? What does "Analyze older history" do?',
          a: [
            'Free public servers only return recent history: about the last hour or two on BNB Chain, more on Ethereum, and pages of 200 events on Tron. The first check reads one window so it is quick.',
            'Each press of "Analyze older history" reads the next window back and redraws the map and the attacker/victim result with everything read so far. When the free servers will not go further, the button is replaced by a note. If the site owner has set an explorer key, it also pages back through the explorer index.',
          ],
        },
        {
          q: 'Who is the "creator" or "owner" of a fake token?',
          a: [
            'For a fake token the map tries to show who deployed the contract. On Tron the network records it. On Ethereum it is found from the chain history. On BNB Chain the free servers do not keep old history, so the map shows the address the contract names as its owner, which is usually the deployer.',
            'The box that "signed" the transaction is the account that actually sent it, which can be different from the address the tokens appear to come from.',
          ],
        },
        {
          q: 'What is "fake USDT" or "flash USDT"?',
          a: [
            'Anyone can deploy a token and call it "USDT" or "Tether USD". Wallets and explorers show the name the token chooses, so a worthless token can look exactly like a real payment.',
            'Real USDT is one specific contract on each chain. This app compares the contract address, never the name.',
          ],
        },
        {
          q: 'What are the real USDT addresses?',
          a: [`BNB Smart Chain (BEP20): ${bsc.address}`, `Ethereum: ${eth.address}`, `Tron: ${tron.address}`, 'If a token has a different address, it is not that chain\'s USDT, whatever it is called.'],
        },
      ],
    },
    {
      group: 'Understanding the results',
      list: [
        {
          q: 'What do VERIFIED, FAKE, UNVERIFIED and NOT RECEIVED mean?',
          a: [
            'VERIFIED: real USDT reached your address in a final block, confirmed by two independent servers that returned the identical answer.',
            'FAKE: the transaction does not prove a real USDT payment to you (wrong token, wrong recipient, wrong amount, or a failed transaction). Do not release goods or money.',
            'UNVERIFIED: not proven either way. Often it is just too early. Read the warnings and check again.',
            'NOT RECEIVED: nothing is on this chain for that hash, or it is still pending.',
          ],
        },
        {
          q: 'Why does a payment I just received say UNVERIFIED?',
          a: ['A new transaction is not final yet. On BNB Smart Chain it takes about a minute. Monitor a wallet re-checks new transfers for you until they are final.'],
        },
        {
          q: 'It says NO RED FLAGS. Does that mean I was paid?',
          a: ['No. The transaction check only looks at what the transaction did. To know that you were paid, use Verify a payment with your own address, or Monitor a wallet, which does that check for incoming transfers.'],
        },
        {
          q: 'The app says VERIFIED but my exchange has not credited it.',
          a: ['The exchange\'s deposit history is the final truth for your exchange balance. Exchanges wait for their own confirmation count and may have different deposit rules.'],
        },
        {
          q: 'It says the servers disagree. What does that mean?',
          a: [
            'The app asks several free public blockchain servers and only trusts an answer that at least two of them return identically. The "Servers" panel shows what each one said, how up to date it was, and how reliable it has been in our tests.',
            'Most of the time one server is just a few blocks behind, rate-limited, or blocked by your internet provider. That is not fraud; the panel says so. Real conflicts (two servers with different data for the same block) usually mean a recent block is being reorganized. Wait a few minutes and check again before accepting a payment.',
          ],
        },
        {
          q: 'Where do I find a transaction hash or a token address?',
          a: [
            'Transaction hash: in the explorer page for the payment (it starts with 0x and is 66 characters on BSC and Ethereum, or 64 hex characters on Tron), or ask the payer for it.',
            'Token address: on the explorer\'s token page, or the "Interacted With (To)" or token contract link in the transfer row. It is not your wallet address and not the transaction hash.',
          ],
        },
      ],
    },
    {
      group: 'Connecting and monitoring a wallet',
      list: [
        {
          q: 'Is connecting my wallet safe?',
          a: [
            'Connecting is optional. This app only asks your wallet one question: which account is selected. It never asks for a signature, never sends a transaction and never asks for permission to spend your tokens.',
            'The code that talks to your wallet refuses every other request, and a test checks that no signing method appears anywhere in the source.',
            'You can also skip connecting: paste any address into "Watch any address" under Monitor a wallet.',
          ],
        },
        {
          q: 'Why can I not connect a wallet in the browser extension?',
          a: ['Browsers only inject wallets (MetaMask and others) into web pages, not into extension popups. In the extension, paste your address to watch it. Or open the website, where Connect works.'],
        },
        {
          q: 'How does it check new transfers?',
          a: ['While the page is open it reads each new block from public nodes and picks out transfers of any token into or out of your address. Each one is checked automatically and the result appears at the top. It sees transactions once they are in a block (a few seconds on BSC), not the private mempool, and it stops when you close the page.'],
        },
        {
          q: 'Why is my history short, and why do I not see fake tokens in it?',
          a: [
            'Public nodes only answer for real USDT, and only for recent blocks (about a day on BSC). Listing every token ever sent to you needs an indexer. If the site owner has configured an explorer key, those appear too.',
            'Fake tokens that arrive while the page is open are still caught live.',
          ],
        },
        {
          q: 'What do the small labels on a transaction mean?',
          a: [
            'Looks like fake USDT: the token calls itself USDT or Tether but is not the real contract.',
            'Dust or zero value: a tiny or empty transfer. Attackers send these from addresses that imitate ones you use, hoping you copy the wrong address from your history later.',
            'Imitates a saved address: this address nearly matches one you paid or saved, but is different. Never copy an address from your history.',
            'Other token: a different token, not USDT. Fine if you expected it.',
          ],
        },
        {
          q: 'What does "Trust this address" do?',
          a: ['It saves the address in this browser. Later, any address that looks almost the same gets flagged as a lookalike. Only trust addresses you got from the real source.'],
        },
      ],
    },
    {
      group: 'Privacy and limits',
      list: [
        {
          q: 'What data leaves my device?',
          a: ['Only read requests to public blockchain nodes (and an optional explorer service the site owner may enable). There are no accounts, no analytics and no keys. Your saved addresses stay in this browser.'],
        },
        {
          q: 'What can this app not do?',
          a: ['It cannot see bank or card chargebacks, a compromised device, or anything off-chain. It cannot stop a transaction you sign elsewhere. It never says a payment is "safe", only what the chain shows.'],
        },
        {
          q: 'A result looks wrong. What should I do?',
          a: ['Do not act on it yet. Open the transaction on the chain\'s explorer using the link in the result, compare the token contract with the real address above, and open an issue on GitHub with the transaction hash and what you expected.'],
        },
      ],
    },
  ]
}

export function faqTab(): HTMLElement {
  const root = h('section', { class: 'tab', id: 'tab-faq' }, null)
  for (const g of items()) {
    root.appendChild(h('h3', { class: 'faqgroup' }, g.group))
    for (const it of g.list) {
      root.appendChild(h('details', { class: 'faq' }, h('summary', {}, it.q), ...it.a.map((p) => h('p', {}, p))))
    }
  }
  return root
}
