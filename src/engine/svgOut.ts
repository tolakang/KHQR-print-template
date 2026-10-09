/** Scene/page → SVG markup for the on-screen preview (same geometry as the PDF). */
import { pathToSvgD } from '../core/geom/path'
import type { SceneItem } from '../core/scene'
import type { PageSpec } from '../core/pdf/writer'
import { rgbToHex } from '../core/svg/color'

const f = (n: number) => String(Math.round(n * 1000) / 1000)

function itemsToSvg(items: SceneItem[], ids: { n: number }, defs: string[], groups: Map<string, string>): string {
  const out: string[] = []
  const open: number[] = []
  for (const it of items) {
    switch (it.kind) {
      case 'fill':
        out.push(`<path d="${pathToSvgD(it.path)}" fill="${rgbToHex(it.color)}"${it.rule === 'evenodd' ? ' fill-rule="evenodd"' : ''}${it.opacity < 1 ? ` fill-opacity="${f(it.opacity)}"` : ''}/>`)
        break
      case 'stroke':
        out.push(`<path d="${pathToSvgD(it.path)}" transform="matrix(${it.ctm.map(f).join(' ')})" fill="none" stroke="${rgbToHex(it.color)}" stroke-width="${f(it.width)}" stroke-linecap="${it.cap}" stroke-linejoin="${it.join}"${it.dash.length ? ` stroke-dasharray="${it.dash.map(f).join(' ')}"` : ''}${it.opacity < 1 ? ` stroke-opacity="${f(it.opacity)}"` : ''}/>`)
        break
      case 'clipPush': {
        const id = `c${ids.n++}`
        defs.push(`<clipPath id="${id}"><path d="${pathToSvgD(it.path)}"${it.rule === 'evenodd' ? ' clip-rule="evenodd"' : ''}/></clipPath>`)
        out.push(`<g clip-path="url(#${id})">`)
        open.push(1)
        break
      }
      case 'clipPop':
        if (open.pop()) out.push('</g>')
        break
      case 'group': {
        let id = groups.get(it.key)
        if (!id) {
          id = `g${ids.n++}`
          groups.set(it.key, id)
          defs.push(`<g id="${id}">${itemsToSvg(it.items, ids, defs, groups)}</g>`)
        }
        out.push(`<use href="#${id}"/>`)
        break
      }
    }
  }
  while (open.pop()) out.push('</g>')
  return out.join('')
}

export interface PreviewOverlay { trim: boolean; bleed: boolean; safe?: { x: number; y: number; w: number; h: number } }

export function pageToSvg(page: PageSpec, overlay: PreviewOverlay = { trim: true, bleed: true }): string {
  const defs: string[] = []
  const body = itemsToSvg(page.items, { n: 0 }, defs, new Map())
  const guides: string[] = []
  const rect = (b: { x: number; y: number; w: number; h: number }, color: string, dash = '') =>
    `<rect x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}" fill="none" stroke="${color}" stroke-width="0.5" vector-effect="non-scaling-stroke"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
  if (overlay.bleed && page.bleedBox) guides.push(rect(page.bleedBox, '#e11d48', '4 3'))
  if (overlay.trim && page.trimBox && (page.bleedBox || page.trimBox.w !== page.width)) guides.push(rect(page.trimBox, '#0284c7'))
  if (overlay.safe) guides.push(rect(overlay.safe, '#16a34a', '2 3'))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(page.width)} ${f(page.height)}" width="${f(page.width)}" height="${f(page.height)}"><defs>${defs.join('')}</defs><rect width="100%" height="100%" fill="#fff"/>${body}<g class="guides">${guides.join('')}</g></svg>`
}
