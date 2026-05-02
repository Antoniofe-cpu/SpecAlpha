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

## Backlog / Future
- P1: Backend background warm-cache at startup to eliminate cold-cache flash
- P1: Tooltip reposition on scroll/resize
- P2: Disaggregated COT report (commercial vs swap dealer)
- P2: Email/Telegram alerts on extreme divergence
- P2: Multi-language toggle (IT/EN)
