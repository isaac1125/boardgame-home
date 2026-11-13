/** Optional sheet `best_players` — soft-fallback null when blank/missing. */
export type BestPlayers =
  | { mode: 'single'; n: number }
  | { mode: 'range'; min: number; max: number }
  | { mode: 'list'; values: number[] }

export type Game = {
  name: string
  playersMin: number
  playersMax: number
  playTimeMin: number | null
  playTimeMax: number | null
  /** Parsed tags from sheet `category` (comma / 、 / ，). Empty cell → []. */
  categories: string[]
  difficulty: string
  location: string
  lentTo: string
  unopened: boolean
  thumbnailUrl: string
  rulesVideoUrl: string
  notes: string
  /** Optional sheet column; empty / missing is fine. e.g. 熱門、新到 */
  highlight: string
  /** Optional「最推薦人數」(`best_players`); empty / missing → null */
  bestPlayers: BestPlayers | null
}

export type ParamRow = {
  type: 'category' | 'difficulty' | 'location' | 'setting' | string
  key: string
  value: string
  sort: number
}

export type CatalogSettings = {
  showLocation: boolean
  showLentTo: boolean
}

export type CatalogData = {
  games: Game[]
  categories: string[]
  difficulties: string[]
  locations: string[]
  settings: CatalogSettings
  source: 'sample' | 'sheet'
}
