import { useEffect } from 'react'
import { useApp } from './store/app'
import { AssetsPanel, DataPanel, TypographyPanel, ExportPanel } from './ui/panels'
import { Preview, RowsTable } from './ui/preview'
import { ExportBar } from './ui/exportBar'

export default function App() {
  const init = useApp((s) => s.init)
  const error = useApp((s) => s.error)
  useEffect(() => {
    init()
  }, [init])

  return (
    <div className="flex h-screen flex-col bg-stone-100 text-stone-900">
      <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded bg-red-700 text-[11px] font-black tracking-tight text-white">KH</div>
          <div>
            <h1 className="whitespace-nowrap text-sm font-semibold leading-tight">KHQR Roll Sticker</h1>
            <p className="hidden text-[11px] leading-tight text-stone-500 sm:block">Vector PDF generator · runs in your browser, nothing is uploaded</p>
          </div>
        </div>
        <div className="ml-auto">
          <ExportBar />
        </div>
      </header>
      {error && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-1.5 text-xs text-red-800">
          <span>{error}</span>
          <button type="button" className="ml-auto underline" onClick={() => useApp.setState({ error: null })}>Dismiss</button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="w-full shrink-0 overflow-y-auto border-r border-stone-200 bg-white md:w-[340px]">
          <AssetsPanel />
          <DataPanel />
          <TypographyPanel />
          <ExportPanel />
          <p className="px-4 py-3 text-[11px] leading-snug text-stone-400">
            Fonts: Nunito Sans, Nokora (SIL OFL). Output PDFs contain vector paths only: no fonts, no images.
          </p>
        </aside>
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-[420px] flex-[3] border-b border-stone-200">
            <Preview />
          </div>
          <div className="min-h-[180px] flex-[1.3] bg-white">
            <RowsTable />
          </div>
        </main>
      </div>
    </div>
  )
}
