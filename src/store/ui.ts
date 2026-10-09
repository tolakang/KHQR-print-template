import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ViewMode = 'cards' | 'flow'

interface UiState {
  view: ViewMode
  /** Node positions in the flow view (by node id); missing ids use the default layout. */
  positions: Record<string, { x: number; y: number }>
  setView: (v: ViewMode) => void
  setPosition: (id: string, p: { x: number; y: number }) => void
  resetLayout: () => void
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      view: 'cards',
      positions: {},
      setView: (view) => set({ view }),
      setPosition: (id, p) => set((st) => ({ positions: { ...st.positions, [id]: p } })),
      resetLayout: () => set({ positions: {} }),
    }),
    {
      name: 'khqr-ui',
      version: 2,
      // v2 removed the Sticker node and moved the Preview: start from the new default layout.
      migrate: (old) => ({ ...(old as UiState), positions: {} }),
    },
  ),
)
