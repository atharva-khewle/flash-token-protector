// Tracker (hidden section): paste or import any number of addresses, read each wallet's history,
// follow the money a few hops, and draw where it goes: who splits it, who collects it, who passes
// it on, and where it ends up. Read-only; everything runs in the browser.

import type { Hex } from '../chains/types'
import { displayAddress } from '../lib/address'
import { familyOfAddress, parseAddress } from '../lib/input'
import { CHAINS, type ChainKey } from '../registry/chains'
import { crawl, loadBalances, type CrawlResult, type Follow } from '../services/trace'
import { buildTrace, fmtAmount, type TokenFilter, type TraceGraph, type TraceNode } from '../verdict/trace'
import { canonicalUsdt } from '../registry/usdt'
import { clear, field, h, link } from './dom'
import { chainSelect, note, openCheck } from './common'
import { downloadText, whiteboard, type BoardSpec, type GNode, type NodeKind } from './graph'

const ADDR_RE = /0x[0-9a-fA-F]{40}|T[1-9A-HJ-NP-Za-km-z]{33}/g
const DRAFT = 'ftp.tracker.draft'
const short = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`

/** Every address-looking string in a text, in order, without duplicates. */
export function extractAddresses(text: string): string[] {
  return [...new Set(text.match(ADDR_RE) ?? [])]
}

function select<T extends string>(name: string, options: [T, string][], initial: T): HTMLSelectElement {
  const s = h('select', { name })
  for (const [v, label] of options) {
    const o = h('option', { value: v }, label)
    if (v === initial) o.selected = true
    s.appendChild(o)
  }
  return s
}

function roleText(n: TraceNode): string {
  const parts: string[] = []
  if (n.input) parts.push('YOUR INPUT')
  if (n.roles.includes('splitter')) parts.push(`SPLITS TO ${n.fanOut}`)
  if (n.roles.includes('collector')) parts.push(`COLLECTS FROM ${n.fanIn}`)
  if (n.roles.includes('pass-through')) parts.push('PASSES ON')
  if (n.roles.includes('destination')) parts.push('MONEY STOPS HERE')
  if (n.roles.includes('unexplored')) parts.push('NOT FOLLOWED')
  if (n.roles.includes('busy')) parts.push('BUSY (EXCHANGE?)')
  if (n.roles.includes('source') && !n.input) parts.push('SOURCE')
  return parts.join(' · ')
}

function kindOf(n: TraceNode): NodeKind {
  if (n.input) return 'me'
  if (n.roles.includes('busy')) return 'contract'
  if (n.roles.includes('collector') || n.roles.includes('destination')) return 'real'
  if (n.roles.includes('splitter')) return 'creator'
  if (n.roles.includes('unexplored')) return 'unknown'
  return 'wallet'
}

export function trackerTab(): HTMLElement {
  let chain: ChainKey = 'tron'
  let result: { crawl: CrawlResult; inputs: Hex[]; chain: ChainKey; balances: Map<Hex, bigint | null> } | null = null
  let balCtrl: AbortController | null = null
  let ctrl: AbortController | null = null

  // ---------- input ----------
  const chainSel = chainSelect('tron')
  const area = h('textarea', { rows: '6', spellcheck: 'false', placeholder: 'Paste one or many addresses: one per line, or any text that contains them.', 'aria-label': 'Addresses' })
  try {
    area.value = localStorage.getItem(DRAFT) ?? ''
  } catch {
    /* optional */
  }
  const count = h('div', { class: 'muted small' })
  const file = h('input', { type: 'file', accept: '.txt,.csv,.json,text/plain,text/csv,application/json', hidden: true })
  const importBtn = h('button', { type: 'button' }, 'Import file')
  const exportList = h('button', { type: 'button' }, 'Export list')
  const clearBtn = h('button', { type: 'button', class: 'link' }, 'Clear')

  const parsed = () => {
    const fam = CHAINS[chain].family
    const ok: Hex[] = []
    const shown: string[] = []
    let wrong = 0
    for (const raw of extractAddresses(area.value)) {
      if (familyOfAddress(raw) !== fam) {
        wrong++
        continue
      }
      const p = parseAddress(raw, fam)
      if (p.ok && !ok.includes(p.hex)) {
        ok.push(p.hex)
        shown.push(p.display)
      } else if (!p.ok) wrong++
    }
    return { ok, shown, wrong }
  }
  const updateCount = () => {
    const p = parsed()
    count.textContent = `${p.ok.length} address${p.ok.length === 1 ? '' : 'es'} for ${CHAINS[chain].name}${p.wrong ? ` · ${p.wrong} skipped (other chain or invalid)` : ''}`
    try {
      localStorage.setItem(DRAFT, area.value.slice(0, 50_000))
    } catch {
      /* optional */
    }
  }
  area.addEventListener('input', updateCount)
  chainSel.addEventListener('change', () => {
    chain = chainSel.value as ChainKey
    updateCount()
  })
  importBtn.addEventListener('click', () => file.click())
  file.addEventListener('change', async () => {
    const f = file.files?.[0]
    if (!f) return
    const text = await f.text()
    const found = extractAddresses(text)
    area.value = [...new Set([...extractAddresses(area.value), ...found])].join('\n')
    file.value = ''
    updateCount()
  })
  exportList.addEventListener('click', () => {
    const p = parsed()
    downloadText(`addresses-${p.shown.length}.txt`, `${p.shown.join('\n')}\n`, 'text/plain')
  })
  clearBtn.addEventListener('click', () => {
    area.value = ''
    updateCount()
  })

  // ---------- options ----------
  const pages = select('pages', [['1', '200 transfers'], ['3', '600 transfers'], ['5', '1,000 transfers'], ['10', '2,000 transfers'], ['25', '5,000 transfers']], '3')
  const hops = select('hops', [['0', 'Only these wallets'], ['1', '1 hop'], ['2', '2 hops'], ['3', '3 hops']], '1')
  const follow = select<Follow>('follow', [['out', 'Where the money goes'], ['in', 'Where the money came from'], ['both', 'Both directions']], 'out')
  const per = select('per', [['3', 'Top 3 per wallet'], ['5', 'Top 5 per wallet'], ['8', 'Top 8 per wallet']], '5')
  const go = h('button', { type: 'button', class: 'primary' }, 'Analyze')
  const stop = h('button', { type: 'button' }, 'Stop')
  stop.hidden = true
  const bar = h('div', { class: 'trk-bar' }, h('div', { class: 'trk-fill' }))
  const status = h('div', { class: 'muted small', 'aria-live': 'polite' })
  const progress = h('div', { class: 'trk-progress' }, bar, status)
  progress.hidden = true
  const err = h('p', { class: 'error', role: 'alert' })
  const out = h('div', { class: 'result' })

  go.addEventListener('click', async () => {
    err.textContent = ''
    const p = parsed()
    if (p.ok.length === 0) return void (err.textContent = `Paste at least one ${CHAINS[chain].name} address.`)
    if (p.ok.length > 40) return void (err.textContent = 'Up to 40 addresses at a time.')
    ctrl = new AbortController()
    go.disabled = true
    stop.hidden = false
    progress.hidden = false
    clear(out)
    const fill = bar.firstElementChild as HTMLElement
    fill.style.width = '2%'
    try {
      const c = chain
      const r = await crawl({
        chain: c,
        inputs: p.ok,
        pages: Number(pages.value),
        hops: Number(hops.value),
        perWallet: Number(per.value),
        follow: follow.value as Follow,
        signal: ctrl.signal,
        onProgress: (x) => {
          status.textContent = x.text
          fill.style.width = `${Math.min(100, Math.round((x.done / Math.max(1, x.total)) * 100))}%`
        },
      })
      balCtrl?.abort()
      result = { crawl: r, inputs: p.ok, chain: c, balances: new Map() }
      render()
    } catch (e) {
      out.appendChild(note(`Could not finish: ${e instanceof Error ? e.message : String(e)}`, 'warn'))
    } finally {
      go.disabled = false
      stop.hidden = true
      progress.hidden = true
      ctrl = null
    }
  })
  stop.addEventListener('click', () => ctrl?.abort())

  // ---------- results ----------
  let token: TokenFilter = 'usdt'

  function render(): void {
    clear(out)
    if (!result) return
    const { crawl: r, inputs, chain: c } = result
    const g = buildTrace({ chain: c, histories: r.histories, inputs, busy: r.busy, token })
    const show = (a: Hex) => displayAddress(c, a)

    // Token filter, built from every token seen.
    const usdt = canonicalUsdt(c)
    const tokens = new Map<string, { label: string; n: number }>()
    for (const list of r.histories.values()) {
      for (const t of list) {
        const k = t.token.toLowerCase()
        if (k === usdt.hex) continue
        const cur = tokens.get(k) ?? { label: (t.tokenSymbol ?? 'unnamed').slice(0, 16), n: 0 }
        cur.n++
        tokens.set(k, cur)
      }
    }
    const tokSel = h('select', { 'aria-label': 'Token' })
    for (const [v, label] of [['usdt', 'Real USDT'], ['all', 'All tokens'], ...[...tokens.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 30).map(([k, t]) => [k, `${t.label} (${t.n})`])] as [string, string][]) {
      const o = h('option', { value: v }, label)
      if (v === token) o.selected = true
      tokSel.appendChild(o)
    }
    tokSel.addEventListener('change', () => {
      token = tokSel.value as TokenFilter
      render()
    })

    const unit = token === 'usdt' ? ' USDT' : ''
    const held = holdings(g, c, result.balances, r.busy)
    const stats = h(
      'div',
      { class: 'trk-stats' },
      stat(String(r.histories.size), 'wallets read'),
      stat(String(g.transfersSeen), 'transfers read'),
      stat(String(g.nodes.length), 'addresses on the map'),
      g.decimals !== null ? stat(`${fmtAmount(g.inflow, g.decimals)}${unit}`, 'entered these wallets from outside') : null,
      held.stat,
    )

    const spec = traceBoard(g, c, (a) => addToList(a))
    const flows = flowTable(g, c)

    const actions = h(
      'div',
      { class: 'trk-actions' },
      btn('Export addresses', () => downloadText(`trace-addresses-${g.nodes.length}.txt`, `${g.nodes.map((n) => show(n.address)).join('\n')}\n`, 'text/plain')),
      btn('Export flows (CSV)', () => downloadText('trace-flows.csv', flowsCsv(g, c), 'text/csv')),
      btn('Export map (JSON)', () => downloadText('trace-map.json', JSON.stringify(jsonOf(g, c), null, 2), 'application/json')),
      btn('Put every address in the list', () => {
        area.value = [...new Set([...extractAddresses(area.value), ...g.nodes.map((n) => show(n.address))])].join('\n')
        updateCount()
        area.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }),
    )

    out.append(
      h('div', { class: 'trk-head' }, h('h3', { class: 'flush' }, 'Where the money goes'), h('label', { class: 'trk-token' }, h('span', { class: 'muted small' }, 'Token '), tokSel)),
      stats,
      g.patterns.length ? h('ul', { class: 'trk-patterns' }, ...g.patterns.map((p) => h('li', {}, p))) : h('p', { class: 'muted' }, 'No transfers of this token between these wallets in the history read.'),
      whiteboard(spec),
      actions,
      held.table,
      flows,
      h('ul', { class: 'muted small trk-notes' }, ...r.notes.map((n) => h('li', {}, n)), g.dropped ? h('li', {}, `${g.dropped} small one-off addresses were left off the map to keep it readable (still in the CSV).`) : null),
    )
  }

  /**
   * "Held now": the current real-USDT balance of the wallets that were traced (history read),
   * summed. If they belong to one operator, this is what it still controls, each dollar counted
   * once. Other addresses on the map (funders, exchanges, not-followed receivers) and busy wallets
   * are listed with their balance but not added: that is usually other people's money.
   */
  function holdings(g: TraceGraph, c: ChainKey, cache: Map<Hex, bigint | null>, busy: Set<Hex>): { stat: HTMLElement; table: HTMLElement } {
    const usdt = canonicalUsdt(c)
    const counts = (n: TraceNode) => n.fetched && !busy.has(n.address)
    const counted = g.nodes.filter(counts).map((n) => n.address)
    const value = h('div', { class: 'trk-statv' }, '…')
    const label = h('div', { class: 'muted small' }, 'held now by these wallets (reading balances…)')
    const statEl = h('div', { class: 'trk-stat accent' }, value, label)
    const tb = h('tbody', {})
    const table = h(
      'details',
      { class: 'trk-flows' },
      h('summary', {}, `Balances of the ${g.nodes.length} addresses on the map`),
      h('div', { class: 'txl-scroll' }, h('table', { class: 'tbl txl-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Address'), h('th', {}, 'Real USDT now'), h('th', {}, 'Counted'), h('th', {}, 'Role'))), tb)),
    )
    const paint = () => {
      let sum = 0n
      let read = 0
      for (const a of counted) {
        const v = cache.get(a)
        if (v === undefined) continue
        read++
        if (v !== null) sum += v
      }
      value.textContent = `${fmtAmount(sum, usdt.decimals)} USDT`
      label.textContent =
        read < counted.length
          ? `held now by the ${counted.length} traced wallets (${read} read…)`
          : `held now by the ${counted.length} traced wallets (other addresses on the map are listed, not added)`
      clear(tb)
      const rows = [...g.nodes].sort((x, y) => {
        const a = cache.get(x.address) ?? -1n
        const b = cache.get(y.address) ?? -1n
        return b > a ? 1 : b < a ? -1 : 0
      })
      for (const n of rows) {
        const v = cache.get(n.address)
        const shown = displayAddress(c, n.address)
        tb.appendChild(
          h(
            'tr',
            {},
            h('td', {}, h('code', { class: 'addr', title: shown }, short(shown))),
            h('td', { class: 'txl-amt real' }, v === undefined ? '…' : v === null ? 'unreadable' : `${fmtAmount(v, usdt.decimals)} USDT`),
            h('td', { class: 'muted small' }, counts(n) ? 'yes' : busy.has(n.address) ? 'no: busy (likely an exchange)' : 'no: not traced'),
            h('td', { class: 'muted small' }, roleText(n).toLowerCase() || '—'),
          ),
        )
      }
    }
    paint()
    const missing = g.nodes.map((n) => n.address).filter((a) => !cache.has(a))
    if (missing.length) {
      balCtrl?.abort()
      const ctl = new AbortController()
      balCtrl = ctl
      let pending = 0
      void loadBalances(c, missing, ctl.signal, (a, v) => {
        cache.set(a, v)
        if (++pending % 3 === 0 || pending === missing.length) paint()
      })
    }
    return { stat: statEl, table }
  }

  function addToList(a: string): void {
    area.value = [...new Set([...extractAddresses(area.value), a])].join('\n')
    updateCount()
  }

  updateCount()
  return h(
    'section',
    { class: 'tab', id: 'tab-tracker' },
    h('div', { class: 'trk-input' }, field('Network', chainSel), field('Addresses', area), count, h('div', { class: 'trk-actions' }, importBtn, exportList, clearBtn), file),
    h('div', { class: 'trk-options' }, field('History per wallet', pages), field('Follow the money', hops), field('Direction', follow), field('Wallets to follow', per)),
    h('div', { class: 'trk-go' }, go, stop),
    progress,
    err,
    out,
  )
}

function stat(value: string, label: string, accent = false): HTMLElement {
  return h('div', { class: `trk-stat${accent ? ' accent' : ''}` }, h('div', { class: 'trk-statv' }, value), h('div', { class: 'muted small' }, label))
}

function btn(label: string, run: () => void): HTMLElement {
  const b = h('button', { type: 'button' }, label)
  b.addEventListener('click', run)
  return b
}

function traceBoard(g: TraceGraph, c: ChainKey, add: (a: string) => void): BoardSpec {
  const ex = CHAINS[c].explorer
  const nodes: GNode[] = g.nodes.map((n) => {
    const shown = displayAddress(c, n.address)
    const amt = (v: bigint) => (g.decimals === null ? `${v}` : fmtAmount(v, g.decimals))
    return {
      id: n.address,
      kind: kindOf(n),
      col: n.layer,
      badge: roleText(n) || undefined,
      title: g.decimals === null ? `${n.inCount} in · ${n.outCount} out` : `In ${amt(n.inTotal)} · Out ${amt(n.outTotal)}`,
      sub: short(shown),
      address: shown,
      explorer: ex.address(shown),
      explorerName: ex.name,
      info: [
        `${n.inCount} transfer${n.inCount === 1 ? '' : 's'} in from ${n.fanIn} address${n.fanIn === 1 ? '' : 'es'}, ${n.outCount} out to ${n.fanOut}.`,
        n.fetched ? 'Its history was read.' : 'Its history was not read; only transfers with wallets that were read are shown.',
        ...(n.roles.includes('busy') ? ['It has more history than was read, so it was not followed (often an exchange or payment service).'] : []),
      ],
      actions: [
        { label: 'Add to the list', run: () => add(shown) },
        { label: 'Check this address', run: () => openCheck('scan', c, shown) },
      ],
    }
  })
  const edges = g.flows.map((f) => ({
    from: f.from,
    to: f.to,
    kind: f.kind === 'real' ? ('real' as const) : f.kind === 'fake' ? ('fake' as const) : ('other' as const),
    label: `${f.decimals === null ? `${f.total}` : fmtAmount(f.total, f.decimals)} ${f.symbol ?? ''}${f.count > 1 ? ` · ${f.count} tx` : ''}`.trim(),
  }))
  return {
    title: 'Money flow',
    desc: 'Left to right in the direction the money moves. Tap a box for details, add it to the list, or check it.',
    nodes,
    edges,
    footnote: 'Purple: your inputs. Light purple: splits money out. Green: collects it or keeps it. Grey dashed: busy wallet (likely an exchange). Grey: passes it on or not followed.',
  }
}

function flowTable(g: TraceGraph, c: ChainKey): HTMLElement {
  const ex = CHAINS[c].explorer
  const show = (a: Hex) => displayAddress(c, a)
  const sorted = [...g.flows].sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0)).slice(0, 200)
  const day = (t: number | null) => (t ? new Date(t * 1000).toLocaleDateString() : '')
  const tb = h('tbody', {})
  for (const f of sorted) {
    const tx = f.txs[0] ? ex.tx(f.txs[0]) : null
    tb.appendChild(
      h(
        'tr',
        {},
        h('td', {}, h('code', { class: 'addr', title: show(f.from) }, short(show(f.from)))),
        h('td', {}, h('code', { class: 'addr', title: show(f.to) }, short(show(f.to)))),
        h('td', { class: `txl-amt ${f.kind}` }, `${f.decimals === null ? `${f.total} raw` : fmtAmount(f.total, f.decimals)} ${f.symbol ?? ''}`),
        h('td', {}, String(f.count)),
        h('td', { class: 'muted small' }, f.first ? `${day(f.first)}${f.last && f.last !== f.first ? ` – ${day(f.last)}` : ''}` : ''),
        h('td', {}, tx ? link(tx, ex.name) : null),
      ),
    )
  }
  return h(
    'details',
    { class: 'trk-flows' },
    h('summary', {}, `All flows (${g.flows.length})`),
    h('div', { class: 'txl-scroll' }, h('table', { class: 'tbl txl-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'From'), h('th', {}, 'To'), h('th', {}, 'Amount'), h('th', {}, 'Transfers'), h('th', {}, 'When'), h('th', {}, 'First tx'))), tb)),
  )
}

/** CSV cells starting with = + - @ are formulas in spreadsheets; token names are untrusted. */
const cell = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`

function flowsCsv(g: TraceGraph, c: ChainKey): string {
  const show = (a: Hex) => displayAddress(c, a)
  const rows = g.flows.map((f) =>
    [show(f.from), show(f.to), f.symbol ?? '', f.kind, f.decimals === null ? f.total.toString() : fmtAmount(f.total, f.decimals).replace(/,/g, ''), String(f.count), f.first ? new Date(f.first * 1000).toISOString() : '', f.last ? new Date(f.last * 1000).toISOString() : '', f.txs.join(' ')]
      .map(cell)
      .join(','),
  )
  return ['from,to,token,kind,amount,transfers,first,last,txs', ...rows].join('\n')
}

function jsonOf(g: TraceGraph, c: ChainKey): unknown {
  const show = (a: Hex) => displayAddress(c, a)
  return {
    chain: c,
    nodes: g.nodes.map((n) => ({ address: show(n.address), roles: n.roles, layer: n.layer, in: n.inTotal.toString(), out: n.outTotal.toString(), fetched: n.fetched })),
    flows: g.flows.map((f) => ({ from: show(f.from), to: show(f.to), token: f.token, symbol: f.symbol, kind: f.kind, total: f.total.toString(), decimals: f.decimals, count: f.count, txs: f.txs })),
  }
}
