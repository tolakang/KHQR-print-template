/**
 * Merchant-name wrapping.
 * - Counts user-perceived characters (grapheme clusters), so a Khmer
 *   consonant cluster with its subscripts/vowels counts as one.
 * - Breaks only between whole words (spaces, or ICU word boundaries for
 *   Khmer, which is usually written without spaces).
 * - A single word longer than the limit is cut on a grapheme boundary.
 * - Lines past `maxLines` are dropped by whole word and reported.
 */

const graphemeSeg = new Intl.Segmenter('km', { granularity: 'grapheme' })
const wordSeg = new Intl.Segmenter('km', { granularity: 'word' })

export const graphemes = (s: string): string[] =>
  Array.from(graphemeSeg.segment(s), (g) => g.segment)

export const charCount = (s: string): number => graphemes(s).length

/** Zero-width chars Khmer typists insert as invisible word breaks. */
const ZW = /[​‌‍⁠﻿]/g

export function normalizeName(raw: unknown): string {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ /g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
}

interface Unit {
  /** Text of the unit (word plus any trailing punctuation). */
  text: string
  /** True when a space separated this unit from the previous one. */
  spaceBefore: boolean
}

/** Split into breakable units. Punctuation sticks to the word before it. */
export function toUnits(text: string): Unit[] {
  const units: Unit[] = []
  let pendingSpace = false
  for (const seg of wordSeg.segment(text)) {
    const s = seg.segment
    if (/^\s+$/.test(s)) {
      pendingSpace = true
      continue
    }
    if (ZW.test(s) && s.replace(ZW, '') === '') {
      ZW.lastIndex = 0
      continue
    }
    ZW.lastIndex = 0
    const clean = s.replace(ZW, '')
    const isPunct = !seg.isWordLike
    const prev = units[units.length - 1]
    // Glue punctuation (",", ".", "&", ")") to the previous word unless a space split them.
    if (prev && isPunct && !pendingSpace) {
      prev.text += clean
    } else if (prev && !pendingSpace && !isPunct && /[([“"'‘-]$/.test(prev.text) && charCount(prev.text) === 1) {
      // Opening bracket or quote on its own: glue to the following word.
      prev.text += clean
    } else {
      units.push({ text: clean, spaceBefore: pendingSpace && units.length > 0 })
    }
    pendingSpace = false
  }
  return units
}

export interface WrapResult {
  lines: string[]
  /** True when words were dropped because they did not fit in maxLines. */
  dropped: boolean
  /** True when a single over-long word had to be cut mid-word. */
  wordCut: boolean
  /** The text that did not make it onto the sticker. */
  droppedText: string
  /** True when a single word is wider than the safe width on its own (never shrunk). */
  tooWide: boolean
}

/**
 * @param fits optional width check (e.g. measured width <= safe width). A line
 *   breaks when it exceeds maxChars OR no longer fits.
 */
export function wrapName(
  raw: unknown,
  maxChars = 25,
  maxLines = 2,
  fits: (line: string) => boolean = () => true,
): WrapResult {
  const text = normalizeName(raw)
  const units = toUnits(text)
  const lines: string[] = []
  let cur = ''
  let wordCut = false
  let tooWide = false
  let i = 0
  const ok = (line: string) => charCount(line) <= maxChars && fits(line)

  const push = () => {
    if (cur) lines.push(cur)
    cur = ''
  }

  for (; i < units.length; i++) {
    if (lines.length >= maxLines) break
    const u = units[i]
    const sep = cur && u.spaceBefore ? ' ' : ''
    const candidate = cur + sep + u.text
    if (ok(candidate)) {
      cur = candidate
      continue
    }
    // Does not fit on the current line.
    if (cur) {
      push()
      if (lines.length >= maxLines) break
    }
    if (charCount(u.text) <= maxChars) {
      if (!fits(u.text)) tooWide = true
      cur = u.text
      continue
    }
    // Single word longer than a full line: cut on grapheme boundary.
    wordCut = true
    let g = graphemes(u.text)
    while (g.length > maxChars && lines.length < maxLines) {
      lines.push(g.slice(0, maxChars).join(''))
      g = g.slice(maxChars)
    }
    if (lines.length >= maxLines) {
      if (g.length) {
        // Remainder of this word cannot fit.
        units[i] = { text: g.join(''), spaceBefore: false }
        break
      }
      i++
      break
    }
    cur = g.join('')
  }
  if (lines.length < maxLines) push()

  const rest = units.slice(i)
  const droppedText = rest
    .map((u, k) => (k > 0 && u.spaceBefore ? ' ' : '') + u.text)
    .join('')
  // `cur` may still hold text if we broke out with lines full.
  return {
    lines,
    dropped: droppedText.length > 0,
    wordCut,
    droppedText,
    tooWide,
  }
}

export interface MidResult {
  value: string
  trimmed: boolean
}

export function formatMid(raw: unknown, maxChars = 15): MidResult {
  let v = String(raw ?? '').trim()
  // Excel may hand us 1.23457E+14 for long numbers stored as numbers.
  if (typeof raw === 'number' && Number.isFinite(raw)) v = BigInt(Math.round(raw)).toString()
  const g = graphemes(v)
  return { value: g.slice(0, maxChars).join(''), trimmed: g.length > maxChars }
}
