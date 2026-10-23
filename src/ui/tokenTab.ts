import { CHAINS, type ChainKey } from '../registry/chains'
import { canonicalUsdt } from '../registry/usdt'
import { parseAddress } from '../lib/input'
import { runTokenCheck, type TokenCheckOutput } from '../services/tokenCheck'
import type { TokenVerdict } from '../verdict/tokenCheck'
import { clear, field, h, maybeLink } from './dom'
import { summaryCard } from './summary'
import { plainToken } from '../verdict/plain'
import { addr, badge, busy, chainSelect, diffAddress, explorerLinks, note } from './common'
import { tokenDiagram } from './diagrams'
import { whiteboard } from './graph'
import { findCreator, tokenSpread, type Creator, type Spread } from '../services/intel'

const KIND: Record<TokenVerdict, string> = {
  'REAL USDT': 'ok',
  'FAKE USDT': 'bad',
  'NOT USDT': 'warn',
  'NOT A CONTRACT': 'bad',
  UNKNOWN: 'warn',
}

export function tokenTab(): HTMLElement {
  const chain = chainSelect('bsc')
  const token = h('input', { type: 'text', placeholder: 'Token contract address', autocomplete: 'off', spellcheck: 'false' })
  const btn = h('button', { type: 'submit', class: 'primary' }, 'Check token')
  const out = h('div', { class: 'result', 'aria-live': 'polite' })
  const err = h('p', { class: 'error', role: 'alert' })
  const form = h(
    'form',
    { class: 'card form' },
    field('Chain', chain),
    field('Token contract address', token, 'On BscScan this is the address on the token page, or the "Interacted With (To)" of a transfer. Not the wallet address and not the tx hash.'),
    err,
    btn,
  )

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    err.textContent = ''
    clear(out)
    const c = chain.value as ChainKey
    const p = parseAddress(token.value, CHAINS[c].family)
    if (!p.ok) return void (err.textContent = p.reason)
    busy(btn, true, 'Check token')
    try {
      const res = await runTokenCheck({ chain: c, token: p.hex })
      const slot = h('div', {})
      const draw = (intel?: { creator?: Creator; spread?: Spread }) => {
        clear(slot)
        slot.appendChild(whiteboard(tokenDiagram(res, intel)))
      }
      draw()
      if (res.verdict !== 'REAL USDT') {
        void Promise.all([findCreator(c, p.hex), tokenSpread(c, p.hex)]).then(([creator, spread]) => draw({ creator, spread }), () => undefined)
      }
      out.appendChild(summaryCard(plainToken(res), render(c, p.display, p.hidden, res), { links: explorerLinks(c, [{ kind: 'token', value: p.display }]), board: slot }))
    } catch (e2) {
      out.appendChild(note(`Could not complete the check: ${e2 instanceof Error ? e2.message : String(e2)}. This is not a confirmation that the token is real.`, 'warn'))
    } finally {
      busy(btn, false, 'Check token')
    }
  })

  return h(
    'section',
    { class: 'tab', id: 'tab-token' },
    h('p', { class: 'lead' }, 'Paste a token contract address. It is real USDT only if it is exactly the official contract for that chain. The name and symbol on a token can be copied by anyone.'),
    form,
    out,
  )
}

function render(c: ChainKey, shown: string, hidden: number, r: TokenCheckOutput): HTMLElement {
  const real = canonicalUsdt(c)
  const info = CHAINS[c]
  const wrap = h('div', { class: 'card' })
  if (hidden > 0) wrap.appendChild(note(`The pasted text contained ${hidden} hidden character(s). They were removed.`, 'warn'))
  wrap.appendChild(h('div', { class: 'verdict' }, badge(r.verdict, KIND[r.verdict]), h('p', {}, r.summary)))

  wrap.appendChild(h('p', {}, 'Checked: ', addr(shown)))
  if (r.name || r.symbol) {
    // Chain data: text only, never markup.
    wrap.appendChild(h('p', {}, 'It calls itself: ', h('strong', {}, `${r.symbol ?? ''}${r.symbol && r.name ? ' / ' : ''}${r.name ?? ''}`), h('span', { class: 'muted' }, '  (self-reported, not proof of anything)')))
  }

  if (r.verdict !== 'REAL USDT') {
    wrap.appendChild(h('p', { class: 'muted' }, `Real USDT on ${info.name}:`))
    wrap.appendChild(h('div', { class: 'cmp' }, h('span', { class: 'muted' }, 'real:    '), addr(real.address)))
    wrap.appendChild(h('div', { class: 'cmp' }, h('span', { class: 'muted' }, 'checked: '), diffAddress(shown, real.address)))
  }

  if (r.nameFindings.length > 0) {
    wrap.appendChild(h('h3', {}, 'Name and symbol'))
    const ul = h('ul', { class: 'risks' })
    for (const n of r.nameFindings) ul.appendChild(h('li', { class: 'risk-medium' }, n.detail))
    wrap.appendChild(ul)
  }
  if (r.findings.length > 0) {
    wrap.appendChild(h('h3', {}, 'How this contract can hurt you'))
    const ul = h('ul', { class: 'risks' })
    for (const f of r.findings) ul.appendChild(h('li', { class: `risk-${f.level}` }, f.detail))
    wrap.appendChild(ul)
  }

  const l = maybeLink(info.explorer.address(shown), info.explorer.name)
  if (l) wrap.appendChild(h('p', { class: 'muted' }, 'Open on ', l, ' (link built by this app; check the domain).'))
  wrap.appendChild(note('This only identifies the token contract. To check a payment you received, use Detailed analysis → Verify a payment with the transaction hash.', 'info'))
  return wrap
}
