import { describe, it, expect } from 'vitest'
import { fieldsFromText, pdfToSheet, PDF_COLS } from '../src/core/import/pdfText'
import { buildKhqr } from '../src/core/qr/khqr'

describe('PDF import helpers', () => {
  it('finds the MID and the name above it', () => {
    expect(fieldsFromText(['KHQR', 'The Pizza Company Sihanou', 'MID: 124092620291906'])).toEqual({ mid: '124092620291906', name: 'The Pizza Company Sihanou' })
    expect(fieldsFromText(['ABC Mart  Merchant ID 1240 9262 0291 908'])).toEqual({ mid: '124092620291908', name: 'ABC Mart' })
    expect(fieldsFromText(['no id here'])).toEqual({})
  })
  it('makes one row per QR, names and MIDs from the payload', () => {
    const a = buildKhqr({ name: 'Lucky', mid: '124092620291910', altName: 'សំណាង' })
    const b = buildKhqr({ name: 'ABC Mart', mid: '124092620291908' })
    const sheet = pdfToSheet('stickers.pdf', [
      { page: 1, lines: ['Lucky', 'MID: 124092620291910'], qrs: [{ name: 'pdf-p001-1.png', payload: a }] },
      { page: 2, lines: [], qrs: [{ name: 'pdf-p002-1.png', payload: a }, { name: 'pdf-p002-2.png', payload: b }] },
      { page: 3, lines: ['Blank page'], qrs: [] },
    ])
    expect(sheet.rows).toHaveLength(4)
    expect(sheet.rowNumbers).toEqual([1, 2, 2, 3])
    const r0 = sheet.rows[0].map((c) => c.text)
    expect([r0[PDF_COLS.qr], r0[PDF_COLS.name], r0[PDF_COLS.nameAlt], r0[PDF_COLS.mid], r0[PDF_COLS.textName]]).toEqual(['pdf-p001-1.png', 'Lucky', 'សំណាង', '124092620291910', 'Lucky'])
    expect(sheet.rows[2][PDF_COLS.name].text).toBe('ABC Mart')
    expect(sheet.rows[3][PDF_COLS.qr].text).toBe('')
    expect(sheet.rows[3].at(-1)!.text).toBe('No QR on this page')
  })
  it('falls back to page text when the QR is not KHQR', () => {
    const sheet = pdfToSheet('x.pdf', [{ page: 1, lines: ['Shop A', 'MID: 123456789'], qrs: [{ name: 'q.png', payload: 'https://example.com' }] }])
    const r = sheet.rows[0].map((c) => c.text)
    expect([r[PDF_COLS.name], r[PDF_COLS.mid], r.at(-1)]).toEqual(['Shop A', '123456789', 'Not a KHQR code'])
  })
})
