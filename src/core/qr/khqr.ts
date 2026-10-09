/**
 * KHQR (EMVCo merchant-presented QR) payload reader.
 * The payload is a list of TLV fields: 2-digit tag, 2-digit length, value.
 *   29 / 30  individual / merchant account: sub-tag 00 Bakong account ID,
 *            01 merchant ID (30) or account information (29), 02 acquiring bank
 *   59       merchant name (max 25)
 *   60       merchant city
 *   64       alternate language: 00 language, 01 merchant name, 02 city
 *   63       CRC-16/CCITT-FALSE over everything up to and including "6304"
 */

export interface Tlv { tag: string; value: string }

/** Split a TLV string; returns null when the lengths do not add up. */
export function parseTlv(s: string): Tlv[] | null {
  const out: Tlv[] = []
  let i = 0
  while (i < s.length) {
    if (i + 4 > s.length) return null
    const tag = s.slice(i, i + 2)
    const len = Number(s.slice(i + 2, i + 4))
    if (!/^\d\d$/.test(tag) || !Number.isInteger(len) || i + 4 + len > s.length) return null
    out.push({ tag, value: s.slice(i + 4, i + 4 + len) })
    i += 4 + len
  }
  return out
}

export function crc16(s: string): string {
  let crc = 0xffff
  for (const byte of new TextEncoder().encode(s)) {
    crc ^= byte << 8
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export interface Khqr {
  merchantName?: string
  /** Merchant name in the alternate language (tag 64-01), e.g. Khmer. */
  merchantNameAlt?: string
  /** Merchant ID (tag 30-01). */
  merchantId?: string
  /** Bakong account ID (tag 29/30-00). */
  accountId?: string
  city?: string
  /** True when the CRC in tag 63 matches. */
  crcOk: boolean
}

/** Read a KHQR payload; null if it is not EMV TLV at all. */
export function parseKhqr(payload: string): Khqr | null {
  const top = parseTlv(payload)
  if (!top || top[0]?.tag !== '00') return null
  const get = (t: string) => top.find((x) => x.tag === t)?.value
  const sub = (t: string) => (get(t) ? parseTlv(get(t)!) ?? [] : [])
  const subGet = (list: Tlv[], t: string) => list.find((x) => x.tag === t)?.value
  const merchant = sub('30')
  const individual = sub('29')
  const alt = sub('64')
  const crcAt = payload.lastIndexOf('6304')
  const crcOk = crcAt >= 0 && crcAt + 8 === payload.length && crc16(payload.slice(0, crcAt + 4)) === payload.slice(crcAt + 4).toUpperCase()
  return {
    merchantName: get('59')?.trim() || undefined,
    merchantNameAlt: subGet(alt, '01')?.trim() || undefined,
    merchantId: subGet(merchant, '01')?.trim() || undefined,
    accountId: (subGet(merchant, '00') ?? subGet(individual, '00'))?.trim() || undefined,
    city: get('60')?.trim() || undefined,
    crcOk,
  }
}

/** Build a KHQR-shaped payload (tests and samples). */
export function buildKhqr(f: { name: string; mid: string; account?: string; altName?: string; city?: string }): string {
  // Lengths count characters, as the reader slices characters.
  const tlv = (tag: string, v: string) => `${tag}${String(v.length).padStart(2, '0')}${v}`
  const acct = tlv('00', f.account ?? 'merchant@bank') + tlv('01', f.mid) + tlv('02', 'Bank')
  let s = tlv('00', '01') + tlv('01', '11') + tlv('30', acct) + tlv('52', '5999') + tlv('53', '116') + tlv('58', 'KH') + tlv('59', f.name) + tlv('60', f.city ?? 'Phnom Penh')
  if (f.altName) s += tlv('64', tlv('00', 'km') + tlv('01', f.altName))
  s += '6304'
  return s + crc16(s)
}
