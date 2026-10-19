// Builds the Chrome extension (Manifest V3) into extension/dist, and zips it.
//
//   node scripts/build-extension.ts            # extension/dist + extension/flash-token-protector-extension.zip
//   node scripts/build-extension.ts --test     # extension/dist-test: also runs on http://127.0.0.1:5199 (tests only)
//
// The manifest is generated from the chain registry so the CSP and host permissions can
// never drift from the RPC hosts the code really calls.

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'vite'
import { CHAIN_KEYS, CHAINS } from '../src/registry/chains.ts'

const ROOT = join(import.meta.dirname, '..')
const EXT = join(ROOT, 'extension')
const test = process.argv.includes('--test')
const OUT = join(EXT, test ? 'dist-test' : 'dist')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }

const rpcOrigins = [...new Set(CHAIN_KEYS.flatMap((k) => [...CHAINS[k].rpcs, ...CHAINS[k].logRpcs]).map((u) => new URL(u).origin))].sort()

const EXPLORERS = ['https://bscscan.com/*', 'https://*.bscscan.com/*', 'https://etherscan.io/*', 'https://*.etherscan.io/*']
const GUARD = [...EXPLORERS, 'https://*.binance.com/*', 'https://tronscan.org/*', 'https://*.tronscan.org/*']
const TEST_PAGE = 'http://127.0.0.1:5199/*'

const manifest = {
  manifest_version: 3,
  name: 'Flash Token Protector',
  version: pkg.version,
  description: 'Spot fake / flash USDT, address poisoning and clipboard swaps. Read-only: no keys, no signing, no tracking.',
  homepage_url: 'https://github.com/atharva-khewle/flash-token-protector',
  minimum_chrome_version: '111',
  icons: { '16': 'icons/icon-16.png', '32': 'icons/icon-32.png', '48': 'icons/icon-48.png', '128': 'icons/icon-128.png' },
  action: { default_title: 'Flash Token Protector', default_popup: 'popup.html', default_icon: { '16': 'icons/icon-16.png', '32': 'icons/icon-32.png' } },
  background: { service_worker: 'background.js', type: 'module' },
  permissions: ['storage', 'contextMenus'],
  host_permissions: rpcOrigins.map((o) => `${o}/*`),
  content_scripts: [
    { matches: [...EXPLORERS, ...(test ? [TEST_PAGE] : [])], js: ['content-explorer.js'], run_at: 'document_idle' },
    { matches: [...GUARD, ...(test ? [TEST_PAGE] : [])], js: ['content-guard.js'], run_at: 'document_start' },
    { matches: [...GUARD, ...(test ? [TEST_PAGE] : [])], js: ['content-main.js'], run_at: 'document_start', world: 'MAIN' },
  ],
  content_security_policy: {
    extension_pages: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src ${rpcOrigins.join(' ')}; base-uri 'none'; form-action 'none'; object-src 'none'`,
  },
}

rmSync(OUT, { recursive: true, force: true })
const define = { __TESTNET__: 'false', __EXT_TEST__: String(test) }

await build({
  root: EXT,
  configFile: false,
  base: './',
  publicDir: false,
  define,
  logLevel: 'warn',
  build: { outDir: OUT, emptyOutDir: true, target: 'es2022', sourcemap: false, rollupOptions: { input: { popup: join(EXT, 'popup.html') } } },
})

const bundles: [string, 'es' | 'iife'][] = [
  ['background', 'es'],
  ['content-explorer', 'iife'],
  ['content-guard', 'iife'],
  ['content-main', 'iife'],
]
for (const [name, format] of bundles) {
  await build({
    configFile: false,
    publicDir: false,
    define,
    logLevel: 'warn',
    build: {
      outDir: OUT,
      emptyOutDir: false,
      target: 'es2022',
      sourcemap: false,
      lib: { entry: join(EXT, 'src', `${name}.ts`), formats: [format], name: `ftp_${name.replace(/-/g, '_')}`, fileName: () => `${name}.js` },
    },
  })
}

if (!existsSync(join(EXT, 'icons', 'icon-128.png'))) execFileSync(process.execPath, [join(ROOT, 'scripts', 'make-icons.ts')], { stdio: 'inherit' })
cpSync(join(EXT, 'icons'), join(OUT, 'icons'), { recursive: true })
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

if (!test) {
  // Reproducible zip: fixed timestamps and sorted entries come from the `zip` tool being given a sorted list.
  const zip = join(EXT, 'flash-token-protector-extension.zip')
  rmSync(zip, { force: true })
  mkdirSync(join(ROOT, 'extension'), { recursive: true })
  if (process.platform === 'win32') {
    execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${OUT}\\*' -DestinationPath '${zip}' -Force`], { stdio: 'inherit' })
  } else {
    execFileSync('zip', ['-r', '-X', zip, '.'], { cwd: OUT, stdio: 'inherit' })
  }
  console.log(`zip: ${zip}`)
}
console.log(`extension built: ${OUT}`)
