# Speculative Alpha — Product Requirements Document

## Original Problem Statement
Financial dashboard ("Speculative Alpha") computing a 0–100 **Confluence Index** from COT institutional positioning, Options (VIX proxy), and Retail-contrarian signals across 18 assets (forex majors, equity indices, commodities). Weekly batched LLM call generates IT/EN insights. UI in Italian by default.

## Phase Roadmap

### Phase 1 — Core dashboard ✅ DONE (pre-fork)
- 18 assets, COT bulk fetching, Confluence Index, weekly batched AI insights, IT/EN i18n.

### Phase 2 — Confluence tuning + macro cleanup ✅ DONE (prior fork)
- Generous alignment formula, ✓/✗ Outcome column, macro events `impact` mapping (2/3 stars), retail-sentiment UI removed.

### Phase 3 — Auth + Soft Paywall ✅ DONE (this iteration — 2026-02-17)
- **Auth foundation** (JWT email/password + Emergent Google OAuth) — `/app/backend/auth.py`
  - `POST /api/auth/register|login|logout|refresh|session|forgot-password|reset-password`
  - `GET  /api/auth/me`, `GET|PUT /api/auth/favorites`
  - httpOnly + secure + samesite=none cookies; brute-force lockout (5 attempts/15min) on IP+email AND email.
  - Admin auto-seeded via env vars (`ADMIN_EMAIL`, `ADMIN_PASSWORD`).
- **User model** in `users` collection: `user_id`, `email`, `password_hash?`, `google_id?`, `name`, `picture`, `role`, `subscription_status`, `trial_ends_at`, `favorites[]`, `created_at`.
- **Favorites persistence**: localStorage for anonymous; auto-migrated to backend on first login.
- **Soft paywall**:
  - Non-premium users see only **GOLD** clearly; all other cards rendered blurred with a "PREMIUM · Sblocca" overlay.
  - Click on a locked card opens the Auth modal.
  - Top banner: "Anteprima — solo Oro è sbloccato · 7 giorni gratis, poi 19€/mese · INIZIA LA PROVA".
  - Registration grants 7-day `trialing` status; admin always `active`.
- **Rate limiting**: `/app/backend/rate_limit.py` — 120 req/60s per IP (X-Forwarded-For aware), `/api/health` excluded.

### Phase 4 — Stripe subscription (P0 — NEXT)
- Stripe Checkout for the actual 7-day trial → 19€/mo subscription.
- Webhook updates `subscription_status` and `trial_ends_at` from Stripe events.
- "Manage subscription" link (Stripe Customer Portal) in user menu.

### Phase 5 — Newsletter (P2)
- "Sunday Insider" — generated from the weekly batched AI cache (1 LLM credit / week already paid).
- Email provider TBD (Resend/SendGrid); skipped for now per user request.

## Architecture
```
/app
├── backend/
│   ├── server.py              FastAPI bootstrap, batched AI prewarm, weekly refresh
│   ├── auth.py                JWT + Emergent Google + favorites + lockout
│   ├── rate_limit.py          In-memory IP token-bucket middleware (single-worker)
│   ├── confluence_index.py    0–100 Confluence Index
│   ├── historical_options.py  VIX proxy
│   ├── macro_scraper.py       TradingEconomics events (importance 2/3)
│   └── tests/test_auth_api.py 18 pytest cases for Phase 3
├── frontend/src/
│   ├── App.js                 Header w/ login·logout, paywall banner, locked AssetCard
│   ├── auth/
│   │   ├── AuthContext.jsx    AuthProvider, useAuth, isPremium, OAuth fragment handler
│   │   └── AuthModal.jsx      login/register w/ Google CTA, resets to login on open
│   └── components/AssetCard.jsx  locked prop → blur + PREMIUM overlay
└── memory/
    ├── PRD.md
    └── test_credentials.md
```

## Key Endpoints (Phase 3)
| Endpoint | Auth | Notes |
| --- | --- | --- |
| `POST /api/auth/register` | public | trial=7d |
| `POST /api/auth/login` | public | brute-force locked after 5 fails |
| `POST /api/auth/logout` | public | clears cookies |
| `GET  /api/auth/me` | cookie | returns sanitized user |
| `POST /api/auth/refresh` | refresh cookie | rotates access token |
| `POST /api/auth/session` | public | exchanges Emergent `session_id` |
| `GET\|PUT /api/auth/favorites` | cookie | server-side favorites |
| `POST /api/auth/forgot-password` | public | link logged to backend |
| `POST /api/auth/reset-password` | token | uses token from `password_reset_tokens` |

## Known Limitations
- **Rate limiter** uses in-memory store — single-worker only (current supervisor sets `--workers 1`). Switch to Redis if scaling out.
- **Stripe billing** not yet wired — `subscription_status="trialing"` is set locally at registration; no automated downgrade after `trial_ends_at`.
- **Reset-password** logs the link to stdout; no email delivery yet.

## Tested Credentials
See `/app/memory/test_credentials.md`.

## Backlog (P0 → P2)
- **P0**: Stripe Checkout + webhook + auto-downgrade after trial.
- **P1**: Reset-password email (Resend or SendGrid).
- **P1**: User menu dropdown — show plan + "Manage billing".
- **P2**: Sunday Insider newsletter (use the existing weekly cache).
- **P2**: Refactor `server.py` (~1750 lines) into `routes/`, `services/`, `models/`.
