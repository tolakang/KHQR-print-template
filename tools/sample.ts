/** Generates sample PDFs from the bundled assets for visual QA. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import QRCode from 'qrcode'
import { parseSvg, svgToScene } from '../src/core/svg/toScene'
import { writePdf } from '../src/core/pdf/writer'
import { loadBundle, bundleOutliner } from '../src/core/text/fonts'
import { composeSticker, defaultStickerOptions } from '../src/core/layout/sticker'
import { buildPage, prepareBackground, defaultExportOptions, type ExportOptions } from '../src/core/layout/page'

const out = process.argv[2] ?? 'out'
mkdirSync(out, { recursive: true })
const fonts = loadBundle({
  extraBold: readFileSync('public/fonts/NunitoSans-ExtraBold.ttf'),
  regular: readFileSync('public/fonts/NunitoSans-Regular.ttf'),
  khmer: readFileSync('public/fonts/Nokora-SemiBold.ttf'),
})
const outliner = bundleOutliner(fonts)
const load = (p: string) => svgToScene(parseSvg(readFileSync(p, 'utf8')), { outlineText: outliner })
const bg = load('public/artwork/a5.svg')
const logo = load('public/artwork/bkb.svg')
const corner = load('public/artwork/corner.svg')
console.log('bg warnings', bg.warnings)

const rows = [
  { name: 'The Pizza Company Sihanou', mid: '124092620291906' },
  { name: 'ហាងកាហ្វេ សុខសាន្ត', mid: '124092620291907' },
  { name: 'ABC Mart ផ្សារទំនើប Phnom Penh', mid: '124092620291908' },
  { name: 'Sovannaphum Trading and Import Export Company Limited', mid: '1240926202919081234' },
  { name: 'Lucky', mid: '1' },
]
const stickerFonts = { nameLatin: fonts.extraBold, nameKhmer: fonts.khmer, midLatin: fonts.regular }
const prepared = prepareBackground(bg.scene)

async function make(file: string, o: ExportOptions) {
  const pages = []
  for (const r of rows) {
    const svg = await QRCode.toString('SAMPLE-KHQR|' + r.mid, { type: 'svg', errorCorrectionLevel: 'M', margin: 4 })
    const qr = svgToScene(parseSvg(svg)).scene
    const s = composeSticker({ name: r.name, mid: r.mid, qr, logo: logo.scene, corner: corner.scene }, stickerFonts, defaultStickerOptions())
    console.log(file, r.name, '→', JSON.stringify(s.nameLines), s.midText, s.warnings.map((w) => w.code).join(','))
    pages.push(buildPage(s.items, prepared, o))
  }
  const t0 = performance.now()
  const pdf = await writePdf(pages, { title: 'KHQR sample' })
  writeFileSync(`${out}/${file}`, pdf)
  console.log(file, pdf.length, 'bytes', Math.round(performance.now() - t0), 'ms')
}

await make('sample-original.pdf', defaultExportOptions())
await make('sample-a6-bleed-marks.pdf', { ...defaultExportOptions(), pageSize: 'A6', bleed: true, bleedMm: 3, cropMarks: true })
await make('sample-a6-bleed.pdf', { ...defaultExportOptions(), pageSize: 'A6', bleed: true, bleedMm: 3 })
