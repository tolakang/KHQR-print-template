import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp, deriveRows } from '../store/app'
import { useSettings } from '../store/settings'
import { charCount, normalizeName } from '../core/text/wrap'
import { engine } from '../engine/client'
import type { PreviewResult, RowInput } from '../engine/types'
import { ChevronLeft, ChevronRight, Alert, Check, Minus, Plus, Maximize } from './icons'

const PT_TO_MM = 25.4 / 72

export function useRows() {
  const sheets = useApp((s) => s.sheets)
  const sheetIndex = useApp((s) => s.sheetIndex)
  const cols = useApp((s) => s.cols)
  const qrFiles = useApp((s) => s.qrFiles)
  return useMemo(() => deriveRows({ sheets, sheetIndex, cols, qrFiles }), [sheets, sheetIndex, cols, qrFiles])
}

const ACTUAL = 96 / 72
const ZOOM_STEP = 1.25
/** Never smaller than 50 % of actual size (fit included); scroll instead. */
const MIN_ZOOM = 0.5 * ACTUAL
const MAX_ZOOM = 8
const zoomBtn = 'grid h-8 w-8 place-items-center text-stone-600 transition hover:bg-brand-50 hover:text-brand first:rounded-l-lg'

export function Preview() {
  const ready = useApp((s) => s.ready)
  const assets = useApp((s) => s.assets)
  const customFonts = useApp((s) => s.customFonts)
  const selected = useApp((s) => s.selected)
  const select = useApp((s) => s.select)
  const source = useApp((s) => s.source)
  const settings = useSettings((s) => s.s)
  const { rows } = useRows()
  const idx = Math.min(Math.max(0, selected), rows.length - 1)
  const row: RowInput | undefined = rows[idx]
  const [res, setRes] = useState<PreviewResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  // Off by default so nothing is drawn around the artboard unless asked for.
  const [guides, setGuides] = useState(false)
  const [pending, setPending] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    if (!ready || !row) return
    const n = ++seq.current
    setPending(true)
    const t = setTimeout(() => {
      engine()
        .preview(row, settings)
        .then((r) => { if (n === seq.current) { setRes(r); setErr(null) } })
        .catch((e) => { if (n === seq.current) setErr((e as Error).message) })
        .finally(() => { if (n === seq.current) setPending(false) })
    }, 60)
    return () => clearTimeout(t)
  }, [ready, row, settings, assets, customFonts])

  // Zoom: 'fit' follows the window size; a number is CSS px per pt (ACTUAL = 100 %).
  const [zoom, setZoom] = useState<'fit' | number>('fit')
  const viewRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setView({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const pad = view.w < 640 ? 32 : 64
  const fit = res && view.w > 0 ? Math.max(MIN_ZOOM, Math.min((view.w - pad) / res.width, (view.h - pad - 40) / res.height)) : ACTUAL
  const scale = zoom === 'fit' ? fit : zoom
  // Drag to move around a preview that is larger than its area.
  const canPan = !!res && (res.width * scale + pad > view.w + 1 || res.height * scale + pad + 40 > view.h + 1)
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const [panning, setPanning] = useState(false)
  const zoomBy = (k: number) => setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale * k)))
  // Ctrl / Cmd + wheel (and trackpad pinch) zooms the preview instead of the page.
  const zoomRef = useRef(zoomBy)
  useEffect(() => {
    zoomRef.current = zoomBy
  })
  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      zoomRef.current(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const svg = useMemo(() => (res && !guides ? res.svg.replace(/<g class="guides">[\s\S]*?<\/g><\/svg>$/, '</svg>') : res?.svg), [res, guides])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4 sm:px-6 md:pl-3">
        <div className="flex items-center rounded-lg border border-stone-200 bg-white shadow-xs">
          <button type="button" className="grid h-8 w-8 place-items-center rounded-l-lg text-brand transition hover:bg-brand-50 disabled:text-stone-300 disabled:hover:bg-transparent" disabled={idx <= 0} onClick={() => select(idx - 1)} aria-label="Previous row">
            <ChevronLeft />
          </button>
          <span className="min-w-32 border-x border-stone-200 px-2 text-center text-xs font-medium tabular-nums text-stone-700">
            {row && row.index >= 0 ? <>Row {idx + 1} of {rows.length} <span className="font-normal text-stone-400">({source === 'pdf' ? 'Page' : 'Excel'} {row.excelRow})</span></> : 'Sample sticker'}
          </span>
          <button type="button" className="grid h-8 w-8 place-items-center rounded-r-lg text-brand transition hover:bg-brand-50 disabled:text-stone-300 disabled:hover:bg-transparent" disabled={idx >= rows.length - 1} onClick={() => select(idx + 1)} aria-label="Next row">
            <ChevronRight />
          </button>
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-stone-500">
          {pending && res && <span className="animate-pulse text-stone-400">Updating…</span>}
          {res && (
            <span className="hidden rounded-full border border-stone-200 bg-white px-2.5 py-1 font-medium tabular-nums text-stone-600 sm:inline">
              {res.width.toFixed(2)} × {res.height.toFixed(2)} pt · {(res.width * PT_TO_MM).toFixed(1)} × {(res.height * PT_TO_MM).toFixed(1)} mm
            </span>
          )}
          <label className="flex cursor-pointer items-center gap-2 font-medium text-stone-700">
            <input type="checkbox" className="peer sr-only" checked={guides} onChange={(e) => setGuides(e.target.checked)} />
            <span aria-hidden className="relative h-4 w-7 rounded-full bg-stone-300 transition-colors peer-checked:bg-brand after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-3" />
            Guides
          </label>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
      <div
        ref={viewRef}
        className={`nodrag nopan absolute inset-0 overflow-auto bg-canvas ${canPan ? (panning ? 'cursor-grabbing select-none' : 'cursor-grab') : ''}`}
        onPointerDown={(e) => {
          const el = viewRef.current
          // Mouse / pen drag pans a zoomed preview; touch keeps native scrolling.
          if (!el || !canPan || e.button !== 0 || e.pointerType === 'touch') return
          pan.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }
          el.setPointerCapture(e.pointerId)
          setPanning(true)
        }}
        onPointerMove={(e) => {
          const el = viewRef.current
          if (!el || !pan.current) return
          el.scrollLeft = pan.current.left - (e.clientX - pan.current.x)
          el.scrollTop = pan.current.top - (e.clientY - pan.current.y)
        }}
        onPointerUp={() => { pan.current = null; setPanning(false) }}
        onPointerCancel={() => { pan.current = null; setPanning(false) }}
      >
        <div className="flex px-4 pb-14 pt-4 sm:px-8 sm:pt-8" style={{ minWidth: '100%', minHeight: '100%', width: 'max-content' }}>
          {!ready && <div className="m-auto text-sm text-stone-500">Loading fonts and engine…</div>}
          {err && <div className="m-auto text-sm text-brand">{err}</div>}
          {svg && res && (
            <div
              className="preview-page m-auto shrink-0 rounded-[2px] bg-white shadow-[0_1px_3px_rgba(0,0,0,.06),0_12px_32px_-4px_rgba(0,0,0,.18)] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
              style={{ width: res.width * scale, height: res.height * scale }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )}
        </div>
      </div>
        {res && (
          <div className="absolute bottom-3 right-3 flex items-center rounded-lg border border-stone-200 bg-white/95 shadow-md backdrop-blur" role="group" aria-label="Zoom">
            <button type="button" className={zoomBtn} onClick={() => zoomBy(1 / ZOOM_STEP)} aria-label="Zoom out" title="Zoom out (Ctrl + scroll)"><Minus /></button>
            <button type="button" className="min-w-14 border-x border-stone-200 px-2 py-1.5 text-xs font-semibold tabular-nums text-stone-700 hover:text-brand" onClick={() => setZoom(ACTUAL)} title="Actual size (100%)">
              {Math.round((scale / ACTUAL) * 100)}%
            </button>
            <button type="button" className={zoomBtn} onClick={() => zoomBy(ZOOM_STEP)} aria-label="Zoom in" title="Zoom in (Ctrl + scroll)"><Plus /></button>
            <button type="button" className={`flex h-8 items-center gap-1 rounded-r-lg border-l border-stone-200 px-2.5 text-xs font-semibold transition ${zoom === 'fit' ? 'bg-brand text-white' : 'text-stone-600 hover:bg-brand-50 hover:text-brand'}`} onClick={() => setZoom('fit')} aria-pressed={zoom === 'fit'} title="Fit to the window">
              <Maximize className="h-3.5 w-3.5" />Fit
            </button>
          </div>
        )}
      </div>
      {res && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 pb-3 text-xs sm:px-6 md:pl-3">
          {res.warnings.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {res.warnings.map((w, i) => (
                <li key={i} className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-900">
                  <Alert className="h-3.5 w-3.5 shrink-0 text-amber-600" />{w.message}
                </li>
              ))}
            </ul>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800">
              <Check className="h-3.5 w-3.5" /> No warnings for this sticker
            </span>
          )}
          {guides && (
            <div className="ml-auto flex flex-wrap gap-x-3 gap-y-1 text-stone-500">
              <span><span className="inline-block h-0.5 w-4 bg-sky-600 align-middle" /> Trim</span>
              <span><span className="inline-block h-0.5 w-4 border-t border-dashed border-rose-600 align-middle" /> Bleed</span>
              <span><span className="inline-block h-0.5 w-4 border-t border-dashed border-green-600 align-middle" /> Text safe width</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function RowsTable() {
  const { rows } = useRows()
  const qrFiles = useApp((s) => s.qrFiles)
  const selected = useApp((s) => s.selected)
  const select = useApp((s) => s.select)
  const hasSheet = useApp((s) => s.sheets.length > 0)
  const s = useSettings((x) => x.s)
  const range = useApp((x) => x.range)
  const [issuesOnly, setIssuesOnly] = useState(false)
  const qrMap = useMemo(() => new Map(qrFiles.map((q) => [q.name, q])), [qrFiles])
  const LIMIT = 400

  if (!hasSheet) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-stone-500">
        <p>Load an Excel file and QR files in the <b className="text-stone-700">Data</b> panel.<br />Until then the preview shows a sample sticker.</p>
      </div>
    )
  }
  const decorated = rows.map((r) => {
    const q = r.qrFile ? qrMap.get(r.qrFile) : undefined
    const issues: string[] = []
    if (!q) issues.push('No QR')
    else if (!q.ok) issues.push('QR unusable')
    if (!r.name.trim()) issues.push('No name')
    else if (charCount(normalizeName(r.name)) > s.limits.nameChars) issues.push('Name trimmed')
    if (!r.mid.trim()) issues.push('No MID')
    if ([...r.mid].length > s.limits.mid) issues.push('MID trimmed')
    if (r.midImprecise) issues.push('MID precision')
    return { r, q, issues }
  })
  const inRange = (n: number) => (range.from === null || n >= range.from) && (range.to === null || n <= range.to)
  const list = issuesOnly ? decorated.filter((d) => d.issues.length) : decorated
  const issueCount = decorated.filter((d) => d.issues.length).length
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-stone-200 px-4 py-2 text-xs">
        <span className="text-sm font-semibold text-stone-900">{rows.length} rows</span>
        <span className={`rounded-full px-2 py-0.5 font-medium ${issueCount ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>{issueCount ? `${issueCount} with issues` : 'All rows ready'}</span>
        <label className="ml-auto flex cursor-pointer items-center gap-2 font-medium text-stone-700">
          <input type="checkbox" className="peer sr-only" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} />
          <span aria-hidden className="relative h-4 w-7 rounded-full bg-stone-300 transition-colors peer-checked:bg-brand after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-3" />
          Issues only
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-500 shadow-[inset_0_-1px_0_#e7e5e4]">
            <tr>
              <th className="py-2 pl-4 pr-3 font-semibold">#</th>
              <th className="px-3 py-2 font-semibold">Merchant name</th>
              <th className="px-3 py-2 font-semibold">MID</th>
              <th className="px-3 py-2 font-semibold">QR file</th>
              <th className="px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, LIMIT).map(({ r, q, issues }) => (
              <tr
                key={r.index}
                onClick={() => select(r.index)}
                className={`cursor-pointer border-b border-stone-100 transition-colors ${selected === r.index ? 'bg-brand-50 shadow-[inset_1px_0_0_var(--color-brand)]' : 'hover:bg-stone-50'} ${inRange(r.excelRow) ? '' : 'opacity-40'}`}
                title={inRange(r.excelRow) ? undefined : 'Outside the export range'}
              >
                <td className="py-1.5 pl-4 pr-3 tabular-nums text-stone-400">{r.excelRow}</td>
                <td className="max-w-64 truncate px-3 py-1.5 font-medium text-stone-900" title={r.name}>{r.name || <i className="text-stone-400">empty</i>}</td>
                <td className="px-3 py-1.5 font-mono tabular-nums text-stone-600">{r.mid}</td>
                <td className="max-w-48 truncate px-3 py-1.5 text-stone-600" title={r.qrFile}>
                  {r.qrFile ?? <span className="text-stone-400">—</span>}
                  {q?.method === 'traced' || q?.method === 'rebuilt' ? <span className="ml-1.5 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">redrawn</span> : null}
                </td>
                <td className="px-3 py-1.5">
                  {issues.length ? (
                    <span className="flex flex-wrap gap-1">
                      {issues.map((t) => <span key={t} className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">{t}</span>)}
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">Ready</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length > LIMIT && <div className="p-2 text-center text-xs text-stone-500">Showing first {LIMIT} of {list.length}. Rows in the export range are all exported.</div>}
      </div>
    </div>
  )
}
