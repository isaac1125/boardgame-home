# 桌遊抵家 / Boardgame Home

Read-only board-game catalog. Data comes from a Google Sheet (`games` + `params`) or local sample CSVs.

## Develop

```bash
npm install
npm run dev
```

## Connect a Sheet

See Project docs: `connected-sheet.md` / `sheet-setup.md`.

App reads `public/config.json`:

```json
{
  "gamesCsvUrl": "…gviz…&sheet=games",
  "paramsCsvUrl": "…gviz…&sheet=params"
}
```

## Deploy

GitHub Pages via Actions on `main`. Live site: `https://isaac1125.github.io/boardgame-home/`
