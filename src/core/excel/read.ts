/**
 * Excel/CSV reading and QR-file matching.
 * Values are returned as text: long numeric MIDs never go through
 * scientific notation, and precision loss is flagged.
 */
import * as XLSX from 'xlsx'

export interface Cell {
  text: string
  /** True if Excel stored this as a number too large to be exact. */
  imprecise: boolean
}

export interface SheetData {
  name: string
  headers: string[]
  rows: Cell[][]
  /** 1-based Excel row number of each data row (for messages). */
  rowNumbers: number[]
}

function cellText(v: unknown): Cell {
  if (v === null || v === undefined) return { text: '', imprecise: false }
  if (typeof v === 'number') {
    if (Number.isInteger(v) && Math.abs(v) < 1e21) {
      return { text: BigInt(v).toString(), imprecise: Math.abs(v) > Number.MAX_SAFE_INTEGER }
    }
    return { text: String(v), imprecise: false }
  }
  if (v instanceof Date) return { text: v.toISOString().slice(0, 10), imprecise: false }
  return { text: String(v).trim(), imprecise: false }
}

export function readWorkbook(data: ArrayBuffer | Uint8Array): SheetData[] {
  const wb = XLSX.read(data, { type: 'array', cellDates: true, codepage: 65001 })
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true })
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
    // Header row = first row with at least one non-empty cell.
    let h = 0
    while (h < grid.length && !(grid[h] ?? []).some((c) => cellText(c).text)) h++
    const headerRow = (grid[h] ?? []).map((c) => cellText(c).text)
    const width = Math.max(headerRow.length, ...grid.slice(h + 1).map((r) => r.length))
    const headers = Array.from({ length: width }, (_, i) => headerRow[i] || `Column ${XLSX.utils.encode_col(i)}`)
    const rows: Cell[][] = []
    const rowNumbers: number[] = []
    for (let r = h + 1; r < grid.length; r++) {
      const row = grid[r] ?? []
      const cells = headers.map((_, i) => cellText(row[i]))
      if (cells.every((c) => !c.text)) continue
      rows.push(cells)
      rowNumbers.push(range.s.r + r + 1)
    }
    return { name, headers, rows, rowNumbers }
  })
}

export interface ColumnMap {
  name: number
  mid: number
  /** Column holding the QR file name; -1 = match QR files by MID. */
  qr: number
}

/** Guess which columns hold the merchant name, MID and QR file name. */
export function guessColumns(headers: string[]): ColumnMap {
  const find = (...res: RegExp[]) => {
    for (const re of res) {
      const i = headers.findIndex((h) => re.test(h))
      if (i >= 0) return i
    }
    return -1
  }
  const qr = find(/qr.*(file|name|code|image)/i, /^qr$/i, /\bqr\b/i)
  const mid = find(/^\s*mid\s*$/i, /\bmid\b/i, /merchant\s*id/i, /terminal\s*id/i)
  const name = find(/merchant\s*name/i, /^\s*name\s*$/i, /ឈ្មោះ/, /name/i, /shop|store|business/i)
  return { name: name === qr ? -1 : name, mid, qr }
}

/** Normalize a file name or cell value for matching. */
export function matchKey(s: string): string {
  return s
    .normalize('NFC')
    .replace(/^.*[\\/]/, '')
    .replace(/\.(svg|png|jpe?g|webp)$/i, '')
    .toLowerCase()
    .replace(/[\s_\-.]+/g, ' ')
    .trim()
}

export interface MatchResult {
  /** File name for each row (undefined = no QR found). */
  byRow: (string | undefined)[]
  unmatchedFiles: string[]
  /** Rows whose key matches more than one file. */
  ambiguousRows: number[]
}

/**
 * Match uploaded QR files to rows. With a QR column, the cell must equal the
 * file name (extension optional). Without one, a file matches when its name
 * equals the MID or contains it as a separate token.
 */
export function matchQrFiles(sheet: SheetData, cols: ColumnMap, files: string[]): MatchResult {
  const byKey = new Map<string, string[]>()
  for (const f of files) {
    const k = matchKey(f)
    byKey.set(k, [...(byKey.get(k) ?? []), f])
  }
  const used = new Set<string>()
  const ambiguousRows: number[] = []
  const byRow = sheet.rows.map((cells, i) => {
    const keyCol = cols.qr >= 0 ? cols.qr : cols.mid
    if (keyCol < 0) return undefined
    const raw = cells[keyCol]?.text ?? ''
    if (!raw) return undefined
    const k = matchKey(raw)
    let hits = byKey.get(k) ?? []
    if (!hits.length && cols.qr < 0) {
      // MID as a token inside the file name, e.g. "KHQR_124092620291906.svg".
      const re = new RegExp(`(^|[^0-9a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^0-9a-z])`)
      hits = files.filter((f) => re.test(matchKey(f)))
    }
    if (hits.length > 1) {
      // Prefer SVG over raster when both exist for the same key.
      const svg = hits.filter((f) => /\.svg$/i.test(f))
      if (svg.length === 1) hits = svg
      else ambiguousRows.push(i)
    }
    const f = hits[0]
    if (f) used.add(f)
    return f
  })
  return { byRow, unmatchedFiles: files.filter((f) => !used.has(f)), ambiguousRows }
}

export interface RowRange { from: number | null; to: number | null }

/** Rows whose Excel row number lies in [from, to]; an empty bound means first / last. */
export function rowsInRange<T extends { excelRow: number }>(rows: T[], range: RowRange): T[] {
  const lo = range.from ?? -Infinity
  const hi = range.to ?? Infinity
  if (lo === -Infinity && hi === Infinity) return rows
  return rows.filter((r) => r.excelRow >= lo && r.excelRow <= hi)
}
