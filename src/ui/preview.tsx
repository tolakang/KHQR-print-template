import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp, deriveRows } from '../store/app'
import { useSettings } from '../store/settings'
import { charCount, normalizeName } from '../core/text/wrap'
import { engine } from '../engine/client'
import type { PreviewResult, RowInput } from '../engine/types'
import { btnCls } from './controls'

const PT_TO_MM = 25.4 / 72

export function useRows() {
  const sheets = useApp((s) => s.sheets)
  const sheetIndex = useApp((s) => s.sheetIndex)
  const cols = useApp((s) => s.cols)
  const qrFiles = useApp((s) => s.qrFiles)
  return useMemo(() => deriveRows({ sheets, sheetIndex, cols, qrFiles }), [sheets, sheetIndex, cols, qrFiles])
}

export function Preview() {
  const ready = useApp((s) => s.ready)
  const assets = useApp((s) => s.assets)
  const selected = useApp((s) => s.selected)
  const select = useApp((s) => s.select)
  const settings = useSettings((s) => s.s)
  const { rows } = useRows()
  const idx = Math.min(Math.max(0, selected), rows.length - 1)
  const row: RowInput | undefined = rows[idx]
  const [res, setRes] = useState<PreviewResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [guides, setGuides] = useState(true)
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
  }, [ready, row, settings, assets])

  const svg = useMemo(() => (res && !guides ? res.svg.replace(/<g class="guides">[\s\S]*?<\/g><\/svg>$/, '</svg>') : res?.svg), [res, guides])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-white px-4 py-2">
        <div className="flex items-center gap-1">
          <button type="button" className={btnCls('ghost')} disabled={idx <= 0} onClick={() => select(idx - 1)} aria-label="Previous row">◀</button>
          <span className="min-w-28 text-center text-xs tabular-nums text-stone-600">
            {row && row.index >= 0 ? <>Row {idx + 1} of {rows.length} <span className="text-stone-400">(Excel {row.excelRow})</span></> : 'Sample sticker'}
          </span>
          <button type="button" className={btnCls('ghost')} disabled={idx >= rows.length - 1} onClick={() => select(idx + 1)} aria-label="Next row">▶</button>
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-stone-500">
          {pending && res && <span className="animate-pulse text-stone-400">Updating…</span>}
          {res && (
            <span className="tabular-nums">
              {res.width.toFixed(2)} × {res.height.toFixed(2)} pt · {(res.width * PT_TO_MM).toFixed(1)} × {(res.height * PT_TO_MM).toFixed(1)} mm
            </span>
          )}
          <label className="flex cursor-pointer items-center gap-1">
            <input type="checkbox" className="accent-red-700" checked={guides} onChange={(e) => setGuides(e.target.checked)} /> Guides
          </label>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[radial-gradient(circle,#d6d3d1_1px,transparent_1px)] bg-[length:14px_14px] p-6">
        {!ready && <div className="text-sm text-stone-500">Loading fonts and engine…</div>}
        {err && <div className="text-sm text-red-700">{err}</div>}
        {svg && (
          <div
            className="preview-page h-full max-h-[78vh] w-auto shadow-[0_1px_2px_rgba(0,0,0,.08),0_8px_28px_rgba(0,0,0,.14)] [&>svg]:block [&>svg]:h-full [&>svg]:w-auto"
            style={{ aspectRatio: `${res!.width} / ${res!.height}` }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </div>
      {res && (res.warnings.length > 0 || guides) && (
        <div className="border-t border-stone-200 bg-white px-4 py-2 text-xs">
          {res.warnings.length > 0 ? (
            <ul className="space-y-0.5 text-amber-800">
              {res.warnings.map((w, i) => <li key={i}>⚠ {w.message}</li>)}
            </ul>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-stone-500">
              <span><span className="inline-block h-0.5 w-4 align-middle bg-sky-600" /> Trim</span>
              <span><span className="inline-block h-0.5 w-4 align-middle border-t border-dashed border-rose-600" /> Bleed</span>
              <span><span className="inline-block h-0.5 w-4 align-middle border-t border-dashed border-green-600" /> Text safe width</span>
              <span className="text-emerald-700">✓ No warnings for this sticker</span>
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
      <div className="p-4 text-xs text-stone-500">
        Load an Excel file and QR files in the <b>Data</b> panel. Until then the preview shows a sample sticker.
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
      <div className="flex items-center gap-3 border-b border-stone-200 px-4 py-1.5 text-xs">
        <span className="font-semibold text-stone-700">{rows.length} rows</span>
        <span className={issueCount ? 'text-amber-700' : 'text-emerald-700'}>{issueCount ? `${issueCount} with issues` : 'all rows ready'}</span>
        <label className="ml-auto flex cursor-pointer items-center gap-1 text-stone-600">
          <input type="checkbox" className="accent-red-700" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} /> Issues only
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 bg-stone-100 text-left text-stone-600">
            <tr>
              <th className="px-3 py-1.5 font-medium">#</th>
              <th className="px-3 py-1.5 font-medium">Merchant name</th>
              <th className="px-3 py-1.5 font-medium">MID</th>
              <th className="px-3 py-1.5 font-medium">QR file</th>
              <th className="px-3 py-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, LIMIT).map(({ r, q, issues }) => (
              <tr
                key={r.index}
                onClick={() => select(r.index)}
                className={`cursor-pointer border-b border-stone-100 ${selected === r.index ? 'bg-red-50' : 'hover:bg-stone-50'} ${inRange(r.excelRow) ? '' : 'opacity-40'}`}
                title={inRange(r.excelRow) ? undefined : 'Outside the export range'}
              >
                <td className="px-3 py-1 tabular-nums text-stone-400">{r.excelRow}</td>
                <td className="max-w-64 truncate px-3 py-1 text-stone-900" title={r.name}>{r.name || <i className="text-stone-400">empty</i>}</td>
                <td className="px-3 py-1 font-mono tabular-nums text-stone-700">{r.mid}</td>
                <td className="max-w-48 truncate px-3 py-1 text-stone-600" title={r.qrFile}>
                  {r.qrFile ?? <span className="text-stone-400">—</span>}
                  {q?.method === 'traced' || q?.method === 'rebuilt' ? <span className="ml-1 rounded bg-sky-100 px-1 text-[10px] text-sky-800">redrawn</span> : null}
                </td>
                <td className="px-3 py-1">
                  {issues.length ? <span className="text-amber-700">{issues.join(' · ')}</span> : <span className="text-emerald-700">Ready</span>}
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
