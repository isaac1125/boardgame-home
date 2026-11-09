import { useEffect, useMemo, useState } from 'react'
import type { CatalogData, Game } from './types'
import { formatPlayTime, formatPlayers } from './lib/format'
import { loadCatalog } from './lib/loadCatalog'
import { youtubeEmbedUrl } from './lib/youtube'
import './App.css'

type Filters = {
  name: string
  players: string
  categories: Set<string>
  difficulties: Set<string>
  availableOnly: boolean
}

const emptyFilters = (): Filters => ({
  name: '',
  players: '',
  categories: new Set(),
  difficulties: new Set(),
  availableOnly: false,
})

function toggleSet(set: Set<string>, value: string): Set<string> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

function matchesFilters(game: Game, filters: Filters): boolean {
  const q = filters.name.trim().toLowerCase()
  if (q && !game.name.toLowerCase().includes(q)) return false

  if (filters.players.trim()) {
    const n = Number(filters.players)
    if (!Number.isFinite(n) || n < game.playersMin || n > game.playersMax) return false
  }

  if (filters.categories.size > 0 && !filters.categories.has(game.category)) return false
  if (filters.difficulties.size > 0 && !filters.difficulties.has(game.difficulty)) return false
  if (filters.availableOnly && game.lentTo) return false

  return true
}

function filterSummary(filters: Filters): string {
  const bits: string[] = []
  if (filters.players.trim()) bits.push(`${filters.players} 人`)
  if (filters.categories.size) bits.push([...filters.categories].join('、'))
  if (filters.difficulties.size) bits.push([...filters.difficulties].join('、'))
  if (filters.availableOnly) bits.push('只看可拿')
  return bits.length ? bits.join(' · ') : '類別／難度／可拿'
}

function activeFilterCount(filters: Filters): number {
  return (
    filters.categories.size +
    filters.difficulties.size +
    (filters.availableOnly ? 1 : 0)
  )
}

function CoverThumb({
  url,
  name,
  size = 'card',
}: {
  url: string
  name: string
  size?: 'card' | 'detail'
}) {
  const [broken, setBroken] = useState(false)
  const showImg = Boolean(url) && !broken

  return (
    <div className={`cover cover--${size}`} aria-hidden={showImg ? undefined : true}>
      {showImg ? (
        <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <div className="cover__placeholder">
          <span>{name.slice(0, 1) || '?'}</span>
        </div>
      )}
    </div>
  )
}

function GameCard({
  game,
  showLocation,
  onOpen,
}: {
  game: Game
  showLocation: boolean
  onOpen: () => void
}) {
  const time = formatPlayTime(game)
  const metaBits = [
    formatPlayers(game),
    time,
    game.difficulty || null,
    showLocation && game.location ? game.location : null,
  ].filter(Boolean)

  const statusBits = [
    game.unopened ? '未開封' : null,
    game.lentTo ? '已借出' : null,
  ].filter(Boolean)

  return (
    <button type="button" className="game-card" onClick={onOpen}>
      <div className="game-card__body">
        <CoverThumb url={game.thumbnailUrl} name={game.name} size="card" />
        <div className="game-card__content">
          <div className="game-card__top">
            <h3>{game.name}</h3>
            <span className="chev">→</span>
          </div>
          <div className="meta-line">
            {game.category ? <span className="tag-cat">{game.category}</span> : null}
            <span className="meta-plain">{metaBits.join(' · ')}</span>
          </div>
          {statusBits.length > 0 ? (
            <div className="status-line">{statusBits.join(' · ')}</div>
          ) : null}
        </div>
      </div>
    </button>
  )
}

function DetailPanel({
  game,
  settings,
  onClose,
}: {
  game: Game
  settings: CatalogData['settings']
  onClose: () => void
}) {
  const time = formatPlayTime(game)
  const embed = youtubeEmbedUrl(game.rulesVideoUrl)

  return (
    <div className="detail-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${game.name} 詳情`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail-panel__header">
          <div className="detail-panel__title-row">
            <CoverThumb url={game.thumbnailUrl} name={game.name} size="detail" />
            <div className="detail-panel__title-text">
              <h2>{game.name}</h2>
              {game.category ? <span className="tag-cat">{game.category}</span> : null}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="關閉">
            ×
          </button>
        </div>

        <div className="detail-grid">
          <div>
            <div className="label">人數</div>
            <div className="value">{formatPlayers(game)}</div>
          </div>
          <div>
            <div className="label">預計時間</div>
            <div className="value">{time ?? '—'}</div>
          </div>
          <div>
            <div className="label">類別</div>
            <div className="value">{game.category || '—'}</div>
          </div>
          <div>
            <div className="label">難易度</div>
            <div className="value">{game.difficulty || '—'}</div>
          </div>
          {settings.showLocation ? (
            <div>
              <div className="label">放置位置</div>
              <div className="value">{game.location || '—'}</div>
            </div>
          ) : null}
          <div>
            <div className="label">狀態</div>
            <div className="value">
              {game.unopened ? '未開封' : game.lentTo ? '已借出' : '可拿'}
            </div>
          </div>
          {settings.showLentTo && game.lentTo ? (
            <div className="span-2">
              <div className="label">借出給</div>
              <div className="value">{game.lentTo}</div>
            </div>
          ) : null}
        </div>

        {game.notes ? (
          <div className="notes-box">
            <div className="label">備註</div>
            <p>{game.notes}</p>
          </div>
        ) : null}

        {embed ? (
          <div className="video-box">
            <div className="label">規則影片</div>
            <div className="video-frame">
              <iframe
                src={embed}
                title={`${game.name} 規則影片`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  )
}

export default function App() {
  const [data, setData] = useState<CatalogData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [selected, setSelected] = useState<Game | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadCatalog()
      .then((catalog) => {
        if (!cancelled) setData(catalog)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '載入失敗')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selected) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected])

  const filtered = useMemo(() => {
    if (!data) return []
    return data.games.filter((g) => matchesFilters(g, filters))
  }, [data, filters])

  const chipCount = activeFilterCount(filters)

  if (error) {
    return (
      <div className="page">
        <header className="topbar">
          <div className="brand">桌遊抵家</div>
          <div className="topbar-right">Boardgame Home</div>
        </header>
        <div className="panel error-panel">
          <h1>載入失敗</h1>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="page">
        <header className="topbar">
          <div className="brand">桌遊抵家</div>
          <div className="topbar-right">Boardgame Home</div>
        </header>
        <div className="panel">
          <p className="loading">載入中…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">桌遊抵家</div>
        <div className="topbar-right">Boardgame Home</div>
      </header>

      {data.source === 'sample' ? (
        <div className="sample-banner" role="status">
          目前顯示<strong>樣本資料</strong>。接上 Google 試算表後會自動改讀正式清單。
        </div>
      ) : null}

      <section className="panel filter-panel">
        <div className="filter-grid">
          <label className="field field--players">
            <span>人數</span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="4"
              value={filters.players}
              onChange={(e) => setFilters((f) => ({ ...f, players: e.target.value }))}
            />
          </label>
          <label className="field field--grow">
            <span>名稱</span>
            <input
              type="search"
              placeholder="關鍵字…"
              value={filters.name}
              onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
        </div>

        <button
          type="button"
          className={`filter-summary ${filtersOpen ? 'is-open' : ''} ${chipCount ? 'has-active' : ''}`}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <span className="filter-summary__label">
            篩選
            {chipCount > 0 ? <em>{chipCount}</em> : null}
          </span>
          <span className="filter-summary__text">{filterSummary(filters)}</span>
          <span className="filter-summary__chev" aria-hidden>
            {filtersOpen ? '▴' : '▾'}
          </span>
        </button>

        {filtersOpen ? (
          <div className="filter-extra">
            <div className="chip-block">
              <div className="chip-label">類別</div>
              <div className="chips chips--scroll">
                {data.categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`chip ${filters.categories.has(c) ? 'is-on chip--yellow' : ''}`}
                    onClick={() =>
                      setFilters((f) => ({ ...f, categories: toggleSet(f.categories, c) }))
                    }
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="chip-block">
              <div className="chip-label">難易度</div>
              <div className="chips chips--scroll">
                {data.difficulties.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`chip ${filters.difficulties.has(d) ? 'is-on chip--teal' : ''}`}
                    onClick={() =>
                      setFilters((f) => ({ ...f, difficulties: toggleSet(f.difficulties, d) }))
                    }
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <label className="toggle">
              <input
                type="checkbox"
                checked={filters.availableOnly}
                onChange={(e) => setFilters((f) => ({ ...f, availableOnly: e.target.checked }))}
              />
              <span>只看可拿（不含已借出）</span>
            </label>
          </div>
        ) : null}
      </section>

      <section className="list-section">
        <div className="list-header">
          <h2>遊戲列表</h2>
          <span>共 {filtered.length} 款</span>
        </div>

        {filtered.length === 0 ? (
          <div className="panel empty">沒有符合條件的遊戲，試試放寬篩選。</div>
        ) : (
          <div className="game-grid">
            {filtered.map((game) => (
              <GameCard
                key={game.name}
                game={game}
                showLocation={data.settings.showLocation}
                onOpen={() => setSelected(game)}
              />
            ))}
          </div>
        )}
      </section>

      {selected ? (
        <DetailPanel
          game={selected}
          settings={data.settings}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  )
}
