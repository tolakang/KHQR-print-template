import { useRef, useState } from 'react'
import { engine } from '../engine/client'
import { useApp } from '../store/app'
import { useSettings } from '../store/settings'
import type { ExportResult } from '../engine/types'
import { useRows } from './preview'
import { rowsInRange } from '../core/excel/read'
import { btnCls } from './controls'

function saveBlob(bytes: Uint8Array, name: string, mime: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function printPdf(bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  const old = document.getElementById('print-frame')
  old?.remove()
  const f = document.createElement('iframe')
  f.id = 'print-frame'
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  f.src = url
  f.onload = () => {
    try {
      f.contentWindow?.focus()
      f.contentWindow?.print()
    } catch {
      window.open(url, '_blank')
    }
  }
  document.body.appendChild(f)
}

export function ExportBar() {
  const ready = useApp((s) => s.ready)
  const hasSheet = useApp((s) => s.sheets.length > 0)
  const s = useSettings((x) => x.s)
  const { rows: allRows } = useRows()
  const range = useApp((x) => x.range)
  const rows = hasSheet ? rowsInRange(allRows, range) : allRows
  const [busy, setBusy] = useState<null | { kind: 'download' | 'print'; done: number; total: number }>(null)
  const [result, setResult] = useState<ExportResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const cancelRef = useRef<() => void>(() => {})

  const run = async (kind: 'download' | 'print') => {
    setErr(null)
    setResult(null)
    setBusy({ kind, done: 0, total: rows.length })
    const settings = kind === 'print' ? { ...s, output: 'combined' as const } : s
    const job = engine().export(rows, settings, (done, total) => setBusy({ kind, done, total }))
    cancelRef.current = job.cancel
    try {
      const r = await job.promise
      setResult(r)
      if (!rows.length) {
        setErr('Nothing to export: no rows in the selected range.')
      } else if (!r.files.length) {
        setErr('Nothing to export: no row has a usable QR file.')
      } else if (kind === 'print') {
        printPdf(r.files[0].bytes)
      } else {
        for (const f of r.files) saveBlob(f.bytes, f.name, f.mime)
      }
    } catch (e) {
      const m = (e as Error).message
      if (m !== 'cancelled') setErr(m)
    } finally {
      setBusy(null)
    }
  }

  const label = hasSheet ? `${rows.length}${rows.length < allRows.length ? ` of ${allRows.length}` : ''} sticker${rows.length === 1 ? '' : 's'}` : 'sample'
  return (
    <div className="flex items-center gap-2">
      {busy ? (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={busy.done} aria-valuemax={busy.total}>
            <div className="h-full bg-red-700 transition-[width]" style={{ width: `${(100 * busy.done) / Math.max(1, busy.total)}%` }} />
          </div>
          <span className="text-xs tabular-nums text-stone-600">{busy.done}/{busy.total}</span>
          <button type="button" className={btnCls('ghost')} onClick={() => cancelRef.current()}>Cancel</button>
        </div>
      ) : (
        <>
          {result && (
            <span className="hidden text-xs text-stone-500 lg:inline">
              {result.pages} pages in {(result.ms / 1000).toFixed(1)} s
              {result.skipped.length > 0 && <span className="text-amber-700"> · {result.skipped.length} skipped (no QR)</span>}
            </span>
          )}
          {err && <span className="text-xs text-red-700">{err}</span>}
          <button type="button" className={btnCls('secondary')} disabled={!ready} onClick={() => run('print')} title="Opens the browser print dialog">Print…</button>
          <button type="button" className={btnCls('primary')} disabled={!ready} onClick={() => run('download')}>
            Download<span className="hidden sm:inline"> PDF</span> <span className="hidden font-normal opacity-80 sm:inline">({label})</span>
          </button>
        </>
      )}
    </div>
  )
}
