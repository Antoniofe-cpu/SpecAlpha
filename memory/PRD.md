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

## Latest Session (Feb 2026) — Round 9 (backtest cronologico onesto)
- **Logica realistica sostituisce il "best-case"**: ora il backtest guarda l'**ordine cronologico** dei min/max settimanali.
  - LONG: se il minimo arriva PRIMA del massimo → struttura rialzista → WIN (entry=min, exit=max). Se il massimo arriva prima del minimo → trader entra al max, vede scendere al min → LOSS.
  - SHORT: simmetrico.
- Statistiche ora oneste: NAS100 win rate 63.6% (era 100%), EURUSD 48% — riflettono realmente se la settimana A2 rispetta la direzione del segnale.
- Disclaimer IT/EN aggiornato.

## Latest Session (Feb 2026) — Round 8 (backtest intra-settimanale A2→A2)
- **Ridisegno logica per utente**: il trade è **intra-settimana**. Report A1 → operazione confinata nella settimana A2.
  - Per LONG: trova la coppia (i,j) con i<j che massimizza `price[j] - price[i]` nei giorni di A2.
  - Per SHORT: trova la coppia (i,j) con i<j che massimizza `price[i] - price[j]`.
  - Rispetta l'ordine cronologico: entry sempre prima dell'exit.
- Esempio NAS100 2026-03-10 LONG: Entry 2026-03-16 (24655) → Exit 2026-03-17 (24780) = **+0.51% WIN**. Tutto dentro la settimana del 16-20 marzo.
- Tabella e PDF: tornate a singolo Week Low/High (l'escursione informativa della settimana A2).

## Latest Session (Feb 2026) — Round 7 (backtest ideale 2 settimane)
- **Logica performance ridisegnata** come richiesto dall'utente: backtest "best-case" su 2 settimane.
  - W1 (settimana dopo il report): entry al prezzo migliore in direzione del segnale — LONG → W1 min, SHORT → W1 max.
  - W2 (settimana successiva): exit al prezzo migliore opposto — LONG → W2 max, SHORT → W2 min.
  - `netPct = (exit − entry)/entry × 100` con segno della direzione. WIN se > 0.
- Tabella: aggiunte colonne **W1 Low/High + W2 Low/High** per mostrare il range di ingresso e di uscita.
- Fetch prezzi esteso a +21 giorni (era +14) per coprire la W2.
- Disclaimer IT/EN aggiornato. PDF riflette la nuova logica.
- Esempio NAS100 2026-03-10 LONG: Entry 23898 (W1 min) → Exit 24188 (W2 max) = **+1.21% WIN** ✓ (prima era erroneamente LOSS).
- NAS100 stats: 22 trade, win rate 95.5%, cumulativo +60.7% — backtest con tempismo ideale.

## Latest Session (Feb 2026) — Round 6 (logica P/L corretta)
- **P/L su entry/exit close** (non più MFE−MAE): logica realistica del trade buy-and-hold senza stop intraday.
  - Entry = lunedì close della settimana successiva al report.
  - Exit = venerdì close della stessa settimana.
  - `netPct = (exit − entry) / entry × 100 × direction` (LONG: +1, SHORT: −1).
  - WIN se netPct > 0, LOSS altrimenti.
  - Week Low/High mantenuti in tabella come info contestuale (escursione settimanale).
- **Tabella performance**: aggiunta colonna "Exit" tra Entry e Week Low/High.
- **Disclaimer aggiornato** (IT/EN). PDF aggiornato.
- Esempio NAS100 2026-03-10 (LONG 24655 → 23898): ora correttamente classificato −3.07% LOSS (era erroneamente calcolato su MFE/MAE).

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

## Latest Session (Feb 2026) — Round 12 (Dual Gemini, Info popover, NZDUSD fix)
- **Dual Gemini key rotation** in `_ai_text`: Gemini #1 → Gemini #2 → Claude → fallback. Doubles the free-tier daily quota at zero cost. Both keys stored in `backend/.env` (`GEMINI_API_KEY`, `GEMINI_API_KEY_2`).
- **Info ⓘ popover** in OptionsPanel header: contextual reading guide with sections (What it is / Max Pain / Walls / GEX & Gamma Regime / How to use in trades / Caveats) for `full` kind, and (What / How to read / How to use / Caveats) for `skew` kind. Bilingual IT/EN. Animated entrance with `fadeInScale` keyframe.
- **NZDUSD options removed** — the `BNZ` ETF is delisted and Yahoo doesn't carry an NZD options chain. Endpoint now returns 404 → UI shows graceful "Options chain not available".
- **Real price coverage verified for all 17 supported assets**: indices, commodities, VIX, BTC, all major FX pairs (EUR/GBP/JPY/AUD/CAD/CHF) — all show recognisable underlying prices.

## Latest Session (Feb 2026) — Round 11 (Phantom +, AI cache stable, CME Options, Claude fallback, real prices)
- **Phantom "+" card** inline in the asset grid (only on Core scope) → click switches scope to `all`. Replaces the previous "soft cue" pill.
- **Permanent AI insight cache** keyed on `(kind, asset, reportDate, lang)` in new `ai_insight_cache` MongoDB collection. COT Intelligence / Macro Sentiment / Final Verdict are now generated **once per report** and reused forever; only a new COT report (different `reportDate`) triggers regeneration. Fallback strings are NEVER persisted.
- **Options & GEX panel** above Historical Chart in modal. New backend module `/app/backend/options_scraper.py`:
  - Indices + commodities (`kind: full`): Max Pain, Call Wall, Put Wall, Net GEX, Gamma Flip, PCR OI, GEX bar chart per strike with Spot + Max Pain reference lines. Uses Black-Scholes gamma for true GEX computation.
  - Currencies / VIX / BTC (`kind: skew`): ATM IV, 25Δ Risk Reversal proxy, OTM call IV vs OTM put IV breakdown, bullish/bearish/neutral interpretation.
  - Source: Yahoo Finance options chain via `yfinance` (CME blocks scraping; ETF proxies SPY/QQQ/GLD/USO/FXE/etc. used for options chain).
  - **Real underlying prices**: backend now also fetches the futures `=F` / forex `=X` spot from Yahoo and attaches `underlyingSpot` + `underlyingMultiplier` so the UI displays recognisable prices (S&P 500 = 7333, EUR/USD = 1.1755, Gold = 4716) alongside the ETF-derived strikes (auto-converted to underlying-equivalent: max pain on SP500 → 7273, not SPY 725).
  - Cached weekly per asset, key invalidates automatically when the option expiry rolls. Saturday refresh loop now also wipes options cache and pre-warms.
- **Claude Sonnet 4.5 fallback** for AI insights:
  - New `_claude_call` + unified `_ai_text(system, user)` entrypoint: tries Gemini → Claude → None.
  - All AI generators (`generate_macro_insight`, `_llm_generate` used by macro_sentiment & verdict) now go through `_ai_text`, so any Gemini 429 transparently routes to Claude.
  - Backend `.env` now reads `ANTHROPIC_API_KEY` (user-provided) and optional `ANTHROPIC_MODEL` (default `claude-sonnet-4-5`).
  - Note: at the time of writing both Gemini (free tier exhausted) AND the Anthropic key (no credit) are blocked → AI insights still fall back to the deterministic template until the user tops up at least one provider.

- **PDF Export overhauled**:
  - Removed bug in footer loop that overwrote pages 2+ background, erasing content (caused "blank pages").
  - Macro Sentiment panel now auto-sizes and includes up to 5 macro news events (country · date · event · prev) — previously news were dropped.
  - "COT Intelligence" panel taller (50mm) with explicit `lineHeightFactor` for clean wrapping of longer Bloomberg-style text.
  - Signal Accuracy section now uses correct `window12w` / `window24w` keys (was rendering literal `MODAL.PERF.WINDOW_52W` placeholders).
  - `ensurePage` reserves 4mm headspace for the mini header band on subsequent pages.
- **UI**: added "soft" expand-hint pill under the cards grid (pulsing amber dot + MousePointerClick icon, IT/EN translated).
- **Institutional Analysis "always the same"** root cause identified: user's Google Gemini API key on free tier (15-20 RPM) and Emergent LLM key budget exhausted. Code changes:
  - `_gemini_direct_call` now serialises calls with `_GEMINI_LOCK` + 4.5s pacing (~13 RPM, safe under 15 RPM free tier).
  - On 429/quota, fail fast instead of long backoff (don't block UI).
  - `generate_macro_insight` returns `(text, used_fallback)`. `_fetch_snapshot` skips caching when fallback is used → next refresh retries AI.
  - Bulk fetch concurrency reduced (Semaphore 4 → 2) since AI is serialised anyway.
  - Stale fallback caches purged.
  - **User action required**: top up Emergent Universal Key OR upgrade Gemini API key to paid tier — otherwise the macro insight will continue to fall back to the deterministic template.


## Latest Session (Feb 2026) — Round 12 (MyFxBook auth fix + contrarian-aligned sentiment score)
- **MyFxBook authentication fixed** (was failing with `Invalid Session` on every call after successful login):
  - Root cause: MyFxBook returns a URL-encoded session token (e.g. `…%2B…%3D%3D`); httpx `params=` re-encoded it, breaking the next call.
  - Fix in `/app/backend/myfxbook_scraper.py`: `unquote(session_id)` before caching it.
  - Switched login to GET (matches MyFxBook docs) and updated credentials in `/app/backend/.env` (`affittosmartbologna@gmail.com`).
  - Now fetches 186 symbols from `/api/get-community-outlook.json`, mapped to EURUSD/GBPUSD/USDJPY/AUDUSD/USDCAD/USDCHF/NZDUSD/GOLD/SILVER/OIL/BTC.
- **Sentiment score inverted to reflect contrarian action signal** (per user choice 2b — "Bullish/Bearish in linea con la logica contrarian"):
  - New formula in `/api/sentiment/{asset_id}`: `score = (50 - long_pct) * 2`.
  - 75% long retail → score −50 → "Bearish" interpretation → contrarian SELL.
  - 25% long retail → score +50 → "Bullish" interpretation → contrarian BUY.
  - Added `crowdLabel` field (`Bullish Crowd` / `Bearish Crowd` / `Mixed Crowd`) so the raw retail positioning is still visible separately.
- **SentimentGauge UI updated** (`/app/frontend/src/components/SentimentGauge.jsx`):
  - "Sentiment Score" label renamed to "Contrarian Score".
  - New `data-testid="contrarian-signal-badge"` showing BUY/SELL/NEUTRAL with strength.
  - New `data-testid="crowd-label-badge"` showing the raw crowd state.
  - Dual-line chart now uses Yahoo daily price as the continuous x-axis backbone with weekly COT sentiment forward-filled and rendered as a step-after line (fixes sparse-points issue).
  - X-axis uses `interval="preserveStartEnd"` + `minTickGap=40` to prevent overlapping date labels.
  - Info panel source corrected to "MyFxBook Community Outlook (account live verificati)".
- **Cleanup**: deleted deprecated `ig_sentiment_scraper.py` and `retail_sentiment_scraper.py`.
- **Code review fix**: replaced bare `except:` in `/api/sentiment/{asset_id}` history block with `except Exception as e: logger.warning(...)`.
- **Tests**: `/app/backend/tests/test_sentiment_api.py` — 21 tests, all passing (sentiment formula, crowdLabel, contrarian signal, priceHistory, regression on options/COT/verdict).
- **Status**: AI text generation still falls back to templates because Gemini free tier is exhausted; this is expected and not a bug.
