// Generates the extension icons (a green shield with a check) as PNGs, no dependencies.
//   node scripts/make-icons.ts

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'

const OUT = join(import.meta.dirname, '..', 'extension', 'icons')

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([len, body, crc])
}

/** Is (x, y) in 0..1 inside the shield outline? */
function inShield(x: number, y: number): boolean {
  if (y < 0.08 || y > 0.95) return false
  // Top edge flat, sides straight, bottom narrowing to a point.
  const half = y < 0.5 ? 0.38 : 0.38 * (1 - (y - 0.5) / 0.45) ** 0.8
  return Math.abs(x - 0.5) <= half
}

function inCheck(x: number, y: number): boolean {
  const seg = (ax: number, ay: number, bx: number, by: number, w: number) => {
    const dx = bx - ax
    const dy = by - ay
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    return Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= w
  }
  return seg(0.33, 0.5, 0.45, 0.63, 0.04) || seg(0.45, 0.63, 0.68, 0.36, 0.04)
}

function png(size: number): Buffer {
  const rows: Buffer[] = []
  const S = 4 // supersampling
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4)
    for (let px = 0; px < size; px++) {
      let shield = 0
      let check = 0
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = (px + (sx + 0.5) / S) / size
          const y = (py + (sy + 0.5) / S) / size
          if (inShield(x, y)) shield++
          if (inCheck(x, y)) check++
        }
      }
      const n = S * S
      const a = shield / n
      const c = check / n
      // green shield (#26a17b), white check
      const r = Math.round(0x26 * (1 - c) + 255 * c)
      const g = Math.round(0xa1 * (1 - c) + 255 * c)
      const b = Math.round(0x7b * (1 - c) + 255 * c)
      row.set([r, g, b, Math.round(255 * a)], 1 + px * 4)
    }
    rows.push(row)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr.set([8, 6, 0, 0, 0], 8) // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(OUT, { recursive: true })
for (const s of [16, 32, 48, 128]) writeFileSync(join(OUT, `icon-${s}.png`), png(s))
console.log('icons written to extension/icons')
