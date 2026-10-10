/** One settings panel with a tab per section (cards view), instead of four stacked cards. */
import type { ReactNode } from 'react'
import { useUi, type SettingsTab } from '../store/ui'
import { useApp } from '../store/app'
import { AssetsPanel, DataPanel, TypographyPanel, PositionPanel, ExportPanel } from './panels'
import { PlainSection } from './sectionMode'
import { Image as ImageIcon, Table as TableIcon, Type as TypeIcon, FileOut, Move } from './icons'

const TABS: { id: SettingsTab; label: string; icon: ReactNode }[] = [
  { id: 'assets', label: 'Assets', icon: <ImageIcon className="h-4 w-4" /> },
  { id: 'data', label: 'Data', icon: <TableIcon className="h-4 w-4" /> },
  { id: 'typography', label: 'Typography', icon: <TypeIcon className="h-4 w-4" /> },
  { id: 'position', label: 'Position', icon: <Move className="h-4 w-4" /> },
  { id: 'export', label: 'Export', icon: <FileOut className="h-4 w-4" /> },
]

export function SettingsTabs() {
  const tab = useUi((x) => x.settingsTab)
  const setTab = useUi((x) => x.setSettingsTab)
  const rows = useApp((x) => x.sheets[x.sheetIndex]?.rows.length ?? 0)
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-black/[0.04] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-6px_rgba(0,0,0,0.10)] md:flex-1">
      <div className="grid shrink-0 grid-cols-5 border-b border-stone-200 px-1" role="tablist" aria-label="Settings">
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
              onClick={() => setTab(t.id)}
              className={`relative flex min-w-0 flex-col items-center gap-1 px-0 pb-2.5 pt-3 text-[11px] font-semibold tracking-tight transition-colors ${active ? 'text-brand' : 'text-stone-500 hover:text-stone-800'}`}
            >
              <span className={`grid h-8 w-8 place-items-center rounded-lg transition-colors ${active ? 'bg-brand-50' : ''}`}>{t.icon}</span>
              <span className="flex max-w-full items-center gap-0.5 whitespace-nowrap">
                {t.label}
                {t.id === 'data' && rows > 0 && <span className="rounded-full bg-brand-50 px-1 text-[10px] text-brand">{rows}</span>}
              </span>
              {active && <span aria-hidden className="absolute inset-x-2 -bottom-px h-px bg-brand" />}
            </button>
          )
        })}
      </div>
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto p-5">
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
