import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import QRCode from 'qrcode'
import { Engine } from '../src/engine/engine'
import { defaultSettings } from '../src/store/settings'
import type { RowInput } from '../src/engine/types'

describe('showing and hiding assets', () => {
  let e: Engine
  const row: RowInput = { index: 0, excelRow: 2, name: 'The Pizza Company Sihanou', mid: '124092620291906', midImprecise: false, qrFile: 'qr.svg' }
  beforeAll(async () => {
    e = new Engine(
      {
        extraBold: readFileSync('public/fonts/NunitoSans-ExtraBold.ttf'),
        regular: readFileSync('public/fonts/NunitoSans-Regular.ttf'),
        khmer: readFileSync('public/fonts/Nokora-SemiBold.ttf'),
      },
      async () => { throw new Error('no raster') },
    )
    for (const [k, f] of [['background', 'a5'], ['logo', 'bkb'], ['corner', 'corner']] as const) e.setAsset(k, readFileSync(`public/assets/${f}.svg`, 'utf8'))
    await e.addQrFile('qr.svg', new TextEncoder().encode(await QRCode.toString('KHQR TEST', { type: 'svg', margin: 4 })), 'image/svg+xml', true)
  })

  it('is on by default', () => {
    expect(defaultSettings().background).toBe(true)
  })
  it('leaves out the background artwork and edge fill, keeps the sticker', async () => {
    const s = { ...defaultSettings(), pageSize: 'A6' as const, bleed: true }
    const withBg = e.preview(row, s)
    const noBg = e.preview(row, { ...s, background: false })
    expect(noBg.svg.length).toBeLessThan(withBg.svg.length / 2)
    expect(noBg.nameLines).toEqual(withBg.nameLines)
    expect(noBg.width).toBe(withBg.width)
    // The background's red header is gone; the black QR and text remain.
    const red = /fill="(#[cd][0-9a-f][0-3][0-9a-f][0-3][0-9a-f]|rgb\(2[0-9]{2},\s*[0-5]?[0-9],)/i
    expect(red.test(withBg.svg)).toBe(true)
    expect(red.test(noBg.svg)).toBe(false)
  })
  it('hides the logo and the corner frame on request', () => {
    const s = defaultSettings()
    const all = e.preview(row, s).svg.length
    expect(e.preview(row, { ...s, showLogo: false }).svg.length).toBeLessThan(all)
    expect(e.preview(row, { ...s, showCorner: false }).svg.length).toBeLessThan(all)
    expect(defaultSettings()).toMatchObject({ showLogo: true, showCorner: true })
  })
  it('draws the blank logo all white over the QR centre', () => {
    const black = e.preview(row, defaultSettings()).svg
    e.setAsset('logo', readFileSync('public/assets/bkw.svg', 'utf8'))
    expect(e.assetWarnings('logo')).toEqual([])
    const blank = e.preview(row, defaultSettings()).svg
    const none = e.preview(row, { ...defaultSettings(), showLogo: false }).svg
    e.setAsset('logo', readFileSync('public/assets/bkb.svg', 'utf8'))
    expect(black).toContain('fill="#231f20"')
    expect(blank).not.toContain('fill="#231f20"')
    expect(blank).not.toBe(none)
  })
  it('names the file and still exports every page', async () => {
    const s = { ...defaultSettings(), background: false }
    const r = await e.export([row], s, () => {}, () => false)
    expect(r.pages).toBe(1)
    expect(r.files[0].name).toMatch(/_no-bg_1p\.pdf$/)
  })
})
