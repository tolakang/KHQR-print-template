/**
 * Position bar at the bottom of the preview: pick an element (tab), then shift it
 * from its guide position in the app-wide unit. Values are stored in pt (settings.offsets).
 */
import { layout } from '../config'
import { useSettings, zeroOffsets } from '../store/settings'
import { useUi } from '../store/ui'
import type { OffsetRole } from '../engine/types'
import { LengthInput, btnCls } from './controls'
import { ChevronDown, Move, Reset } from './icons'

const ELEMENTS: { role: OffsetRole; label: string; short: string; hint?: string }[] = [
  { role: 'corner', label: 'Corner frame', short: 'Corner' },
  { role: 'qr', label: 'QR code', short: 'QR', hint: 'The Bakong logo moves with the QR.' },
  { role: 'name', label: 'Merchant name', short: 'Name', hint: 'With MID position “Follow name”, the MID moves too.' },
  { role: 'mid', label: 'MID', short: 'MID' },
]

export function PositionBar() {
  const s = useSettings((x) => x.s)
  const set = useSettings((x) => x.set)
  const role = useUi((x) => x.positionTab)
  const setRole = useUi((x) => x.setPositionTab)
  const open = useUi((x) => x.positionOpen)
  const setOpen = useUi((x) => x.setPositionOpen)
  const lim = layout.artboard.w
  const moved = (r: OffsetRole) => s.offsets[r].x !== 0 || s.offsets[r].y !== 0
  const movedCount = ELEMENTS.filter((e) => moved(e.role)).length
  const el = ELEMENTS.find((e) => e.role === role) ?? ELEMENTS[1]
  const setAxis = (axis: 'x' | 'y', pt: number) => set({ offsets: { ...s.offsets, [el.role]: { ...s.offsets[el.role], [axis]: pt } } })

  const tabs = (
    <div className="grid min-w-0 flex-1 grid-cols-4 gap-1 rounded-[10px] bg-stone-100 p-1 ring-1 ring-inset ring-stone-200/70 sm:min-w-[340px]" role="tablist" aria-label="Element">
      {ELEMENTS.map((e) => {
        const active = e.role === el.role
        return (
          <button key={e.role} type="button" role="tab" aria-selected={active} aria-label={e.label} title={e.hint} onClick={() => setRole(e.role)}
            className={`relative h-7 truncate rounded-md px-1.5 text-xs font-semibold transition ${active ? 'bg-white text-brand shadow-[0_1px_2px_rgba(28,25,23,0.10)] ring-1 ring-black/[0.04]' : 'text-stone-500 hover:text-stone-900'}`}>
            <span className="sm:hidden">{e.short}</span>
            <span className="hidden sm:inline">{e.label}</span>
            {moved(e.role) && <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-brand" />}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="nodrag border-t border-stone-200/70 bg-white px-3 py-2">
      {/* Row 1: title, element tabs, unit, reset all. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} title={open ? 'Hide position controls' : 'Show position controls'} className="flex h-8 shrink-0 items-center gap-2 text-xs font-semibold text-stone-800 hover:text-brand">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-brand-50 text-brand"><Move className="h-3.5 w-3.5" strokeWidth={2} /></span>
          Adjust position
          {movedCount > 0 && <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold leading-4 text-white">{movedCount}</span>}
          <ChevronDown className={`h-4 w-4 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">{tabs}</div>}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" className={btnCls('ghost')} disabled={movedCount === 0} onClick={() => set({ offsets: zeroOffsets() })} title="Put every element back at its guide position">
            <Reset className="h-3.5 w-3.5" />Reset all
          </button>
        </div>
      </div>
      {/* Row 2: X / Y for the picked element. */}
      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-2" role="tabpanel" aria-label={el.label}>
          <label className="flex min-w-32 flex-1 items-center gap-2 sm:max-w-48">
            <span className="shrink-0 text-xs font-semibold text-stone-500" title="+ moves right, − moves left">X →</span>
            <div className="flex-1"><LengthInput ariaLabel={`${el.label} X`} pt={s.offsets[el.role].x} onChange={(v) => setAxis('x', v)} minPt={-lim} maxPt={lim} /></div>
          </label>
          <label className="flex min-w-32 flex-1 items-center gap-2 sm:max-w-48">
            <span className="shrink-0 text-xs font-semibold text-stone-500" title="+ moves down, − moves up">Y ↓</span>
            <div className="flex-1"><LengthInput ariaLabel={`${el.label} Y`} pt={s.offsets[el.role].y} onChange={(v) => setAxis('y', v)} minPt={-lim} maxPt={lim} /></div>
          </label>
          <button type="button" className={btnCls('secondary', 'sm')} disabled={!moved(el.role)} onClick={() => set({ offsets: { ...s.offsets, [el.role]: { x: 0, y: 0 } } })} aria-label={`Reset ${el.label} position`}>
            <Reset className="h-3.5 w-3.5" />Reset
          </button>
          <span className="min-w-0 basis-full text-[11px] leading-snug text-stone-500 sm:flex-1 sm:basis-48">
            From the guide position: + right / down, − left / up.{el.hint ? ` ${el.hint}` : ''}
          </span>
        </div>
      )}
    </div>
  )
}
