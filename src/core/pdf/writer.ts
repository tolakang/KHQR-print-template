/**
 * Writes Scenes into a vector-only PDF with pdf-lib.
 * No fonts and no images are ever embedded: every mark is a path.
 * Repeated artwork (the background) is written once as a Form XObject.
 */
import { PDFDocument, PDFName, PDFNumber, PDFDict, PDFRef } from 'pdf-lib'
import type { Matrix } from '../geom/matrix'
import { pathToPdfOps } from '../geom/path'
import type { SceneItem, RGB } from '../scene'

export interface Box { x: number; y: number; w: number; h: number }

export interface PageSpec {
  /** MediaBox size in pt. */
  width: number
  height: number
  /** Boxes in y-down page coordinates (converted to PDF y-up internally). */
  trimBox?: Box
  bleedBox?: Box
  /** Items in y-down page coordinates (pt). */
  items: SceneItem[]
}

export interface DocMeta { title?: string; author?: string; subject?: string }

const f = (n: number) => {
  const r = Math.round(n * 10000) / 10000
  return Object.is(r, -0) ? '0' : String(r)
}
const col = (c: RGB) => c.map((v) => f(Math.min(1, Math.max(0, v)))).join(' ')
const mat = (m: Matrix) => m.map(f).join(' ')

/** Resource names used by one content stream. */
export interface OpsContext {
  gs: (alpha: number) => string
  xobject: (key: string, items: SceneItem[]) => string
}

/** Content-stream operators for a list of items (y-down space). */
export function itemsOps(items: SceneItem[], ctx: OpsContext): string {
  const out: string[] = []
  let depth = 0
  for (const it of items) {
    switch (it.kind) {
      case 'fill': {
        if (!it.path.length) break
        const gs = it.opacity < 0.9999 ? ctx.gs(it.opacity) : ''
        if (gs) out.push('q', `/${gs} gs`)
        out.push(`${col(it.color)} rg`, pathToPdfOps(it.path), it.rule === 'evenodd' ? 'f*' : 'f')
        if (gs) out.push('Q')
        break
      }
      case 'stroke': {
        if (!it.path.length) break
        const gs = it.opacity < 0.9999 ? ctx.gs(it.opacity) : ''
        out.push('q')
        if (gs) out.push(`/${gs} gs`)
        out.push(
          `${col(it.color)} RG`,
          `${f(it.width)} w`,
          `${{ butt: 0, round: 1, square: 2 }[it.cap]} J`,
          `${{ miter: 0, round: 1, bevel: 2 }[it.join]} j`,
          `${f(Math.max(1, it.miterLimit))} M`,
          `[${it.dash.map(f).join(' ')}] 0 d`,
          `${mat(it.ctm)} cm`,
          pathToPdfOps(it.path),
          'S',
          'Q',
        )
        break
      }
      case 'clipPush':
        depth++
        out.push('q')
        if (it.path.length) out.push(pathToPdfOps(it.path), it.rule === 'evenodd' ? 'W* n' : 'W n')
        else out.push('0 0 m h W n') // empty clip hides everything
        break
      case 'clipPop':
        if (depth > 0) {
          depth--
          out.push('Q')
        }
        break
      case 'group':
        out.push(`/${ctx.xobject(it.key, it.items)} Do`)
        break
    }
  }
  while (depth-- > 0) out.push('Q')
  return out.join('\n')
}

/** Incremental writer: add pages one at a time (keeps memory flat for big batches). */
export class PdfBuilder {
  private forms = new Map<string, PDFRef>()
  private gsRefs = new Map<string, PDFRef>()
  readonly doc: PDFDocument
  private constructor(doc: PDFDocument) {
    this.doc = doc
  }

  static async create(meta: DocMeta = {}): Promise<PdfBuilder> {
    const doc = await PDFDocument.create()
    doc.setProducer('KHQR Roll Sticker Generator')
    doc.setCreator('KHQR Roll Sticker Generator')
    if (meta.title) doc.setTitle(meta.title)
    if (meta.author) doc.setAuthor(meta.author)
    if (meta.subject) doc.setSubject(meta.subject)
    return new PdfBuilder(doc)
  }

  get pageCount() {
    return this.doc.getPageCount()
  }

  private gsRef(alpha: string): PDFRef {
    let ref = this.gsRefs.get(alpha)
    if (!ref) {
      const dict = this.doc.context.obj({ Type: 'ExtGState' }) as PDFDict
      dict.set(PDFName.of('ca'), PDFNumber.of(Number(alpha)))
      dict.set(PDFName.of('CA'), PDFNumber.of(Number(alpha)))
      ref = this.doc.context.register(dict)
      this.gsRefs.set(alpha, ref)
    }
    return ref
  }

  /** Build a context that records resources into `res` (ExtGState / XObject dicts). */
  private context(res: { gs: Map<string, PDFRef>; xo: Map<string, PDFRef> }): OpsContext {
    return {
      gs: (alpha) => {
        const key = f(alpha)
        const name = `GS${key.replace('.', '_')}`
        if (!res.gs.has(name)) res.gs.set(name, this.gsRef(key))
        return name
      },
      xobject: (key, items) => {
        let ref = this.forms.get(key)
        if (!ref) {
          ref = this.makeForm(items)
          this.forms.set(key, ref)
        }
        const name = `X${[...this.forms.keys()].indexOf(key)}`
        res.xo.set(name, ref)
        return name
      },
    }
  }

  private resourcesDict(res: { gs: Map<string, PDFRef>; xo: Map<string, PDFRef> }): PDFDict {
    const ctx = this.doc.context
    const dict = ctx.obj({}) as PDFDict
    if (res.gs.size) {
      const d = ctx.obj({}) as PDFDict
      for (const [n, r] of res.gs) d.set(PDFName.of(n), r)
      dict.set(PDFName.of('ExtGState'), d)
    }
    if (res.xo.size) {
      const d = ctx.obj({}) as PDFDict
      for (const [n, r] of res.xo) d.set(PDFName.of(n), r)
      dict.set(PDFName.of('XObject'), d)
    }
    return dict
  }

  private makeForm(items: SceneItem[]): PDFRef {
    const res = { gs: new Map<string, PDFRef>(), xo: new Map<string, PDFRef>() }
    const ops = itemsOps(items, this.context(res))
    const ctx = this.doc.context
    const stream = ctx.flateStream(ops, {
      Type: 'XObject',
      Subtype: 'Form',
      FormType: 1,
      BBox: [-100000, -100000, 100000, 100000],
    })
    stream.dict.set(PDFName.of('Resources'), this.resourcesDict(res))
    return ctx.register(stream)
  }

  addPage(spec: PageSpec) {
    const page = this.doc.addPage([spec.width, spec.height])
    const toPdf = (b: Box) => [b.x, spec.height - b.y - b.h, b.w, b.h] as const
    if (spec.bleedBox) page.setBleedBox(...toPdf(spec.bleedBox))
    if (spec.trimBox) {
      page.setTrimBox(...toPdf(spec.trimBox))
      page.setArtBox(...toPdf(spec.trimBox))
    }
    const res = { gs: new Map<string, PDFRef>(), xo: new Map<string, PDFRef>() }
    const body = itemsOps(spec.items, this.context(res))
    // Flip to y-down so scene coordinates can be used directly.
    const ops = `q\n1 0 0 -1 0 ${f(spec.height)} cm\n${body}\nQ`
    for (const [n, r] of res.gs) page.node.setExtGState(PDFName.of(n), r)
    for (const [n, r] of res.xo) page.node.setXObject(PDFName.of(n), r)
    const ctx = this.doc.context
    page.node.addContentStream(ctx.register(ctx.flateStream(ops)))
    return page
  }

  save(): Promise<Uint8Array> {
    return this.doc.save({ useObjectStreams: true })
  }
}

export async function writePdf(pages: PageSpec[], meta: DocMeta = {}): Promise<Uint8Array> {
  const b = await PdfBuilder.create(meta)
  for (const p of pages) b.addPage(p)
  return b.save()
}

