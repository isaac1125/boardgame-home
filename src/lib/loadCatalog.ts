import type { CatalogData, CatalogSettings, Game, ParamRow } from '../types'
import { parseCsv, rowsToObjects } from './csv'
import { parseBool, parseOptionalInt } from './format'

const SAMPLE_GAMES_URL = '/seed-games.csv'
const SAMPLE_PARAMS_URL = '/seed-params.csv'

function mapGame(row: Record<string, string>): Game | null {
  const name = (row.name ?? '').trim()
  if (!name) return null

  const playersMax = parseOptionalInt(row.players_max ?? '')
  if (playersMax == null) return null

  const playersMin = parseOptionalInt(row.players_min ?? '') ?? 1

  return {
    name,
    playersMin,
    playersMax,
    playTimeMin: parseOptionalInt(row.play_time_min ?? ''),
    playTimeMax: parseOptionalInt(row.play_time_max ?? ''),
    category: (row.category ?? '').trim(),
    difficulty: (row.difficulty ?? '').trim(),
    location: (row.location ?? '').trim(),
    lentTo: (row.lent_to ?? '').trim(),
    unopened: parseBool(row.unopened ?? ''),
    thumbnailUrl: (row.thumbnail_url ?? '').trim(),
    rulesVideoUrl: (row.rules_video_url ?? '').trim(),
    notes: (row.notes ?? '').trim(),
  }
}

function mapParam(row: Record<string, string>): ParamRow | null {
  const type = (row.type ?? '').trim()
  const value = (row.value ?? '').trim()
  if (!type) return null
  return {
    type,
    key: (row.key ?? '').trim(),
    value,
    sort: parseOptionalInt(row.sort ?? '') ?? 999,
  }
}

function buildFromRows(
  gameRows: Record<string, string>[],
  paramRows: Record<string, string>[],
  source: 'sample' | 'sheet',
): CatalogData {
  const params = paramRows.map(mapParam).filter((p): p is ParamRow => p != null)
  params.sort((a, b) => a.sort - b.sort)

  const categories = params.filter((p) => p.type === 'category').map((p) => p.value).filter(Boolean)
  const difficulties = params.filter((p) => p.type === 'difficulty').map((p) => p.value).filter(Boolean)
  const locations = params.filter((p) => p.type === 'location').map((p) => p.value).filter(Boolean)

  const settings: CatalogSettings = {
    showLocation: true,
    showLentTo: true,
  }
  for (const p of params) {
    if (p.type !== 'setting') continue
    if (p.key === 'show_location') settings.showLocation = parseBool(p.value)
    if (p.key === 'show_lent_to') settings.showLentTo = parseBool(p.value)
  }

  const games = gameRows.map(mapGame).filter((g): g is Game => g != null)

  return { games, categories, difficulties, locations, settings, source }
}

async function fetchCsv(url: string): Promise<Record<string, string>[]> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`無法讀取 ${url}（${res.status}）`)
  const text = await res.text()
  return rowsToObjects(parseCsv(text))
}

type RuntimeConfig = {
  gamesCsvUrl?: string
  paramsCsvUrl?: string
}

async function resolveSheetUrls(): Promise<{ gamesUrl: string; paramsUrl: string } | null> {
  const fromEnvGames = (import.meta.env.VITE_GAMES_CSV_URL as string | undefined)?.trim()
  const fromEnvParams = (import.meta.env.VITE_PARAMS_CSV_URL as string | undefined)?.trim()
  if (fromEnvGames && fromEnvParams) {
    return { gamesUrl: fromEnvGames, paramsUrl: fromEnvParams }
  }

  try {
    const res = await fetch(`/config.json?ts=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const cfg = (await res.json()) as RuntimeConfig
    const gamesUrl = cfg.gamesCsvUrl?.trim()
    const paramsUrl = cfg.paramsCsvUrl?.trim()
    if (gamesUrl && paramsUrl) return { gamesUrl, paramsUrl }
  } catch {
    // ignore — fall back to sample
  }

  return null
}

export async function loadCatalog(): Promise<CatalogData> {
  const sheet = await resolveSheetUrls()

  if (sheet) {
    const [gameRows, paramRows] = await Promise.all([
      fetchCsv(sheet.gamesUrl),
      fetchCsv(sheet.paramsUrl),
    ])
    return buildFromRows(gameRows, paramRows, 'sheet')
  }

  const [gameRows, paramRows] = await Promise.all([
    fetchCsv(SAMPLE_GAMES_URL),
    fetchCsv(SAMPLE_PARAMS_URL),
  ])
  return buildFromRows(gameRows, paramRows, 'sample')
}
