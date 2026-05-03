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

## Latest Session (Feb 2026) — Round 5 (rifinitura finale)
- **Trade performance solo se bias concordi**: `_synthetic_verdict` aggiornato — LONG solo se `net>0 AND delta>0`, SHORT solo se `net<0 AND delta<0`, altrimenti WAIT (escluso). `_backfill_verdicts` ora rigenera sempre i sintetici per propagare la nuova regola. `verdict_performance` filtra i WAIT. Test EURUSD: 26 trade (era 50), 25 valutati, 52% win rate, R cumulativo +1R.
- **Toggle lingua nel footer** (no più overlay): integrato come elemento del flusso, parent = footer DIV. Scrolla con la pagina, sempre visibile alla fine.
- **Re-fetch lingua più aggressivo**: al cambio toggle, `setSnapshots([])` immediato per dare feedback visivo, poi rigenero AI con lang corretto.
- **PDF arricchito**: aggiunte le sezioni mancanti — sparkline Net Position storico (vector line) + Δ WoW recent bars (vector verde/rosso). PDF ora copre l'intera card. 62 KB nativo.

## Latest Session (Feb 2026) — Round 4 (rifinitura)
- **AI multilingua end-to-end**:
  - Backend: tutti gli endpoint AI (`/cot/{asset}`, `/cot/bulk`, `/macro/{asset}`, `/verdict/{asset}`) accettano `?lang=it|en`. Prompt e fallback dinamici. Cache `_id` separata per lingua (`{asset}__{lang}`).
  - Frontend: `api.js` propaga `lang`. App e Modal ri-fetchano automaticamente quando il toggle cambia, popolando le tre considerazioni (Macro Intelligence, Macro Sentiment, Final Verdict) nella nuova lingua.
- **Toggle lingua bottom-LEFT** (era coperto dal badge Emergent in basso a destra). Auto-detect mantenuto.
- **Performance equity curve = curva monotone** (no più step-after).
- **PDF "fotocopia documento"**:
  - Sostituito html2canvas con costruzione **nativa jsPDF + autoTable**.
  - Replica fedele del design: header con brand stripe, 3 panel top (Sentiment / Net Position / Macro Intelligence con quote in italic), Macro Sentiment full-width, Final Verdict colorato, COT History table colorata (Δ verde/rosso), Performance R con stats strip + R-curve vector + ultimi 10 verdetti.
  - Multi-pagina A4 portrait con header riassuntivo + footer paginato su tutte le pagine.
  - **44 KB** invece di 42 MB; testo selezionabile; lingua del PDF segue il toggle app.

## Latest Session (Feb 2026) — Round 3 (semplificazione)
- **Performance R semplice**:
  - Una WIN vale **+1R**, una LOSS vale **−1R**, FLAT = 0R (rare).
  - WIN se MFE > MAE nella settimana lun→ven, LOSS se MAE > MFE.
  - **R cumulativo** = somma dei +1/−1 (= wins − losses).
  - Rimosse colonne MFE/MAE/Net R/R-multiple — tabella ridotta a Report/Verdetto/Entry/Week Low/Week High/R/Outcome.
  - Disclaimer riscritto.
- **PDF design-fedele**: tornato a html2canvas+jspdf, ma con **clone offscreen** del modal — risolve il taglio a metà (clone con `maxHeight:none`, `overflow:visible`, scrollEl flatten). Il PDF mantiene il design originale (header, chart, performance). Multi-pagina A4 portrait. Verificato download `{ASSET}_{reportDate}.pdf`.

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
