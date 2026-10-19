// The extension zip must use forward-slash paths, or Chrome/Brave cannot find icons/icon-16.png.
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { zipDir } from '../scripts/zip'

describe('zipDir', () => {
  it('stores nested files with forward slashes and a valid end record', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ftp-zip-'))
    mkdirSync(join(dir, 'icons'))
    writeFileSync(join(dir, 'manifest.json'), '{"a":1}')
    writeFileSync(join(dir, 'icons', 'icon-16.png'), Buffer.from([1, 2, 3]))
    const out = join(dir, '..', `ftp-${Date.now()}.zip`)
    const names = zipDir(dir, out)
    expect(names).toEqual(['manifest.json', 'icons/', 'icons/icon-16.png'])
    const buf = readFileSync(out)
    expect(buf.includes(Buffer.from('icons/icon-16.png'))).toBe(true)
    expect(buf.includes(Buffer.from('icons\icon-16.png'))).toBe(false)
    expect(buf.readUInt32LE(buf.length - 22)).toBe(0x06054b50)
  })
})
