// docs/ATTACK_RESEARCH.md is generated from the attack-vector data. Set WRITE_DOCS=1 to regenerate it.

import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildResearch } from '../scripts/research'

const ROOT = new URL('../', import.meta.url)
const FILE = new URL('docs/ATTACK_RESEARCH.md', ROOT)

describe('attack research document', () => {
  it('is up to date with the vectors, scenes, incidents and threat matrix', () => {
    const doc = buildResearch(ROOT)
    if (process.env.WRITE_DOCS) writeFileSync(FILE, doc)
    expect(readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n')).toBe(doc)
  })

  it('covers every vector with a diagram and a cited case', () => {
    const doc = buildResearch(ROOT)
    expect(doc.match(/^### [A-G]\d+[a-z]? /gm)!.length).toBe(51)
    expect(doc.match(/```mermaid/g)!.length).toBe(51)
    expect(doc.match(/\*\*Real-world case\.\*\*/g)!.length).toBe(51)
  })
})
