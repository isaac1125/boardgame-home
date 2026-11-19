import type { BestPlayers, BestPlayersPart, Game } from '../types'

export function formatPlayers(game: Game): string {
  if (game.playersMin === game.playersMax) return `${game.playersMax} 人`
  return `${game.playersMin}–${game.playersMax} 人`
}

export function formatPlayTime(game: Game): string | null {
  const min = game.playTimeMin
  const max = game.playTimeMax
  if (min == null && max == null) return null
  if (min != null && max != null) {
    if (min === max) return `${min} 分`
    return `${min}–${max} 分`
  }
  return `${min ?? max} 分`
}

export function parseBool(value: string): boolean {
  const v = value.trim().toUpperCase()
  return v === 'TRUE' || v === '1' || v === 'YES' || v === 'Y'
}

/** Normalize digits / light sheet noise before int parse. */
function normalizeNumberToken(raw: string): string {
  return raw
    .trim()
    // fullwidth ０-９ → ASCII
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30))
    // strip trailing 人 / 位 and spaces
    .replace(/[人位]\s*$/u, '')
    .trim()
}

export function parseOptionalInt(value: string): number | null {
  const t = normalizeNumberToken(value)
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

/**
 * Sheet `category` may be one value or several separated by
 * ASCII comma, Chinese comma, or顿号. Soft-fallback: blank → [].
 */
export function parseCategories(raw: string): string[] {
  const t = raw.trim()
  if (!t) return []
  return t
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Fullwidth digits → ASCII (shared by range / list token parsing). */
function toAsciiDigits(raw: string): string {
  return raw.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
  )
}

/**
 * Dashes Sheets / IME often insert: hyphen, en/em, minus, fullwidth hyphen-minus, tilde.
 * Missing － / − previously dropped mid-list ranges like `16-18`.
 */
const RANGE_DASH = String.raw`[-–—−－~～至到]`

function parseRangeBounds(normalized: string): { min: number; max: number } | null {
  const range = normalized.match(new RegExp(`^(\\d+)\\s*${RANGE_DASH}\\s*(\\d+)\\s*[人位]?\\s*$`, 'u'))
  if (!range) return null
  let min = Number(range[1])
  let max = Number(range[2])
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  if (min > max) [min, max] = [max, min]
  if (min <= 0) return null
  return { min, max }
}

function expandRange(min: number, max: number): number[] {
  // Guard: BGG-style list ranges are tiny (e.g. 16-18); reject runaway spans
  if (max - min > 20) return []
  const out: number[] = []
  for (let n = min; n <= max; n++) out.push(n)
  return out
}

/** One comma-list token → display part + expanded ints for overlap. */
function parseBestPlayersListToken(raw: string): { part: BestPlayersPart; values: number[] } | null {
  const normalized = toAsciiDigits(normalizeNumberToken(raw))
  if (!normalized) return null

  const bounds = parseRangeBounds(normalized)
  if (bounds) {
    if (bounds.min === bounds.max) {
      return { part: { kind: 'single', n: bounds.min }, values: [bounds.min] }
    }
    const values = expandRange(bounds.min, bounds.max)
    if (values.length === 0) return null
    return { part: { kind: 'range', min: bounds.min, max: bounds.max }, values }
  }

  const n = parseOptionalInt(normalized)
  if (n == null || n <= 0) return null
  return { part: { kind: 'single', n }, values: [n] }
}

/**
 * Optional `best_players`:
 * - single `4` (also `４`, `4人`, `4.0`)
 * - range `3-5` / `3–5` / fullwidth `３－５`
 * - list `6,8,10` (also ， 、)
 * - mixed list+range `14,16-18,20,22` (keeps `16–18` on the card)
 * Soft-fallback: blank / unparseable → null.
 */
export function parseBestPlayers(raw: string): BestPlayers | null {
  const t = raw.trim()
  if (!t) return null

  if (/[,，、]/.test(t)) {
    const tokens = t
      .split(/[,，、]/)
      .map((s) => parseBestPlayersListToken(s))
      .filter((x): x is NonNullable<typeof x> => x != null)
    if (tokens.length === 0) return null

    const parts = tokens.map((x) => x.part)
    const values = [...new Set(tokens.flatMap((x) => x.values))].sort((a, b) => a - b)
    if (values.length === 0) return null
    if (values.length === 1) return { mode: 'single', n: values[0] }
    return { mode: 'list', values, parts }
  }

  // Normalize fullwidth digits before range detect so `３－５` works
  const normalized = toAsciiDigits(t)
  const bounds = parseRangeBounds(normalized)
  if (bounds) {
    if (bounds.min === bounds.max) return { mode: 'single', n: bounds.min }
    return { mode: 'range', min: bounds.min, max: bounds.max }
  }

  const n = parseOptionalInt(normalized)
  if (n == null || n <= 0) return null
  return { mode: 'single', n }
}

/** Classic overlap: best band intersects [sliderMin, sliderMax]. Single = range of one. */
export function bestPlayersOverlaps(
  best: BestPlayers | null,
  sliderMin: number,
  sliderMax: number,
): boolean {
  if (!best) return false
  if (best.mode === 'single') {
    // Same overlap idea as a 1-wide range: min==max==n
    return best.n <= sliderMax && best.n >= sliderMin
  }
  if (best.mode === 'range') return best.min <= sliderMax && best.max >= sliderMin
  return best.values.some((v) => v >= sliderMin && v <= sliderMax)
}

function formatPart(part: BestPlayersPart): string {
  return part.kind === 'single' ? `${part.n}` : `${part.min}–${part.max}`
}

/**
 * Collapse consecutive ints into range segments for compact copy:
 * [14,16,17,18,20,22] → ["14","16–18","20","22"]
 */
function collapseBestPlayerSegments(values: number[]): string[] {
  if (values.length === 0) return []
  const sorted = [...values].sort((a, b) => a - b)
  const segments: string[] = []
  let start = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i]
    if (n === prev + 1) {
      prev = n
      continue
    }
    segments.push(start === prev ? `${start}` : `${start}–${prev}`)
    start = prev = n
  }
  segments.push(start === prev ? `${start}` : `${start}–${prev}`)
  return segments
}

/** Prefer sheet tokens when a list embeds ranges; else collapse consecutive singles. */
function formatListSegments(best: Extract<BestPlayers, { mode: 'list' }>): string[] {
  if (best.parts.some((p) => p.kind === 'range')) {
    return best.parts.map(formatPart)
  }
  return collapseBestPlayerSegments(best.values)
}

/** Compact card / list value (no 人). Lists keep mid-ranges: 14·16–18·20·22. */
export function formatBestPlayers(best: BestPlayers | null): string | null {
  if (!best) return null
  if (best.mode === 'single') return `${best.n}`
  if (best.mode === 'range') return `${best.min}–${best.max}`
  return formatListSegments(best).join('·')
}

/** Detail-panel value with 人:「4 人」／「3–5 人」／「14、16–18、20、22 人」. */
export function formatBestPlayersDetail(best: BestPlayers | null): string | null {
  if (!best) return null
  if (best.mode === 'single') return `${best.n} 人`
  if (best.mode === 'range') return `${best.min}–${best.max} 人`
  return `${formatListSegments(best).join('、')} 人`
}
