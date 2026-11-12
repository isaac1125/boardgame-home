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
