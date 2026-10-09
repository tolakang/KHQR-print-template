/**
 * Reads a generated KHQR PDF in the browser: renders each page (pdf.js), finds
 * every QR code on it (jsQR, repeating after blanking each code found), crops
 * each code to a PNG for the raster-redraw pipeline, and collects the page text.
 * pdf.js is loaded only when a PDF is opened.
 */
import jsQR from 'jsqr'
import type { PdfPageResult } from './pdfText'

export interface PdfQrImage { name: string; payload: string; png: Uint8Array }
export interface PdfReadResult { pages: PdfPageResult[]; images: PdfQrImage[] }

const MAX_SIDE = 2400 // px for the longest page side
const MAX_QRS_PER_PAGE = 60

// The legacy build polyfills newer built-ins (e.g. Map#getOrInsertComputed) that the
// modern build needs and current Chrome / Safari / Firefox do not all have yet.
async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

/** Text lines (top to bottom) from pdf.js text items. */
function toLines(items: { str: string; transform: number[] }[]): string[] {
  const rows = new Map<number, { x: number; s: string }[]>()
  for (const it of items) {
    if (!it.str.trim()) continue
    const y = Math.round(it.transform[5] / 2) * 2
    const row = rows.get(y) ?? []
    row.push({ x: it.transform[4], s: it.str })
    rows.set(y, row)
  }
  return [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, r]) => r.sort((a, b) => a.x - b.x).map((p) => p.s).join(' '))
}

async function toPng(canvas: HTMLCanvasElement, x: number, y: number, w: number, h: number): Promise<Uint8Array> {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(canvas, x, y, w, h, 0, 0, w, h)
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png'))
  return new Uint8Array(await blob.arrayBuffer())
}

type Code = NonNullable<ReturnType<typeof jsQR>>
type Loc = Code['location']

function shift(l: Loc, dx: number, dy: number): Loc {
  const m = (p: { x: number; y: number }) => ({ x: p.x + dx, y: p.y + dy })
  return { ...l, topLeftCorner: m(l.topLeftCorner), topRightCorner: m(l.topRightCorner), bottomLeftCorner: m(l.bottomLeftCorner), bottomRightCorner: m(l.bottomRightCorner) }
}

/**
 * One code anywhere in the image. jsQR looks for a single code, and several codes
 * side by side can confuse its finder-pattern search, so when the whole image gives
 * nothing, overlapping windows (halves, then thirds, then quarters) are tried.
 */
function findCode(ctx: CanvasRenderingContext2D, w: number, h: number): { code: Code; ox: number; oy: number } | null {
  const scan = (x: number, y: number, cw: number, ch: number) => {
    const img = ctx.getImageData(x, y, cw, ch)
    const code = jsQR(img.data, cw, ch, { inversionAttempts: 'dontInvert' })
    return code ? { code, ox: x, oy: y } : null
  }
  const whole = scan(0, 0, w, h)
  if (whole) return whole
  for (const parts of [2, 3, 4]) {
    const cw = Math.ceil((w / parts) * 1.5)
    const ch = Math.ceil((h / parts) * 1.5)
    const stepX = (w - cw) / Math.max(1, parts * 2 - 2)
    const stepY = (h - ch) / Math.max(1, parts * 2 - 2)
    for (let iy = 0; iy <= parts * 2 - 2; iy++) {
      for (let ix = 0; ix <= parts * 2 - 2; ix++) {
        const x = Math.max(0, Math.round(ix * stepX))
        const y = Math.max(0, Math.round(iy * stepY))
        const r = scan(x, y, Math.min(cw, w - x), Math.min(ch, h - y))
        if (r) return r
      }
    }
  }
  return null
}

export async function readKhqrPdf(bytes: Uint8Array, onProgress?: (page: number, total: number) => void): Promise<PdfReadResult> {
  const pdfjs = await loadPdfJs()
  // No font faces (text is drawn as paths) and no WebAssembly image decoders: keeps it inside the CSP.
  const task = pdfjs.getDocument({ data: bytes, disableFontFace: true, useWasm: false, standardFontDataUrl: new URL('/pdfjs/standard_fonts/', location.href).href })
  const doc = await task.promise
  const pages: PdfPageResult[] = []
  const images: PdfQrImage[] = []
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      onProgress?.(n, doc.numPages)
      const page = await doc.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(8, MAX_SIDE / Math.max(base.width, base.height))
      const vp = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(vp.width)
      canvas.height = Math.ceil(vp.height)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise
      const text = await page.getTextContent()
      const lines = toLines(text.items.filter((i): i is typeof i & { str: string; transform: number[] } => 'str' in i))

      // Find every code: decode, crop with a 4-module quiet zone, blank it, repeat.
      const work = document.createElement('canvas')
      work.width = canvas.width
      work.height = canvas.height
      const wctx = work.getContext('2d', { willReadFrequently: true })!
      wctx.drawImage(canvas, 0, 0)
      const qrs: { name: string; payload: string }[] = []
      for (let k = 0; k < MAX_QRS_PER_PAGE; k++) {
        const found = findCode(wctx, work.width, work.height)
        if (!found) break
        const { code, ox, oy } = found
        const L = shift(code.location, ox, oy)
        const xs = [L.topLeftCorner.x, L.topRightCorner.x, L.bottomLeftCorner.x, L.bottomRightCorner.x]
        const ys = [L.topLeftCorner.y, L.topRightCorner.y, L.bottomLeftCorner.y, L.bottomRightCorner.y]
        const side = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
        const pad = Math.ceil((side / (17 + 4 * code.version)) * 4)
        const x = Math.max(0, Math.floor(Math.min(...xs)) - pad)
        const y = Math.max(0, Math.floor(Math.min(...ys)) - pad)
        const w = Math.min(canvas.width - x, Math.ceil(side) + 2 * pad)
        const h = Math.min(canvas.height - y, Math.ceil(side) + 2 * pad)
        const name = `pdf-p${String(n).padStart(3, '0')}-${k + 1}.png`
        images.push({ name, payload: code.data, png: await toPng(canvas, x, y, w, h) })
        qrs.push({ name, payload: code.data })
        wctx.fillStyle = '#fff'
        wctx.fillRect(x, y, w, h)
      }
      pages.push({ page: n, lines, qrs })
      page.cleanup()
    }
  } finally {
    await task.destroy()
  }
  return { pages, images }
}
