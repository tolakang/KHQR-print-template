/** One settings panel with a tab per section (cards view), instead of separate cards. */
import type { ReactNode } from 'react'
import { useUi, type SettingsTab } from '../store/ui'
import { useApp } from '../store/app'
import { AssetsPanel, DataPanel, TypographyPanel, PositionPanel, ExportPanel } from './panels'
import { PlainSection } from './sectionMode'
import { Image as ImageIcon, Table as TableIcon, Type as TypeIcon, FileOut, Move } from './icons'

const TABS: { id: SettingsTab; label: string; icon: (active: boolean) => ReactNode }[] = [
  { id: 'assets', label: 'Assets', icon: (a) => <ImageIcon className="h-[18px] w-[18px]" strokeWidth={a ? 2 : 1.75} /> },
  { id: 'data', label: 'Data', icon: (a) => <TableIcon className="h-[18px] w-[18px]" strokeWidth={a ? 2 : 1.75} /> },
  { id: 'typography', label: 'Typography', icon: (a) => <TypeIcon className="h-[18px] w-[18px]" strokeWidth={a ? 2 : 1.75} /> },
  { id: 'position', label: 'Position', icon: (a) => <Move className="h-[18px] w-[18px]" strokeWidth={a ? 2 : 1.75} /> },
  { id: 'export', label: 'Export', icon: (a) => <FileOut className="h-[18px] w-[18px]" strokeWidth={a ? 2 : 1.75} /> },
]

export function SettingsTabs() {
  const tab = useUi((x) => x.settingsTab)
  const setTab = useUi((x) => x.setSettingsTab)
  const rows = useApp((x) => x.sheets[x.sheetIndex]?.rows.length ?? 0)
  return (
    <div className="card flex min-h-0 flex-col overflow-hidden md:flex-1">
      <div className="shrink-0 border-b border-stone-200/70 p-2">
        <div className="grid grid-cols-5 gap-1 rounded-xl bg-stone-100/80 p-1" role="tablist" aria-label="Settings">
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={active}
                aria-controls={`panel-${t.id}`}
                aria-label={t.id === 'data' && rows > 0 ? `Data, ${rows} rows` : t.label}
                onClick={() => setTab(t.id)}
                className={`relative flex min-w-0 flex-col items-center gap-1 rounded-lg px-0.5 pb-1.5 pt-2 text-[11px] font-semibold tracking-tight transition ${
                  active
                    ? 'bg-white text-brand shadow-[0_1px_2px_rgba(28,25,23,0.08),0_2px_8px_-2px_rgba(28,25,23,0.10)] ring-1 ring-black/[0.04]'
                    : 'text-stone-500 hover:bg-white/60 hover:text-stone-800'
                }`}
              >
                <span className="relative">
                  {t.icon(active)}
                  {t.id === 'data' && rows > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-brand px-1 text-center text-[9px] font-bold leading-4 text-white ring-2 ring-white">{rows}</span>
                  )}
                </span>
                <span className="max-w-full whitespace-nowrap">{t.label}</span>
              </button>
            )
          })}
        </div>
      </div>
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-5">
        <PlainSection.Provider value={true}>
          {tab === 'assets' && <AssetsPanel />}
          {tab === 'data' && <DataPanel />}
          {tab === 'typography' && <TypographyPanel />}
          {tab === 'position' && <PositionPanel />}
          {tab === 'export' && <ExportPanel />}
        </PlainSection.Provider>
      </div>
    </div>
  )
}
