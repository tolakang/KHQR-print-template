import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import QRCode from 'qrcode'
import { Engine } from '../src/engine/engine'
import { defaultSettings } from '../src/store/settings'
import { NAME_FONTS, CUSTOM_FONT, DEFAULT_NAME_FONT } from '../src/config/fonts'
import type { RowInput } from '../src/engine/types'

const file = (p: string) => new Uint8Array(readFileSync(`public/${p}`))

describe('merchant-name fonts', () => {
  let e: Engine
  const row: RowInput = { index: 0, excelRow: 2, name: 'ABC Mart ផ្សារ', mid: '124092620291906', midImprecise: false, qrFile: 'qr.svg' }
  beforeAll(async () => {
    e = new Engine(
      { extraBold: file('fonts/NunitoSans-ExtraBold.ttf'), regular: file('fonts/NunitoSans-Regular.ttf'), khmer: file('fonts/Nokora-SemiBold.ttf') },
      async () => { throw new Error('no raster') },
      async (p) => file(p),
    )
    await e.addQrFile('qr.svg', new TextEncoder().encode(await QRCode.toString('KHQR TEST', { type: 'svg', margin: 4 })), 'image/svg+xml', true)
  })

  it('every bundled font exists, loads and has its script', () => {
    for (const script of ['latin', 'khmer'] as const) {
      expect(NAME_FONTS[script].map((f) => f.id)).toContain(DEFAULT_NAME_FONT[script])
      for (const f of NAME_FONTS[script]) {
        expect(existsSync(`public/${f.file}`), f.file).toBe(true)
        expect(e.registerFont(`test-${f.id}`, script, file(f.file)), f.label).toEqual({ ok: true })
      }
    }
  })
  it('changes the name outlines when another font is chosen', async () => {
    const base = defaultSettings()
    const guide = e.preview(row, base).svg
    for (const s of [{ ...base, nameFontLatin: 'inter-800' }, { ...base, nameFontKhmer: 'kantumruy-pro-700' }]) {
      await e.ensureFonts(s)
      const r = e.preview(row, s)
      expect(r.warnings.map((w) => w.code)).not.toContain('font-missing')
      expect(r.svg).not.toBe(guide)
    }
  })
  it('accepts an uploaded font only if it has the script', () => {
    expect(e.registerFont(CUSTOM_FONT.khmer, 'khmer', file('fonts/Inter_800ExtraBold.ttf'))).toMatchObject({ ok: false, error: /no Khmer/ })
    expect(e.registerFont(CUSTOM_FONT.latin, 'latin', new Uint8Array([1, 2, 3, 4]))).toMatchObject({ ok: false })
    expect(e.registerFont(CUSTOM_FONT.latin, 'latin', file('fonts/Poppins_700Bold.ttf'))).toEqual({ ok: true })
    const r = e.preview(row, { ...defaultSettings(), nameFontLatin: CUSTOM_FONT.latin })
    expect(r.warnings.map((w) => w.code)).not.toContain('font-missing')
  })
  it('falls back to the guide font, with a warning, when a font is not loaded', () => {
    const r = e.preview(row, { ...defaultSettings(), nameFontKhmer: CUSTOM_FONT.khmer })
    expect(r.warnings.map((w) => w.code)).toContain('font-missing')
    expect(r.nameLines.length).toBeGreaterThan(0)
  })
})
