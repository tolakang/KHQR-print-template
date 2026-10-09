/** QA: pixel diff two PNGs, write a diff image, print mismatch ratio. */
import { readFileSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
const [, , a, b, out] = process.argv
const A = PNG.sync.read(readFileSync(a)), B = PNG.sync.read(readFileSync(b))
const w = Math.min(A.width, B.width), h = Math.min(A.height, B.height)
const crop = (p: PNG) => { const o = new PNG({ width: w, height: h }); PNG.bitblt(p, o, 0, 0, w, h, 0, 0); return o }
const ca = crop(A), cb = crop(B), d = new PNG({ width: w, height: h })
const n = pixelmatch(ca.data, cb.data, d.data, w, h, { threshold: 0.15 })
if (out) writeFileSync(out, PNG.sync.write(d))
console.log(JSON.stringify({ sizeA: [A.width, A.height], sizeB: [B.width, B.height], mismatched: n, ratio: +(n / (w * h)).toFixed(5) }))
