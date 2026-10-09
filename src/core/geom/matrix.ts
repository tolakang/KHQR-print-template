/** 2D affine matrix [a b c d e f], same meaning as SVG matrix() and PDF cm. */
export type Matrix = [number, number, number, number, number, number]

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

/** m1 × m2: apply m2 first, then m1 (SVG nesting order: parent × child). */
export function multiply(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1
  const [a2, b2, c2, d2, e2, f2] = m2
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ]
}

export const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y]
export const scale = (sx: number, sy = sx): Matrix => [sx, 0, 0, sy, 0, 0]

export function rotate(deg: number, cx = 0, cy = 0): Matrix {
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const m: Matrix = [cos, sin, -sin, cos, 0, 0]
  if (!cx && !cy) return m
  return multiply(multiply(translate(cx, cy), m), translate(-cx, -cy))
}

export function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

export function isIdentity(m: Matrix): boolean {
  return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0
}

/** Mean linear scale factor (for stroke widths under uniform transforms). */
export function meanScale(m: Matrix): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]))
}

/** Parse an SVG transform attribute. */
export function parseTransform(src: string | null | undefined): Matrix {
  let m: Matrix = IDENTITY
  if (!src) return m
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(src))) {
    const n = match[2]
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number)
    let t: Matrix = IDENTITY
    switch (match[1]) {
      case 'matrix':
        if (n.length === 6) t = n as Matrix
        break
      case 'translate':
        t = translate(n[0] ?? 0, n[1] ?? 0)
        break
      case 'scale':
        t = scale(n[0] ?? 1, n[1] ?? n[0] ?? 1)
        break
      case 'rotate':
        t = rotate(n[0] ?? 0, n[1] ?? 0, n[2] ?? 0)
        break
      case 'skewX':
        t = [1, 0, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 1, 0, 0]
        break
      case 'skewY':
        t = [1, Math.tan(((n[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0]
        break
    }
    m = multiply(m, t)
  }
  return m
}
