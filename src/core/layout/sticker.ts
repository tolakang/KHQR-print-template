/**
 * Composes one sticker (everything except the background) in artboard
 * coordinates: A6, 297.6378 × 419.5276 pt (layout.json), origin top-left, y down.
 */
import { layout as defaultLayout, limits as defaultLimits, type Layout, type Limits } from '../../config'
import { parsePathData, transformPath, type Path } from '../geom/path'
import { translate } from '../geom/matrix'
import type { Scene, SceneItem, Warning, RGB } from '../scene'
import type { Offsets } from '../../engine/types'
import { outlineLine, type LoadedFont } from '../text/outline'
import { wrapName, formatMid } from '../text/wrap'
import { inkBBox, bboxToRect, placeScene, type Rect } from './place'

export interface StickerFonts {
  nameLatin: LoadedFont // Nunito Sans ExtraBold
  nameKhmer: LoadedFont // Nokora SemiBold
  midLatin: LoadedFont // Nunito Sans Regular
}

export interface StickerOptions {
  nameSizePt: number
  midSizePt: number
  limits: Limits
  safeMarginPt: number
  midPosition: 'follow' | 'fixed'
  textColor: RGB
  /** Draw the corner frame asset. */
  showCorner: boolean
  /** Shift of each element from its guide position (pt, x right, y down). */
  offsets?: Offsets
}

const NO_OFFSET = { x: 0, y: 0 }

export const defaultStickerOptions = (l: Layout = defaultLayout): StickerOptions => ({
  nameSizePt: l.name.sizePt,
  midSizePt: l.mid.sizePt,
  limits: { ...defaultLimits },
  safeMarginPt: l.safeMarginPt,
  midPosition: l.mid.position,
  textColor: [0, 0, 0],
  showCorner: true,
})

export interface StickerInput {
  name: unknown
  mid: unknown
  qr: Scene
  logo: Scene | null
  corner: Scene | null
}

export type Role = 'corner' | 'qr' | 'logo' | 'name' | 'mid'

export interface StickerResult {
  items: SceneItem[]
  /** Role of each item (same index as items). */
  roles: Role[]
  warnings: Warning[]
  nameLines: string[]
  midText: string
}

export function composeSticker(
  input: StickerInput,
  fonts: StickerFonts,
  opt: StickerOptions = defaultStickerOptions(),
  L: Layout = defaultLayout,
): StickerResult {
  const items: SceneItem[] = []
  const roles: Role[] = []
  const warnings: Warning[] = []
  const W = L.artboard.w
  const H = L.artboard.h
  const off = (r: keyof Offsets) => opt.offsets?.[r] ?? NO_OFFSET
  const moved = (b: { x: number; y: number; size: number }, r: keyof Offsets) => ({ ...b, x: b.x + off(r).x, y: b.y + off(r).y })
  const qrBox = moved(L.qr, 'qr')
  const offPage: string[] = []
  const checkOnPage = (label: string, x1: number, y1: number, x2: number, y2: number) => {
    const e = 0.01
    if (x1 < -e || y1 < -e || x2 > W + e || y2 > H + e) offPage.push(label)
  }
  const add = (role: Role, ...its: SceneItem[]) => {
    for (const it of its) {
      items.push(it)
      roles.push(role)
    }
  }

  // Corner frame (ink box → 154.3 pt square).
  if (input.corner && opt.showCorner) {
    const ink = inkBBox(input.corner.items)
    const box = moved(L.corner, 'corner')
    if (ink) add('corner', ...placeScene(input.corner, bboxToRect(ink), sq(box)).items)
    checkOnPage('corner frame', box.x, box.y, box.x + box.size, box.y + box.size)
  }

  // QR: measured on its dark modules (quiet zone excluded) → 134 pt.
  const qrInk = inkBBox(input.qr.items, true)
  if (!qrInk) {
    warnings.push({ code: 'qr-empty', message: 'QR file has no dark modules.' })
  } else {
    const ref = bboxToRect(qrInk)
    const aspect = ref.w / ref.h
    if (Math.abs(aspect - 1) > 0.02) {
      warnings.push({ code: 'qr-not-square', message: `QR is not square (${aspect.toFixed(2)}:1); fitted inside 134 × 134 pt.` })
    }
    const placed = placeScene(input.qr, ref, sq(qrBox))
    // Drop white/near-white fills that fall outside the 134 pt box (quiet-zone backgrounds),
    // so the quiet zone never paints over the background or corner frame.
    add('qr', ...placed.items.filter((it) => !(it.kind === 'fill' && isWhite(it.color) && outside(it, sq(qrBox)))))
    checkOnPage('QR', qrBox.x, qrBox.y, qrBox.x + qrBox.size, qrBox.y + qrBox.size)
  }

  // Logo: ink box → 32 pt, centered on the QR.
  if (input.logo) {
    const ink = inkBBox(input.logo.items)
    // Follows the QR so it stays centred on it.
    if (ink) add('logo', ...placeScene(input.logo, bboxToRect(ink), sq(moved(L.logo, 'qr'))).items)
    else warnings.push({ code: 'logo-empty', message: 'Logo file has nothing to draw.' })
  }

  // Merchant name.
  const nameFonts = { latin: fonts.nameLatin, khmer: fonts.nameKhmer }
  const safeW = W - 2 * opt.safeMarginPt
  const measure = (s: string) => outlineLine(s, nameFonts, opt.nameSizePt)
  const wrap = wrapName(input.name, opt.limits.nameChars, opt.limits.nameLines, (s) => measure(s).width <= safeW)
  if (!wrap.lines.length) warnings.push({ code: 'name-empty', message: 'Merchant name is empty.' })
  if (wrap.dropped) warnings.push({ code: 'name-dropped', message: `Name trimmed; not printed: “${wrap.droppedText}”.` })
  if (wrap.tooWide) warnings.push({ code: 'name-too-wide', message: 'A word is wider than the safe area; reduce the name size.' })

  const capName = (fonts.nameLatin.capHeight / fonts.nameLatin.upem) * opt.nameSizePt
  // Guide: the first line's cap top sits 38 pt below the QR, whatever the name size.
  const qrBottom = L.qr.y + L.qr.size
  const firstBaseline = qrBottom + L.name.gapFromQr + capName
  // The name offset is applied to the guide position (not to the moved QR).
  const nameOff = off('name')
  let baseline = firstBaseline + nameOff.y
  for (const line of wrap.lines) {
    const o = measure(line)
    if (o.missingGlyphs) warnings.push({ code: 'name-glyph', message: `Some characters in “${line}” are not in the fonts.` })
    const x = (W - o.width) / 2 + nameOff.x
    add('name', fill(transformPath(parsePathData(o.d), translate(x, baseline)), opt.textColor))
    checkOnPage('merchant name', x, baseline - capName, x + o.width, baseline)
    baseline += L.name.lineGap + capName
  }
  // "Follow name": the MID moves with the name.
  const lastBaseline = wrap.lines.length
    ? baseline - (L.name.lineGap + capName)
    : firstBaseline + nameOff.y

  // MID.
  const mid = formatMid(input.mid, opt.limits.mid)
  if (mid.trimmed) warnings.push({ code: 'mid-trimmed', message: `MID longer than ${opt.limits.mid} characters was trimmed.` })
  if (!mid.value) warnings.push({ code: 'mid-empty', message: 'MID is empty.' })
  if (typeof input.mid === 'number' && input.mid > Number.MAX_SAFE_INTEGER) {
    warnings.push({ code: 'mid-precision', message: 'MID was stored as a number in Excel and may have lost digits; format the column as Text.' })
  }
  const midText = mid.value ? L.mid.prefix + mid.value : ''
  if (midText) {
    const midFonts = { latin: fonts.midLatin, khmer: fonts.nameKhmer }
    const o = outlineLine(midText, midFonts, opt.midSizePt)
    const capMid = (fonts.midLatin.capHeight / fonts.midLatin.upem) * opt.midSizePt
    const anchor = opt.midPosition === 'fixed'
      ? firstBaseline + (opt.limits.nameLines - 1) * (L.name.lineGap + capName)
      : lastBaseline
    const midOff = off('mid')
    const midBaseline = anchor + L.mid.gapFromName + capMid + midOff.y
    const midX = (W - o.width) / 2 + midOff.x
    if (o.width > safeW) warnings.push({ code: 'mid-too-wide', message: 'MID is wider than the safe area.' })
    add('mid', fill(transformPath(parsePathData(o.d), translate(midX, midBaseline)), opt.textColor))
    checkOnPage('MID', midX, midBaseline - capMid, midX + o.width, midBaseline)
  }
  if (offPage.length) {
    const list = [...new Set(offPage)].join(', ')
    warnings.push({ code: 'off-page', message: `Moved past the sticker edge: ${list}. Check the position settings.` })
  }

  return { items, roles, warnings, nameLines: wrap.lines, midText }
}

const sq = (b: { x: number; y: number; size: number }): Rect => ({ x: b.x, y: b.y, w: b.size, h: b.size })
const fill = (path: Path, color: RGB): SceneItem =>
  ({ kind: 'fill', path, rule: 'nonzero', color, opacity: 1 })
const isWhite = (c: RGB) => c[0] > 0.94 && c[1] > 0.94 && c[2] > 0.94
function outside(it: SceneItem, r: Rect): boolean {
  if (it.kind !== 'fill') return false
  const b = inkBBox([it])
  if (!b) return false
  const e = 0.5
  return b.x1 < r.x - e || b.y1 < r.y - e || b.x2 > r.x + r.w + e || b.y2 > r.y + r.h + e
}
