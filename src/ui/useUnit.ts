import { useSettings } from '../store/settings'
import { ptTo, toPt, round2, fmtLen, UNIT_STEP, type Unit } from '../config/units'

/** The app-wide length unit and converters for values stored in pt. */
export function useUnit() {
  const unit = useSettings((x) => x.s.unit) as Unit
  return {
    unit,
    step: UNIT_STEP[unit],
    /** pt → shown number (2 decimals). */
    show: (pt: number) => round2(ptTo(pt, unit)),
    /** shown number → pt. */
    parse: (v: number) => toPt(v, unit),
    /** "3 mm" style label from pt. */
    fmt: (pt: number, digits = 2) => fmtLen(pt, unit, digits),
  }
}
