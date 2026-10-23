import { CHAINS, type ChainKey } from '../registry/chains'
import { canonicalUsdt } from '../registry/usdt'
import { parseTxHash } from '../lib/input'
import { displayAddress } from '../lib/address'
import { runTxReport, type TxReportOutput } from '../services/txReport'
import { formatUnits } from '../verdict/transfer'
import type { Headline, Level, ReportToken } from '../verdict/txReport'
import type { TokenVerdict } from '../verdict/tokenCheck'
import { clear, field, h, maybeLink } from './dom'
import { addr, badge, busy, chainSelect, explorerLinks, note } from './common'
import { txDiagram } from './diagrams'
import { whiteboard } from './graph'
import { txIntel, type TxIntel } from '../services/intel'
import { renderProviders } from './providersView'
import { summaryCard } from './summary'
import { plainTx } from '../verdict/plain'

const HEAD_KIND: Record<Headline, string> = {
  'NOT ON CHAIN': 'bad',
  'BLOCK HASH': 'bad',
  'FAILED TX': 'bad',
  'FAKE USDT FOUND': 'bad',
  'PROBLEMS FOUND': 'warn',
  'NO RED FLAGS': 'ok',
}
const HEAD_TEXT: Record<Headline, string> = {
  'NOT ON CHAIN': 'Nothing was found on this chain for that hash.',
  'BLOCK HASH': 'That is a block hash, not a transaction.',
  'FAILED TX': 'The transaction failed. Nothing moved.',
  'FAKE USDT FOUND': 'A token pretending to be USDT is in this transaction.',
  'PROBLEMS FOUND': 'Read the findings below.',
  'NO RED FLAGS': 'No red flags in what this transaction did. This does not check that it paid you. Use Detailed analysis → Verify a payment with your address for that.',
}
const TOKEN_KIND: Record<TokenVerdict, string> = { 'REAL USDT': 'ok', 'FAKE USDT': 'bad', 'NOT USDT': 'warn', 'NOT A CONTRACT': 'bad', UNKNOWN: 'warn' }
const LEVEL_CLASS: Record<Level, string> = { bad: 'risk-high', warn: 'risk-medium', info: 'risk-info', ok: 'risk-ok' }
const LEVEL_TAG: Record<Level, string> = { bad: 'PROBLEM', warn: 'WARNING', info: 'INFO', ok: 'OK' }

export function txTab(): HTMLElement {
  const chain = chainSelect('bsc')
  const hash = h('input', { type: 'text', placeholder: '0x… (BSC/ETH) or 64 hex (Tron)', autocomplete: 'off', spellcheck: 'false' })
  const btn = h('button', { type: 'submit', class: 'primary' }, 'Analyze')
  const out = h('div', { class: 'result', 'aria-live': 'polite' })
  const err = h('p', { class: 'error', role: 'alert' })
  const form = h('form', { class: 'card form' }, field('Chain', chain, 'Binance P2P on BEP20 = BNB Smart Chain.'), field('Transaction hash', hash), err, btn)

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    err.textContent = ''
    clear(out)
    const c = chain.value as ChainKey
    const ph = parseTxHash(hash.value, c)
    if (!ph.ok) return void (err.textContent = ph.reason)
    busy(btn, true, 'Analyze')
    try {
      out.appendChild(renderTxResult(await runTxReport({ chain: c, hash: ph.hash, hiddenChars: ph.hidden })))
    } catch (e2) {
      out.appendChild(note(`Could not complete the check: ${e2 instanceof Error ? e2.message : String(e2)}. This is not a confirmation that anything is fine.`, 'warn'))
    } finally {
      busy(btn, false, 'Analyze')
    }
  })

  return h(
    'section',
    { class: 'tab', id: 'tab-tx' },
    form,
    out,
  )
}

function tokenBlock(r: TxReportOutput, t: ReportToken): HTMLElement {
  const usdt = canonicalUsdt(r.chain)
  const show = (x: `0x${string}`) => displayAddress(r.chain, x)
  const real = t.verdict === 'REAL USDT'
  const title = [t.symbol, t.name].filter(Boolean).join(' / ')
  const rows = h('ul', { class: 'decoys' })
  for (const x of t.transfers) {
    rows.appendChild(
      h(
        'li',
        {},
        addr(show(x.from)),
        ' → ',
        addr(show(x.to)),
        h('div', { class: 'muted' }, real ? `${formatUnits(x.value, usdt.decimals)} USDT` : `claims ${x.value.toString()} raw units (its own decimals are not trusted)`),
      ),
    )
  }
  return h(
    'div',
    { class: 'tokenblock' },
    h('div', {}, badge(t.verdict, TOKEN_KIND[t.verdict]), ' ', title ? h('strong', {}, title) : h('span', { class: 'muted' }, 'unnamed'), ' at ', addr(show(t.token))),
    h('div', { class: 'muted' }, t.summary),
    rows,
  )
}

/** Plain summary on top, then the diagram, full report folded underneath. */
export function renderTxResult(r: TxReportOutput): HTMLElement {
  const slot = h('div', {})
  const draw = (intel?: TxIntel) => {
    clear(slot)
    slot.appendChild(whiteboard(txDiagram(r, intel)))
  }
  draw()
  if (r.blockNumber !== null) void txIntel(r).then(draw, () => undefined)
  const links = explorerLinks(r.chain, [
    { kind: 'tx', value: r.hash },
    ...r.tokens.filter((t) => t.verdict !== 'REAL USDT').slice(0, 2).map((t) => ({ kind: 'token' as const, value: displayAddress(r.chain, t.token), label: `“${(t.symbol ?? 'token').slice(0, 16)}” token` })),
  ])
  return summaryCard(plainTx(r), renderReport(r), { links, board: slot })
}

export function renderReport(r: TxReportOutput): HTMLElement {
  const info = CHAINS[r.chain]
  const show = (x: `0x${string}`) => displayAddress(r.chain, x)
  const wrap = h('div', { class: 'card' })
  wrap.appendChild(h('div', { class: 'verdict' }, badge(r.headline, HEAD_KIND[r.headline]), h('p', {}, HEAD_TEXT[r.headline])))

  if (r.problems.length > 0) {
    wrap.appendChild(h('h3', {}, 'Findings'))
    const ul = h('ul', { class: 'risks' })
    for (const p of r.problems) ul.appendChild(h('li', { class: LEVEL_CLASS[p.level] }, h('strong', {}, `${LEVEL_TAG[p.level]} `), p.text))
    wrap.appendChild(ul)
  }

  const servers = renderProviders(r.providers)
  if (servers) wrap.appendChild(servers)

  if (r.tokens.length > 0) {
    wrap.appendChild(h('h3', {}, `Tokens moved (${r.tokens.length})`))
    for (const t of r.tokens) wrap.appendChild(tokenBlock(r, t))
  }

  if (r.parties.length > 0) {
    wrap.appendChild(h('h3', {}, 'Addresses involved'))
    const tb = h('tbody', {})
    for (const p of r.parties) {
      const kind = p.code ? (p.code.kind === 'eoa' ? 'wallet' : p.code.kind === 'delegated' ? 'wallet (EIP-7702 delegated)' : 'contract') : '?'
      tb.appendChild(h('tr', {}, h('td', {}, addr(show(p.address))), h('td', {}, p.roles.join(', ')), h('td', {}, kind)))
    }
    wrap.appendChild(h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'Address'), h('th', {}, 'Role'), h('th', {}, 'Type'))), tb))
  }

  if (r.net.length > 0) {
    const tb = h('tbody', {})
    for (const n of r.net) tb.appendChild(h('tr', {}, h('td', {}, addr(show(n.address))), h('td', { class: n.value > 0n ? 'pos' : 'neg' }, n.formatted)))
    wrap.appendChild(h('h3', {}, 'Net real USDT change'))
    wrap.appendChild(h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'Address'), h('th', {}, 'Net USDT'))), tb))
  }

  const l = maybeLink(info.explorer.tx(r.hash), info.explorer.name)
  if (l) wrap.appendChild(h('p', { class: 'muted' }, 'Open on ', l, ' (link built by this app; check the domain).'))
  wrap.appendChild(note('Depositing to Binance? The final truth is your Binance deposit history, not this page and not a screenshot.', 'info'))
  return wrap
}
