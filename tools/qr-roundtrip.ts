/** QA: build A6 stickers with a KHQR-length payload at EC L/M/Q, for scanning after rendering. */
import { readFileSync, writeFileSync } from 'node:fs'
import QRCode from 'qrcode'
import { parseSvg, svgToScene } from '../src/core/svg/toScene'
import { loadBundle, bundleOutliner } from '../src/core/text/fonts'
import { composeSticker, defaultStickerOptions } from '../src/core/layout/sticker'
import { buildPage, prepareBackground, defaultExportOptions } from '../src/core/layout/page'
import { writePdf } from '../src/core/pdf/writer'
const fonts = loadBundle({ extraBold: readFileSync('public/fonts/NunitoSans-ExtraBold.ttf'), regular: readFileSync('public/fonts/NunitoSans-Regular.ttf'), khmer: readFileSync('public/fonts/Nokora-SemiBold.ttf') })
const load = (p: string) => svgToScene(parseSvg(readFileSync(p, 'utf8')), { outlineText: bundleOutliner(fonts) }).scene
// KHQR-length EMV-style test payload (not a real merchant).
const payload = '00020101021230510016abaakhppxxx@abaa01151240926202919060208ABA Bank5204599953031165802KH5925The Pizza Company Sihanou6010Phnom Penh99170013176000000000063041A2B'
const pages = []
for (const ec of ['L', 'M', 'Q'] as const) {
  const qr = svgToScene(parseSvg(await QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: ec, margin: 4 }))).scene
  const s = composeSticker({ name: 'The Pizza Company Sihanou', mid: '124092620291906', qr, logo: load('public/artwork/bkb.svg'), corner: load('public/artwork/corner.svg') }, { nameLatin: fonts.extraBold, nameKhmer: fonts.khmer, midLatin: fonts.regular }, defaultStickerOptions())
  pages.push(buildPage(s.items, prepareBackground(load('public/artwork/a5.svg')), { ...defaultExportOptions(), pageSize: 'A6' }))
}
writeFileSync(process.argv[2], await writePdf(pages))
console.log('payload', payload.length)
