# Listify Backend API

Node.js + Express + MongoDB + Playwright backend for the Listify app.

## Stack
- **Express** — REST API
- **MongoDB / Mongoose** — database
- **Playwright** — headless browser for scraping + Facebook upload
- **Stripe** — subscription payments
- **Redis + Bull** — job queues (optional)

## Setup

```bash
npm install
cp .env.example .env
# Fill in MONGODB_URI, JWT_SECRET, STRIPE keys
npm run dev
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /auth/register | Create account |
| POST | /auth/login | Login |
| GET | /auth/me | Get profile |
| POST | /scrape/start | Start inventory scan |
| GET | /scrape/status/:jobId | Poll scan progress |
| GET | /scrape/listings/:jobId | Get scanned listings |
| GET | /scrape/history | User scan history |
| POST | /facebook/session | Save FB cookies |
| POST | /facebook/upload/start | Start FB upload |
| GET | /facebook/upload/status/:id | Poll upload progress |
| GET | /billing/plans | Get plan options |
| GET | /billing/subscription | Current subscription |
| GET | /billing/usage | Usage stats |
| POST | /billing/checkout | Create Stripe session |
| DELETE | /billing/subscription | Cancel subscription |
| POST | /billing/webhook | Stripe webhook |

## Deployment

Recommended: Railway, Render, or DigitalOcean App Platform.
Playwright requires Chromium — Railway and Render support this out of the box.
