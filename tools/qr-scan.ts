/** QA: decode every QR in a rendered page PNG (pdftoppm output). Usage: qr-scan.ts page.png... */
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import jsQR from 'jsqr'
let fail = 0
for (const f of process.argv.slice(2)) {
  const p = PNG.sync.read(readFileSync(f))
  const r = jsQR(new Uint8ClampedArray(p.data), p.width, p.height)
  console.log(JSON.stringify({ file: f, ok: !!r, data: r?.data }))
  if (!r) fail++
}
process.exit(fail ? 1 : 0)
