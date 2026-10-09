/**
 * End-to-end check of the built app in Chromium (run `npm run build` first).
 * Serves dist/ with the production CSP, uploads fixtures, downloads the PDF.
 * Usage: tsx tools/e2e.ts <outDir>
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, extname } from 'node:path'
import { chromium } from 'playwright'
import * as XLSX from 'xlsx'
import QRCode from 'qrcode'

const out = process.argv[2] ?? 'out/e2e'
mkdirSync(out, { recursive: true })

// --- fixtures ---
const rows = [
  ['No', 'QR File', 'Merchant Name', 'MID'],
  [1, 'qr_001', 'The Pizza Company Sihanou', '124092620291906'],
  [2, 'qr_002', 'ហាងកាហ្វេ សុខសាន្ត', '124092620291907'],
  [3, 'qr_003', 'ABC Mart ផ្សារទំនើប Phnom Penh', '124092620291908'],
  [4, 'qr_004', 'Sovannaphum Trading and Import Export Company Limited', '1240926202919081234'],
  [5, 'qr_005', 'Lucky', '124092620291910'],
  [6, 'qr_missing', 'No QR Shop', '124092620291911'],
]
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Merchants')
const xlsxPath = join(out, 'merchants.xlsx')
writeFileSync(xlsxPath, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
const qrPaths: string[] = []
for (let i = 1; i <= 5; i++) {
  const payload = `00020101021230510016abaakhppxxx@abaa0115${rows[i][3]}5925${String(rows[i][2]).slice(0, 25)}6010Phnom Penh6304TEST`
  if (i === 3 || i === 5) {
    const p = join(out, `qr_00${i}.png`)
    writeFileSync(p, await QRCode.toBuffer(payload, { margin: 4, scale: i === 3 ? 7 : 4 }))
    qrPaths.push(p)
  } else {
    const p = join(out, `qr_00${i}.svg`)
    writeFileSync(p, await QRCode.toString(payload, { type: 'svg', margin: 4 }))
    qrPaths.push(p)
  }
}

// --- static server with production CSP (copied from nginx.conf) ---
const csp = /Content-Security-Policy "([^"]+)"/.exec(readFileSync('nginx.conf', 'utf8'))![1]
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.ttf': 'font/ttf' }
const server = createServer((req, res) => {
  let p = join('dist', decodeURIComponent((req.url ?? '/').split('?')[0]))
  if (!existsSync(p) || p.endsWith('/') || p === 'dist') p = join('dist', 'index.html')
  res.setHeader('Content-Security-Policy', csp)
  res.setHeader('Content-Type', types[extname(p)] ?? 'application/octet-stream')
  res.end(readFileSync(p))
})
await new Promise<void>((r) => server.listen(4180, r))

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, acceptDownloads: true })
const logs: string[] = []
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`) })
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`))
page.on('worker', (w) => {
  logs.push(`worker started: ${w.url()}`)
  w.on('console', (m) => logs.push(`worker ${m.type()}: ${m.text()}`))
})
page.on('requestfailed', (r) => logs.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`))
page.on('response', (r) => { if (r.status() >= 400) logs.push(`http ${r.status()}: ${r.url()}`) })

const t0 = Date.now()
await page.goto('http://localhost:4180/')
try {
  await page.waitForSelector('.preview-page svg', { timeout: 30000 })
} catch (e) {
  await page.screenshot({ path: join(out, '0-fail.png') })
  console.log('FAILED to render. Console:', logs, '\nBody:', (await page.locator('body').innerText()).slice(0, 500))
  throw e
}
console.log('ready + sample preview in', Date.now() - t0, 'ms')
await page.screenshot({ path: join(out, '1-start.png') })

// Upload Excel + QR files
await page.locator('input[type=file][accept*=".xlsx"]').setInputFiles(xlsxPath)
await page.locator('input[type=file][multiple][accept*=".png"]').setInputFiles(qrPaths)
await page.waitForFunction(() => document.body.innerText.includes('5 QR files loaded'), null, { timeout: 30000 })
await page.waitForTimeout(800)
const matched = await page.locator('text=/rows matched to a QR file/').innerText()
console.log('match notice:', matched)
await page.screenshot({ path: join(out, '2-data.png') })

// Select the Khmer row
await page.locator('tbody tr').nth(1).click()
await page.waitForTimeout(600)
await page.screenshot({ path: join(out, '3-khmer-row.png') })

// Export: A6 with bleed and crop marks
await page.locator('select').filter({ hasText: 'Original' }).selectOption('A6')
await page.getByRole('radio', { name: 'With bleed' }).click()
await page.getByText('Crop marks', { exact: true }).click()
await page.waitForFunction(() => document.body.innerText.includes('338.65') && !document.body.innerText.includes('Updating…'), null, { timeout: 15000 })
await page.waitForTimeout(300)
await page.screenshot({ path: join(out, '4-a6-bleed.png') })
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: /^Download/ }).click()])
const pdfPath = join(out, dl.suggestedFilename())
await dl.saveAs(pdfPath)
console.log('downloaded', dl.suggestedFilename())
await page.waitForTimeout(300)
console.log('status:', await page.locator('header').innerText())

// Row range: Excel rows 2–4 → a 3-page PDF
await page.getByLabel('First row').fill('2')
await page.getByLabel('Last row').fill('4')
await page.waitForFunction(() => document.body.innerText.includes('3 of 6 rows in range'), null, { timeout: 5000 })
const [dlr] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: /^Download/ }).click()])
console.log('downloaded (range 2–4)', dlr.suggestedFilename())
if (!/_3p\.pdf$/.test(dlr.suggestedFilename())) throw new Error(`range export: expected 3 pages, got ${dlr.suggestedFilename()}`)
await dlr.saveAs(join(out, `range-${dlr.suggestedFilename()}`))
await page.getByRole('button', { name: 'All', exact: true }).click()

// Without background
await page.getByText('Include background', { exact: true }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: join(out, '4b-no-background.png') })
const [dlb] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: /^Download/ }).click()])
console.log('downloaded (no background)', dlb.suggestedFilename())
if (!/_no-bg_/.test(dlb.suggestedFilename())) throw new Error(`no-background export: unexpected name ${dlb.suggestedFilename()}`)
await dlb.saveAs(join(out, dlb.suggestedFilename()))
await page.getByText('Include background', { exact: true }).click()

// Hide / show the logo and corner frame
await page.getByRole('button', { name: 'Hide bakong logo' }).click()
await page.getByRole('button', { name: 'Hide corner frame' }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: join(out, '4d-hidden-logo-corner.png') })
await page.getByRole('button', { name: 'Show bakong logo' }).click()
// White logo
await page.getByRole('button', { name: 'Blank', exact: true }).click()
await page.waitForFunction(() => document.body.innerText.includes('bkw.svg (blank, white)'), null, { timeout: 10000 })
await page.waitForTimeout(800)
await page.screenshot({ path: join(out, '4e-white-logo.png') })
await page.getByRole('button', { name: 'Black', exact: true }).click()
await page.getByRole('button', { name: 'Show corner frame' }).click()

// Corner frame: square corners in brand red
await page.getByLabel('Corner radius', { exact: true }).fill('0')
await page.getByRole('button', { name: 'Corner color #d22026' }).click()
await page.waitForTimeout(800)
const cornerHtml = await page.locator('.preview-page').innerHTML()
if (!cornerHtml.includes('#d22026')) throw new Error('corner color not applied')
await page.screenshot({ path: join(out, '4g-corner.png') })
await page.getByRole('button', { name: 'Reset to default' }).click()
if (await page.getByLabel('Corner radius', { exact: true }).inputValue() !== '13.25') throw new Error('corner reset failed')
console.log('corner controls ok')

// Drag and drop an SVG onto the corner frame card
await page.evaluate(async () => {
  const svg = await (await fetch('/artwork/corner.svg')).text()
  const dt = new DataTransfer()
  dt.items.add(new File([svg], 'dropped-corner.svg', { type: 'image/svg+xml' }))
  const card = [...document.querySelectorAll('div')].find((d) => d.className.includes('rounded-xl') && d.textContent?.startsWith('Corner frame'))!
  for (const type of ['dragenter', 'dragover', 'drop']) card.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }))
})
await page.waitForFunction(() => document.body.innerText.includes('dropped-corner.svg'), null, { timeout: 10000 })
console.log('asset drop ok')

// Typography panel: fonts
await page.getByRole('button', { name: /Typography/ }).click()
await page.waitForTimeout(300)
await page.getByLabel('Merchant name font: Khmer').selectOption('kantumruy-pro-700')
await page.locator('input[type=file][accept*=".ttf"]').first().setInputFiles('public/fonts/Poppins_700Bold.ttf')
await page.waitForFunction(() => document.body.innerText.includes('Uploaded: Poppins_700Bold.ttf'), null, { timeout: 10000 })
await page.waitForTimeout(800)
await page.screenshot({ path: join(out, '4c-typography.png') })
console.log('fonts ok')
await page.locator('section').filter({ hasText: 'Typography' }).getByRole('button', { name: 'Reset', exact: true }).click()
await page.waitForTimeout(500)
const khmerFont = await page.getByLabel('Merchant name font: Khmer').inputValue()
if (khmerFont !== 'nokora-600') throw new Error(`typography reset failed: ${khmerFont}`)
console.log('typography reset ok')

// Zoom
await page.getByRole('button', { name: 'Zoom in' }).click()
await page.getByRole('button', { name: 'Zoom in' }).click()
await page.waitForTimeout(300)
await page.screenshot({ path: join(out, '4f-zoomed.png') })
await page.getByRole('button', { name: /Fit/ }).click()

// Print: builds the combined PDF and loads it into the hidden print frame
await page.getByRole('button', { name: /^Print/ }).click()
await page.waitForFunction(() => document.getElementById('print-frame')?.getAttribute('src')?.startsWith('blob:'), null, { timeout: 60000 })
console.log('print frame loaded')

// ZIP per MID
await page.locator('select').filter({ hasText: 'One combined PDF' }).selectOption('zip')
const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: /^Download/ }).click()])
await dl2.saveAs(join(out, dl2.suggestedFilename()))
console.log('downloaded', dl2.suggestedFilename())

// Mobile layout
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(400)
await page.screenshot({ path: join(out, '5-mobile.png') })

console.log('console errors/warnings:', logs.length ? logs : 'none')
await browser.close()
server.close()
