/**
 * Pure helpers for PDF import (no browser APIs, unit-tested): turning page text
 * into fields and found QR codes into a table the Data panel already understands.
 */
import type { SheetData, Cell } from '../excel/read'
import { parseKhqr, type Khqr } from '../qr/khqr'

export interface PdfQr { name: string; payload: string }
export interface PdfPageResult { page: number; lines: string[]; qrs: PdfQr[] }

/** MID and the line above it (taken as the merchant name) from a page's text lines. */
export function fieldsFromText(lines: string[]): { mid?: string; name?: string } {
  const clean = lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const re = /\b(?:MID|Merchant\s*ID)\b\s*[:#.-]?\s*([0-9][0-9 ]{5,24}[0-9])/i
  for (let i = 0; i < clean.length; i++) {
    const m = re.exec(clean[i])
    if (!m) continue
    const mid = m[1].replace(/\s+/g, '')
    // The name is usually the line above the MID (or the text before it on the same line).
    const before = clean[i].slice(0, m.index).trim()
    const name = before || clean[i - 1]
    return { mid, name: name && !re.test(name) ? name : undefined }
  }
  return {}
}

export const PDF_HEADERS = ['Page', 'QR File', 'Merchant Name', 'Merchant Name (local language)', 'MID', 'Name (PDF text)', 'MID (PDF text)', 'QR check'] as const
export const PDF_COLS = { qr: 1, name: 2, nameAlt: 3, mid: 4, textName: 5, textMid: 6 }

const cell = (text: string | undefined): Cell => ({ text: text ?? '', imprecise: false })

/**
 * One row per QR code (a page with several codes gives several rows; a page with
 * none gives one row without a QR file, so it shows up as "No QR").
 * Name and MID come from the QR payload; page text is the fallback.
 */
export function pdfToSheet(fileName: string, pages: PdfPageResult[]): SheetData {
  const rows: Cell[][] = []
  const rowNumbers: number[] = []
  for (const p of pages) {
    const text = fieldsFromText(p.lines)
    const one = p.qrs.length === 1
    if (!p.qrs.length) {
      rows.push([cell(String(p.page)), cell(''), cell(text.name), cell(''), cell(text.mid), cell(text.name), cell(text.mid), cell('No QR on this page')])
      rowNumbers.push(p.page)
      continue
    }
    for (const q of p.qrs) {
      const k: Khqr | null = parseKhqr(q.payload)
      const check = !k ? 'Not a KHQR code' : k.crcOk ? 'KHQR OK' : 'KHQR checksum mismatch'
      rows.push([
        cell(String(p.page)),
        cell(q.name),
        cell(k?.merchantName ?? (one ? text.name : '')),
        cell(k?.merchantNameAlt),
        cell(k?.merchantId ?? (one ? text.mid : '')),
        cell(one ? text.name : ''),
        cell(one ? text.mid : ''),
        cell(check),
      ])
      rowNumbers.push(p.page)
    }
  }
  return { name: fileName, headers: [...PDF_HEADERS], rows, rowNumbers }
}
