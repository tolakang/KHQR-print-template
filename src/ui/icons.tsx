/** Small inline stroke icons (24 × 24 grid, currentColor). */
import type { ReactNode } from 'react'

function Icon({ children, className = 'h-4 w-4' }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {children}
    </svg>
  )
}

type P = { className?: string }
export const ChevronDown = (p: P) => <Icon {...p}><path d="m6 9 6 6 6-6" /></Icon>
export const ChevronLeft = (p: P) => <Icon {...p}><path d="m15 18-6-6 6-6" /></Icon>
export const ChevronRight = (p: P) => <Icon {...p}><path d="m9 18 6-6-6-6" /></Icon>
export const Download = (p: P) => <Icon {...p}><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></Icon>
export const Printer = (p: P) => <Icon {...p}><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v7H6z" /></Icon>
export const Upload = (p: P) => <Icon {...p}><path d="M12 21V9m0 0-4 4m4-4 4 4M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2" /></Icon>
export const Eye = (p: P) => <Icon {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></Icon>
export const EyeOff = (p: P) => <Icon {...p}><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.2 3.1M6.6 6.6A17.6 17.6 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20" /></Icon>
export const Shield = (p: P) => <Icon {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></Icon>
export const Reset = (p: P) => <Icon {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></Icon>
export const Image = (p: P) => <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></Icon>
export const Table = (p: P) => <Icon {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" /></Icon>
export const Type = (p: P) => <Icon {...p}><path d="M4 7V4h16v3M9 20h6M12 4v16" /></Icon>
export const FileOut = (p: P) => <Icon {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M12 18v-6m0 0-3 3m3-3 3 3" /></Icon>
export const Alert = (p: P) => <Icon {...p}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></Icon>
export const Check = (p: P) => <Icon {...p}><path d="M20 6 9 17l-5-5" /></Icon>
export const Minus = (p: P) => <Icon {...p}><path d="M5 12h14" /></Icon>
export const Plus = (p: P) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>
export const Move = (p: P) => <Icon {...p}><path d="M12 2v20M2 12h20M12 2l-3 3m3-3 3 3M12 22l-3-3m3 3 3-3M2 12l3-3m-3 3 3 3M22 12l-3-3m3 3-3 3" /></Icon>
export const Maximize = (p: P) => <Icon {...p}><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></Icon>
