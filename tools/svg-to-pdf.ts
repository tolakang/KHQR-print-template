/** Spike/QA: convert an SVG to a 1-page PDF at its viewBox size (1 unit = 1 pt). */
import { readFileSync, writeFileSync } from 'node:fs'
import { parseSvg, svgToScene } from '../src/core/svg/toScene'
import { writePdf } from '../src/core/pdf/writer'
import { loadBundle, bundleOutliner } from '../src/core/text/fonts'

const [, , input, output] = process.argv
const fonts = loadBundle({
  extraBold: readFileSync('public/fonts/NunitoSans-ExtraBold.ttf'),
  regular: readFileSync('public/fonts/NunitoSans-Regular.ttf'),
  khmer: readFileSync('public/fonts/Nokora-SemiBold.ttf'),
})
const t0 = performance.now()
const doc = parseSvg(readFileSync(input, 'utf8'))
const { scene, warnings } = svgToScene(doc, { outlineText: bundleOutliner(fonts) })
const pdf = await writePdf([{ width: scene.width, height: scene.height, items: scene.items }])
writeFileSync(output, pdf)
console.log(JSON.stringify({ items: scene.items.length, size: [scene.width, scene.height], bytes: pdf.length, ms: Math.round(performance.now() - t0), warnings }))
