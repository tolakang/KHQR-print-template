/// <reference lib="webworker" />
/**
 * Worker host for the Engine. Messages: { id, method, args } → { id, result } | { id, error }.
 * Progress: { id, progress: [done, total] }.
 */
import { Engine } from '../engine/engine'
import type { RGBAImage } from '../core/qr/raster'

declare const self: DedicatedWorkerGlobalScope

async function decodeRaster(bytes: Uint8Array, mime: string): Promise<RGBAImage> {
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime || 'image/png' }))
  // Cap very large images; QR modules stay well above 4 px.
  const max = 2400
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * k))
  const h = Math.max(1, Math.round(bmp.height * k))
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  const d = ctx.getImageData(0, 0, w, h)
  return { data: d.data, width: w, height: h }
}

let engine: Promise<Engine> | null = null
const cancelled = new Set<number>()

function getEngine(): Promise<Engine> {
  if (!engine) {
    engine = (async () => {
      const base = new URL('/', self.location.href)
      const get = async (p: string) => {
        const r = await fetch(new URL(p, base))
        if (!r.ok) throw new Error(`Failed to load ${p} (${r.status})`)
        return new Uint8Array(await r.arrayBuffer())
      }
      const [extraBold, regular, khmer] = await Promise.all([
        get('fonts/NunitoSans-ExtraBold.ttf'),
        get('fonts/NunitoSans-Regular.ttf'),
        get('fonts/Nokora-SemiBold.ttf'),
      ])
      return new Engine({ extraBold, regular, khmer }, decodeRaster, get)
    })()
  }
  return engine
}

self.onmessage = async (ev: MessageEvent) => {
  const { id, method, args } = ev.data as { id: number; method: string; args: unknown[] }
  if (method === 'cancel') {
    cancelled.add(args[0] as number)
    return
  }
  try {
    const e = await getEngine()
    let result: unknown
    switch (method) {
      case 'ready':
        result = true
        break
      case 'setAsset':
        result = e.setAsset(args[0] as never, args[1] as string | null)
        break
      case 'clearQrs':
        e.clearQrs()
        result = true
        break
      case 'addQrFiles': {
        const files = args[0] as { name: string; bytes: Uint8Array; mime: string }[]
        const redraw = args[1] as boolean
        const out = []
        for (let i = 0; i < files.length; i++) {
          out.push(await e.addQrFile(files[i].name, files[i].bytes, files[i].mime, redraw))
          if (i % 10 === 9) self.postMessage({ id, progress: [i + 1, files.length] })
        }
        result = out
        break
      }
      case 'reprocessRaster':
        result = await e.reprocessRaster(args[0] as boolean)
        break
      case 'preview':
        await e.ensureFonts(args[1] as never)
        result = e.preview(args[0] as never, args[1] as never)
        break
      case 'registerFont':
        result = e.registerFont(args[0] as string, args[1] as never, args[2] as Uint8Array)
        break
      case 'export': {
        const r = await e.export(
          args[0] as never,
          args[1] as never,
          (done, total) => self.postMessage({ id, progress: [done, total] }),
          () => cancelled.has(id),
        )
        self.postMessage({ id, result: r }, r.files.map((f) => f.bytes.buffer as ArrayBuffer))
        return
      }
      default:
        throw new Error(`Unknown method ${method}`)
    }
    self.postMessage({ id, result })
  } catch (err) {
    self.postMessage({ id, error: (err as Error).message ?? String(err) })
  } finally {
    cancelled.delete(id)
  }
}

// Tell the client the module (including HarfBuzz's top-level await) has finished loading;
// messages sent before this point could otherwise be lost.
self.postMessage({ hello: true })
