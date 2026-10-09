import { describe, it, expect, beforeAll } from 'vitest'
import { layout } from '../src/config'
import { readFileSync } from 'node:fs'
import { wrapName, formatMid, charCount, toUnits } from '../src/core/text/wrap'
import { loadFont, outlineLine, splitRuns, type LoadedFont } from '../src/core/text/outline'

describe('wrapName', () => {
  it('keeps short names on one line', () => {
    expect(wrapName('ABC Coffee')).toMatchObject({ lines: ['ABC Coffee'], dropped: false })
  })
  it('limits the whole name to 25 chars by whole word', () => {
    const r = wrapName('Golden Dragon Restaurant and Karaoke Lounge')
    expect(r.lines).toEqual(['Golden Dragon Restaurant'])
    expect(r.dropped).toBe(true)
    expect(r.droppedText).toBe('and Karaoke Lounge')
  })
  it('counts all lines together against the limit', () => {
    const name = 'Sovannaphum Trading and Import Export Company Limited Phnom Penh'
    const r = wrapName(name, 25, 2, (l) => charCount(l) <= 12)
    expect(r.lines).toEqual(['Sovannaphum', 'Trading and'])
    expect(charCount(r.lines.join(' '))).toBeLessThanOrEqual(25)
    expect(r.droppedText).toBe('Import Export Company Limited Phnom Penh')
  })
  it('drops whole words past the line limit and reports them', () => {
    const r = wrapName('AAAA BBBB CCCC DDDD EEEE', 25, 2, (l) => charCount(l) <= 8)
    expect(r.lines).toEqual(['AAAA', 'BBBB'])
    expect(r.droppedText).toBe('CCCC DDDD EEEE')
  })
  it('cuts a single over-long word on grapheme boundary', () => {
    const r = wrapName('Supercalifragilisticexpialidocious Shop')
    expect(r.wordCut).toBe(true)
    expect(charCount(r.lines[0])).toBe(25)
  })
  it('exactly 25 chars fits', () => {
    const s = 'A'.repeat(12) + ' ' + 'B'.repeat(12)
    expect(wrapName(s).lines).toEqual([s])
  })
  it('collapses whitespace and line breaks', () => {
    expect(wrapName('  ABC \n  Mart  ').lines).toEqual(['ABC Mart'])
  })
  it('glues punctuation to the word before', () => {
    expect(toUnits('ABC Co., Ltd.').map((u) => u.text)).toEqual(['ABC', 'Co.,', 'Ltd.'])
  })
  it('counts a Khmer cluster as one character', () => {
    expect(charCount('ស្ត្រី')).toBeLessThan('ស្ត្រី'.length)
  })
  it('wraps Khmer written without spaces at word boundaries', () => {
    const name = 'ហាងលក់ទំនិញចម្រុះសុខសាន្តនិងកាហ្វេភ្នំពេញថ្មី'
    const r = wrapName(name, 25, 2, (l) => charCount(l) <= 8)
    expect(r.lines.length).toBe(2)
    expect(r.lines.join('') + r.droppedText).toBe(name)
    expect(charCount(r.lines.join(''))).toBeLessThanOrEqual(25)
    r.lines.forEach((l) => expect(charCount(l)).toBeLessThanOrEqual(8))
  })
  it('handles mixed English and Khmer', () => {
    const r = wrapName('ABC Mart ហាងលក់ទំនិញ Phnom Penh')
    expect(r.lines.join(' ')).toContain('ABC Mart')
    r.lines.forEach((l) => expect(charCount(l)).toBeLessThanOrEqual(25))
  })
  it('drops zero-width spaces', () => {
    expect(wrapName('ហាង​កាហ្វេ').lines).toEqual(['ហាងកាហ្វេ'])
  })
  it('empty name gives no lines', () => {
    expect(wrapName('').lines).toEqual([])
    expect(wrapName(undefined).lines).toEqual([])
  })
})

describe('formatMid', () => {
  it('keeps 15 chars', () => {
    expect(formatMid('123456789012345')).toEqual({ value: '123456789012345', trimmed: false })
  })
  it('trims and flags longer values', () => {
    expect(formatMid('1234567890123456789')).toEqual({ value: '123456789012345', trimmed: true })
  })
  it('respects a configurable limit', () => {
    expect(formatMid('1234567890123456789', 20).trimmed).toBe(false)
  })
  it('turns Excel numbers into plain digits', () => {
    expect(formatMid(123456789012345).value).toBe('123456789012345')
  })
})

describe('outline', () => {
  let latin: LoadedFont, khmer: LoadedFont, regular: LoadedFont
  beforeAll(() => {
    latin = loadFont(readFileSync('public/fonts/NunitoSans-ExtraBold.ttf'))
    regular = loadFont(readFileSync('public/fonts/NunitoSans-Regular.ttf'))
    khmer = loadFont(readFileSync('public/fonts/Nokora-SemiBold.ttf'))
  })
  it('splits script runs', () => {
    expect(splitRuns('ABC ហាង Mart').map((r) => r.script)).toEqual(['latin', 'khmer', 'latin'])
  })
  it('outlines Latin text to paths with sane width', () => {
    const o = outlineLine('ABC Coffee', { latin, khmer }, 23)
    expect(o.d).toMatch(/^M/)
    expect(o.missingGlyphs).toBe(false)
    expect(o.width).toBeGreaterThan(80)
    expect(o.width).toBeLessThan(160)
    expect(o.bbox.y1).toBeLessThan(-14) // cap height above baseline
  })
  it('outlines Khmer with shaping (no notdef, coeng forms below baseline)', () => {
    const o = outlineLine('ស្ត្រី ហាងកាហ្វេ', { latin, khmer }, 23)
    expect(o.missingGlyphs).toBe(false)
    expect(o.d.length).toBeGreaterThan(200)
    expect(o.bbox.y2).toBeGreaterThan(2) // subscript goes below baseline
  })
  it('MID in Nunito Regular', () => {
    const o = outlineLine('MID: 123456789012345', { latin: regular, khmer }, 10)
    expect(o.missingGlyphs).toBe(false)
    expect(o.width).toBeGreaterThan(80)
  })
  it('cap height is read from the font', () => {
    expect(latin.capHeight / latin.upem).toBeGreaterThan(0.6)
    expect(latin.capHeight / latin.upem).toBeLessThan(0.8)
  })
})

describe('width-aware wrapping (guide sample)', () => {
  // A6 design: name size and safe width are the guide values × 0.981351, so wrapping is unchanged.
  it('"The Pizza Company Sihanou" wraps to 2 lines at 23pt within the safe width', () => {
    const latin = loadFont(readFileSync('public/fonts/NunitoSans-ExtraBold.ttf'))
    const khmer = loadFont(readFileSync('public/fonts/Nokora-SemiBold.ttf'))
    const safe = layout.artboard.w - 2 * layout.safeMarginPt
    const r = wrapName('The Pizza Company Sihanou', 25, 2, (l) => outlineLine(l, { latin, khmer }, layout.name.sizePt).width <= safe)
    expect(r.lines).toEqual(['The Pizza Company', 'Sihanou'])
    expect(r.dropped).toBe(false)
  })
  it('flags a single word wider than the safe width', () => {
    const r = wrapName('WWWWWWWWWWWW', 25, 2, () => false)
    expect(r.tooWide).toBe(true)
    expect(r.lines).toEqual(['WWWWWWWWWWWW'])
  })
})
