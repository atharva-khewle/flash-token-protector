// @vitest-environment happy-dom
// F32: attacks on the tool itself.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { h, link } from '../src/ui/dom'

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

const root = process.cwd()

describe('F32a XSS through token names', () => {
  it('a token name with HTML is rendered as text, never parsed', () => {
    const evil = '<img src=x onerror="window.__pwned=1">Tether USD'
    const el = h('div', {}, h('strong', {}, evil))
    document.body.appendChild(el)
    expect(el.querySelector('img')).toBeNull()
    expect(el.textContent).toBe(evil)
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
  })

  it('no innerHTML / outerHTML / insertAdjacentHTML / eval / new Function / document.write in src', () => {
    const banned = /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|\beval\(|new Function\(|document\.write/
    for (const f of walk(join(root, 'src')).filter((p) => /\.(ts|js)$/.test(p))) {
      expect(banned.test(readFileSync(f, 'utf8')), f).toBe(false)
    }
  })

  it('anchors cannot be created with an href attribute from data; link() allows https only', () => {
    expect(() => h('a', { href: 'javascript:alert(1)' })).toThrow()
    expect(() => link('javascript:alert(1)', 'x')).toThrow()
    expect(link('https://bscscan.com/tx/0x1', 'x').rel).toContain('noopener')
  })
})

describe('F32b secrets stay server-side', () => {
  it('no VITE_ env vars and no api key reads in frontend code', () => {
    for (const f of walk(join(root, 'src'))) {
      const s = readFileSync(f, 'utf8')
      expect(/import\.meta\.env|env\.EXPLORER_API_KEY|apikey=/i.test(s), f).toBe(false)
    }
  })
})

describe('F32e supply chain', () => {
  it('all dependencies are pinned to exact versions and a lockfile exists', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Record<string, Record<string, string>>
    for (const deps of [pkg.dependencies ?? {}, pkg.devDependencies ?? {}]) {
      for (const [name, v] of Object.entries(deps)) expect(/^\d+\.\d+\.\d+$/.test(v), `${name}@${v}`).toBe(true)
    }
    expect(statSync(join(root, 'package-lock.json')).isFile()).toBe(true)
  })

  it('index.html loads no third-party scripts', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8')
    for (const m of html.matchAll(/<script[^>]*src="([^"]+)"/g)) expect(m[1]!.startsWith('/')).toBe(true)
  })
})
