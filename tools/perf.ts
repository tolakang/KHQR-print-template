/** Perf check: export N stickers (default 1000) through the Engine in Node. Usage: tsx tools/perf.ts [N] */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import QRCode from 'qrcode'
import { Engine } from '../src/engine/engine'
import { defaultSettings } from '../src/store/settings'
import type { RowInput } from '../src/engine/types'

const N = Number(process.argv[2] ?? 1000)
const e = new Engine(
  {
    extraBold: readFileSync('public/fonts/NunitoSans-ExtraBold.ttf'),
    regular: readFileSync('public/fonts/NunitoSans-Regular.ttf'),
    khmer: readFileSync('public/fonts/Nokora-SemiBold.ttf'),
  },
  async () => { throw new Error('no raster in perf test') },
)
for (const k of ['background', 'logo', 'corner'] as const) {
  e.setAsset(k, readFileSync(`public/artwork/${{ background: 'a5', logo: 'bkb', corner: 'corner' }[k]}.svg`, 'utf8'))
}
const names = ['The Pizza Company Sihanou', 'ហាងកាហ្វេ សុខសាន្ត', 'ABC Mart ផ្សារទំនើប Phnom Penh', 'Lucky', 'Sovannaphum Trading and Import Export Company Limited']
const rows: RowInput[] = []
const t0 = Date.now()
for (let i = 0; i < N; i++) {
  const mid = String(124092620000000 + i)
  const name = `qr_${i}.svg`
  const svg = await QRCode.toString(`00020101021230510016abaakhppxxx@abaa0115${mid}5925${names[i % 5].slice(0, 25)}6010Phnom Penh6304TEST`, { type: 'svg', margin: 4 })
  await e.addQrFile(name, new TextEncoder().encode(svg), 'image/svg+xml', true)
  rows.push({ index: i, excelRow: i + 2, name: names[i % 5], mid, midImprecise: false, qrFile: name })
}
const tLoad = Date.now() - t0
const s = { ...defaultSettings(), pageSize: 'A6' as const, bleed: true }
const mem0 = process.memoryUsage().rss
const r = await e.export(rows, s, () => {}, () => false)
mkdirSync('out', { recursive: true })
writeFileSync('out/perf.pdf', r.files[0].bytes)
console.log(JSON.stringify({ stickers: N, qrLoadMs: tLoad, exportMs: r.ms, pages: r.pages, pdfMB: +(r.files[0].bytes.length / 1e6).toFixed(1), rssMB: Math.round(process.memoryUsage().rss / 1e6), rssStartMB: Math.round(mem0 / 1e6) }))
