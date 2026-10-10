import { useContext, useMemo, useState } from 'react'
import { useApp, deriveRows, DEFAULT_ASSETS, RED_LOGO, WHITE_LOGO } from '../store/app'
import { useSettings, defaultSettings, zeroOffsets } from '../store/settings'
import type { AssetKind, OffsetRole } from '../engine/types'
import { pageGeometry, type PageSizeName } from '../core/layout/page'
import { qrPrintSize } from '../core/qr/printSize'
import { rowsInRange } from '../core/excel/read'
import { layout, mmToPt, NAME_CHARS_MAX } from '../config'
import { NAME_FONTS, CUSTOM_FONT, type FontScript } from '../config/fonts'
import { Section, Field, NumberInput, OptionalIntInput, Select, Toggle, Segmented, FileButton, DropZone, Notice, btnCls } from './controls'
import { useFileDrop } from './useFileDrop'
import { PlainSection } from './sectionMode'
import { ExportBar } from './exportBar'
import { Eye, EyeOff, Upload, Image as ImageIcon, Table as TableIcon, Type as TypeIcon, FileOut, Reset, Move } from './icons'

const svgThumb = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

/** Setting that shows or hides each asset on the sticker (preview and export). */
const VISIBLE_KEY = { background: 'background', logo: 'showLogo', corner: 'showCorner' } as const

const LOGO_COLORS = [
  { key: 'black', label: 'Black', swatch: 'bg-[#231f20]', file: DEFAULT_ASSETS.logo.file, name: DEFAULT_ASSETS.logo.name },
  { key: 'red', label: 'Red', swatch: 'bg-[#d0021b]', file: RED_LOGO.file, name: RED_LOGO.name },
  { key: 'white', label: 'Blank', swatch: 'bg-white ring-1 ring-inset ring-stone-300', file: WHITE_LOGO.file, name: WHITE_LOGO.name },
] as const

/** #rrggbb text box; keeps what is typed until it is a full color. */
function HexInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      type="text"
      value={draft ?? value}
      placeholder="original"
      maxLength={7}
      onChange={(e) => {
        const v = e.target.value.trim()
        setDraft(v)
        if (/^#?[0-9a-f]{6}$/i.test(v)) onChange(('#' + v.replace('#', '')).toLowerCase())
      }}
      onBlur={() => setDraft(null)}
      className="h-9 w-24 rounded-lg border border-stone-200 bg-white px-2.5 font-mono text-xs uppercase text-stone-700 focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/10"
      aria-label="Corner color hex"
    />
  )
}

function CornerControls({ builtIn }: { builtIn: boolean }) {
  const s = useSettings((x) => x.s)
  const set = useSettings((x) => x.set)
  const resetAsset = useApp((x) => x.resetAsset)
  const max = layout.corner.arm
  const color = s.cornerColor || (builtIn ? layout.corner.color : '#000000')
  const isDefault = builtIn && s.cornerRadiusPt === layout.corner.radius && !s.cornerColor
  const resetFrame = () => {
    set({ cornerRadiusPt: layout.corner.radius, cornerColor: '' })
    if (!builtIn) resetAsset('corner')
  }
  return (
    <div className="mt-3 space-y-3 border-t border-stone-200/70 pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-stone-800">Frame style</span>
        <button type="button" className={btnCls('secondary', 'sm')} disabled={isDefault} onClick={resetFrame} title="Built-in frame, guide radius and guide color">
          <Reset className="h-3.5 w-3.5" />Reset to default
        </button>
      </div>
      <div className={builtIn ? '' : 'opacity-50'}>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-stone-700">Corner radius</span>
          <button type="button" className={btnCls('ghost')} disabled={!builtIn || s.cornerRadiusPt === layout.corner.radius} onClick={() => set({ cornerRadiusPt: layout.corner.radius })}>Guide ({layout.corner.radius} pt)</button>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={max}
            step="any"
            value={Math.min(max, s.cornerRadiusPt)}
            disabled={!builtIn}
            onChange={(e) => set({ cornerRadiusPt: Number(e.target.value) })}
            className="h-1.5 flex-1 cursor-pointer accent-brand disabled:cursor-not-allowed"
            aria-label="Corner radius"
          />
          <div className="w-28"><NumberInput value={s.cornerRadiusPt} onChange={(v) => set({ cornerRadiusPt: v })} min={0} max={max} step={0.25} suffix="pt" disabled={!builtIn} /></div>
        </div>
        {!builtIn && <p className="mt-1 text-[11px] text-stone-500">Radius works with the built-in frame; an uploaded frame keeps its own shape.</p>}
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-stone-700">Corner color</span>
          <button type="button" className={btnCls('ghost')} disabled={!s.cornerColor} onClick={() => set({ cornerColor: '' })}>{builtIn ? `Guide (${layout.corner.color})` : 'Original colors'}</button>
        </div>
        <div className="flex items-center gap-2">
          <input type="color" value={color} onChange={(e) => set({ cornerColor: e.target.value })} className="h-9 w-12 cursor-pointer rounded-lg border border-stone-200 bg-white p-1" aria-label="Corner color" />
          <HexInput value={s.cornerColor || (builtIn ? layout.corner.color : '')} onChange={(v) => set({ cornerColor: v })} />
          {[layout.corner.color, '#000000', '#d22026', '#ffffff'].map((c) => (
            <button key={c} type="button" title={c} aria-label={`Corner color ${c}`} onClick={() => set({ cornerColor: c === layout.corner.color && builtIn ? '' : c })}
              className={`h-6 w-6 rounded-full ring-1 ring-inset ring-stone-300 transition hover:scale-110 ${color.toLowerCase() === c ? 'outline-1 outline-offset-2 outline-brand' : ''}`}
              style={{ background: c }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function AssetSlot({ kind, label, hint }: { kind: AssetKind; label: string; hint: string }) {
  const a = useApp((s) => s.assets[kind])
  const visible = useSettings((x) => x.s[VISIBLE_KEY[kind]])
  const setSettings = useSettings((x) => x.set)
  const setAssetFile = useApp((s) => s.setAssetFile)
  const resetAsset = useApp((s) => s.resetAsset)
  const setAssetUrl = useApp((s) => s.setAssetUrl)
  const drop = useFileDrop((f) => setAssetFile(kind, f[0]))
  return (
    <div
      {...drop.props}
      className={`subcard relative transition-colors ${drop.over ? '!border-dashed !border-brand !bg-brand-50' : visible ? '' : '!border-dashed !border-stone-300 !bg-stone-100/60'}`}
    >
      {drop.over && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl bg-brand-50/90 text-sm font-semibold text-brand">
          <span className="flex items-center gap-2"><Upload className="h-4 w-4" />Drop SVG to replace the {label.toLowerCase()}</span>
        </div>
      )}
      <div className="flex gap-3">
        <div className={`grid h-16 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-stone-200 bg-white bg-[repeating-conic-gradient(#f5f5f4_0_25%,#fff_0_50%)] bg-[length:10px_10px] p-1 transition-opacity ${visible ? '' : 'opacity-30 grayscale'}`}>
          {a && <img src={svgThumb(a.svg)} alt="" className="max-h-full max-w-full" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-stone-900">{label}</div>
              <div className="truncate text-xs text-stone-500" title={a?.name}>{a?.name ?? 'Loading…'}</div>
            </div>
            <button
              type="button"
              className={`${btnCls(visible ? 'secondary' : 'primary', 'sm')} !h-7 !gap-1 !px-2`}
              aria-pressed={!visible}
              aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
              onClick={() => setSettings({ [VISIBLE_KEY[kind]]: !visible })}
            >
              {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {visible ? 'Hide' : 'Show'}
            </button>
          </div>
          {!visible && <div className="mt-1 text-[11px] font-medium text-amber-700">Hidden: not in preview or export</div>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <FileButton accept=".svg,image/svg+xml" onFiles={(f) => setAssetFile(kind, f[0])}>
              <Upload className="h-3.5 w-3.5" />Upload SVG
            </FileButton>
            <span className="hidden text-[11px] text-stone-400 sm:inline">or drop it here</span>
            {a && !a.isDefault && kind !== 'logo' && (
              <button type="button" className={btnCls('ghost')} onClick={() => resetAsset(kind)}>Reset</button>
            )}
          </div>
        </div>
      </div>
      {kind === 'logo' && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs font-medium text-stone-600">Color</span>
          <div className="inline-flex flex-1 gap-1 rounded-[10px] bg-stone-200/50 p-1 ring-1 ring-inset ring-stone-200/70" role="group" aria-label="Logo color">
            {LOGO_COLORS.map((c) => {
              const active = a?.name === c.name
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => (c.key === 'black' ? resetAsset('logo') : setAssetUrl('logo', c.file, c.name))}
                  className={`flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold transition ${active ? 'bg-brand text-white shadow-[0_1px_2px_rgba(210,32,38,0.3)]' : 'text-stone-600 hover:bg-white hover:text-stone-900'}`}
                >
                  <span className={`h-3 w-3 rounded-full ${c.swatch}`} aria-hidden />
                  {c.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {kind === 'corner' && <CornerControls builtIn={!!a?.isDefault} />}
      <p className="mt-2.5 text-[11px] leading-snug text-stone-500">{hint}</p>
      {a?.warnings.map((w) => <div key={w.code} className="mt-1.5"><Notice>{w.message}</Notice></div>)}
    </div>
  )
}

export function AssetsPanel() {
  return (
    <Section title="Assets" icon={<ImageIcon className="h-4 w-4" />} description="Artwork placed on every sticker. Upload or drop an SVG to replace one.">
      <AssetSlot kind="background" label="Background" hint={`Fitted inside the trim with one uniform scale. Gaps and bleed are filled from the artwork's edge colors. Default: ${DEFAULT_ASSETS.background.name}.`} />
      <AssetSlot kind="logo" label="Bakong logo" hint="Always scaled to 32 × 32 pt and centered on the QR." />
      <AssetSlot kind="corner" label="Corner frame" hint="Scaled to 154.3 pt square around the QR." />
    </Section>
  )
}

export function DataPanel() {
  const app = useApp()
  const s = useSettings((x) => x.s)
  const set = useSettings((x) => x.set)
  const sheet = app.sheets[app.sheetIndex]
  const derived = useMemo(() => deriveRows(app), [app.sheets, app.sheetIndex, app.cols, app.qrFiles]) // eslint-disable-line react-hooks/exhaustive-deps
  const realQr = app.qrFiles.filter((q) => !q.name.startsWith('__'))
  const failed = realQr.filter((q) => !q.ok)
  const rebuilt = realQr.filter((q) => q.method === 'rebuilt' || q.method === 'traced')
  const matched = sheet ? derived.rows.filter((r) => r.qrFile && realQr.find((q) => q.name === r.qrFile && q.ok)).length : 0
  const colOptions = [{ value: -1, label: '— none —' }, ...(sheet?.headers.map((h, i) => ({ value: i, label: h })) ?? [])]

  return (
    <Section title="Data" icon={<TableIcon className="h-4 w-4" />} description="Where the merchant names, MIDs and QR codes come from." badge={sheet ? <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand">{sheet.rows.length}</span> : null}>
      <Field label="Source" group>
        <Segmented value={app.source} onChange={(v) => app.setSource(v)} options={[{ value: 'excel', label: 'Excel + QR files' }, { value: 'pdf', label: 'Generated PDF' }]} />
      </Field>
      {app.source === 'pdf' ? (
        <div>
          <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-stone-900"><span className="grid h-5 w-5 place-items-center rounded-full bg-brand-50 text-[11px] font-bold text-brand ring-1 ring-inset ring-brand/20">1</span>KHQR PDF</div>
          <DropZone onFiles={(f) => app.loadPdf(f[0])} accept={/\.pdf$/i}>
            <div className="mb-2 text-stone-500">
              {app.pdfBusy ? `Reading page ${app.pdfBusy[0]} of ${app.pdfBusy[1] || '…'}` : app.pdfSummary && app.workbookName ? app.workbookName : 'Drop a generated KHQR PDF here'}
            </div>
            <FileButton accept=".pdf,application/pdf" onFiles={(f) => app.loadPdf(f[0])}>{app.pdfSummary ? 'Replace PDF' : 'Choose PDF'}</FileButton>
          </DropZone>
          <p className="mt-1.5 text-[11px] leading-snug text-stone-500">Each QR code is read from the PDF and redrawn as vector. Merchant name and MID come from the KHQR code itself (tags 59 and 30-01); the page text is the fallback.</p>
          {app.pdfSummary && (
            <div className="mt-2">
              <Notice tone={app.pdfSummary.pagesWithout ? 'warn' : 'ok'}>
                {app.pdfSummary.codes} QR code{app.pdfSummary.codes === 1 ? '' : 's'} found on {app.pdfSummary.pages} page{app.pdfSummary.pages === 1 ? '' : 's'}.
                {app.pdfSummary.pagesWithout > 0 && ` ${app.pdfSummary.pagesWithout} page${app.pdfSummary.pagesWithout === 1 ? '' : 's'} without a QR code.`}
              </Notice>
            </div>
          )}
        </div>
      ) : (
      <div>
        <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-stone-900"><span className="grid h-5 w-5 place-items-center rounded-full bg-brand-50 text-[11px] font-bold text-brand ring-1 ring-inset ring-brand/20">1</span>Excel file</div>
        <DropZone onFiles={(f) => app.loadWorkbook(f[0])} accept={/\.(xlsx|xls|xlsm|csv|ods)$/i}>
          <div className="mb-2 text-stone-500">{app.workbookName ?? 'Drop .xlsx / .xls / .csv here'}</div>
          <FileButton accept=".xlsx,.xls,.xlsm,.csv,.ods" onFiles={(f) => app.loadWorkbook(f[0])}>{app.workbookName ? 'Replace file' : 'Choose file'}</FileButton>
        </DropZone>
      </div>
      )}
      {sheet && (
        <div className="grid grid-cols-2 gap-2">
          {app.sheets.length > 1 && (
            <div className="col-span-2">
              <Field label="Sheet">
                <Select value={app.sheetIndex} onChange={(v) => app.setSheet(v)} options={app.sheets.map((sh, i) => ({ value: i, label: `${sh.name} (${sh.rows.length})` }))} />
              </Field>
            </div>
          )}
          <Field label="Merchant name column"><Select value={app.cols.name} onChange={(v) => app.setCols({ name: v })} options={colOptions} /></Field>
          <Field label="MID column"><Select value={app.cols.mid} onChange={(v) => app.setCols({ mid: v })} options={colOptions} /></Field>
          <div className="col-span-2">
            <Field label="QR file name column" hint={app.source === 'pdf' ? 'Codes cut from the PDF (one per QR found).' : 'If none, QR files are matched by MID (e.g. 124092620291906.svg or KHQR_124092620291906.png).'}>
              <Select value={app.cols.qr} onChange={(v) => app.setCols({ qr: v })} options={colOptions} />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label={app.source === 'pdf' ? 'Export rows (PDF page numbers)' : 'Export rows (Excel row numbers)'} group hint={rangeHint(derived.rows.length, rowsInRange(derived.rows, app.range).length, app.range)}>
              <div className="flex items-center gap-2">
                <OptionalIntInput value={app.range.from} onChange={(v) => app.setRange({ from: v })} min={1} placeholder={`${derived.rows[0]?.excelRow ?? ''} (first)`} ariaLabel="First row" />
                <span className="text-xs text-stone-500">to</span>
                <OptionalIntInput value={app.range.to} onChange={(v) => app.setRange({ to: v })} min={1} placeholder={`${derived.rows.at(-1)?.excelRow ?? ''} (last)`} ariaLabel="Last row" />
                {(app.range.from !== null || app.range.to !== null) && (
                  <button type="button" className={btnCls('ghost')} onClick={() => app.setRange({ from: null, to: null })}>All</button>
                )}
              </div>
            </Field>
          </div>
        </div>
      )}
      {app.source === 'excel' && (<>
      <div>
        <div className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-stone-900"><span className="grid h-5 w-5 place-items-center rounded-full bg-brand-50 text-[11px] font-bold text-brand ring-1 ring-inset ring-brand/20">2</span>QR files</div>
        <DropZone onFiles={(f) => app.addQrFiles(f)} accept={/\.(svg|png|jpe?g|webp)$/i}>
          <div className="mb-2 text-stone-500">
            {app.qrBusy ? `Processing ${app.qrBusy[0]} / ${app.qrBusy[1]}…` : realQr.length ? `${realQr.length} QR files loaded` : 'Drop SVG / PNG / JPG QR files here'}
          </div>
          <div className="flex justify-center gap-1.5">
            <FileButton accept=".svg,.png,.jpg,.jpeg,.webp" multiple onFiles={(f) => app.addQrFiles(f)}>Add files</FileButton>
            <FileButton directory onFiles={(f) => app.addQrFiles(f)}>Add folder</FileButton>
            {realQr.length > 0 && <button type="button" className={btnCls('ghost')} onClick={() => app.clearQrFiles()}>Clear</button>}
          </div>
        </DropZone>
      </div>
      <Toggle
        checked={s.redrawRaster}
        onChange={(v) => { set({ redrawRaster: v }); app.reprocessRaster(v) }}
        label="Redraw raster QR as vector"
        hint="PNG/JPG QRs are decoded, redrawn as vector modules and re-verified. SVG QRs are used as they are."
      />
      </>)}
      {sheet && (
        <div className="space-y-1">
          <Notice tone={matched === sheet.rows.length ? 'ok' : 'warn'}>
            {matched} of {sheet.rows.length} rows matched to a QR file.
            {derived.unmatchedFiles.filter((f) => !f.startsWith('__')).length > 0 && ` ${derived.unmatchedFiles.filter((f) => !f.startsWith('__')).length} QR files not used by any row.`}
          </Notice>
          {derived.ambiguousRows.length > 0 && <Notice>{derived.ambiguousRows.length} rows match more than one QR file.</Notice>}
        </div>
      )}
      {rebuilt.length > 0 && <Notice tone="info">{rebuilt.length} raster QR files redrawn as vector and verified.</Notice>}
      {failed.length > 0 && (
        <Notice tone="error">
          <div className="font-medium">{failed.length} QR files can't be used:</div>
          <ul className="mt-0.5 max-h-24 list-disc overflow-auto pl-4">
            {failed.slice(0, 50).map((q) => <li key={q.name}><span className="font-mono">{q.name}</span>: {q.error}</li>)}
          </ul>
        </Notice>
      )}
    </Section>
  )
}

function rangeHint(total: number, inRange: number, r: { from: number | null; to: number | null }) {
  if (r.from === null && r.to === null) return `All ${total} rows are exported. Leave a box empty for first / last.`
  if (r.from !== null && r.to !== null && r.from > r.to) return 'The first row is after the last row: nothing to export.'
  return `${inRange} of ${total} rows in range.`
}

function FontPicker({ script }: { script: FontScript }) {
  const s = useSettings((x) => x.s)
  const set = useSettings((x) => x.set)
  const custom = useApp((x) => x.customFonts[script])
  const setCustomFont = useApp((x) => x.setCustomFont)
  const removeCustomFont = useApp((x) => x.removeCustomFont)
  const drop = useFileDrop((f) => setCustomFont(script, f[0]), /\.(ttf|otf)$/i)
  const value = script === 'latin' ? s.nameFontLatin : s.nameFontKhmer
  const options = [
    ...NAME_FONTS[script].map((f) => ({ value: f.id, label: f.label })),
    ...(custom ? [{ value: CUSTOM_FONT[script], label: `Uploaded: ${custom}` }] : []),
  ]
  const label = script === 'latin' ? 'English' : 'Khmer'
  return (
    <div {...drop.props} className={`subcard transition-colors ${drop.over ? '!border-dashed !border-brand !bg-brand-50' : ''}`}>
      <Field label={`Merchant name font: ${label}`}>
        <Select value={value} onChange={(v) => set(script === 'latin' ? { nameFontLatin: v } : { nameFontKhmer: v })} options={options} />
      </Field>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <FileButton accept=".ttf,.otf,font/ttf,font/otf" onFiles={(f) => setCustomFont(script, f[0])}>
          <Upload className="h-3.5 w-3.5" />{custom ? 'Replace font' : 'Upload font'}
        </FileButton>
        {custom && <button type="button" className={btnCls('ghost')} onClick={() => removeCustomFont(script)}>Remove</button>}
        <span className="text-[11px] text-stone-400">{drop.over ? 'Drop the font file' : '.ttf / .otf, or drop it here'}</span>
      </div>
    </div>
  )
}

export function TypographyPanel() {
  const s = useSettings((x) => x.s)
  const set = useSettings((x) => x.set)
  const d = defaultSettings()
  const guide = { nameSizePt: d.nameSizePt, midSizePt: d.midSizePt, limits: d.limits, safeMarginPt: d.safeMarginPt, midPosition: d.midPosition, nameFontLatin: d.nameFontLatin, nameFontKhmer: d.nameFontKhmer }
  const typographyIsGuide = (Object.keys(guide) as (keyof typeof guide)[]).every((k) => JSON.stringify(s[k]) === JSON.stringify(guide[k]))
  const resetTypography = () => set(guide)
  return (
    <Section title="Typography" icon={<TypeIcon className="h-4 w-4" />} description="Fonts, sizes and limits for the merchant name and MID." defaultOpen={false} action={
      <button type="button" className={btnCls('secondary', 'sm')} disabled={typographyIsGuide} onClick={resetTypography} title="Reset fonts, sizes and limits to the guide values">
        <Reset className="h-3.5 w-3.5" />Reset
      </button>
    }>
      <FontPicker script="latin" />
      <FontPicker script="khmer" />
      <p className="text-[11px] leading-snug text-stone-500">English letters, digits and symbols use the English font; Khmer letters use the Khmer font. MID: Nunito Sans Regular. All text is outlined in the PDF.</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Name size"><NumberInput value={s.nameSizePt} onChange={(v) => set({ nameSizePt: v })} min={6} max={60} step={0.5} suffix="pt" /></Field>
        <Field label="MID size"><NumberInput value={s.midSizePt} onChange={(v) => set({ midSizePt: v })} min={4} max={30} step={0.5} suffix="pt" /></Field>
        <Field label="Name chars (max)"><NumberInput value={s.limits.nameChars} onChange={(v) => set({ limits: { ...s.limits, nameChars: Math.round(v) } })} min={1} max={NAME_CHARS_MAX} /></Field>
        <Field label="Name lines (max)"><NumberInput value={s.limits.nameLines} onChange={(v) => set({ limits: { ...s.limits, nameLines: Math.round(v) } })} min={1} max={4} /></Field>
        <Field label="MID max chars"><NumberInput value={s.limits.mid} onChange={(v) => set({ limits: { ...s.limits, mid: Math.round(v) } })} min={1} max={64} /></Field>
        <Field label="Side safe margin"><NumberInput value={s.safeMarginPt} onChange={(v) => set({ safeMarginPt: v })} min={0} max={100} step={0.5} suffix="pt" /></Field>
      </div>
      <Field label="MID position" group>
        <Segmented value={s.midPosition} onChange={(v) => set({ midPosition: v })} options={[{ value: 'follow', label: 'Follow name' }, { value: 'fixed', label: 'Fixed (2-line spot)' }]} />
      </Field>
      <p className="text-[11px] leading-snug text-stone-500">The whole name is limited to {s.limits.nameChars} characters (max {NAME_CHARS_MAX}, spaces included); extra words are dropped and flagged. It wraps by whole word at the safe width, max {s.limits.nameLines} lines. Text is never shrunk automatically.</p>
      <button type="button" className={`${btnCls('secondary')} w-full`} disabled={typographyIsGuide} onClick={resetTypography}><Reset className="h-4 w-4" />Reset to guide values</button>
    </Section>
  )
}

const POSITION_ROWS: { role: OffsetRole; label: string; hint?: string }[] = [
  { role: 'corner', label: 'Corner frame' },
  { role: 'qr', label: 'QR code', hint: 'The Bakong logo moves with the QR.' },
  { role: 'name', label: 'Merchant name' },
  { role: 'mid', label: 'MID', hint: 'With MID position “Follow name”, the MID also moves with the name.' },
]

/** Move the corner frame, QR, name and MID from their guide positions (mm or pt). */
export function PositionPanel() {
  const s = useSettings((x) => x.s)
  const set = useSettings((x) => x.set)
  const unit = s.positionUnit
  const toUnit = (pt: number) => (unit === 'mm' ? Math.round((pt / mmToPt(1)) * 100) / 100 : Math.round(pt * 100) / 100)
  const fromUnit = (v: number) => (unit === 'mm' ? mmToPt(v) : v)
  const lim = toUnit(layout.artboard.w)
  const isZero = (r: OffsetRole) => s.offsets[r].x === 0 && s.offsets[r].y === 0
  const allZero = POSITION_ROWS.every((r) => isZero(r.role))
  const setAxis = (r: OffsetRole, axis: 'x' | 'y', v: number) => set({ offsets: { ...s.offsets, [r]: { ...s.offsets[r], [axis]: fromUnit(v) } } })
  const resetOne = (r: OffsetRole) => set({ offsets: { ...s.offsets, [r]: { x: 0, y: 0 } } })
  const resetAll = () => set({ offsets: zeroOffsets() })
  return (
    <Section title="Position" icon={<Move className="h-4 w-4" />} description="Fine-tune where each element sits on the sticker." defaultOpen={false} action={
      <button type="button" className={btnCls('secondary', 'sm')} disabled={allZero} onClick={resetAll} title="Put every element back at its guide position">
        <Reset className="h-3.5 w-3.5" />Reset
      </button>
    }>
      <Field label="Unit" group>
        <Segmented value={unit} onChange={(v) => set({ positionUnit: v })} options={[{ value: 'mm', label: 'Millimetres (mm)' }, { value: 'pt', label: 'Points (pt)' }]} />
      </Field>
      <p className="text-[11px] leading-snug text-stone-500">Shift from the guide position. X: + moves right, − left. Y: + moves down, − up. 1 mm = 2.835 pt.</p>
      {POSITION_ROWS.map(({ role, label, hint }) => (
        <div key={role} className="subcard">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-stone-900">{label}</span>
            <button type="button" className={btnCls('ghost')} disabled={isZero(role)} onClick={() => resetOne(role)} aria-label={`Reset ${label} position`}>Reset</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="X (→)"><NumberInput ariaLabel={`${label} X`} value={toUnit(s.offsets[role].x)} onChange={(v) => setAxis(role, 'x', v)} min={-lim} max={lim} step={unit === 'mm' ? 0.5 : 1} suffix={unit} /></Field>
            <Field label="Y (↓)"><NumberInput ariaLabel={`${label} Y`} value={toUnit(s.offsets[role].y)} onChange={(v) => setAxis(role, 'y', v)} min={-lim} max={lim} step={unit === 'mm' ? 0.5 : 1} suffix={unit} /></Field>
          </div>
          {hint && <p className="mt-2 text-[11px] leading-snug text-stone-500">{hint}</p>}
        </div>
      ))}
      <button type="button" className={`${btnCls('secondary')} w-full`} disabled={allZero} onClick={resetAll}><Reset className="h-4 w-4" />Reset all positions</button>
    </Section>
  )
}

const PAGE_SIZES: { value: PageSizeName; label: string }[] = [
  { value: 'A3', label: 'A3 (297 × 420 mm)' },
  { value: 'A4', label: 'A4 (210 × 297 mm)' },
  { value: 'A5', label: 'A5 (148 × 210 mm)' },
  { value: 'A6', label: 'A6 (105 × 148 mm) · sticker size' },
  { value: 'A7', label: 'A7 (74 × 105 mm)' },
  { value: 'custom', label: 'Custom…' },
]

export function ExportPanel() {
  const s = useSettings((x) => x.s)
  const set = useSettings((x) => x.set)
  const engineOpts = { pageSize: s.pageSize, customMm: s.customMm, bleed: false, bleedMm: 0, cropMarks: false, edgeFill: 'auto' as const }
  const qrSize = qrPrintSize(pageGeometry(engineOpts).stickerScale)
  const inTabs = useContext(PlainSection)
  return (
    <Section title="Export" icon={<FileOut className="h-4 w-4" />} description="Page size, bleed and how the PDF is delivered.">
      <Field label="Page size" hint="Artwork scales uniformly to fit, never stretched.">
        <Select value={s.pageSize} onChange={(v) => set({ pageSize: v })} options={PAGE_SIZES} />
      </Field>
      {s.pageSize === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Width"><NumberInput value={s.customMm.w} onChange={(v) => set({ customMm: { ...s.customMm, w: v } })} min={20} max={1000} suffix="mm" /></Field>
          <Field label="Height"><NumberInput value={s.customMm.h} onChange={(v) => set({ customMm: { ...s.customMm, h: v } })} min={20} max={1000} suffix="mm" /></Field>
        </div>
      )}
      {qrSize.tooSmall ? (
        <Notice>{qrSize.message}</Notice>
      ) : (
        <p className="text-[11px] leading-snug text-stone-500">QR prints at {qrSize.qrMm.toFixed(1)} mm.</p>
      )}
      <Toggle
        checked={s.background}
        onChange={(v) => set({ background: v })}
        label="Include background"
        hint="Off: only the QR, logo, corner frame and text are printed (for pre-printed sticker stock)."
      />
      <Field label="Cut" group>
        <Segmented value={s.bleed ? 'bleed' : 'trim'} onChange={(v) => set({ bleed: v === 'bleed' })} options={[{ value: 'trim', label: 'No bleed (trimmed)' }, { value: 'bleed', label: 'With bleed' }]} />
      </Field>
      {s.bleed && (
        <div className="subcard space-y-3">
          {!s.bleedPerSide ? (
            <Field label="Bleed" hint="Default 3 mm. 0–10 mm.">
              <NumberInput value={s.bleedMm} onChange={(v) => set({ bleedMm: v })} min={0} max={10} step={0.5} suffix="mm" />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {(['top', 'right', 'bottom', 'left'] as const).map((k) => (
                <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
                  <NumberInput value={s.bleedSidesMm[k]} onChange={(v) => set({ bleedSidesMm: { ...s.bleedSidesMm, [k]: v } })} min={0} max={10} step={0.5} suffix="mm" />
                </Field>
              ))}
            </div>
          )}
          <Toggle checked={s.bleedPerSide} onChange={(v) => set({ bleedPerSide: v })} label="Different bleed per side" />
          <Field label="Bleed fill" group>
            <Segmented value={s.edgeFill} onChange={(v) => set({ edgeFill: v })} options={[{ value: 'auto', label: 'Extend edge colors' }, { value: 'color', label: 'One color' }]} />
          </Field>
          {s.edgeFill === 'color' && (
            <div className="flex items-center gap-2">
              <input type="color" value={s.edgeColor} onChange={(e) => set({ edgeColor: e.target.value })} className="h-9 w-12 cursor-pointer rounded-lg border border-stone-200 bg-white p-1" aria-label="Bleed color" />
              <span className="font-mono text-xs text-stone-600">{s.edgeColor}</span>
            </div>
          )}
        </div>
      )}
      <Toggle checked={s.cropMarks} onChange={(v) => set({ cropMarks: v })} label="Crop marks" hint="Adds a slug outside the bleed for the marks." />
      <Field label="Download as">
        <Select
          value={s.output}
          onChange={(v) => set({ output: v })}
          options={[
            { value: 'combined', label: 'One combined PDF' },
            { value: 'zip', label: 'ZIP of single PDFs (named by MID)' },
            { value: 'split', label: 'ZIP of PDFs split by page count' },
          ]}
        />
      </Field>
      {s.output === 'split' && (
        <Field label="Pages per file"><NumberInput value={s.splitEvery} onChange={(v) => set({ splitEvery: Math.round(v) })} min={1} max={10000} /></Field>
      )}
      {/* In the tabbed panel the Export tab ends with the download; Flow has its own Download node. */}
      {inTabs && (
        <div className="rounded-[14px] border border-brand/15 bg-brand-50/50 p-3.5">
          <div className="eyebrow mb-2.5 !text-brand">Get the PDF</div>
          <ExportBar stacked />
        </div>
      )}
    </Section>
  )
}
