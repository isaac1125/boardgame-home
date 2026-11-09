# BG blanket

Read-only board-game catalog. Data comes from a Google Sheet (`games` + `params`) or local sample CSVs.

## Develop

```bash
npm install
npm run dev
```

## Connect a Sheet

1. Follow `/cursor/stores/self/docs/sheet-setup.md` (or the Project `docs/sheet-setup.md`).
2. Set `VITE_GAMES_CSV_URL` and `VITE_PARAMS_CSV_URL` to the public CSV export / gviz URLs.
3. Rebuild / republish.

Without those env vars the UI loads `/seed-games.csv` and `/seed-params.csv` and labels itself as sample data.
