# Nomba checkout & payout demo

SureDriver uses **Nomba Checkout** for owner payments and **Nomba Transfers** for driver payouts. With `NOMBA_MOCK=true` (default locally), both flows run end-to-end without real money.

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
| Owner pays        | In-app demo → `mock-confirm`  | Nomba WebView + webhook        |
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
