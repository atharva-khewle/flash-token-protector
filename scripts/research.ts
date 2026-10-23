// Builds docs/ATTACK_RESEARCH.md from the same data the website's Attack vectors section uses:
// the vector list, the drawn scenes, the real-world incidents, the threat matrix and the local-chain
// proof results. Run `WRITE_DOCS=1 npx vitest run tests/research.test.ts` to regenerate it; the same
// test fails in CI when the document is out of date.

import { readFileSync } from 'node:fs'
import { INCIDENTS } from '../src/ui/incidents'
import type { Scene, SEdge, SNode } from '../src/ui/sceneKit'
import { SCENES_A } from '../src/ui/scenesA'
import { SCENES_B } from '../src/ui/scenesB'
import { VECTORS, type Vector } from '../src/ui/vectors'

const SCENES: Record<string, Scene> = { ...SCENES_A, ...SCENES_B }
const SEV_ORDER = ['Critical', 'High', 'Medium', 'Low']

interface MatrixRow {
  layers: string
  rule: string
  tests: string
}

interface ProofResult {
  id: string
  title: string
  pass: boolean
  outcome?: { observed?: string }
}

function readMatrix(root: URL): Map<string, MatrixRow> {
  const rows = new Map<string, MatrixRow>()
  for (const line of readFileSync(new URL('docs/THREAT_MATRIX.md', root), 'utf8').split('\n')) {
    const m = /^\| ([A-G]\d+[a-z]?) \| (.*?) \| (.*) \| (.*) \|\s*$/.exec(line)
    if (m) rows.set(m[1]!, { layers: m[2]!, rule: m[3]!, tests: m[4]! })
  }
  return rows
}

function readProof(root: URL): ProofResult[] {
  try {
    return (JSON.parse(readFileSync(new URL('docs/proof/results.json', root), 'utf8')) as { results: ProofResult[] }).results
  } catch {
    return []
  }
}

// ---------- Mermaid ----------

const NODE_STYLE: Record<string, string> = {
  attacker: 'fill:#3a2422,stroke:#e5786f,color:#f3f3f5',
  fake: 'fill:#3a2422,stroke:#e5786f,color:#f3f3f5',
  victim: 'fill:#3a3222,stroke:#f0c674,color:#f3f3f5',
  real: 'fill:#1f3329,stroke:#85e0b0,color:#f3f3f5',
  me: 'fill:#2f2b45,stroke:#ab9ff2,color:#f3f3f5',
  creator: 'fill:#2c2840,stroke:#c4bbf8,color:#f3f3f5',
  contract: 'fill:#2d2d32,stroke:#8f8f9a,color:#f3f3f5,stroke-dasharray:5 3',
  wallet: 'fill:#2d2d32,stroke:#8f8f9a,color:#f3f3f5',
  unknown: 'fill:#2d2d32,stroke:#8f8f9a,color:#f3f3f5',
}
const EDGE_COLOR: Record<string, string> = {
  real: '#3fae74',
  fake: '#e5786f',
  dust: '#d6a43c',
  zero: '#d6a43c',
  lookalike: '#e5786f',
  approval: '#d6a43c',
  created: '#9d8fe8',
  call: '#8f8f9a',
  other: '#8f8f9a',
}

/** Text safe inside a quoted Mermaid label. */
const esc = (s: string) => s.replace(/"/g, '#quot;').replace(/[<>]/g, '').replace(/\|/g, '/')

function mermaid(s: Scene): string {
  const ids = new Map(s.nodes.map((n, i) => [n.id, `n${i}`]))
  const lines = ['```mermaid', 'flowchart TD']
  const label = (n: SNode) => (n.badge ? `<b>${esc(n.badge)}</b><br/>${esc(n.title)}` : esc(n.title))
  for (const n of s.nodes) lines.push(`  ${ids.get(n.id)}["${label(n)}"]`)
  const arrow = (e: SEdge) => (e.kind === 'real' || e.kind === 'fake' ? '==>' : e.kind === 'call' || e.kind === 'created' || e.kind === 'zero' || e.kind === 'dust' ? '-.->' : '-->')
  for (const e of s.edges) {
    const a = ids.get(e.from)
    const b = ids.get(e.to)
    if (!a || !b) continue
    lines.push(e.label ? `  ${a} ${arrow(e)}|"${esc(e.label)}"| ${b}` : `  ${a} ${arrow(e)} ${b}`)
  }
  s.nodes.forEach((n) => lines.push(`  style ${ids.get(n.id)} ${NODE_STYLE[n.kind] ?? NODE_STYLE.unknown}`))
  s.edges.forEach((e, i) => lines.push(`  linkStyle ${i} stroke:${EDGE_COLOR[e.kind] ?? '#8f8f9a'},stroke-width:2px`))
  lines.push('```')
  return lines.join('\n')
}

// ---------- document ----------

const anchor = (v: Vector) => `${v.id} ${v.name}`.toLowerCase().replace(/[^a-z0-9 _-]/g, '').replace(/ /g, '-')
const residual = (row: MatrixRow | undefined) => !!row && /\*\*Residual\*\*/.test(row.layers)

export function buildResearch(root: URL): string {
  const matrix = readMatrix(root)
  const proof = readProof(root)
  const groups = [...new Set(VECTORS.map((v) => v.group))]
  const out: string[] = []
  const refs: { id: string; source: string; title: string; url: string }[] = []

  const sevCount = (list: Vector[]) => SEV_ORDER.map((s) => list.filter((v) => v.sev === s).length)
  const covered = VECTORS.filter((v) => !residual(matrix.get(v.id))).length
  const reproduced = VECTORS.filter((v) => proof.some((p) => p.id.startsWith(`${v.id}-`))).length

  out.push(
    '# Attack vectors against USDT payments: a field guide',
    '',
    '> Generated from the data behind the website\'s **Attack vectors** section (`src/ui/vectors.ts`, `src/ui/scenes*.ts`, `src/ui/incidents.ts`), the [threat matrix](THREAT_MATRIX.md) and the [local-chain proof](PROOF.md). Do not edit by hand: run `WRITE_DOCS=1 npx vitest run tests/research.test.ts`.',
    '',
    '## Abstract',
    '',
    `"Flash USDT" is a social-engineering scam, not a technology: a payment is made to *look* like real USDT when it is not, or a real payment is shown out of context. This document catalogues **${VECTORS.length} attack vectors** used against people who receive or send USDT on BNB Smart Chain, Ethereum and Tron, from fake tokens and forged events to address poisoning, approval phishing, EIP-7702 delegation drainers and lying infrastructure. For each vector it gives the mechanism, what the victim sees, a flow diagram of who does what and which funds move where, the detection rule implemented in this project, the tests that prove that rule, a reproduction on a local chain where one exists, and a documented real-world case with its source.`,
    '',
    `Of the ${VECTORS.length} vectors, **${covered} are detected** by on-chain rules in this tool and **${VECTORS.length - covered} are residual** (off-chain or device-level: they are documented, and the UI warns about them, but the chain alone cannot prove them). **${reproduced}** vectors are reproduced end to end with real transactions on a local Anvil chain.`,
    '',
    '## Method',
    '',
    '- **Threat model.** The attacker controls any number of addresses and contracts on the target chain, can pay gas, can message the victim, and may control a website, an RPC endpoint or the victim\'s clipboard. The attacker cannot forge signatures of addresses they do not control and cannot change the canonical USDT contracts.',
    '- **Identity rule.** Real USDT is exactly one contract per chain (registry in `src/registry/usdt.ts`). Name, symbol, logo, decimals and price are never used for identity.',
    '- **Evidence.** Rules are pure functions over normalized chain data (`src/verdict/`), unit-tested in `tests/`. Behavioural vectors are reproduced with purpose-built malicious contracts on a local chain (`contracts/src/`, `e2e/scenarios.ts`); those contracts refuse to deploy anywhere except a local chain or BSC testnet.',
    '- **Field data.** Real mainnet examples are in [TEST_TXS.md](TEST_TXS.md). Each vector below cites one published real-world case; summaries only state what the linked source reports.',
    '- **Defense layers.** L0 input, L1 consensus and finality, L2 token identity, L3 net amounts, L4 context (recipient, amount, time, reuse), L5 lookalikes and history, L6 token behaviour, L7 account control, L8 app and infrastructure. See the README\'s [Defense layers](../README.md#defense-layers).',
    '',
    '## Taxonomy',
    '',
    '| Group | Vectors | Critical | High | Medium | Low |',
    '|---|---|---|---|---|---|',
    ...groups.map((g) => {
      const list = VECTORS.filter((v) => v.group === g)
      return `| ${g} | ${list.length} | ${sevCount(list).join(' | ')} |`
    }),
    `| **Total** | **${VECTORS.length}** | ${sevCount(VECTORS).map((n) => `**${n}**`).join(' | ')} |`,
    '',
    '## All vectors at a glance',
    '',
    '| ID | Vector | Chains | Severity | Layer(s) | Status | Real-world case |',
    '|---|---|---|---|---|---|---|',
    ...VECTORS.map((v) => {
      const inc = INCIDENTS[v.id]
      const row = matrix.get(v.id)
      const status = residual(row) ? 'Residual' : proof.some((p) => p.id.startsWith(`${v.id}-`)) ? 'Detected, reproduced' : 'Detected'
      return `| [${v.id}](#${anchor(v)}) | ${v.name.replace(/\|/g, '/')} | ${v.chains} | ${v.sev} | ${v.layer} | ${status} | ${inc ? `[${inc.title.replace(/\|/g, '/')}](${inc.url})` : ''} |`
    }),
    '',
  )

  for (const g of groups) {
    out.push(`## ${g}`, '')
    for (const v of VECTORS.filter((x) => x.group === g)) {
      const s = SCENES[v.id]
      const inc = INCIDENTS[v.id]
      const row = matrix.get(v.id)
      const runs = proof.filter((p) => p.id.startsWith(`${v.id}-`))
      out.push(`### ${v.id} ${v.name}`, '', `**Severity:** ${v.sev} · **Chains:** ${v.chains} · **Layer(s):** ${v.layer}${residual(row) ? ' · **Residual**' : ''}`, '')
      out.push(`**Mechanism.** ${v.how}.`, '')
      if (v.sees) out.push(`**What the victim sees.** ${v.sees}.`, '')
      if (s) {
        out.push('**Attack flow.**', '', mermaid(s), '')
        if (s.foot) out.push(`*${s.foot}*`, '')
        out.push('**Step by step.**', '', ...s.steps.map((t, i) => `${i + 1}. ${t}`), '')
      }
      out.push(`**Detection.** ${v.det}.`, '')
      if (row) {
        out.push(`**Rule (${row.layers}).** ${row.rule}`, '')
        if (row.tests && row.tests !== '—') out.push(`**Tests.** ${row.tests}`, '')
      }
      if (runs.length) {
        out.push('**Reproduced on a local chain.**', '', ...runs.map((p) => `- \`${p.id}\`: ${p.title} → ${p.outcome?.observed ?? (p.pass ? 'pass' : 'fail')}${p.pass ? '' : ' (FAILED)'}`), '')
      }
      if (inc) {
        refs.push({ id: v.id, source: inc.source, title: inc.title, url: inc.url })
        out.push(`**Real-world case.** *${inc.title}${inc.when ? ` (${inc.when})` : ''}.* ${inc.text} Source: [${inc.source}](${inc.url}).`, '')
      }
    }
  }

  out.push('## References', '', ...refs.map((r, i) => `${i + 1}. **${r.id}**: ${r.source}, "${r.title}". <${r.url}>`), '')
  return out.join('\n')
}
