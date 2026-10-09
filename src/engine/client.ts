/** Main-thread client for the engine worker. */
import type { AssetKind, ExportResult, PreviewResult, QrFileStatus, RowInput, Settings } from './types'
import type { Warning } from '../core/scene'

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; progress?: (d: number, t: number) => void }

class EngineClient {
  private worker: Worker
  private seq = 0
  private pending = new Map<number, Pending>()
  private loaded: Promise<void>
  private markLoaded!: () => void

  constructor() {
    this.loaded = new Promise((r) => (this.markLoaded = r))
    this.worker = new Worker(new URL('../workers/engine.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (ev) => {
      if (ev.data?.hello) return this.markLoaded()
      const { id, result, error, progress } = ev.data
      const p = this.pending.get(id)
      if (!p) return
      if (progress) return p.progress?.(progress[0], progress[1])
      this.pending.delete(id)
      if (error) p.reject(new Error(error))
      else p.resolve(result)
    }
    this.worker.onerror = (ev) => {
      this.markLoaded()
      for (const p of this.pending.values()) p.reject(new Error(ev.message || 'Worker error'))
      this.pending.clear()
    }
  }

  private call<T>(method: string, args: unknown[], progress?: Pending['progress'], transfer: Transferable[] = []): { id: number; promise: Promise<T> } {
    const id = ++this.seq
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, progress })
    })
    this.loaded.then(() => this.worker.postMessage({ id, method, args }, transfer))
    return { id, promise }
  }

  ready() { return this.call<boolean>('ready', []).promise }
  setAsset(kind: AssetKind, svg: string | null) { return this.call<Warning[]>('setAsset', [kind, svg]).promise }
  clearQrs() { return this.call<boolean>('clearQrs', []).promise }
  addQrFiles(files: { name: string; bytes: Uint8Array; mime: string }[], redraw: boolean, progress?: Pending['progress']) {
    return this.call<QrFileStatus[]>('addQrFiles', [files, redraw], progress).promise
  }
  reprocessRaster(redraw: boolean) { return this.call<QrFileStatus[]>('reprocessRaster', [redraw]).promise }
  preview(row: RowInput, s: Settings) { return this.call<PreviewResult>('preview', [row, s]).promise }
  export(rows: RowInput[], s: Settings, progress: Pending['progress']) {
    const c = this.call<ExportResult>('export', [rows, s], progress)
    return { promise: c.promise, cancel: () => this.loaded.then(() => this.worker.postMessage({ id: 0, method: 'cancel', args: [c.id] })) }
  }
}

let client: EngineClient | null = null
export const engine = () => (client ??= new EngineClient())
