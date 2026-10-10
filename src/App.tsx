import { useEffect } from 'react'
import { useUi } from './store/ui'
import { useSettings } from './store/settings'
import { UNITS, type Unit } from './config/units'
import { FlowView } from './ui/flow'
import { useApp } from './store/app'
import { SettingsTabs } from './ui/settingsTabs'
import { Preview, RowsTable } from './ui/preview'
import { ExportBar } from './ui/exportBar'
import { Shield } from './ui/icons'

function ViewSwitch() {
  const view = useUi((x) => x.view)
  const setView = useUi((x) => x.setView)
  return (
    <div className="inline-flex h-9 items-center gap-1 rounded-[10px] bg-stone-100 p-1 ring-1 ring-inset ring-stone-200/70" role="radiogroup" aria-label="Layout">
      {(['cards', 'flow'] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={view === v}
          onClick={() => setView(v)}
          className={`h-7 rounded-md px-2.5 text-xs font-semibold transition sm:px-3 ${view === v ? 'bg-white text-brand shadow-[0_1px_2px_rgba(28,25,23,0.10)] ring-1 ring-black/[0.04]' : 'text-stone-500 hover:text-stone-900'}`}
        >
          {v === 'cards' ? 'Cards' : 'Flow'}
        </button>
      ))}
    </div>
  )
}

/** App-wide length unit: every length field and readout follows it. */
function UnitSwitch() {
  const unit = useSettings((x) => x.s.unit)
  const set = useSettings((x) => x.set)
  return (
    <>
      <div className="hidden h-9 items-center gap-0.5 rounded-[10px] bg-stone-100 p-1 ring-1 ring-inset ring-stone-200/70 sm:inline-flex" role="radiogroup" aria-label="Units" title="Units for every length">
        {UNITS.map((u) => (
          <button key={u} type="button" role="radio" aria-checked={unit === u} onClick={() => set({ unit: u })}
            className={`h-7 min-w-9 rounded-md px-2 text-xs font-semibold transition ${unit === u ? 'bg-white text-brand shadow-[0_1px_2px_rgba(28,25,23,0.10)] ring-1 ring-black/[0.04]' : 'text-stone-500 hover:text-stone-900'}`}>
            {u}
          </button>
        ))}
      </div>
      <select
        aria-label="Units"
        value={unit}
        onChange={(e) => set({ unit: e.target.value as Unit })}
        className="h-9 rounded-[10px] bg-stone-100 px-2 text-xs font-semibold text-stone-700 ring-1 ring-inset ring-stone-200/70 sm:hidden"
      >
        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
      </select>
    </>
  )
}

export default function App() {
  const init = useApp((s) => s.init)
  const error = useApp((s) => s.error)
  const view = useUi((s) => s.view)
  const flow = view === 'flow'
  useEffect(() => {
    init()
  }, [init])

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-stone-900 md:h-screen">
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-stone-200/80 bg-white/90 px-4 backdrop-blur-md md:static md:h-16 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/artwork/khqr-logo.svg" alt="KHQR" className="h-5 w-auto shrink-0 min-[400px]:h-6 sm:h-7" />
          <div className="hidden min-w-0 border-l border-stone-200 pl-3 sm:block">
            <h1 className="truncate text-sm font-semibold leading-tight tracking-tight text-stone-900">Roll Sticker</h1>
            <p className="text-xs leading-tight text-stone-500">Vector PDF generator</p>
          </div>
          <span className="ml-1 hidden items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200/80 lg:inline-flex">
            <Shield className="h-3.5 w-3.5" /> Runs in your browser · nothing is uploaded
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <UnitSwitch />
          <ViewSwitch />
          <ExportBar />
        </div>
      </header>
      {error && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-5 py-2 text-xs text-red-800">
          <span>{error}</span>
          <button type="button" className="ml-auto font-semibold text-brand hover:underline" onClick={() => useApp.setState({ error: null })}>Dismiss</button>
        </div>
      )}
      {flow ? (
        <div className="h-[calc(100dvh-56px)] md:h-auto md:min-h-0 md:flex-1">
          <FlowView />
        </div>
      ) : (
      /* Phones: preview first, then settings, then the rows table. Desktop: settings on the left. */
      <div className="flex flex-col gap-4 p-4 md:grid md:min-h-0 md:flex-1 md:grid-cols-[392px_minmax(0,1fr)] md:grid-rows-[minmax(0,3fr)_minmax(220px,1.3fr)] md:gap-5 md:p-5">
        <main className="card order-1 min-h-0 overflow-hidden md:order-none md:col-start-2 md:row-start-1">
          <Preview />
        </main>
        <aside className="order-2 flex flex-col gap-3 md:order-none md:col-start-1 md:row-span-2 md:row-start-1 md:min-h-0">
          <SettingsTabs />
          <p className="shrink-0 px-1 text-[11px] leading-snug text-stone-400">
            Fonts are SIL Open Font License (Nunito Sans, Nokora and the other name fonts). Output PDFs contain vector paths only: no fonts, no images.
          </p>
        </aside>
        <section className="card order-3 max-h-[70vh] min-h-[240px] overflow-hidden md:order-none md:col-start-2 md:row-start-2 md:max-h-none md:min-h-0">
          <RowsTable />
        </section>
      </div>
      )}
    </div>
  )
}
