# Speculative Alpha — Institutional COT Dashboard

## Original Problem
"Correggi, migliora e rendi funzionante questo progetto" — fix, improve and make functional an existing institutional COT dashboard project (originally React+Vite+Express+TS scraping tradingster.com).

## Architecture
- **Backend**: FastAPI + Python (httpx + BeautifulSoup) on port 8001
- **Frontend**: React 19 + CRA + Tailwind + recharts + framer-motion + lucide on port 3000
- **Database**: MongoDB caching (TTL 6h)
- **AI**: Gemini 2.5 Flash via Emergent LLM key (emergentintegrations)
- **Data Source**: tradingster.com legacy-futures (parses HTML table + embedded JS chart data)

## Core Requirements (locked)
- Dark, professional, elegant, minimalist design (amber/gold primary on obsidian background)
- Soft typography (Manrope + DM Sans + JetBrains Mono), no spiky corners (rounded-3xl/[28px])
- Auto refresh every Saturday 22:00 UTC + manual refresh button
- CSV export, favorites in localStorage, 60-week history
- Italian language UI; Bloomberg-terminal style insights

## Implemented (latest)
- **Backend**: FastAPI scraper for 18 assets across INDEX/COMMODITY/CURRENCY (SP500 E-Mini 13874A, NAS100, DOW, RUSSELL, VIX, GOLD, SILVER, COPPER, OIL, NATGAS, BTC, EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, NZDUSD)
- **Endpoints**: `/api/health`, `/api/assets`, `/api/cot/{id}`, `/api/cot/{id}/history`, `/api/cot/bulk?scope=core|all`, `POST /api/cot/refresh`
- **AI Macro Insights**: Gemini-generated 1–2 sentence Bloomberg-style notes per asset
- **Mongo cache** with 6h TTL + Saturday auto-refresh background task
- **AssetCard**: Net/Δ WoW + absolute Long+changeLong + absolute Short+changeShort + macro insight + OI Share tooltip (portal-based)
- **Forex Strength Index** (currencies-only):
  - Ranking 7 currencies + USD synthetic by net position
  - Strongest/Weakest highlight cards
  - Macro narrative
  - Trade Ideas: ALL pairs with score gap >0.5 OR momentum >50% (top 6)
  - Trend Alerts (extreme abs positions)
  - Integrated Confronto Diretto (currencies only)
- **HeatmapStrip**: all-asset color-intensity grid
- **AssetDetailModal**: 3-metric row + Net Position chart with 13/26/52/100W toggles + Δ WoW bar chart + Tabella Storica + CSV export + Refresh
- **HelpModal**: 7 sections (Net Position, Δ WoW, Long/Short, OI Share, Forex Strength, Divergenze, Refresh)
- **Header**: live indicator, countdown to next sync, refresh + guide buttons
- **Skeleton tiles** for pending assets when scope changes
- **Per-endpoint axios timeouts** (fast 30s, slow 120s for bulk/history)

## Validation
- Backend tests: 12/12 PASS
- Frontend: 95% (only cold-cache transient banner; resolved on subsequent loads)

## Latest Session (Feb 2026) — Round 2
- **Performance overhaul**:
  - Logica trading aggiornata: entry = lunedì close, risk window = lun→ven, **MFE/MAE** sui min/max settimanali (non più exit fisso al venerdì close).
  - Metriche: **R = MFE/MAE** (cap 10R), **Net R = R−1**, win se Net R>0, loss se <0.
  - Backfill esteso a **50 verdetti** sintetici (era 20).
  - Frontend mostra "R cumulativo" e "Net R cumulativo" + curva R + tabella ultimi 10 con colonne MFE/MAE/R/Net R.
  - Disclaimer sintetico aggiornato.
- **i18n IT/EN 360°**:
  - Provider in `src/i18n.js` con dizionari completi per tutti i componenti utente (App, AssetCard, AssetDetailModal, HelpModal, HeatmapStrip, CurrencyStrengthIndex).
  - **Auto-detect** lingua browser via `navigator.languages` (default EN se non rilevato; IT se locale italiano); persistenza in localStorage.
  - Toggle IT/EN floating in **basso a destra** con z-index alto.
  - Termini finanziari standard (Long/Short/Net/Δ WoW/MFE/MAE/R/Win Rate/OI Share/Equity/Bullish/Bearish) preservati identici in entrambe le lingue.
- **PDF reale strutturato**: rimosso `html2canvas`. Ora usa `jsPDF` + `jspdf-autotable` per generare un PDF nativo con sezioni testo+tabelle: Snapshot, Macro, Verdict, History (8 righe), Performance R (con dettaglio per-trade). Footer paginato. Lingua del PDF segue la lingua app.

## Latest Session (Feb 2026) — Round 1
- **P0 ✅** Retroactive verdict generation: Fixed broken `_backfill_verdicts` in `server.py` (NameError caused by stray duplicated code).
- **P1 ✅** PDF Snapshot Export (round 1, ora sostituito da PDF reale).
- **P2 ✅** UI polish: rimosso `modal-refresh-btn`; rimosso "CFTC ·" dall'header.

## Backlog / Future
- P1: Backend background warm-cache at startup to eliminate cold-cache flash
- P1: Tooltip reposition on scroll/resize
- P2: Disaggregated COT report (commercial vs swap dealer)
- P2: Email/Telegram alerts on extreme divergence
- P2: Multi-language toggle (IT/EN)
