import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { layout, limits, NAME_CHARS_MAX } from '../config'
import { DEFAULT_NAME_FONT } from '../config/fonts'
import type { Settings } from '../engine/types'

export const defaultSettings = (): Settings => ({
  nameSizePt: layout.name.sizePt,
  midSizePt: layout.mid.sizePt,
  limits: { ...limits },
  safeMarginPt: layout.safeMarginPt,
  midPosition: 'follow',
  showCorner: true,
  showLogo: true,
  nameFontLatin: DEFAULT_NAME_FONT.latin,
  nameFontKhmer: DEFAULT_NAME_FONT.khmer,
  redrawRaster: true,
  background: true,
  pageSize: 'original',
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
        return { ...current, s: { ...d, ...p, limits: lim } }
      },
    },
  ),
)
