# One-Time Cloudflare Worker Setup

Follow these 4 steps to enable automatic deployment via GitHub Actions.
After setup, any push to `worker/` will auto-deploy.

## Step 1 — Create a Cloudflare account

1. Go to https://dash.cloudflare.com/sign-up
2. Sign up with email + password (free, no credit card required)
3. Verify your email

## Step 2 — Create an API token

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click **Create Token**
3. Find the template **"Edit Cloudflare Workers"** and click **Use template**
4. Under **Account Resources**, select your account from the dropdown
5. Under **Zone Resources**, leave as default ("All zones" or "Include: All zones")
6. Scroll down and click **Continue to summary**
7. Click **Create Token**
8. **Copy the token immediately** — you won't be able to see it again

## Step 3 — Add the token as a GitHub secret

1. Go to https://github.com/myonnone01/ETF-app/settings/secrets/actions
2. Click **New repository secret**
3. Name: `CLOUDFLARE_API_TOKEN`
4. Value: paste the token from Step 2
5. Click **Add secret**

## Step 4 — Trigger the first deploy

Option A (easiest): Go to the **Actions** tab in your repo, click
**"Deploy Cloudflare Worker"** workflow, then click **Run workflow**.

Option B: Push any small change to the `worker/` directory.

After the action completes (~30 seconds), check its logs — you'll see
a URL like `https://etf-buy-advisor-api.<your-subdomain>.workers.dev`.

## Step 5 — Configure the app

1. Open https://myonnone01.github.io/ETF-app/
2. Expand **Strategy Settings**
3. Paste the Worker URL into **Cloudflare Worker URL**
4. Click **Save** → **Refresh Data Now**
5. Header should flip to "Live Data" (green dot)

## Troubleshooting

**Action fails with "Authentication error"**
- Token expired or wrong scope. Regenerate using the "Edit Cloudflare Workers" template.

**Action succeeds but no URL in logs**
- Check the "Deploy to Cloudflare Workers" step output. The URL is printed on the line starting with "Published".

**Worker returns 502 errors**
- Yahoo Finance may be temporarily blocking the Cloudflare IP. The app will automatically fall back to other data sources.

**Free tier limits**
- 100,000 requests/day (plenty for personal use)
- 10ms CPU time per request
- No bandwidth limits
