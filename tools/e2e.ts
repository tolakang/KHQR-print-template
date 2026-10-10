/**
 * End-to-end check of the built app in Chromium (run `npm run build` first).
 * Serves dist/ with the production CSP, uploads fixtures, downloads the PDF.
 * Usage: tsx tools/e2e.ts <outDir>
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, extname } from 'node:path'
import { chromium } from 'playwright'
import * as XLSX from 'xlsx'
import QRCode from 'qrcode'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { buildKhqr } from '../src/core/qr/khqr'

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
  const payload = buildKhqr({ name: String(rows[i][2]).slice(0, 25), mid: String(rows[i][3]), account: 'abaakhppxxx@abaa' })
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
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.ttf': 'font/ttf' }
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

// Settings panel tabs (cards view)
const tab = (name: string) => page.getByRole('tab', { name: new RegExp(`^${name}`) }).click()
if ((await page.getByRole('tablist', { name: 'Settings' }).getByRole('tab').count()) !== 4) throw new Error('expected 4 settings tabs')

// Upload Excel + QR files
await tab('Data')
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

// Flow view: same panels as nodes on a canvas
await page.getByRole('radio', { name: 'Flow' }).click()
await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length === 7, null, { timeout: 15000 })
await page.waitForSelector('.react-flow__node .preview-page svg', { timeout: 15000 })
await page.waitForTimeout(800)
await page.screenshot({ path: join(out, '3b-flow.png') })
if (await page.locator('.react-flow__edge').count() !== 6) throw new Error('flow edges missing')
// Each wire has its own connection points: 6 wires → 6 outputs + 6 inputs.
const handles = await page.locator('.react-flow__handle').count()
if (handles !== 12) throw new Error(`expected 12 handles, got ${handles}`)
// Download node builds the PDF too
const [dlf] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('.react-flow__node-panel').filter({ hasText: 'Builds the PDF' }).getByRole('button', { name: /^Download PDF/ }).click()])
console.log('downloaded from flow node', dlf.suggestedFilename())
// Collapse every collapsible card: each output point must stay on its card
for (const id of ['assets', 'data', 'typography', 'export']) {
  await page.locator(`.react-flow__node[data-id="${id}"] section > div > button`).first().click()
}
await page.waitForTimeout(600)
await page.screenshot({ path: join(out, '3c-flow-collapsed.png') })
for (const id of ['assets', 'data', 'typography', 'export']) {
  const node = (await page.locator(`.react-flow__node[data-id="${id}"] section`).boundingBox())!
  for (const h of await page.locator(`.react-flow__node[data-id="${id}"] .react-flow__handle`).all()) {
    const b = (await h.boundingBox())!
    const cy = b.y + b.height / 2
    if (cy < node.y || cy > node.y + node.height) throw new Error(`${id}: wire point off the collapsed card`)
  }
}
for (const id of ['assets', 'data', 'typography', 'export']) {
  await page.locator(`.react-flow__node[data-id="${id}"] section > div > button`).first().click()
}
await page.getByRole('radio', { name: 'Cards' }).click()
await page.waitForSelector('aside', { timeout: 5000 })
console.log('flow view ok')

// Export: A6 with bleed and crop marks
await tab('Export')
await page.locator('select').filter({ hasText: 'A6 (105' }).selectOption('A6')
await page.getByRole('radio', { name: 'With bleed' }).click()
await page.getByText('Crop marks', { exact: true }).click()
await page.waitForFunction(() => document.body.innerText.includes('119.47 × 162.47 mm') && !document.body.innerText.includes('Updating…'), null, { timeout: 15000 })
await page.waitForTimeout(300)
await page.screenshot({ path: join(out, '4-a6-bleed.png') })
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('header').getByRole('button', { name: /^Download/ }).click()])
const pdfPath = join(out, dl.suggestedFilename())
await dl.saveAs(pdfPath)
console.log('downloaded', dl.suggestedFilename())
await page.waitForTimeout(300)
console.log('status:', await page.locator('header').innerText())

// Row range: Excel rows 2–4 → a 3-page PDF
await tab('Data')
await page.getByLabel('First row').fill('2')
await page.getByLabel('Last row').fill('4')
await page.waitForFunction(() => document.body.innerText.includes('3 of 6 rows in range'), null, { timeout: 5000 })
const [dlr] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('header').getByRole('button', { name: /^Download/ }).click()])
console.log('downloaded (range 2–4)', dlr.suggestedFilename())
if (!/_3p\.pdf$/.test(dlr.suggestedFilename())) throw new Error(`range export: expected 3 pages, got ${dlr.suggestedFilename()}`)
await dlr.saveAs(join(out, `range-${dlr.suggestedFilename()}`))
await page.getByRole('button', { name: 'All', exact: true }).click()

// Without background
await tab('Export')
await page.getByText('Include background', { exact: true }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: join(out, '4b-no-background.png') })
const [dlb] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('header').getByRole('button', { name: /^Download/ }).click()])
console.log('downloaded (no background)', dlb.suggestedFilename())
if (!/_no-bg_/.test(dlb.suggestedFilename())) throw new Error(`no-background export: unexpected name ${dlb.suggestedFilename()}`)
await dlb.saveAs(join(out, dlb.suggestedFilename()))
await page.getByText('Include background', { exact: true }).click()

// Hide / show the logo and corner frame
await tab('Assets')
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
  const card = [...document.querySelectorAll('div')].find((d) => d.className.includes('subcard') && d.textContent?.startsWith('Corner frame'))!
  for (const type of ['dragenter', 'dragover', 'drop']) card.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }))
})
await page.waitForFunction(() => document.body.innerText.includes('dropped-corner.svg'), null, { timeout: 10000 })
console.log('asset drop ok')

// Typography panel: fonts
await tab('Typography')
await page.waitForTimeout(300)
await page.getByLabel('Merchant name font: Khmer').selectOption('kantumruy-pro-700')
await page.locator('input[type=file][accept*=".ttf"]').first().setInputFiles('public/fonts/Poppins_700Bold.ttf')
await page.waitForFunction(() => document.body.innerText.includes('Uploaded: Poppins_700Bold.ttf'), null, { timeout: 10000 })
await page.waitForTimeout(800)
await page.screenshot({ path: join(out, '4c-typography.png') })
console.log('fonts ok')
await page.locator('[role=tabpanel][id^="panel-"]').getByRole('button', { name: 'Reset', exact: true }).click()
await page.waitForTimeout(500)
const khmerFont = await page.getByLabel('Merchant name font: Khmer').inputValue()
if (khmerFont !== 'nokora-600') throw new Error(`typography reset failed: ${khmerFont}`)
console.log('typography reset ok')

// Position bar in the preview: QR tab, move 10 mm right (= 28.35 pt), switch units, reset
await page.getByRole('tab', { name: 'QR code', exact: true }).click()
const htmlBefore = await page.locator('.preview-page').innerHTML()
await page.getByLabel('QR code X').fill('10')
await page.waitForFunction((h) => document.querySelector('.preview-page')!.innerHTML !== h, htmlBefore, { timeout: 10000 })
await page.waitForTimeout(500)
await page.screenshot({ path: join(out, '4h-position.png') })
await page.getByRole('radio', { name: 'pt', exact: true }).click()
if ((await page.getByLabel('QR code X').inputValue()) !== '28.35') throw new Error(`position unit switch: ${await page.getByLabel('QR code X').inputValue()}`)
// px (CSS, 96 per inch): 28.35 pt = 37.8 px; the safe margin and size readout follow the unit too
await page.getByRole('radio', { name: 'px', exact: true }).click()
await tab('Typography')
if ((await page.getByLabel('Name size').inputValue()) !== '30.67') throw new Error(`name size in px: ${await page.getByLabel('Name size').inputValue()}`)
await page.getByRole('radio', { name: 'mm', exact: true }).click()
if ((await page.getByLabel('Name size').inputValue()) !== '8.11' || (await page.getByLabel('MID size').inputValue()) !== '3.53') throw new Error('font sizes in mm')
await page.getByRole('radio', { name: 'px', exact: true }).click()
if ((await page.getByLabel('QR code X').inputValue()) !== '37.8') throw new Error(`px unit: ${await page.getByLabel('QR code X').inputValue()}`)
await page.waitForFunction(() => document.body.innerText.includes('451.53 × 614.05 px'), null, { timeout: 5000 })
await page.getByRole('radio', { name: 'pt', exact: true }).click()
await page.getByRole('tab', { name: 'Merchant name', exact: true }).click()
await page.getByLabel('Merchant name Y').fill('400')
await page.getByLabel('Merchant name Y').blur()
await page.waitForFunction(() => document.body.innerText.includes('Moved past the sticker edge'), null, { timeout: 10000 })
await page.getByRole('button', { name: 'Reset all', exact: true }).click()
if ((await page.getByLabel('Merchant name Y').inputValue()) !== '0') throw new Error('position reset failed')
await page.getByRole('tab', { name: 'QR code', exact: true }).click()
if ((await page.getByLabel('QR code X').inputValue()) !== '0') throw new Error('position reset failed (QR)')
await page.waitForFunction((h) => document.querySelector('.preview-page')!.innerHTML === h, htmlBefore, { timeout: 10000 })
await page.getByRole('radio', { name: 'mm', exact: true }).click()
console.log('position ok')

// Zoom, then drag the zoomed preview to move around
await page.getByRole('button', { name: 'Zoom in' }).click()
await page.getByRole('button', { name: 'Zoom in' }).click()
await page.getByRole('button', { name: 'Zoom in' }).click()
await page.waitForTimeout(300)
const view = page.locator('.preview-page').locator('xpath=../..')
const before = await view.evaluate((el) => [el.scrollLeft, el.scrollTop])
const box = (await view.boundingBox())!
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2 - 150, { steps: 6 })
await page.mouse.up()
const after = await view.evaluate((el) => [el.scrollLeft, el.scrollTop])
if (after[0] <= before[0] && after[1] <= before[1]) throw new Error(`preview drag did not pan: ${before} → ${after}`)
console.log('preview pan ok')
await page.screenshot({ path: join(out, '4f-zoomed.png') })
await page.getByRole('button', { name: /Fit/ }).click()

// Print: builds the combined PDF and loads it into the hidden print frame
if (await page.locator('header').getByRole('button', { name: /^Print/ }).count()) throw new Error('Print should not be in the header')
await tab('Export')
// Download from inside the Export tab
const [dlt] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('[role=tabpanel][id^="panel-"]').getByRole('button', { name: /^Download PDF/ }).click()])
console.log('downloaded from export tab', dlt.suggestedFilename())
await page.locator('[role=tabpanel][id^="panel-"]').screenshot({ path: join(out, '4i-export-tab.png') })
await page.locator('[role=tabpanel][id^="panel-"]').getByRole('button', { name: /^Print/ }).click()
await page.waitForFunction(() => document.getElementById('print-frame')?.getAttribute('src')?.startsWith('blob:'), null, { timeout: 60000 })
console.log('print frame loaded')

// ZIP per MID
await tab('Export')
await page.locator('select').filter({ hasText: 'One combined PDF' }).selectOption('zip')
const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.locator('header').getByRole('button', { name: /^Download/ }).click()])
await dl2.saveAs(join(out, dl2.suggestedFilename()))
console.log('downloaded', dl2.suggestedFilename())

// Data source: a generated KHQR PDF (bank-style: QR images + text; 2 codes on page 2; page 3 without a code)
{
  const bank = await PDFDocument.create()
  const font = await bank.embedFont(StandardFonts.Helvetica)
  const add = async (codes: { name: string; mid: string; alt?: string }[], label?: string) => {
    const pg = bank.addPage([297.64, 419.53])
    for (const [i, c] of codes.entries()) {
      const png = await bank.embedPng(await QRCode.toBuffer(buildKhqr({ name: c.name, mid: c.mid, altName: c.alt }), { margin: 4, scale: 6 }))
      const x = codes.length === 1 ? 74 : 20 + i * 140
      pg.drawImage(png, { x, y: 200, width: codes.length === 1 ? 150 : 120, height: codes.length === 1 ? 150 : 120 })
    }
    if (label) {
      pg.drawText(codes[0]?.name ?? label, { x: 60, y: 160, size: 16, font })
      pg.drawText(`MID: ${codes[0]?.mid ?? '999888777666'}`, { x: 60, y: 135, size: 11, font })
    }
  }
  await add([{ name: 'Lucky Mart', mid: '124092620291911', alt: 'ផ្សារសំណាង' }], 'x')
  await add([{ name: 'Shop Two A', mid: '124092620291912' }, { name: 'Shop Two B', mid: '124092620291913' }])
  await add([], 'Blank page')
  const bankPath = join(out, 'bank-generated.pdf')
  writeFileSync(bankPath, await bank.save())

  await tab('Data')
  await page.getByRole('radio', { name: 'Generated PDF' }).click()
  await page.locator('input[type=file][accept*=".pdf"]').setInputFiles(bankPath)
  try {
    await page.waitForFunction(() => document.body.innerText.includes('3 QR codes found on 3 pages'), null, { timeout: 60000 })
  } catch (e) {
    await page.screenshot({ path: join(out, '6-pdf-fail.png') })
    console.log('PDF import failed. Console:', logs.slice(-15), '\nData panel:', (await page.locator('aside').innerText()).slice(0, 1500))
    throw e
  }
  await page.waitForTimeout(800)
  const body = await page.locator('tbody').innerText()
  for (const t of ['Lucky Mart', 'Shop Two A', 'Shop Two B', '124092620291913']) if (!body.includes(t)) throw new Error(`PDF import: "${t}" missing`)
  if ((await page.locator('tbody tr').count()) !== 4) throw new Error('PDF import: expected 4 rows (3 codes + 1 page without)')
  await page.screenshot({ path: join(out, '6-pdf-import.png') })
  // Khmer name from the KHQR alternate-language field
  await page.locator('select').filter({ hasText: 'Merchant Name (local language)' }).first().selectOption({ label: 'Merchant Name (local language)' })
  await page.waitForTimeout(500)
  if (!(await page.locator('tbody').innerText()).includes('ផ្សារសំណាង')) throw new Error('PDF import: Khmer name missing')
  console.log('pdf import (bank-style) ok')

  // Re-import a PDF made by this app (vector QR, outlined text): names and MIDs come from the codes
  const own = join(out, readdirSync(out).find((f) => /_A6_bleed_5p\.pdf$/.test(f))!)
  await page.locator('input[type=file][accept*=".pdf"]').setInputFiles(own)
  await page.waitForFunction(() => document.body.innerText.includes('5 QR codes found on 5 pages'), null, { timeout: 60000 })
  await page.waitForTimeout(500)
  const ownBody = await page.locator('tbody').innerText()
  if (!ownBody.includes('The Pizza Company Sihanou') || !ownBody.includes('124092620291906')) throw new Error('re-import of own PDF failed')
  const [dlp] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: /^Download/ }).first().click()])
  console.log('pdf import (own export) ok →', dlp.suggestedFilename())
  await page.getByRole('radio', { name: 'Excel + QR files' }).click()
}

// Mobile layout (both views)
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(400)
await page.screenshot({ path: join(out, '5-mobile.png') })
await tab('Export')
await page.locator('aside').screenshot({ path: join(out, '5a-mobile-tabs.png') })
await page.locator('main').screenshot({ path: join(out, '5c-mobile-position.png') })
await page.getByRole('radio', { name: 'Flow' }).click()
await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length === 7, null, { timeout: 15000 })
await page.waitForTimeout(600)
await page.screenshot({ path: join(out, '5b-mobile-flow.png') })
await page.getByRole('radio', { name: 'Cards' }).click()
console.log('mobile flow ok')

console.log('console errors/warnings:', logs.length ? logs : 'none')
await browser.close()
server.close()
