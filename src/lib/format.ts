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

export function parseOptionalInt(value: string): number | null {
  const t = value.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
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

/**
 * Optional `best_players`:
 * - single `4`
 * - range `3-5` / `3–5`
 * - list `6,8,10` (also ， 、)
 * Soft-fallback: blank / unparseable → null.
 */
export function parseBestPlayers(raw: string): BestPlayers | null {
  const t = raw.trim()
  if (!t) return null

  if (/[,，、]/.test(t)) {
    const values = [
      ...new Set(
        t
          .split(/[,，、]/)
          .map((s) => parseOptionalInt(s))
          .filter((n): n is number => n != null && n > 0),
      ),
    ].sort((a, b) => a - b)
    if (values.length === 0) return null
    if (values.length === 1) return { mode: 'single', n: values[0] }
    return { mode: 'list', values }
  }

  const range = t.match(/^(\d+)\s*[-–—~～至到]\s*(\d+)$/)
  if (range) {
    let min = Number(range[1])
    let max = Number(range[2])
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null
    if (min > max) [min, max] = [max, min]
    if (min === max) return { mode: 'single', n: min }
    return { mode: 'range', min, max }
  }

  const n = parseOptionalInt(t)
  if (n == null || n <= 0) return null
  return { mode: 'single', n }
}

/** Classic overlap: best band intersects [sliderMin, sliderMax]. */
export function bestPlayersOverlaps(
  best: BestPlayers | null,
  sliderMin: number,
  sliderMax: number,
): boolean {
  if (!best) return false
  if (best.mode === 'single') return best.n >= sliderMin && best.n <= sliderMax
  if (best.mode === 'range') return best.min <= sliderMax && best.max >= sliderMin
  return best.values.some((v) => v >= sliderMin && v <= sliderMax)
}

export function formatBestPlayers(best: BestPlayers | null): string | null {
  if (!best) return null
  if (best.mode === 'single') return `${best.n}`
  if (best.mode === 'range') return `${best.min}–${best.max}`
  return best.values.join('·')
}
