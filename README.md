# SureDriver

Cost-optimized MVP marketplace for car owners in Nigeria to hire vetted drivers for **their own vehicles**. Duration-based pricing, Nomba payments, trip status updates (no live map), and invite-only PIN auth.

## Stack

| Layer | Tech |
|-------|------|
| Mobile | Expo (React Native) + NativeWind |
| API | NestJS + Prisma |
| Local DB | SQLite (`apps/api/prisma/dev.db`) |
| Production DB | Supabase Postgres |
| Hosting | Render (free tier) |
| Payments | Nomba Checkout + Transfers API (`NOMBA_MOCK=true` for demos) |

## Monorepo layout

```
apps/api          NestJS REST API
apps/mobile       Expo owner + driver app
packages/shared-types   Pricing, constants, formatNaira
```

## Quick start

### Prerequisites

- Node.js 20+
- pnpm 9+ (`corepack enable && corepack prepare pnpm@9.15.0 --activate`)

### Install

```bash
pnpm install
```

### API setup

```bash
cp apps/api/.env.example apps/api/.env
pnpm db:migrate
pnpm db:seed
pnpm dev:api
```

API runs at `http://localhost:3000`. Health check: `GET /health`.

### Mobile setup

```bash
cp apps/mobile/.env.example apps/mobile/.env
pnpm dev:mobile
```

For a physical device, set `EXPO_PUBLIC_API_URL` to your machine's LAN IP (e.g. `http://192.168.1.10:3000`).

## Demo accounts (after seed)

| Role | Phone | PIN |
|------|-------|-----|
| Admin | 2348000000000 | 1234 |
| Owner | 2348011111111 | 1234 |
| Driver | 2348022222222 | 1234 |

Login screen hint: `08011111111` / PIN `1234` (owner).

## End-to-end flow

1. **Owner** logs in → Book a driver → pick duration → enter address → Pay & confirm (mock payment in dev).
2. **Driver** logs in → Go online → Accept job → En route → Start trip → End trip.
3. **Owner** sees trip status timeline on trip detail screen; can rate driver after completion.
4. **Driver** receives automated payout (mock Nomba transfer in dev).

## Pricing (duration tiers)

| Tier | Duration | Price |
|------|----------|-------|
| Hourly | 2 hours | ₦6,000 |
| Half day | 4 hours | ₦10,000 |
| Full day | 8 hours | ₦18,000 |

Platform fee: 15% (configurable via `PLATFORM_FEE_PERCENT`).

## Admin API

Authenticate as admin, then:

- `POST /admin/invites` — invite owner/driver by phone
- `GET /admin/drivers/pending` — drivers awaiting KYC
- `PATCH /admin/drivers/:userId/verification` — approve/reject driver
- `GET /admin/bookings` — list bookings
- `POST /admin/payouts/:bookingId/retry` — retry failed payout

## Production deployment

### Supabase (Postgres)

1. Create a Supabase project and copy the Postgres connection string.
2. Change `provider` in `apps/api/prisma/schema.prisma` from `sqlite` to `postgresql`.
3. Run `pnpm db:migrate` against the Supabase URL.
4. Set `DATABASE_URL` on Render to the Supabase connection string.

### Render

`render.yaml` is included. Connect the repo to Render, set Nomba credentials, and deploy.

### Nomba

Set in production:

- `NOMBA_MOCK=false`
- `NOMBA_CLIENT_ID`, `NOMBA_CLIENT_SECRET`, `NOMBA_ACCOUNT_ID`, `NOMBA_WEBHOOK_SECRET`
- Webhook URL: `https://your-api.onrender.com/payments/webhooks/nomba`

See **[docs/EXTERNAL_SETUP.md](docs/EXTERNAL_SETUP.md)** for step-by-step setup of GitHub, Supabase, Render, Nomba, and phone testing.

## Optional: local Postgres

```bash
docker compose up -d
# Set DATABASE_URL=postgresql://suredriver:suredriver@localhost:5432/suredriver
# Switch schema.prisma provider to postgresql, then pnpm db:migrate
```

## Features intentionally omitted (MVP)

- Live GPS map (status timeline instead)
- SMS OTP (invite-only PIN auth)
- In-app document uploads (WhatsApp KYC)
- Redis / Socket.io (5s polling + Expo push)

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev:api` | Start NestJS in watch mode |
| `pnpm dev:mobile` | Start Expo dev server |
| `pnpm build:api` | Build API |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:seed` | Seed demo users |
