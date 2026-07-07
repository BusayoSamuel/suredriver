# Nomba checkout & payout demo

SureDriver uses **Nomba Checkout** for owner payments and **Nomba Transfers** for driver payouts. With `NOMBA_MOCK=true` (default locally), both flows run end-to-end without real money.

## Hackathon account model (read this first)

Nomba's hierarchy for Hackathon 2026:

```
Parent ("mothership") — f666ef9b-888e-4799-85ce-acb505b28023
└── Your team's sub-account (one per team — from the hackathon email)
    ├── Virtual account → Customer A   (optional — not used by SureDriver today)
    ├── Virtual account → Customer B
    └── Virtual account → Order #1234  (one-time VA alternative to Checkout)
```

**Do not create sub-accounts from code.** Your team already has exactly one sub-account. Put it in `NOMBA_SUB_ACCOUNT_ID`.

| Concept | What it is | SureDriver |
|---------|------------|------------|
| Parent account | Shared hackathon mothership | `NOMBA_PARENT_ACCOUNT_ID` — **always** the `accountId` header |
| Sub-account | Your team / merchant wallet | `NOMBA_SUB_ACCOUNT_ID` — scoped in checkout body + payout URL path |
| Virtual account | Per-customer or per-order NUBAN | **Not used** — we collect via **Nomba Checkout** instead (one-time hosted payment per booking) |

Checkout and one-time virtual accounts are both valid “collect per order” patterns. SureDriver maps each booking to a checkout `orderReference` (`SD-…`) and reconciles via webhook + polling — same idea as tagging a VA with an `accountRef`.

**Golden rule:** `accountId` header = parent on every request. Sub-account id only in body or URL path.

## Sandbox vs production (Nomba hackathon)

Some features **do not work in sandbox** but work in production:

| Feature | Sandbox | Production |
|---------|---------|------------|
| Nomba Checkout (card/bank UI) | Yes | Yes |
| Checkout **webhooks** | Unreliable / may not fire (Nomba investigating) | Yes |
| Direct debits | No | Yes |
| Card tokenization | No | Yes |

**SureDriver implication:** In sandbox, owner payment confirmation relies on **in-app polling** (`confirmPayment` → Nomba verify API), not webhooks. That is expected — your integration is not broken if Render never logs webhook hits during sandbox checkout.

We still register `POST /payments/webhooks/nomba` for production and hackathon submission. When you go live (`NOMBA_BASE_URL=https://api.nomba.com` + LIVE creds), webhooks become the primary path; polling remains a fallback.

## Quick start

```bash
# API — mock mode on by default
cd apps/api && cp .env.example .env
pnpm db:seed && pnpm dev:api

# Mobile
cd apps/mobile && pnpm start
```

Demo accounts (PIN `1234`):

| Role  | Button       | Phone        |
|-------|--------------|--------------|
| Owner | Test Owner   | 08011111111  |
| Driver| Test Driver  | 08022222222  |

## Demo script (5 minutes)

### 1. Owner checkout (Nomba Checkout)

1. Sign in as **Test Owner**
2. Tap **Find a driver for your car** → fill the form → **Submit**
3. On **Confirm booking**, note the price breakdown (trip total, platform fee, driver share)
4. Tap **Pay & confirm**
5. **Nomba Checkout** demo screen opens (sandbox UI)
6. Tap **Pay ₦…** → payment confirms → view trip

On the trip screen, open **Payment** to see:

- Nomba order reference (`SD-…`)
- Transaction ID (`MOCK-TXN-…` or real txn in sandbox)

### 2. Driver accepts & completes trip

1. Sign in as **Test Driver**
2. Open the paid job under **Available jobs** → **Accept job**
3. Walk through: **I'm en route** → **Start trip** → **End trip**
4. Payout alert shows amount + Nomba transfer ID

### 3. Driver payout (Nomba Transfers)

1. On driver home, tap **My earnings**
2. Each completed trip shows **Paid** with payout from Nomba Transfers
3. API logs: `Payout sent` notification

## What happens under the hood

| Step              | Mock (`NOMBA_MOCK=true`)     | Sandbox (`NOMBA_MOCK=false`)   |
|-------------------|------------------------------|--------------------------------|
| Create checkout   | `POST /payments/.../checkout` | Same → real Nomba checkout link |
| Owner pays        | In-app demo → `mock-confirm`  | Nomba WebView + **polling** (webhooks unreliable in sandbox) |
| Trip completes    | `POST /trips/:id/end`         | Same                           |
| Driver payout     | `MOCK-TRF-PAYOUT-…`           | `POST /v2/transfers/bank`      |

## Switch to Nomba sandbox

In `apps/api/.env`:

```env
NOMBA_MOCK=false
NOMBA_BASE_URL=https://sandbox.nomba.com
NOMBA_CLIENT_ID=your_test_client_id
NOMBA_CLIENT_SECRET=your_test_private_key
NOMBA_PARENT_ACCOUNT_ID=your_parent_account_id
NOMBA_SUB_ACCOUNT_ID=your_sub_account_id
NOMBA_WEBHOOK_SECRET=your_webhook_signature_key
```

Webhook URL: `https://your-api/payments/webhooks/nomba`

Hackathon teams: register that URL and your sub-account ID at
https://forms.gle/hKfBRHZiTGvU7LC59

See [EXTERNAL_SETUP.md](./EXTERNAL_SETUP.md) for full Nomba dashboard steps.

## API endpoints (demo)

```http
POST /payments/bookings/:id/checkout     # Owner — start Nomba checkout
POST /payments/bookings/:id/mock-confirm # Owner — mock pay (NOMBA_MOCK only)
POST /payments/webhooks/nomba            # Nomba payment_success webhook
POST /trips/:id/end                      # Driver — triggers payout
POST /admin/payouts/:id/retry            # Admin — retry failed payout
```

## Price split example

| Duration   | Owner pays | Platform (15%) | Driver gets |
|------------|------------|----------------|-------------|
| 2 Hours    | ₦6,000     | ₦900           | ₦5,100      |
| Half day   | ₦10,000    | ₦1,500         | ₦8,500      |
| Full day   | ₦18,000    | ₦2,700         | ₦15,300     |
