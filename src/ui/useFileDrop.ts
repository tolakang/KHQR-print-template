import { useRef, useState, type DragEvent } from 'react'

/** Drag-and-drop handlers for any element; `over` is true while files hover it. */
export function useFileDrop(onFiles: (f: File[]) => void, accept?: RegExp) {
  const [over, setOver] = useState(false)
  const depth = useRef(0)
  const props = {
    onDragEnter: (e: DragEvent) => { e.preventDefault(); depth.current++; setOver(true) },
    onDragOver: (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' },
    onDragLeave: () => { if (--depth.current <= 0) { depth.current = 0; setOver(false) } },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      depth.current = 0
      setOver(false)
      const files = Array.from(e.dataTransfer.files).filter((f) => !accept || accept.test(f.name))
      if (files.length) onFiles(files)
    },
  }
  return { over, props }
}
