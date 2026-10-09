/** QA: render an SVG to PNG in Chromium at viewBox size × scale. */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
const [, , input, output, scaleArg] = process.argv
const svg = readFileSync(input, 'utf8')
const vb = /viewBox="([^"]+)"/.exec(svg)![1].split(/[\s,]+/).map(Number)
const s = Number(scaleArg ?? 1)
const w = Math.round(vb[2] * s), h = Math.round(vb[3] * s)
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const page = await browser.newPage({ viewport: { width: w, height: h } })
const src = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
await page.setContent(`<html><body style="margin:0;background:#fff"><img src="${src}" style="display:block;width:${w}px;height:${h}px"></body></html>`)
await page.waitForLoadState('networkidle')
await page.screenshot({ path: output, clip: { x: 0, y: 0, width: w, height: h } })
await browser.close()
console.log(JSON.stringify({ w, h }))
