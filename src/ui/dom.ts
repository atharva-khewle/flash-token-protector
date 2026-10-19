// Tiny DOM helpers. Chain data (token names, symbols, addresses) is untrusted:
// it only ever reaches the page as text nodes. No innerHTML anywhere.

type Child = Node | string | number | null | undefined | false
type Attrs = Record<string, string | boolean | undefined | ((e: Event) => void)>

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue
    if (typeof v === 'function') {
      el.addEventListener(k.replace(/^on/, '').toLowerCase(), v)
    } else if (k === 'href') {
      throw new Error('use link() for anchors')
    } else {
      el.setAttribute(k, v === true ? '' : v)
    }
  }
  append(el, ...children)
  return el
}

export function append(el: Node, ...children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c)
  }
}

/** External link. Only https URLs the app built itself (from the chain registry). */
export function link(url: string, text: string): HTMLAnchorElement {
  const u = new URL(url)
  if (u.protocol !== 'https:') throw new Error('only https links')
  const a = document.createElement('a')
  a.href = u.toString()
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.textContent = text
  return a
}

/** Like link(), for explorers that may not exist (local test chain). */
export function maybeLink(url: string | null, text: string): Node | null {
  return url ? link(url, text) : null
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild)
}

export function field(label: string, input: HTMLElement, hint?: string): HTMLElement {
  return h('label', { class: 'field' }, h('span', { class: 'label' }, label), input, hint ? h('span', { class: 'hint' }, hint) : null)
}
