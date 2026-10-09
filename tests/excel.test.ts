import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { readWorkbook, guessColumns, matchQrFiles, matchKey } from '../src/core/excel/read'

function book(rows: unknown[][]): Uint8Array {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
}

describe('readWorkbook', () => {
  it('reads headers, keeps MIDs as text, skips blank rows', () => {
    const data = book([
      [],
      ['No', 'QR File', 'Merchant Name', 'MID'],
      [1, 'qr_001.svg', 'The Pizza Company Sihanou', 124092620291906],
      [],
      [2, 'qr_002', 'ហាងកាហ្វេ សុខសាន្ត', '000124092620291'],
    ])
    const [s] = readWorkbook(data)
    expect(s.headers).toEqual(['No', 'QR File', 'Merchant Name', 'MID'])
    expect(s.rows.length).toBe(2)
    expect(s.rows[0][3].text).toBe('124092620291906')
    expect(s.rows[1][3].text).toBe('000124092620291') // leading zeros kept when stored as text
    expect(s.rows[1][2].text).toBe('ហាងកាហ្វេ សុខសាន្ត')
    expect(s.rowNumbers).toEqual([3, 5])
  })
  it('flags numbers too large to be exact', () => {
    const [s] = readWorkbook(book([['MID'], [12345678901234567890]]))
    expect(s.rows[0][0].imprecise).toBe(true)
  })
  it('reads CSV with UTF-8 Khmer', () => {
    const csv = new TextEncoder().encode('Name,MID\nហាង ABC,123\n')
    const [s] = readWorkbook(csv)
    expect(s.rows[0][0].text).toBe('ហាង ABC')
  })
})

describe('guessColumns', () => {
  it('finds common header names', () => {
    expect(guessColumns(['No', 'QR File', 'Merchant Name', 'MID'])).toEqual({ name: 2, mid: 3, qr: 1 })
    expect(guessColumns(['Name', 'Merchant ID'])).toEqual({ name: 0, mid: 1, qr: -1 })
    expect(guessColumns(['QR code name', 'merchant name', 'mid'])).toEqual({ name: 1, mid: 2, qr: 0 })
  })
})

describe('matchQrFiles', () => {
  const sheet = readWorkbook(book([
    ['QR', 'Name', 'MID'],
    ['qr_001', 'A', '111'],
    ['QR 002.svg', 'B', '222'],
    ['missing', 'C', '333'],
  ]))[0]
  it('matches by QR column ignoring extension, case and separators', () => {
    const r = matchQrFiles(sheet, { qr: 0, name: 1, mid: 2 }, ['QR_001.png', 'qr-002.svg', 'extra.svg'])
    expect(r.byRow).toEqual(['QR_001.png', 'qr-002.svg', undefined])
    expect(r.unmatchedFiles).toEqual(['extra.svg'])
  })
  it('matches by MID when there is no QR column', () => {
    const r = matchQrFiles(sheet, { qr: -1, name: 1, mid: 2 }, ['KHQR_111.svg', '222.png', '3333.svg'])
    expect(r.byRow).toEqual(['KHQR_111.svg', '222.png', undefined])
  })
  it('prefers SVG when both formats exist', () => {
    const r = matchQrFiles(sheet, { qr: 0, name: 1, mid: 2 }, ['qr_001.png', 'qr_001.svg'])
    expect(r.byRow[0]).toBe('qr_001.svg')
    expect(r.ambiguousRows).toEqual([])
  })
  it('matchKey normalizes', () => {
    expect(matchKey('folder/QR_001 .SVG')).toBe('qr 001')
  })
})
