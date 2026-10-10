import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { OffsetRole } from '../engine/types'

export type ViewMode = 'cards' | 'flow'
export type SettingsTab = 'assets' | 'data' | 'typography' | 'export'

interface UiState {
  view: ViewMode
  /** Node positions in the flow view (by node id); missing ids use the default layout. */
  positions: Record<string, { x: number; y: number }>
  /** Open tab of the settings panel (cards view). */
  settingsTab: SettingsTab
  /** Element picked in the preview's position bar, and whether the bar is expanded. */
  positionTab: OffsetRole
  positionOpen: boolean
  setPositionTab: (r: OffsetRole) => void
  setPositionOpen: (v: boolean) => void
  setView: (v: ViewMode) => void
  setSettingsTab: (t: SettingsTab) => void
  setPosition: (id: string, p: { x: number; y: number }) => void
  resetLayout: () => void
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      view: 'cards',
      positions: {},
      settingsTab: 'assets',
      positionTab: 'qr',
      positionOpen: true,
      setPositionTab: (positionTab) => set({ positionTab }),
      setPositionOpen: (positionOpen) => set({ positionOpen }),
      setView: (view) => set({ view }),
      setSettingsTab: (settingsTab) => set({ settingsTab }),
      setPosition: (id, p) => set((st) => ({ positions: { ...st.positions, [id]: p } })),
      resetLayout: () => set({ positions: {} }),
    }),
    {
      name: 'khqr-ui',
      version: 3,
      // v2 removed the Sticker node; v3 moved Export to the inputs and added Download: start from the new default layout.
      migrate: (old) => ({ ...(old as UiState), positions: {} }),
    },
  ),
)
