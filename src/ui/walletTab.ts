// "My wallet": follow one address (connected wallet or pasted), see its balance and history,
// have every new transfer checked automatically, and open any transaction for a full analysis.
// Read-only: nothing here signs, sends or approves anything.

import { adapterFor } from '../chains'
import type { Hex } from '../chains/types'
import { displayAddress } from '../lib/address'
import { parseAddress } from '../lib/input'
import { addWatch, getAccount, getRecent, getWatchlist, setAccount } from '../lib/storage'
import { connectWallet, discoverWallets, onAccountChange, type DiscoveredWallet } from '../lib/wallet'
import { CHAIN_KEYS, CHAINS, type ChainKey } from '../registry/chains'
import { canonicalUsdt } from '../registry/usdt'
import { flagEntries, loadBalance, loadHistory, type Flag, type FlaggedEntry, type HistoryEntry } from '../services/history'
import { runTxReport } from '../services/txReport'
import { runVerify, type VerifyOutput } from '../services/verify'
import { startWatch, type LiveTransfer, type WatchStatus } from '../services/watch'
import { formatUnits } from '../verdict/transfer'
import { checkDestination, classifyCode } from '../verdict/wallet'
import { append, clear, field, h } from './dom'
import { addr, badge, diffAddress, note } from './common'
import { renderTxResult } from './txTab'
import { VERDICT_TEXT } from './verifyTab'

const isExtensionPage = () => typeof chrome !== 'undefined' && !!chrome.runtime?.id

const VERDICT_KIND: Record<VerifyOutput['verdict'], string> = { VERIFIED: 'ok', FAKE: 'bad', UNVERIFIED: 'warn', 'NOT RECEIVED': 'bad' }
const FLAG_TEXT: Record<Flag, { text: string; kind: string }> = {
  'fake-usdt': { text: 'Looks like fake USDT', kind: 'bad' },
  lookalike: { text: 'Imitates an address you use', kind: 'bad' },
  dust: { text: 'Dust', kind: 'warn' },
  zero: { text: 'Zero value', kind: 'warn' },
  'other-token': { text: 'Other token', kind: 'muted' },
}
const ATTENTION: Flag[] = ['fake-usdt', 'lookalike', 'dust', 'zero']

type Filter = 'all' | 'in' | 'out' | 'attention'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'in', label: 'Received' },
  { id: 'out', label: 'Sent' },
  { id: 'attention', label: 'Needs a look' },
]

const short = (s: string) => (s.length > 14 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s)

function timeAgo(ts: number | null): string {
  if (!ts) return ''
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(ts * 1000).toLocaleDateString()
}

function amountText(chain: ChainKey, e: Pick<HistoryEntry, 'canonical' | 'value' | 'decimals' | 'symbol'>): string {
  if (e.canonical) return `${formatUnits(e.value, canonicalUsdt(chain).decimals)} USDT`
  if (e.decimals !== null) return `${formatUnits(e.value, e.decimals)} ${e.symbol ?? ''}`.trim()
  return `${e.value.toString()} raw units`
}

/** CSV cells starting with = + - @ are formulas in spreadsheets. Token names are untrusted. */
function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return `"${safe.replace(/"/g, '""')}"`
}

function avatar(address: string): HTMLElement {
  const el = h('span', { class: 'avatar', 'aria-hidden': 'true' })
  const hue = parseInt(address.slice(2, 6), 16) % 360
  // CSSOM, not a style attribute: the page CSP forbids inline style attributes.
  el.style.background = `linear-gradient(135deg, hsl(${hue} 55% 62%), hsl(${(hue + 70) % 360} 50% 52%))`
  return el
}

/** Lets the top bar's Connect button drive this panel and show which address is followed. */
export interface WalletHooks {
  connect?: (w: DiscoveredWallet) => Promise<void>
  disconnect?: () => void
  current?: () => { chain: ChainKey; address: Hex; via: 'wallet' | 'watch' } | null
  onAccount?: () => void
}

export function walletTab(hooks: WalletHooks = {}): HTMLElement {
  let chainSel: ChainKey = 'bsc'
  let acct: { chain: ChainKey; address: Hex; via: 'wallet' | 'watch' } | null = null
  let stop: (() => void) | null = null
  let stopAccountEvents: (() => void) | null = null
  let entries: HistoryEntry[] = []
  let coverage: string[] = []
  let balance: bigint | null | undefined
  let status = ''
  let filter: Filter = 'all'
  let session = 0
  let notify = false
  const verdicts = new Map<string, VerifyOutput['verdict']>()
  const fresh = new Set<string>()

  const hero = h('div', {})
  const accountEl = h('div', {})
  const alerts = h('div', { class: 'alerts', 'aria-live': 'assertive' })
  const detail = h('div', { class: 'detail' })
  const listEl = h('div', {})
  const payCheck = h('div', {})

  const watchlist = (c: ChainKey): Hex[] =>
    getWatchlist(c).flatMap((w) => {
      const p = parseAddress(w.address, CHAINS[c].family)
      return p.ok ? [p.hex] : []
    })
  const flagged = (): FlaggedEntry[] => (acct ? flagEntries(acct.chain, entries, watchlist(acct.chain)) : [])

  // ---------- hero (nothing followed yet) ----------

  const manual = h('input', { type: 'text', placeholder: 'Paste an address, e.g. your Binance deposit address', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Address to watch' })
  const err = h('p', { class: 'error', role: 'alert' })
  const walletBox = h('div', { class: 'walletbtns' })
  const pills = h('div', { class: 'pills', role: 'group', 'aria-label': 'Network' })

  function renderPills(): void {
    clear(pills)
    const label = (k: ChainKey) => (k === 'bsc' ? 'BNB Chain' : k === 'eth' ? 'Ethereum' : k === 'tron' ? 'Tron' : 'Local test')
    for (const k of [...CHAIN_KEYS.filter((x) => !CHAINS[x].test), ...CHAIN_KEYS.filter((x) => CHAINS[x].test)]) {
      const b = h('button', { type: 'button', class: 'pill', 'data-chain': k, 'aria-pressed': String(k === chainSel) }, label(k))
      b.addEventListener('click', () => switchChain(k))
      pills.appendChild(b)
    }
  }

  function switchChain(k: ChainKey): void {
    err.textContent = ''
    if (!acct) {
      chainSel = k
      renderPills()
      return
    }
    if (CHAINS[k].family !== CHAINS[acct.chain].family) {
      err.textContent = `This address belongs to a ${CHAINS[acct.chain].family === 'evm' ? 'BNB Chain / Ethereum' : 'Tron'} account. Stop following it first to switch.`
      return
    }
    void begin(k, acct.address, acct.via)
  }

  function renderHero(): void {
    clear(hero)
    if (acct) return
    const form = h(
      'form',
      { class: 'card form hero' },
      h('div', { class: 'herohead' }, h('h2', {}, 'Follow a wallet'), h('p', { class: 'muted' }, 'See your USDT, your history, and get every new transfer checked for you. Read-only.')),
      pills,
      walletBox,
      h('div', { class: 'or' }, 'or'),
      field('Watch any address', manual, 'Your own address, or one you are about to pay.'),
      err,
      h('button', { type: 'submit', class: 'primary' }, 'Watch'),
    )
    form.addEventListener('submit', (e) => {
      e.preventDefault()
      err.textContent = ''
      const p = parseAddress(manual.value, CHAINS[chainSel].family)
      if (!p.ok) return void (err.textContent = p.reason)
      void begin(chainSel, p.hex, 'watch')
    })
    const steps = h(
      'ol',
      { class: 'steps' },
      h('li', {}, h('strong', {}, '1. Follow'), ' an address (connect a wallet, or paste one).'),
      h('li', {}, h('strong', {}, '2. See'), ' your balance and recent transfers, with anything odd marked.'),
      h('li', {}, h('strong', {}, '3. Click'), ' a transfer to find out if it is real. New ones are checked automatically.'),
    )
    append(hero, form, steps)
  }

  // ---------- account header ----------

  function copy(text: string, label: HTMLElement, original: string): void {
    const done = (msg: string) => {
      label.textContent = msg
      setTimeout(() => (label.textContent = original), 1400)
    }
    try {
      void navigator.clipboard.writeText(text).then(
        () => done('Copied'),
        () => done('Copy failed'),
      )
    } catch {
      done('Copy failed')
    }
  }

  function action(icon: string, label: string, on: (text: HTMLElement) => void): HTMLElement {
    const text = h('span', { class: 'albl' }, label)
    const b = h('button', { type: 'button', class: 'action' }, h('span', { class: 'aico', 'aria-hidden': 'true' }, icon), text)
    b.addEventListener('click', () => on(text))
    return b
  }

  function exportCsv(): void {
    if (!acct) return
    const a = acct
    const rows = flagged().map((e) =>
      [
        e.timestamp ? new Date(e.timestamp * 1000).toISOString() : '',
        e.direction,
        e.canonical ? 'USDT (real)' : e.symbol ?? e.token,
        amountText(a.chain, e),
        displayAddress(a.chain, e.counterparty),
        e.hash,
        e.flags.join(' '),
      ]
        .map(csvCell)
        .join(','),
    )
    const csv = ['time,direction,token,amount,counterparty,tx,flags', ...rows].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const el = document.createElement('a')
    el.href = url
    el.download = `transfers-${short(displayAddress(a.chain, a.address))}.csv`
    el.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  function securityScan(): void {
    if (!acct) return
    document.getElementById('tabbtn-scan')?.click()
    const form = document.querySelector<HTMLFormElement>('#tab-scan form')
    if (!form) return
    form.querySelector('select')!.value = acct.chain
    form.querySelector<HTMLInputElement>('input')!.value = displayAddress(acct.chain, acct.address)
    form.requestSubmit()
  }

  function renderAccount(): void {
    clear(accountEl)
    if (!acct) return
    const a = acct
    const shown = displayAddress(a.chain, a.address)
    const usdt = canonicalUsdt(a.chain)
    const bal = balance === undefined ? '…' : balance === null ? 'unavailable' : formatUnits(balance, usdt.decimals)

    const notifySupported = typeof Notification !== 'undefined'
    const notifyBox = h('input', { type: 'checkbox', id: 'notify-toggle' })
    notifyBox.checked = notify
    notifyBox.addEventListener('change', async () => {
      if (notifyBox.checked && typeof Notification !== 'undefined') {
        const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
        notify = p === 'granted'
        notifyBox.checked = notify
      } else notify = false
    })

    accountEl.appendChild(
      h(
        'div',
        { class: 'card account' },
        h('div', { class: 'acchead' }, avatar(a.address), h('div', { class: 'accwho' }, h('div', { class: 'muted small' }, a.via === 'wallet' ? 'Connected wallet · read-only' : 'Watching · read-only'), h('div', { class: 'addr' }, short(shown))), pills),
        h('div', { class: 'balance' }, h('span', { class: 'balnum' }, bal), balance ? h('span', { class: 'balunit' }, ' USDT') : null),
        h('div', { class: 'muted small' }, 'Real USDT in this address right now'),
        h('div', { class: 'livestatus muted small', 'aria-live': 'polite' }, h('span', { class: `dot ${status.startsWith('Live') ? 'on' : ''}` }), status || 'Starting live check…'),
        h(
          'div',
          { class: 'actions' },
          action('⧉', 'Copy address', (t) => copy(shown, t, 'Copy address')),
          action('↻', 'Refresh', () => void refresh()),
          action('⛨', 'Analyze address', securityScan),
          action('⤓', 'Export CSV', exportCsv),
          action('✕', a.via === 'wallet' ? 'Disconnect' : 'Stop', () => {
            end()
            setAccount(null)
            renderHero()
          }),
        ),
        notifySupported ? h('label', { class: 'notifyrow muted small' }, notifyBox, ' Notify me when something suspicious arrives (while this page is open)') : null,
      ),
    )
  }

  // ---------- history ----------

  function chips(e: FlaggedEntry, v: VerifyOutput['verdict'] | undefined): HTMLElement {
    const box = h('div', { class: 'chips' })
    if (v) box.appendChild(badge(v, VERDICT_KIND[v]))
    for (const f of e.flags) box.appendChild(h('span', { class: `chip chip-${FLAG_TEXT[f].kind}` }, FLAG_TEXT[f].text))
    if (e.trusted) box.appendChild(h('span', { class: 'chip chip-ok' }, 'Trusted'))
    return box
  }

  function renderList(): void {
    clear(listEl)
    if (!acct) return
    const a = acct
    const all = flagged()
    const attention = all.filter((e) => e.flags.some((f) => ATTENTION.includes(f)))
    const shown = all.filter((e) => (filter === 'all' ? true : filter === 'attention' ? attention.includes(e) : filter === 'in' ? e.direction !== 'out' : e.direction === 'out'))

    if (attention.length > 0 && filter !== 'attention') {
      const s = h('button', { type: 'button', class: 'attention' }, h('strong', {}, `${attention.length} transfer${attention.length === 1 ? '' : 's'} need a look`), h('span', { class: 'muted small' }, ' Fake-looking tokens, dust, or addresses that imitate ones you use. Tap to review.'))
      s.addEventListener('click', () => {
        filter = 'attention'
        renderList()
      })
      listEl.appendChild(s)
    }

    const bar = h('div', { class: 'filters', role: 'group', 'aria-label': 'Filter transfers' })
    for (const f of FILTERS) {
      const b = h('button', { type: 'button', class: 'filter', 'aria-pressed': String(filter === f.id) }, f.id === 'attention' && attention.length ? `${f.label} (${attention.length})` : f.label)
      b.addEventListener('click', () => {
        filter = f.id
        renderList()
      })
      bar.appendChild(b)
    }
    listEl.appendChild(bar)

    if (entries.length === 0) {
      listEl.appendChild(h('div', { class: 'card empty' }, h('p', {}, 'No transfers found in the range checked.'), h('p', { class: 'muted small' }, 'New transfers will show up here as they arrive.')))
    } else if (shown.length === 0) {
      listEl.appendChild(h('div', { class: 'card empty' }, h('p', { class: 'muted' }, filter === 'attention' ? 'Nothing needs a look. Nice.' : 'Nothing in this view.')))
    } else {
      const ul = h('ul', { class: 'hist' })
      for (const e of shown) {
        const v = verdicts.get(e.hash)
        const sign = e.direction === 'in' ? '+' : e.direction === 'out' ? '−' : ''
        const verb = e.direction === 'in' ? 'Received' : e.direction === 'out' ? 'Sent' : 'Moved'
        const bad = e.flags.some((f) => f === 'fake-usdt' || f === 'lookalike')
        const row = h(
          'button',
          { type: 'button', class: `histrow ${e.direction}${bad ? ' bad' : ''}${fresh.has(e.hash) ? ' fresh' : ''}`, 'aria-label': `Open transaction ${e.hash}` },
          h('span', { class: 'ico' }, e.direction === 'in' ? '↓' : e.direction === 'out' ? '↑' : '⇄'),
          h(
            'span',
            { class: 'main' },
            h('span', { class: 'title' }, e.canonical ? `${verb} USDT` : `${verb} ${e.symbol ? `“${e.symbol.slice(0, 16)}” token` : 'unknown token'}`),
            h('span', { class: 'sub muted' }, `${e.direction === 'in' ? 'from' : 'to'} ${short(displayAddress(a.chain, e.counterparty))}${e.timestamp ? ' · ' + timeAgo(e.timestamp) : ''}`),
          ),
          h('span', { class: 'side' }, h('span', { class: `amt ${e.canonical ? e.direction : 'other'}` }, `${sign}${amountText(a.chain, e)}`), chips(e, v)),
        )
        row.addEventListener('click', () => void open(e))
        ul.appendChild(h('li', {}, row))
      }
      listEl.appendChild(ul)
    }
    if (coverage.length > 0) listEl.appendChild(h('ul', { class: 'coverage muted small' }, ...coverage.map((x) => h('li', {}, x))))
  }

  // ---------- one transaction ----------

  async function open(e: FlaggedEntry): Promise<void> {
    if (!acct) return
    const { chain: c, address: me } = acct
    const mine = session
    clear(detail)
    const card = h('div', { class: 'card detailcard' })
    const close = h('button', { type: 'button', class: 'link' }, 'Close')
    close.addEventListener('click', () => clear(detail))
    append(card, h('div', { class: 'detailhead' }, h('h3', { class: 'flush' }, 'Is this transfer real?'), close), h('p', { class: 'muted' }, 'Reading the chain…'))
    detail.appendChild(card)
    detail.scrollIntoView?.({ block: 'nearest' })
    try {
      const [verify, report] = await Promise.all([
        e.direction === 'in' ? runVerify({ chain: c, hash: e.hash, hiddenChars: 0, context: { recipient: me }, watchlist: watchlist(c) }) : Promise.resolve(null),
        runTxReport({ chain: c, hash: e.hash, hiddenChars: 0 }),
      ])
      if (mine !== session) return
      clear(card)
      append(card, h('div', { class: 'detailhead' }, h('h3', { class: 'flush' }, 'Is this transfer real?'), close))
      if (verify) {
        verdicts.set(e.hash, verify.verdict)
        append(
          card,
          h('div', { class: 'verdict' }, badge(verify.verdict, VERDICT_KIND[verify.verdict]), h('p', {}, `For this address: ${VERDICT_TEXT[verify.verdict]}`)),
          verify.netToTarget !== null ? h('p', { class: 'amount' }, 'Real USDT this address gained: ', h('strong', {}, `${verify.netFormatted} USDT`)) : null,
        )
        renderList()
      }
      append(card, trustBox(e), renderTxResult(report))
    } catch (err2) {
      clear(card)
      append(card, note(`Could not analyze this transaction: ${err2 instanceof Error ? err2.message : String(err2)}`, 'warn'))
    }
  }

  function trustBox(e: FlaggedEntry): HTMLElement | null {
    if (!acct) return null
    const c = acct.chain
    const shown = displayAddress(c, e.counterparty)
    if (e.trusted) return h('p', { class: 'muted small' }, 'You trust ', addr(shown), '.')
    const label = h('input', { type: 'text', placeholder: 'Name, e.g. "Alice (P2P buyer)"', 'aria-label': 'Name for this address', maxlength: '40' })
    const save = h('button', { type: 'button' }, 'Trust this address')
    save.addEventListener('click', () => {
      addWatch({ chain: c, address: shown, label: label.value.trim().slice(0, 40) || 'Trusted' })
      renderList()
      save.disabled = true
      save.textContent = 'Saved'
    })
    return h(
      'div',
      { class: 'trustbox' },
      h('div', { class: 'muted small' }, 'Other side of this transfer: ', addr(shown)),
      h('div', { class: 'row' }, label, save),
      h('div', { class: 'hint' }, 'Only trust an address you got from the real person or page. Later, anything that looks almost the same gets flagged.'),
    )
  }

  // ---------- live transfers ----------

  function alertFor(t: LiveTransfer, mine: number): void {
    if (!acct) return
    const { chain: c, address: me } = acct
    const line = h('div', { class: 'alert' }, h('strong', {}, t.direction === 'in' ? 'Incoming transfer' : 'Outgoing transfer'), ' ', h('span', { class: 'muted' }, 'checking…'))
    alerts.prepend(line)
    while (alerts.children.length > 4) alerts.lastElementChild?.remove()

    const entry: HistoryEntry = {
      hash: t.hash,
      blockNumber: t.blockNumber,
      timestamp: Math.floor(Date.now() / 1000),
      direction: t.direction,
      counterparty: t.counterparty,
      token: t.token,
      canonical: t.canonical,
      symbol: null,
      name: null,
      decimals: null,
      value: t.value,
    }
    entries = [entry, ...entries.filter((x) => !(x.hash === t.hash && x.token === t.token && x.value === t.value && x.direction === t.direction))]
    fresh.add(t.hash)
    renderList()
    if (t.canonical) void refreshBalance()

    const run = async (attempt: number): Promise<void> => {
      if (mine !== session) return
      try {
        const r = t.direction === 'in' ? await runVerify({ chain: c, hash: t.hash, hiddenChars: 0, context: { recipient: me }, watchlist: watchlist(c) }) : null
        const rep = await runTxReport({ chain: c, hash: t.hash, hiddenChars: 0 })
        if (mine !== session) return
        // Fill in the token's own name so the row can say what it claims to be.
        const tok = rep.tokens.find((x) => x.token === t.token)
        if (tok) {
          entry.symbol = tok.symbol
          entry.name = tok.name
        }
        clear(line)
        const first = rep.problems.find((p) => p.level === 'bad') ?? rep.problems.find((p) => p.level === 'warn')
        if (r) verdicts.set(t.hash, r.verdict)
        const kind = r ? VERDICT_KIND[r.verdict] : rep.headline === 'NO RED FLAGS' ? 'ok' : 'warn'
        line.className = `alert ${kind}`
        append(
          line,
          h('strong', {}, t.direction === 'in' ? 'Incoming ' : 'Outgoing '),
          r ? badge(r.verdict, VERDICT_KIND[r.verdict]) : badge(rep.headline, rep.headline === 'NO RED FLAGS' ? 'ok' : 'bad'),
          ' ',
          h('span', {}, `${amountText(c, entry)} · tx ${short(t.hash)}`),
          first ? h('div', { class: 'muted small' }, first.text) : null,
          r ? h('div', { class: 'muted small' }, VERDICT_TEXT[r.verdict]) : null,
        )
        const more = h('button', { type: 'button', class: 'link' }, 'Details')
        more.addEventListener('click', () => void open({ ...entry, flags: [], trusted: false }))
        append(line, ' ', more)
        renderList()
        if (notify && typeof Notification !== 'undefined' && Notification.permission === 'granted' && (kind === 'bad' || kind === 'warn') && t.direction === 'in') {
          new Notification('Flash Token Protector', { body: `${r?.verdict ?? rep.headline}: ${first?.text ?? 'check this incoming transfer'}`.slice(0, 160) })
        }
        // Just-mined transactions are usually not final yet: look again until they are, or give up.
        if (r?.verdict === 'UNVERIFIED' && attempt < 8) setTimeout(() => void run(attempt + 1), 12_000)
      } catch {
        if (mine === session) append(line, h('div', { class: 'muted small' }, 'Could not finish the automatic check. Tap the row to retry.'))
      }
    }
    void run(0)
  }

  function statusText(s: WatchStatus): string {
    if (s.state === 'unsupported' || s.state === 'degraded') return s.reason
    const parts = [`Live · block ${s.block}`]
    if (!s.allTokens) parts.push('real USDT only on this RPC')
    if (s.pending) parts.push(`${s.pending} pending from this address`)
    return parts.join(' · ')
  }

  // ---------- lifecycle ----------

  async function refreshBalance(): Promise<void> {
    if (!acct) return
    const mine = session
    const b = await loadBalance(acct.chain, acct.address)
    if (mine !== session) return
    balance = b
    renderAccount()
  }

  async function refresh(): Promise<void> {
    if (!acct) return
    const mine = session
    const c = acct.chain
    const me = acct.address
    balance = undefined
    renderAccount()
    void refreshBalance()
    try {
      const r = await loadHistory(c, me)
      if (mine !== session) return
      const live = entries.filter((x) => fresh.has(x.hash))
      entries = [...live, ...r.entries.filter((x) => !live.some((l) => l.hash === x.hash && l.token === x.token && l.value === x.value))]
      coverage = r.coverage
    } catch (e) {
      if (mine !== session) return
      coverage = [`History unavailable: ${e instanceof Error ? e.message : String(e)}`]
    }
    renderList()
  }

  function end(): void {
    session++
    stop?.()
    stop = null
    stopAccountEvents?.()
    stopAccountEvents = null
    acct = null
    entries = []
    coverage = []
    balance = undefined
    status = ''
    filter = 'all'
    verdicts.clear()
    fresh.clear()
    clear(accountEl)
    clear(listEl)
    clear(detail)
    clear(alerts)
    clear(payCheck)
    hooks.onAccount?.()
  }

  async function begin(c: ChainKey, address: Hex, via: 'wallet' | 'watch', wallet?: DiscoveredWallet): Promise<void> {
    end()
    chainSel = c
    const mine = session
    acct = { chain: c, address, via }
    setAccount({ chain: c, address, via })
    hooks.onAccount?.()
    renderPills()
    renderHero()
    renderAccount()
    renderPayCheck()
    listEl.appendChild(h('div', { class: 'card empty' }, h('p', { class: 'muted' }, 'Loading your history…')))
    stop = startWatch(c, address, {
      transfer: (t) => alertFor(t, mine),
      status: (s) => {
        if (mine !== session) return
        status = statusText(s)
        renderAccount()
      },
    })
    if (wallet) {
      stopAccountEvents = onAccountChange(wallet, (next) => {
        if (mine !== session) return
        if (next && next !== address) void begin(c, next, 'wallet', wallet)
        else if (!next) {
          end()
          setAccount(null)
          renderHero()
        }
      })
    }
    await refresh()
  }

  // ---------- "check an address before you pay" ----------

  function renderPayCheck(): void {
    clear(payCheck)
    if (!acct) return
    const a = acct
    const input = h('input', { type: 'text', placeholder: 'Address you are about to pay', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Address you are about to pay' })
    const out = h('div', {})
    const form = h('form', { class: 'row paycheck' }, input, h('button', { type: 'submit' }, 'Check'))
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault()
      clear(out)
      const p = parseAddress(input.value, CHAINS[a.chain].family)
      if (!p.ok) return void out.appendChild(h('p', { class: 'error' }, p.reason))
      const paid = flagged()
        .filter((e) => e.canonical && e.direction === 'out')
        .map((e) => displayAddress(a.chain, e.counterparty))
      const res = checkDestination(p.display, [...getWatchlist(a.chain).map((w) => w.address), ...paid], getRecent(a.chain))
      if (res.level === 'danger') {
        append(out, h('div', { class: 'verdict' }, badge('LOOKALIKE', 'bad'), h('p', {}, res.detail)))
        for (const m of res.matches) append(out, h('div', { class: 'cmp' }, h('span', { class: 'muted' }, 'pasted: '), diffAddress(p.display, m.target)), h('div', { class: 'cmp' }, h('span', { class: 'muted' }, 'yours:  '), addr(m.target)))
      } else if (res.level === 'known') {
        append(out, h('div', { class: 'verdict' }, badge('KNOWN', 'ok'), h('p', {}, res.detail)))
      } else {
        append(out, h('div', { class: 'verdict' }, badge('NEW', 'warn'), h('p', {}, res.detail)))
      }
      try {
        const code = classifyCode(await adapterFor(a.chain).getCode(p.hex))
        if (code.kind === 'contract') out.appendChild(note('That address is a smart contract, not a personal wallet. Make sure that is expected.', 'warn'))
      } catch {
        /* optional */
      }
    })
    payCheck.appendChild(h('div', { class: 'card' }, h('h3', { class: 'flush' }, 'About to pay someone?'), h('p', { class: 'muted small' }, 'Paste the address first. It is compared with people you have paid and addresses you trust, to catch lookalikes.'), form, out))
  }

  // ---------- wallets ----------

  if (isExtensionPage()) {
    walletBox.appendChild(note('Browsers only inject wallets into web pages, not extension popups. Paste an address below, or open the website to connect a wallet.', 'info'))
  } else {
    void discoverWallets().then((ws) => {
      if (ws.length === 0) {
        walletBox.appendChild(note('No browser wallet found. Connecting is optional; you can paste an address below.', 'info'))
        return
      }
      for (const w of ws) {
        const b = h('button', { type: 'button', class: 'walletbtn' }, `Connect ${w.name}`)
        b.addEventListener('click', async () => {
          err.textContent = ''
          if (CHAINS[chainSel].family !== 'evm') return void (err.textContent = 'Browser wallets connect on BNB Chain or Ethereum. Pick one of those, or paste a Tron address.')
          try {
            await begin(chainSel, await connectWallet(w), 'wallet', w)
          } catch (e) {
            err.textContent = e instanceof Error ? e.message : String(e)
          }
        })
        walletBox.appendChild(b)
      }
      walletBox.appendChild(h('p', { class: 'muted small' }, 'Optional. Connecting only reads which account is selected. This app never asks you to sign or send anything.'))
    })
  }

  hooks.current = () => acct
  hooks.connect = async (w) => {
    const c: ChainKey = CHAINS[chainSel].family === 'evm' ? chainSel : 'bsc'
    await begin(c, await connectWallet(w), 'wallet', w)
  }
  hooks.disconnect = () => {
    end()
    setAccount(null)
    renderHero()
  }

  renderPills()
  renderHero()

  const root = h('section', { class: 'tab', id: 'tab-wallet' }, hero, accountEl, alerts, detail, listEl, payCheck)

  // Restore the last followed address (watch only: a wallet must be reconnected on purpose).
  const saved = getAccount()
  if (saved && saved.via === 'watch' && saved.chain in CHAINS) {
    const p = parseAddress(displayAddress(saved.chain, saved.address as Hex), CHAINS[saved.chain].family)
    if (p.ok) queueMicrotask(() => void begin(saved.chain, p.hex, 'watch'))
  }
  return root
}
