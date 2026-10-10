import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { layout, limits, NAME_CHARS_MAX } from '../config'
import { DEFAULT_NAME_FONT } from '../config/fonts'
import type { Offsets, Settings } from '../engine/types'

export const zeroOffsets = (): Offsets => ({ corner: { x: 0, y: 0 }, qr: { x: 0, y: 0 }, name: { x: 0, y: 0 }, mid: { x: 0, y: 0 } })

export const defaultSettings = (): Settings => ({
  nameSizePt: layout.name.sizePt,
  midSizePt: layout.mid.sizePt,
  limits: { ...limits },
  safeMarginPt: layout.safeMarginPt,
  midPosition: 'follow',
  showCorner: true,
  showLogo: true,
  cornerRadiusPt: layout.corner.radius,
  cornerColor: '',
  offsets: zeroOffsets(),
  unit: 'mm',
  nameFontLatin: DEFAULT_NAME_FONT.latin,
  nameFontKhmer: DEFAULT_NAME_FONT.khmer,
  redrawRaster: true,
  background: true,
  pageSize: 'A6',
  customMm: { w: 105, h: 148 },
  bleed: false,
  bleedMm: layout.bleedMm,
  bleedPerSide: false,
  bleedSidesMm: { top: 3, right: 3, bottom: 3, left: 3 },
  cropMarks: false,
  edgeFill: 'auto',
  edgeColor: '#ffffff',
  output: 'combined',
  splitEvery: 100,
})

interface SettingsState {
  s: Settings
  set: (patch: Partial<Settings>) => void
  reset: () => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      s: defaultSettings(),
      set: (patch) => set((st) => ({ s: { ...st.s, ...patch } })),
      reset: () => set({ s: defaultSettings() }),
    }),
    {
      name: 'khqr-settings',
      version: 1,
      merge: (persisted, current) => {
        const p: Partial<Settings> = (persisted as Partial<SettingsState>)?.s ?? {}
        const d = defaultSettings()
        const lim = { ...d.limits, ...(p.limits ?? {}) }
        lim.nameChars = Math.min(NAME_CHARS_MAX, lim.nameChars)
        // Values that were the defaults of the old 317.5 × 427.5 pt design move to the A6 design.
        if (p.cornerRadiusPt === 20.6 || p.cornerRadiusPt === 13.25) p.cornerRadiusPt = d.cornerRadiusPt
        if (p.nameSizePt === 23) p.nameSizePt = d.nameSizePt
        if (p.midSizePt === 10) p.midSizePt = d.midSizePt
        if (p.safeMarginPt === 20) p.safeMarginPt = d.safeMarginPt
        // Defaults of the scaled (×0.981) A6 design move to the guide's exact sizes.
        if (p.cornerRadiusPt === 13.003) p.cornerRadiusPt = d.cornerRadiusPt
        if (p.nameSizePt === 22.571) p.nameSizePt = d.nameSizePt
        if (p.midSizePt === 9.814) p.midSizePt = d.midSizePt
        if (p.safeMarginPt === 12.656 || p.safeMarginPt === 10.0689) p.safeMarginPt = d.safeMarginPt
        // The position bar's own mm/pt switch became the app-wide unit.
        const old = (p as { positionUnit?: 'mm' | 'pt' }).positionUnit
        if (!p.unit && old) p.unit = old
        delete (p as { positionUnit?: unknown }).positionUnit
        if (p.pageSize === 'original') p.pageSize = 'A6'
        const offsets = { ...d.offsets, ...(p.offsets ?? {}) }
        return { ...current, s: { ...d, ...p, limits: lim, offsets } }
      },
    },
  ),
)
