import type { Game } from '../types'

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
