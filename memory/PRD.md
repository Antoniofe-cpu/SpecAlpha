# Speculative Alpha — Product Requirements Document

## Original Problem Statement
Financial dashboard ("Speculative Alpha") computing a 0–100 **Confluence Index** from COT institutional positioning, Options (VIX proxy), and Retail/Commercial-contrarian signals across 18 assets (forex majors, equity indices, commodities). Weekly batched LLM call generates IT/EN insights. UI in Italian by default.

## Phase Roadmap

### Phase 1 — Core dashboard ✅ DONE (pre-fork)
- 18 assets, COT bulk fetching, Confluence Index, weekly batched AI insights, IT/EN i18n.

### Phase 2 — Confluence tuning + macro cleanup ✅ DONE (prior fork)
- Generous alignment formula, ✓/✗ Outcome column, macro events `impact` mapping (2/3 stars), retail-sentiment UI removed.

### Phase 3 — Auth + Soft Paywall ✅ DONE (2026-02-17)
- **Auth dual** (JWT email/password + Emergent Google OAuth) — `auth.py`
- **Soft paywall**: solo GOLD visibile agli anonimi, resto blurrato con CTA premium
- **Favorites persistente** lato server, **rate limiting** 120 req/60s per IP
- 18 pytest tests passati; brute-force lockout funzionante dietro proxy K8s

### Phase 4 — Stripe LIVE billing ✅ DONE (2026-02-17)
- Payment Link redirect con `client_reference_id` + `prefilled_email`
- Webhook firmato (`/api/billing/webhook`) → aggiorna `subscription_status`, `trial_ends_at`, `current_period_end`, `stripe_customer_id` su `customer.subscription.*`, `invoice.payment_*`, `checkout.session.completed`
- Customer Portal (`/api/billing/portal`) per gestione abbonamento
- `?billing=success` → toast "Benvenuto Premium" + polling status
- Pulsanti: "Inizia la prova" (banner + header) e "Gestisci abbonamento" (header se premium)

### Phase 5 — Admin Dashboard ✅ DONE (2026-02-17)
- Route protetta `/admin` (solo `role=admin`)
- **3 tab**: Panoramica · Utenti · Eventi live
- **KPIs**: utenti totali, nuovi 7/30gg, attivi 7/30gg, trial, active subs, past_due, canceled, conversion %, MRR
- **Funnel 30gg**: visit → register → activate → trial → paid
- **Top asset** visti (30gg) + **Revenue series** 90gg (da `stripe_events`)
- **Tabella utenti** con search, plan filter, azioni (extend trial 7gg, role toggle, delete)
- **Eventi live** filtrabili per tipo, auto-refresh ogni 30s
- **Tracking automatico**: register, login, asset_view, paywall_click, checkout_start, subscription_started/canceled, page_view, favorite_toggle (estendibile via `POST /api/admin/track`)

### Phase 6 — Confluence Index v2 ✅ DONE (2026-02-17)
- Algoritmo **semplificato e equiparato** (33.3% ciascuno):
  1. **Non-Commercial** (specs): net + WoW (diretto)
  2. **Options**: PCR + GEX
  3. **Commercial** (hedger): net + WoW **invertito** (contrarian)
- Formula: `100 × alignment × (0.5 + 0.5 × magnitudeAvg)`
- Validato su 7 asset core: SP500/NAS100 → 70-75 short allineati, GOLD → 40 long, OIL → 38 neutral

### Phase 7 — UI polish + Admin period filter + PDF v2 ✅ DONE (2026-02-17)
- **Landing**: hero title con `white-space: nowrap` (no più lettere orfane "i mercati."), 4 pillar card (COT Report, Opzioni, Indici/commodities/forex, Confluence Index).
- **Dashboard header**: rimosso pulsante Refresh (cache già batched), Guida diventa solo icona.
- **Admin**: filtro periodo (preset 7/30/90gg + custom date range) propagato a `kpis`, `funnel`, `events`, `top-assets`; nuovo endpoint `DELETE /api/admin/events` per purge eventi nel range; icona Trash2 in header.
- **PDF v2 (export per-asset)**: aggiunto **Confluence Index hero** con score 0-100 colorato per tier + direction pill + 3 stream alignment bars (Non-Comm/Options/Commercial); macro events con ★ rating (2/3 stelle); chip CI in header.

### Backlog (P1 → P2)
- **P1** Reset-password email reale (Resend o SendGrid)
- **P1** User menu dropdown completo (profilo, billing, lingua, logout)
- **P2** "Sunday Insider" newsletter dalla cache AI settimanale
- **P2** Refactor `server.py` (~1750 righe) in `routes/`, `services/`, `models/`
- **P2** Redis-backed rate limiter (per scalare oltre worker singolo)

## Architecture
```
/app
├── backend/
│   ├── server.py              FastAPI bootstrap, batched AI prewarm, weekly refresh
│   ├── auth.py                JWT + Emergent Google + favorites + brute-force lockout
│   ├── billing.py             Stripe LIVE: Payment Link, webhook, Customer Portal
│   ├── admin.py               KPIs, funnel, events, users CRUD, tracking
│   ├── rate_limit.py          In-memory IP token-bucket middleware
│   ├── confluence_index.py    v2 — 3 equally-weighted streams (NonComm, Options, Comm-inverted)
│   ├── historical_options.py  VIX proxy
│   ├── macro_scraper.py       TradingEconomics events (importance 2/3)
│   └── tests/test_auth_api.py 18 pytest cases for Phase 3
├── frontend/src/
│   ├── App.js                 Header w/ login·billing·admin·logout, paywall banner
│   ├── index.js               BrowserRouter w/ /admin route
│   ├── auth/
│   │   ├── AuthContext.jsx    AuthProvider, useAuth, isPremium, OAuth fragment handler
│   │   └── AuthModal.jsx      login/register w/ Google CTA, resets to login on open
│   ├── billing/api.js         startCheckout, openBillingPortal, fetchBillingStatus
│   ├── admin/
│   │   ├── api.js             adminApi.{kpis,funnel,events,topAssets,users,…} + track()
│   │   └── AdminPanel.jsx     Overview · Users · Events tabs
│   └── components/AssetCard.jsx  locked prop → blur + PREMIUM overlay
└── memory/
    ├── PRD.md
    └── test_credentials.md
```

## Key Endpoints
| Endpoint | Auth | Notes |
| --- | --- | --- |
| `POST /api/auth/register|login|logout|refresh|session` | public/cookie | JWT + Google OAuth |
| `GET\|PUT /api/auth/favorites` | cookie | persistent favorites |
| `POST /api/billing/checkout` | cookie | returns Stripe Payment Link URL |
| `POST /api/billing/portal` | cookie | returns Stripe Customer Portal URL |
| `GET  /api/billing/status` | cookie | live subscription status (Stripe roundtrip) |
| `POST /api/billing/webhook` | Stripe-Signature | LIVE webhook |
| `GET  /api/admin/kpis|funnel|events|top-assets|users` | admin cookie | analytics, supportano `days`/`from`/`to` |
| `POST /api/admin/track` | optional cookie | event ingestion (also from frontend) |
| `POST /api/admin/users/{id}/extend-trial|role` | admin cookie | management |
| `DELETE /api/admin/users/{id}` | admin cookie | hard delete + events wipe |
| `DELETE /api/admin/events` | admin cookie | purge eventi per `type`/`days`/`from-to` (richiede almeno un filtro o `all=true`) |

## Stripe Configuration (LIVE)
- Payment Link: `https://buy.stripe.com/6oUdR9an4cLA3lA83e73G00`
- 7-day trial, $24.99/month recurring (USD + EUR auto)
- Webhook endpoint: `https://dashboard-auth-phase.preview.emergentagent.com/api/billing/webhook`
- Events subscribed: `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`, `invoice.payment_{succeeded,failed}`

## Tested Credentials
See `/app/memory/test_credentials.md`.
