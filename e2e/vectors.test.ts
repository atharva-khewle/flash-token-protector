// Runs every attack scenario against a fresh local Anvil node and writes the evidence
// (docs/proof/results.json and docs/PROOF.md).
//
//   npm run e2e          starts its own anvil on :8545
//   SEED=1 npm run e2e   uses the anvil already running on :8545 and also writes the UI
//                        inputs to docs/proof/ui-cases.json (for browser testing)

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { registerLocal } from '../src/testnet'
import { deployAll } from '../scripts/deploy-test-contracts'
import { makeCtx, startAnvil, type Anvil, type Ctx } from './chain'
import { scenarios, type Outcome } from './scenarios'

const ROOT = process.cwd()
const seed = !!process.env.SEED
let anvil: Anvil | null = null
let ctx: Ctx
const results: { id: string; vectors: string[]; title: string; pass: boolean; error?: string; outcome?: Outcome }[] = []

beforeAll(async () => {
  anvil = seed ? null : await startAnvil()
  const d = await deployAll(anvil?.rpc ?? 'http://127.0.0.1:8545')
  registerLocal(d)
  ctx = await makeCtx(d)
  if (seed) {
    mkdirSync(join(ROOT, 'public'), { recursive: true })
    writeFileSync(join(ROOT, 'public', 'testnet-deployments.json'), JSON.stringify(d, null, 2) + '\n')
  }
})

afterAll(async () => {
  mkdirSync(join(ROOT, 'docs', 'proof'), { recursive: true })
  writeFileSync(join(ROOT, 'docs', 'proof', 'results.json'), JSON.stringify({ chainId: ctx?.d.chainId, results }, null, 2) + '\n')
  if (seed) {
    const ui = results.filter((r) => r.outcome?.ui).map((r) => ({ id: r.id, title: r.title, ...r.outcome!.ui }))
    writeFileSync(join(ROOT, 'docs', 'proof', 'ui-cases.json'), JSON.stringify({ deployments: ctx.d, cases: ui }, null, 2) + '\n')
  }
  await anvil?.stop()
})

describe('every attack vector, on a real local chain', () => {
  for (const s of scenarios) {
    it(`${s.id}: ${s.title}`, async () => {
      const row: (typeof results)[number] = { id: s.id, vectors: s.vectors, title: s.title, pass: false }
      results.push(row)
      try {
        row.outcome = await s.run(ctx)
        row.pass = true
      } catch (e) {
        row.error = e instanceof Error ? e.message : String(e)
        throw e
      }
      expect(row.pass).toBe(true)
    })
  }
})
