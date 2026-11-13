import type { BestPlayers, Game } from '../types'

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
 * One comma-list token: a single int, or a short inclusive range (`16-18` → 16,17,18).
 * Huge spans are ignored so a typo cannot explode the list.
 */
function parseBestPlayersListToken(raw: string): number[] {
  const normalized = toAsciiDigits(normalizeNumberToken(raw))
  if (!normalized) return []

  const range = normalized.match(/^(\d+)\s*[-–—~～至到]\s*(\d+)$/u)
  if (range) {
    let min = Number(range[1])
    let max = Number(range[2])
    if (!Number.isFinite(min) || !Number.isFinite(max)) return []
    if (min > max) [min, max] = [max, min]
    if (min <= 0) return []
    // Guard: BGG-style list ranges are tiny (e.g. 16-18); reject runaway spans
    if (max - min > 20) return []
    const out: number[] = []
    for (let n = min; n <= max; n++) out.push(n)
    return out
  }

  const n = parseOptionalInt(normalized)
  return n != null && n > 0 ? [n] : []
}

/**
 * Optional `best_players`:
 * - single `4` (also `４`, `4人`, `4.0`)
 * - range `3-5` / `3–5`
 * - list `6,8,10` (also ， 、)
 * - mixed list+range tokens `14,16-18,20,22` → expands to discrete list
 * Soft-fallback: blank / unparseable → null.
 */
export function parseBestPlayers(raw: string): BestPlayers | null {
  const t = raw.trim()
  if (!t) return null

  if (/[,，、]/.test(t)) {
    const values = [
      ...new Set(t.split(/[,，、]/).flatMap((s) => parseBestPlayersListToken(s))),
    ].sort((a, b) => a - b)
    if (values.length === 0) return null
    if (values.length === 1) return { mode: 'single', n: values[0] }
    return { mode: 'list', values }
  }

  // Normalize fullwidth digits before range detect so `３–５` works
  const normalized = toAsciiDigits(t)
  const range = normalized.match(/^(\d+)\s*[-–—~～至到]\s*(\d+)\s*[人位]?\s*$/u)
  if (range) {
    let min = Number(range[1])
    let max = Number(range[2])
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null
    if (min > max) [min, max] = [max, min]
    if (min === max) return { mode: 'single', n: min }
    return { mode: 'range', min, max }
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

/** Compact card / list value (no 人). Middot with spaces so long lists can wrap cleanly. */
export function formatBestPlayers(best: BestPlayers | null): string | null {
  if (!best) return null
  if (best.mode === 'single') return `${best.n}`
  if (best.mode === 'range') return `${best.min}–${best.max}`
  return best.values.join(' · ')
}

/** Detail-panel value with 人:「4 人」／「3–5 人」／「6、8、10 人」. */
export function formatBestPlayersDetail(best: BestPlayers | null): string | null {
  if (!best) return null
  if (best.mode === 'single') return `${best.n} 人`
  if (best.mode === 'range') return `${best.min}–${best.max} 人`
  return `${best.values.join('、')} 人`
}
