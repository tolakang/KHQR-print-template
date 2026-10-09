/**
 * Merchant-name wrapping.
 * - Counts user-perceived characters (grapheme clusters), so a Khmer
 *   consonant cluster with its subscripts/vowels counts as one.
 * - Breaks only between whole words (spaces, or ICU word boundaries for
 *   Khmer, which is usually written without spaces).
 * - The whole name is limited to `maxChars` (25: the KHQR merchant-name
 *   limit); whole words past it are dropped and reported. A first word longer
 *   than the limit is cut on a grapheme boundary.
 * - Lines break where the next word no longer fits the safe width; words past
 *   `maxLines` are dropped and reported.
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
  /** True when words were dropped (name over the character limit, or more lines than allowed). */
  dropped: boolean
  /** True when a single over-long word had to be cut mid-word. */
  wordCut: boolean
  /** The text that did not make it onto the sticker. */
  droppedText: string
  /** True when a single word is wider than the safe width on its own (never shrunk). */
  tooWide: boolean
}

const joinUnits = (units: Unit[]) => units.map((u, k) => (k > 0 && u.spaceBefore ? ' ' : '') + u.text).join('')

/**
 * @param maxChars limit for the whole name (all lines, spaces between words
 *   included). Whole words past it are dropped; a first word longer than the
 *   limit is cut.
 * @param fits optional width check (e.g. measured width <= safe width); a line
 *   breaks before the word that no longer fits.
 */
export function wrapName(
  raw: unknown,
  maxChars = 25,
  maxLines = 2,
  fits: (line: string) => boolean = () => true,
): WrapResult {
  const units = toUnits(normalizeName(raw))

  // 1. Character limit for the whole name, by whole word.
  const kept: Unit[] = []
  let over: Unit[] = []
  let total = 0
  let wordCut = false
  for (let i = 0; i < units.length; i++) {
    const u = units[i]
    const add = (kept.length && u.spaceBefore ? 1 : 0) + charCount(u.text)
    if (total + add <= maxChars) {
      kept.push(u)
      total += add
      continue
    }
    if (!kept.length) {
      // First word alone is over the limit: cut on a grapheme boundary.
      const g = graphemes(u.text)
      kept.push({ text: g.slice(0, maxChars).join(''), spaceBefore: false })
      over = [{ text: g.slice(maxChars).join(''), spaceBefore: false }, ...units.slice(i + 1)]
      wordCut = true
    } else {
      over = units.slice(i)
    }
    break
  }

  // 2. Lines by width, max `maxLines`.
  const lines: string[] = []
  let cur = ''
  let tooWide = false
  let i = 0
  for (; i < kept.length; i++) {
    const u = kept[i]
    const candidate = cur ? cur + (u.spaceBefore ? ' ' : '') + u.text : u.text
    if (!cur || fits(candidate)) {
      if (!cur && !fits(u.text)) tooWide = true
      cur = candidate
      continue
    }
    lines.push(cur)
    cur = ''
    if (lines.length >= maxLines) break
    if (!fits(u.text)) tooWide = true
    cur = u.text
  }
  if (cur) lines.push(cur)

  const droppedText = joinUnits([...kept.slice(i), ...over])
  return { lines, dropped: droppedText.length > 0, wordCut, droppedText, tooWide }
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
