/**
 * Composes one sticker (everything except the background) in artboard
 * coordinates: 317.5 × 427.5 pt, origin top-left, y down.
 */
import { layout as defaultLayout, limits as defaultLimits, type Layout, type Limits } from '../../config'
import { parsePathData, transformPath, type Path } from '../geom/path'
import { translate } from '../geom/matrix'
import type { Scene, SceneItem, Warning, RGB } from '../scene'
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
}

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
  const add = (role: Role, ...its: SceneItem[]) => {
    for (const it of its) {
      items.push(it)
      roles.push(role)
    }
  }

  // Corner frame (ink box → 154.3 pt square).
  if (input.corner && opt.showCorner) {
    const ink = inkBBox(input.corner.items)
    if (ink) add('corner', ...placeScene(input.corner, bboxToRect(ink), sq(L.corner)).items)
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
    const placed = placeScene(input.qr, ref, sq(L.qr))
    // Drop white/near-white fills that fall outside the 134 pt box (quiet-zone backgrounds),
    // so the quiet zone never paints over the background or corner frame.
    add('qr', ...placed.items.filter((it) => !(it.kind === 'fill' && isWhite(it.color) && outside(it, sq(L.qr)))))
  }

  // Logo: ink box → 32 pt, centered on the QR.
  if (input.logo) {
    const ink = inkBBox(input.logo.items)
    if (ink) add('logo', ...placeScene(input.logo, bboxToRect(ink), sq(L.logo)).items)
    else warnings.push({ code: 'logo-empty', message: 'Logo file has nothing to draw.' })
  }

  // Merchant name.
  const nameFonts = { latin: fonts.nameLatin, khmer: fonts.nameKhmer }
  const safeW = W - 2 * opt.safeMarginPt
  const measure = (s: string) => outlineLine(s, nameFonts, opt.nameSizePt)
  const wrap = wrapName(input.name, opt.limits.nameChars, opt.limits.nameLines, (s) => measure(s).width <= safeW)
  if (!wrap.lines.length) warnings.push({ code: 'name-empty', message: 'Merchant name is empty.' })
  if (wrap.dropped) warnings.push({ code: 'name-dropped', message: `Name too long; dropped: “${wrap.droppedText}”.` })
  if (wrap.wordCut) warnings.push({ code: 'name-word-cut', message: `A word longer than ${opt.limits.nameChars} characters was cut.` })
  if (wrap.tooWide) warnings.push({ code: 'name-too-wide', message: 'A word is wider than the safe area; reduce the name size.' })

  const capName = (fonts.nameLatin.capHeight / fonts.nameLatin.upem) * opt.nameSizePt
  // Keep the first baseline where the guide puts it for 23 pt; for other sizes
  // keep the 38 pt QR-to-cap-top gap so larger text grows downward.
  const qrBottom = L.qr.y + L.qr.size
  const guideCap = (fonts.nameLatin.capHeight / fonts.nameLatin.upem) * L.name.sizePt
  const gapQrToCap = L.name.baselineY - guideCap - qrBottom
  let baseline = qrBottom + gapQrToCap + capName
  for (const line of wrap.lines) {
    const o = measure(line)
    if (o.missingGlyphs) warnings.push({ code: 'name-glyph', message: `Some characters in “${line}” are not in the fonts.` })
    const x = (W - o.width) / 2
    add('name', fill(transformPath(parsePathData(o.d), translate(x, baseline)), opt.textColor))
    baseline += L.name.lineGap + capName
  }
  const lastBaseline = wrap.lines.length
    ? baseline - (L.name.lineGap + capName)
    : L.name.baselineY

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
      ? L.name.baselineY + (opt.limits.nameLines - 1) * (L.name.lineGap + capName)
      : lastBaseline
    const midBaseline = anchor + L.mid.gapFromName + capMid
    if (o.width > safeW) warnings.push({ code: 'mid-too-wide', message: 'MID is wider than the safe area.' })
    add('mid', fill(transformPath(parsePathData(o.d), translate((W - o.width) / 2, midBaseline)), opt.textColor))
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
