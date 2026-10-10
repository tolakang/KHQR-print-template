/**
 * Printed QR size check: warns when the code gets too small to scan reliably
 * (small pages such as A7 or custom sizes). The module size is only known for
 * redrawn raster QRs, where the version was decoded.
 */
import { layout as defaultLayout, type Layout } from '../../config'

export interface QrPrintSize {
  qrMm: number
  /** Module size, when the module count is known. */
  moduleMm?: number
  tooSmall: boolean
  message?: string
}

const PT_TO_MM = 25.4 / 72

export function qrPrintSize(stickerScale: number, modules?: number, L: Layout = defaultLayout): QrPrintSize {
  const qrMm = L.qr.size * stickerScale * PT_TO_MM
  const moduleMm = modules ? qrMm / modules : undefined
  // Exact (15 significant digits: drops floating-point noise only).
  const fmt = (v: number) => Number(v.toPrecision(15))
  if (qrMm < L.scan.minQrMm) {
    return { qrMm, moduleMm, tooSmall: true, message: `QR prints at ${fmt(qrMm)} mm, under ${L.scan.minQrMm} mm: it may not scan. Use a larger page size and test-scan a print.` }
  }
  if (moduleMm !== undefined && moduleMm < L.scan.minModuleMm) {
    return { qrMm, moduleMm, tooSmall: true, message: `QR modules print at ${fmt(moduleMm)} mm (${modules} × ${modules}), under ${L.scan.minModuleMm} mm: it may not scan. Use a larger page size and test-scan a print.` }
  }
  return { qrMm, moduleMm, tooSmall: false }
}
