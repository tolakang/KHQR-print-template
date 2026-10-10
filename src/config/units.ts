/** Display units for lengths. Values are stored in pt (bleed and custom page size in mm). */
export type Unit = 'mm' | 'pt' | 'px'

export const UNITS: Unit[] = ['mm', 'pt', 'px']

/** pt per unit: 1 mm = 72 / 25.4 pt; 1 px = 0.75 pt (CSS px, 96 per inch). */
export const PT_PER: Record<Unit, number> = { mm: 72 / 25.4, pt: 1, px: 0.75 }

/** Arrow-key step of a length field in each unit. */
export const UNIT_STEP: Record<Unit, number> = { mm: 0.5, pt: 1, px: 1 }

export const ptTo = (pt: number, u: Unit) => pt / PT_PER[u]
export const toPt = (v: number, u: Unit) => v * PT_PER[u]
/** Two decimals, no trailing zeros. */
export const round2 = (v: number) => Math.round(v * 100) / 100
/** "12.5 mm" from a length in pt. */
export const fmtLen = (pt: number, u: Unit, digits = 2) => `${Number(ptTo(pt, u).toFixed(digits))} ${u}`
