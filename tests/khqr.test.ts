import { describe, it, expect } from 'vitest'
import { parseKhqr, parseTlv, crc16, buildKhqr } from '../src/core/qr/khqr'

describe('KHQR payload', () => {
  it('CRC-16/CCITT-FALSE of "123456789" is 29B1', () => {
    expect(crc16('123456789')).toBe('29B1')
  })
  it('reads name, merchant ID, account and city', () => {
    const p = buildKhqr({ name: 'The Pizza Company Sihanou', mid: '124092620291906', account: 'abaakhppxxx@abaa' })
    expect(parseKhqr(p)).toMatchObject({ merchantName: 'The Pizza Company Sihanou', merchantId: '124092620291906', accountId: 'abaakhppxxx@abaa', city: 'Phnom Penh', crcOk: true })
  })
  it('reads the alternate-language (Khmer) name from tag 64', () => {
    const p = buildKhqr({ name: 'Anita Mobkhmer', altName: 'អានីតា មួបខ្មែរ', mid: '125090512311628' })
    expect(parseKhqr(p)?.merchantNameAlt).toBe('អានីតា មួបខ្មែរ')
  })
  it('flags a wrong CRC and rejects non-EMV text', () => {
    const p = buildKhqr({ name: 'X', mid: '1' })
    expect(parseKhqr(p.slice(0, -4) + '0000')?.crcOk).toBe(false)
    expect(parseKhqr('https://example.com')).toBeNull()
    expect(parseTlv('0105AB')).toBeNull() // length runs past the end
  })
})
