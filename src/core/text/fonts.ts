import { loadFont, outlineLine, type LoadedFont } from './outline'
import { parsePathData } from '../geom/path'
import type { TextOutliner } from '../svg/toScene'

export interface FontBundle {
  extraBold: LoadedFont
  regular: LoadedFont
  khmer: LoadedFont
}

export function loadBundle(data: { extraBold: ArrayBuffer | Uint8Array; regular: ArrayBuffer | Uint8Array; khmer: ArrayBuffer | Uint8Array }): FontBundle {
  return { extraBold: loadFont(data.extraBold), regular: loadFont(data.regular), khmer: loadFont(data.khmer) }
}

/**
 * Outliner for live text found inside uploaded SVGs. Only the bundled
 * families can be outlined; anything else returns null (and is reported).
 */
export function bundleOutliner(b: FontBundle): TextOutliner {
  return (text, style) => {
    const fam = style.family.toLowerCase()
    let latin: LoadedFont | null = null
    if (/nunito/.test(fam)) latin = style.weight >= 700 || /extrabold|black|bold/.test(fam) ? b.extraBold : b.regular
    else if (/nokora|khmer/.test(fam)) latin = b.regular
    if (!latin) return null
    const o = outlineLine(text, { latin, khmer: b.khmer }, style.size)
    return { path: parsePathData(o.d), width: o.width }
  }
}
