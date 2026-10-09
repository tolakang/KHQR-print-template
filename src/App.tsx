import { useEffect } from 'react'
import { useApp } from './store/app'
import { AssetsPanel, DataPanel, TypographyPanel, ExportPanel } from './ui/panels'
import { Preview, RowsTable } from './ui/preview'
import { ExportBar } from './ui/exportBar'
import { Shield } from './ui/icons'

export default function App() {
  const init = useApp((s) => s.init)
  const error = useApp((s) => s.error)
  useEffect(() => {
    init()
  }, [init])

  return (
    <div className="flex min-h-screen flex-col bg-stone-100 text-stone-900 md:h-screen">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-stone-200 bg-white/95 px-4 py-2.5 backdrop-blur md:static md:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand text-[13px] font-black tracking-tight text-white shadow-sm shadow-brand/30">KH</div>
          <div className="min-w-0">
            <h1 className="truncate text-sm sm:text-[15px] font-bold leading-tight tracking-tight">KHQR Roll Sticker</h1>
            <p className="hidden text-xs leading-tight text-stone-500 sm:block">Vector PDF generator</p>
          </div>
          <span className="ml-2 hidden items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800 lg:inline-flex">
            <Shield className="h-3.5 w-3.5" /> Runs in your browser · nothing is uploaded
          </span>
        </div>
        <div className="ml-auto">
          <ExportBar />
        </div>
      </header>
      {error && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-5 py-2 text-xs text-red-800">
          <span>{error}</span>
          <button type="button" className="ml-auto font-semibold text-brand hover:underline" onClick={() => useApp.setState({ error: null })}>Dismiss</button>
        </div>
      )}
      {/* Phones: preview first, then settings, then the rows table. Desktop: settings on the left. */}
      <div className="flex flex-col md:grid md:min-h-0 md:flex-1 md:grid-cols-[360px_minmax(0,1fr)] md:grid-rows-[minmax(0,3fr)_minmax(200px,1.3fr)]">
        <main className="order-1 h-[72vh] min-h-0 md:order-none md:col-start-2 md:row-start-1 md:h-auto">
          <Preview />
        </main>
        <aside className="order-2 border-t border-stone-200 bg-white md:order-none md:col-start-1 md:row-span-2 md:row-start-1 md:overflow-y-auto md:border-r md:border-t-0">
          <AssetsPanel />
          <DataPanel />
          <TypographyPanel />
          <ExportPanel />
          <p className="px-5 py-4 text-[11px] leading-snug text-stone-400">
            Fonts are SIL Open Font License (Nunito Sans, Nokora and the other name fonts). Output PDFs contain vector paths only: no fonts, no images.
          </p>
        </aside>
        <section className="order-3 max-h-[70vh] min-h-[240px] border-t border-stone-200 bg-white md:order-none md:col-start-2 md:row-start-2 md:max-h-none md:min-h-0">
          <RowsTable />
        </section>
      </div>
    </div>
  )
}
