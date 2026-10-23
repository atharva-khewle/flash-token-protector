// Every attack vector in the UI has a drawn scene and a real-world case with an https link.

import { describe, expect, it } from 'vitest'
import { INCIDENTS } from '../src/ui/incidents'
import { SCENES } from '../src/ui/vectorsTab'
import { VECTORS } from '../src/ui/vectors'

describe('attack vector scenes', () => {
  it('lists 51 vectors', () => {
    expect(VECTORS.length).toBe(51)
  })

  it('has a scene and an incident for every vector', () => {
    for (const v of VECTORS) {
      expect(SCENES[v.id], `scene ${v.id}`).toBeDefined()
      expect(INCIDENTS[v.id], `incident ${v.id}`).toBeDefined()
    }
  })

  it('scene edges only connect boxes that exist, and each scene tells a story', () => {
    for (const [id, s] of Object.entries(SCENES)) {
      const ids = new Set(s.nodes.map((n) => n.id))
      expect(ids.size, `${id} has unique node ids`).toBe(s.nodes.length)
      for (const e of s.edges) {
        expect(ids.has(e.from), `${id} edge from ${e.from}`).toBe(true)
        expect(ids.has(e.to), `${id} edge to ${e.to}`).toBe(true)
      }
      expect(s.steps.length, `${id} steps`).toBeGreaterThanOrEqual(3)
    }
  })

  it('every incident links to an https page and the links are unique', () => {
    const urls = Object.values(INCIDENTS).map((i) => i.url)
    for (const u of urls) expect(new URL(u).protocol).toBe('https:')
    expect(new Set(urls).size).toBe(urls.length)
  })
})
