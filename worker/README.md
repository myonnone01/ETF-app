# ETF Buy Advisor — API Proxy (Cloudflare Worker)

A lightweight serverless proxy that fetches Yahoo Finance data, bypassing CORS.

## Setup (one-time, ~2 minutes)

1. Create a free Cloudflare account at https://dash.cloudflare.com/sign-up
2. Install Wrangler CLI:
   ```bash
   npm install -g wrangler
   ```
3. Login:
   ```bash
   wrangler login
   ```
4. Deploy:
   ```bash
   cd worker
   npx wrangler deploy
   ```
5. Copy the URL it gives you (e.g. `https://etf-buy-advisor-api.<you>.workers.dev`)
6. Set it in the app: open Strategy Settings → paste the Worker URL

## Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/chart/SPY` | Single symbol chart data |
| `GET /api/chart/SPY?range=1y&interval=1d` | With custom range/interval |
| `GET /api/charts` | All 6 ETFs at once |
| `GET /health` | Health check |

## Free Tier Limits

- 100,000 requests/day
- 10ms CPU time per request
- Global edge deployment (fast everywhere)
- Built-in caching (5-minute TTL)
