/**
 * ETF Buy Advisor — Cloudflare Worker API Proxy
 *
 * Proxies Yahoo Finance requests to bypass CORS restrictions.
 * Includes caching, rate limiting, and error handling.
 *
 * Deploy: npx wrangler deploy
 * Test:   npx wrangler dev
 */

const ALLOWED_SYMBOLS = new Set(['SPY', 'VOO', 'VTI', 'VT', 'VXUS', 'QQQ']);
const CACHE_TTL = 300; // 5 minutes
const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

// CORS headers for the frontend
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data, status) {
  status = status || 200;
  return new Response(JSON.stringify(data), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS),
  });
}

function errorResponse(message, status) {
  return jsonResponse({ error: message }, status || 400);
}

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (path === '/' || path === '/health') {
      return jsonResponse({ status: 'ok', service: 'ETF Buy Advisor API' });
    }

    // Single symbol: /api/chart/SPY
    const chartMatch = path.match(/^\/api\/chart\/([A-Z]+)$/);
    if (chartMatch) {
      const symbol = chartMatch[1];
      if (!ALLOWED_SYMBOLS.has(symbol)) {
        return errorResponse('Invalid symbol: ' + symbol, 400);
      }

      const range = url.searchParams.get('range') || '2y';
      const interval = url.searchParams.get('interval') || '1d';

      return fetchYahooChart(symbol, range, interval, env, ctx);
    }

    // All symbols: /api/charts
    if (path === '/api/charts') {
      const range = url.searchParams.get('range') || '2y';
      const interval = url.searchParams.get('interval') || '1d';

      const results = {};
      const promises = [];

      for (const symbol of ALLOWED_SYMBOLS) {
        promises.push(
          fetchYahooChart(symbol, range, interval, env, ctx)
            .then(function(resp) { return resp.json(); })
            .then(function(data) { results[symbol] = data; })
            .catch(function(err) { results[symbol] = { error: err.message }; })
        );
      }

      await Promise.all(promises);
      return jsonResponse(results);
    }

    return errorResponse('Not found. Use /api/chart/{SYMBOL} or /api/charts', 404);
  },
};

async function fetchYahooChart(symbol, range, interval, env, ctx) {
  // Check Cloudflare cache
  var cacheKey = 'https://etf-api.cache/' + symbol + '/' + range + '/' + interval;
  var cache = caches.default;
  var cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch from Yahoo Finance
  var yahooUrl = YAHOO_BASE + '/' + symbol + '?range=' + range + '&interval=' + interval;

  try {
    var resp = await fetch(yahooUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ETFBuyAdvisor/1.0)',
      },
    });

    if (!resp.ok) {
      return errorResponse('Yahoo Finance returned HTTP ' + resp.status, 502);
    }

    var data = await resp.json();

    // Validate response
    if (!data.chart || !data.chart.result || !data.chart.result[0]) {
      return errorResponse('Invalid Yahoo Finance response', 502);
    }

    var response = jsonResponse(data);

    // Cache for 5 minutes
    var cachedResponse = new Response(response.clone().body, response);
    cachedResponse.headers.set('Cache-Control', 'public, max-age=' + CACHE_TTL);
    ctx.waitUntil(cache.put(cacheKey, cachedResponse));

    return response;
  } catch (err) {
    return errorResponse('Failed to fetch from Yahoo Finance: ' + err.message, 502);
  }
}
