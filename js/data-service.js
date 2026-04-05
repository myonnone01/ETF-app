/**
 * DataService - Data layer for ETF Buy Advisor
 *
 * Provides price history (daily & weekly OHLCV candles) for SPY, VOO, VTI,
 * VT, VXUS, and QQQ.  Attempts live Yahoo Finance fetches first; falls back
 * to a deterministic mock-data generator that produces realistic price paths
 * with interesting technical patterns.
 *
 * Attach: window.DataService
 */
(function () {
  'use strict';

  // -----------------------------------------------------------------------
  // Configuration
  // -----------------------------------------------------------------------

  /** Tracked ETF symbols */
  const SYMBOLS = ['SPY', 'VOO', 'VTI', 'VT', 'VXUS', 'QQQ'];

  /**
   * Per-symbol parameters used by the mock generator.
   *   price        – approximate April 2026 closing price
   *   avgVolume    – average daily share volume
   *   volatility   – annualised volatility multiplier (1 = baseline ~12%)
   *   drift        – annualised upward drift (log-return bias)
   *   correlation  – how tightly the symbol tracks SPY's random component
   */
  const ETF_PROFILES = {
    SPY:  { price: 565, avgVolume: 70_000_000, volatility: 1.0,  drift: 0.10, correlation: 1.0  },
    VOO:  { price: 520, avgVolume:  5_000_000, volatility: 1.0,  drift: 0.10, correlation: 0.99 },
    VTI:  { price: 280, avgVolume:  4_000_000, volatility: 1.02, drift: 0.10, correlation: 0.97 },
    VT:   { price: 115, avgVolume:  2_000_000, volatility: 0.95, drift: 0.08, correlation: 0.85 },
    VXUS: { price:  62, avgVolume:  6_000_000, volatility: 0.90, drift: 0.06, correlation: 0.55 },
    QQQ:  { price: 490, avgVolume: 45_000_000, volatility: 1.35, drift: 0.12, correlation: 0.92 },
  };

  // -----------------------------------------------------------------------
  // Seeded PRNG  (Mulberry32 – fast, 32-bit, deterministic)
  // -----------------------------------------------------------------------

  /**
   * Create a seeded pseudo-random number generator.
   * @param {string} seed – any string; hashed to a 32-bit integer.
   * @returns {function(): number} – returns values in [0, 1).
   */
  function createRng(seed) {
    // Simple string hash (djb2)
    let h = 5381;
    for (let i = 0; i < seed.length; i++) {
      h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
    }

    // Mulberry32
    let state = h >>> 0;
    return function () {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Return a normally-distributed random value (Box-Muller).
   * @param {function} rng – seeded RNG returning [0,1).
   */
  function randNormal(rng) {
    const u1 = rng() || 1e-10; // avoid log(0)
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // -----------------------------------------------------------------------
  // Date helpers
  // -----------------------------------------------------------------------

  /** Format Date as YYYY-MM-DD */
  function fmtDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** True if the given Date falls on a weekend. */
  function isWeekend(d) {
    const dow = d.getDay();
    return dow === 0 || dow === 6;
  }

  /**
   * Generate an array of trading dates ending at `endDate`, going back
   * roughly `tradingDays` business days.
   */
  function tradingDateRange(endDate, tradingDays) {
    const dates = [];
    const d = new Date(endDate);
    while (dates.length < tradingDays) {
      if (!isWeekend(d)) {
        dates.unshift(new Date(d));
      }
      d.setDate(d.getDate() - 1);
    }
    return dates;
  }

  // -----------------------------------------------------------------------
  // Mock Data Generator
  // -----------------------------------------------------------------------

  /**
   * A shared random walk component that drives correlated ETFs together.
   * Generated once per session using the seed "MARKET".
   */
  let _marketReturns = null;

  function getMarketReturns(days) {
    if (_marketReturns && _marketReturns.length >= days) {
      return _marketReturns;
    }

    const rng = createRng('MARKET_BASE_2026');
    const returns = [];
    const baseVol = 0.012; // ~1.2% daily vol ≈ ~19% annualised

    // Create an interesting path: rally, pullback, rally, consolidation
    // by modulating volatility and drift over time.
    for (let i = 0; i < days; i++) {
      const t = i / days; // 0..1 progress

      // Regime: periods of low/high vol & positive/negative drift
      let localDrift = 0.0004; // slight daily upward bias
      let localVol = baseVol;

      // Phase 1 (0-20%): steady uptrend
      // Phase 2 (20-30%): sharp pullback (~8-12%)
      if (t > 0.20 && t < 0.30) {
        localDrift = -0.003;
        localVol = baseVol * 1.6;
      }
      // Phase 3 (30-50%): recovery / golden-cross setup
      else if (t >= 0.30 && t < 0.50) {
        localDrift = 0.0008;
        localVol = baseVol * 0.9;
      }
      // Phase 4 (50-60%): second smaller dip
      else if (t >= 0.50 && t < 0.60) {
        localDrift = -0.001;
        localVol = baseVol * 1.2;
      }
      // Phase 5 (60-85%): strong rally
      else if (t >= 0.60 && t < 0.85) {
        localDrift = 0.0007;
        localVol = baseVol * 0.85;
      }
      // Phase 6 (85-100%): consolidation near highs
      else if (t >= 0.85) {
        localDrift = 0.0002;
        localVol = baseVol * 1.0;
      }

      returns.push(localDrift + localVol * randNormal(rng));
    }

    _marketReturns = returns;
    return returns;
  }

  /**
   * Generate mock daily OHLCV candles for `symbol`.
   *
   * @param {string} symbol – e.g. 'SPY'
   * @param {number} [days=365] – calendar days of history
   * @returns {{ daily: Array, weekly: Array, isLive: boolean }}
   */
  function generateMockData(symbol, days) {
    if (days === undefined || days === null) days = 365;

    const profile = ETF_PROFILES[symbol];
    if (!profile) {
      throw new Error(`Unknown symbol: ${symbol}`);
    }

    // Number of trading days (~252 per year)
    const tradingDays = Math.round(days * (252 / 365));

    // End date: most recent Friday-or-earlier weekday relative to "today"
    const today = new Date(2026, 3, 3); // April 3 2026 (Friday)
    const dates = tradingDateRange(today, tradingDays);

    // Market-wide component (shared correlation driver)
    const marketReturns = getMarketReturns(tradingDays);

    // Symbol-specific RNG for the idiosyncratic component
    const rng = createRng(symbol + '_IDIO_2026');

    // Build the close-price series working forward from the start.
    // We know the *end* price, so we generate log-returns then rescale.
    const logReturns = [];
    const dailyVol = 0.012 * profile.volatility;
    const dailyDrift = profile.drift / 252;

    for (let i = 0; i < tradingDays; i++) {
      const marketComponent = profile.correlation * marketReturns[i];
      const idioVol = dailyVol * Math.sqrt(1 - profile.correlation * profile.correlation);
      const idioComponent = idioVol * randNormal(rng);
      const r = dailyDrift + marketComponent + idioComponent;
      logReturns.push(r);
    }

    // Cumulative log-return from day 0 to day N
    const cumReturns = [0];
    for (let i = 0; i < logReturns.length; i++) {
      cumReturns.push(cumReturns[i] + logReturns[i]);
    }

    // Rescale so that the final close equals `profile.price`.
    // close[i] = profile.price * exp(cumReturns[i] - cumReturns[last])
    const lastCum = cumReturns[cumReturns.length - 1];
    const closes = [];
    for (let i = 0; i < tradingDays; i++) {
      const price = profile.price * Math.exp(cumReturns[i + 1] - lastCum);
      closes.push(Math.round(price * 100) / 100);
    }

    // Build OHLCV candles from the close series
    const daily = [];
    for (let i = 0; i < tradingDays; i++) {
      const close = closes[i];
      const prevClose = i > 0 ? closes[i - 1] : close * (1 - logReturns[0]);

      // Open gaps slightly from previous close
      const gapFactor = 1 + (rng() - 0.5) * 0.003;
      let open = Math.round(prevClose * gapFactor * 100) / 100;

      // High and low: extend beyond open/close by a random wick
      const wickUp = close * (0.001 + rng() * 0.006);
      const wickDown = close * (0.001 + rng() * 0.006);
      let high = Math.round((Math.max(open, close) + wickUp) * 100) / 100;
      let low = Math.round((Math.min(open, close) - wickDown) * 100) / 100;

      // Ensure consistency: low <= open,close <= high
      if (low > Math.min(open, close)) low = Math.min(open, close);
      if (high < Math.max(open, close)) high = Math.max(open, close);

      // Volume: log-normal around average, higher on volatile days
      const volChange = Math.abs(logReturns[i]);
      const volMultiplier = 1 + volChange * 30; // big moves → big volume
      const rawVol = profile.avgVolume * volMultiplier * (0.7 + rng() * 0.6);
      const volume = Math.round(rawVol);

      daily.push({
        date: fmtDate(dates[i]),
        open,
        high,
        low,
        close,
        volume,
      });
    }

    // Aggregate into weekly candles (Mon-Fri weeks)
    const weekly = aggregateWeekly(daily);

    return { daily, weekly, isLive: false };
  }

  /**
   * Aggregate daily candles into weekly candles.
   * Each week runs Monday-Friday; partial weeks are included.
   */
  function aggregateWeekly(dailyCandles) {
    if (!dailyCandles || dailyCandles.length === 0) return [];

    const weeks = [];
    let bucket = null;

    for (const candle of dailyCandles) {
      const d = new Date(candle.date + 'T00:00:00');
      // ISO week start: Monday
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const weekKey = fmtDate(weekStart);

      if (!bucket || bucket._key !== weekKey) {
        if (bucket) weeks.push(finalizeBucket(bucket));
        bucket = {
          _key: weekKey,
          date: weekKey,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        };
      } else {
        bucket.high = Math.max(bucket.high, candle.high);
        bucket.low = Math.min(bucket.low, candle.low);
        bucket.close = candle.close;
        bucket.volume += candle.volume;
      }
    }

    if (bucket) weeks.push(finalizeBucket(bucket));
    return weeks;
  }

  function finalizeBucket(bucket) {
    return {
      date: bucket.date,
      open: bucket.open,
      high: bucket.high,
      low: bucket.low,
      close: bucket.close,
      volume: bucket.volume,
    };
  }

  // -----------------------------------------------------------------------
  // Yahoo Finance live data fetcher
  // -----------------------------------------------------------------------

  /**
   * Attempt to fetch real price data from Yahoo Finance v8 API.
   * Falls back to mock data on any error (CORS, network, parse, etc.).
   *
   * @param {string} symbol
   * @returns {Promise<{ daily: Array, weekly: Array, isLive: boolean }>}
   */
  async function fetchLiveData(symbol) {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=2y&interval=1d`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const json = await resp.json();
      const result = json.chart.result[0];
      const timestamps = result.timestamp;
      const quote = result.indicators.quote[0];

      if (!timestamps || !quote) throw new Error('Unexpected payload shape');

      const daily = [];
      for (let i = 0; i < timestamps.length; i++) {
        // Skip days with null data (holidays, etc.)
        if (
          quote.open[i] == null ||
          quote.close[i] == null ||
          quote.high[i] == null ||
          quote.low[i] == null
        ) {
          continue;
        }

        const d = new Date(timestamps[i] * 1000);
        daily.push({
          date: fmtDate(d),
          open: Math.round(quote.open[i] * 100) / 100,
          high: Math.round(quote.high[i] * 100) / 100,
          low: Math.round(quote.low[i] * 100) / 100,
          close: Math.round(quote.close[i] * 100) / 100,
          volume: Math.round(quote.volume[i] || 0),
        });
      }

      if (daily.length === 0) throw new Error('No valid candles parsed');

      const weekly = aggregateWeekly(daily);

      console.log(`[DataService] Live data loaded for ${symbol} (${daily.length} candles)`);
      return { daily, weekly, isLive: true };
    } catch (err) {
      console.warn(
        `[DataService] Live fetch failed for ${symbol}: ${err.message}. Using mock data.`
      );
      return generateMockData(symbol);
    }
  }

  // -----------------------------------------------------------------------
  // Quote helper
  // -----------------------------------------------------------------------

  /**
   * Derive a current-quote snapshot from the most recent candle data.
   *
   * @param {string} symbol
   * @param {{ daily: Array }} data – already-fetched candle data (optional;
   *        if omitted the function generates mock data on the fly).
   * @returns {{ symbol, price, change, changePercent, volume,
   *             high52week, low52week, isLive }}
   */
  function deriveQuote(symbol, data) {
    if (!data) data = generateMockData(symbol);

    const daily = data.daily;
    const last = daily[daily.length - 1];
    const prev = daily.length > 1 ? daily[daily.length - 2] : last;

    const change = Math.round((last.close - prev.close) * 100) / 100;
    const changePercent =
      Math.round((change / prev.close) * 10000) / 100; // two decimals

    // 52-week high/low (last 252 trading days or whatever is available)
    const lookback = daily.slice(-252);
    let high52 = -Infinity;
    let low52 = Infinity;
    for (const c of lookback) {
      if (c.high > high52) high52 = c.high;
      if (c.low < low52) low52 = c.low;
    }

    return {
      symbol,
      price: last.close,
      change,
      changePercent,
      volume: last.volume,
      high52week: high52,
      low52week: low52,
      isLive: !!data.isLive,
    };
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Get a quote snapshot for a single symbol.
   *
   * @param {string} symbol
   * @returns {Promise<Object>}
   */
  async function getQuote(symbol) {
    const data = await fetchLiveData(symbol);
    return deriveQuote(symbol, data);
  }

  /**
   * Fetch candle data for all tracked ETFs.
   *
   * @returns {Promise<Object>} – map of symbol -> { daily, weekly, isLive, quote }
   */
  async function getAllData() {
    const results = {};

    // Fetch all symbols in parallel
    const entries = await Promise.all(
      SYMBOLS.map(async (sym) => {
        const data = await fetchLiveData(sym);
        const quote = deriveQuote(sym, data);
        return [sym, { ...data, quote }];
      })
    );

    for (const [sym, val] of entries) {
      results[sym] = val;
    }

    return results;
  }

  // -----------------------------------------------------------------------
  // Expose on window
  // -----------------------------------------------------------------------

  window.DataService = {
    /** List of tracked ETF symbols. */
    SYMBOLS,

    /** Per-symbol profile info (price, volume, volatility, etc.). */
    ETF_PROFILES,

    /**
     * Generate deterministic mock OHLCV data.
     * @param {string} symbol
     * @param {number} [days=365]
     * @returns {{ daily: Array, weekly: Array, isLive: false }}
     */
    generateMockData,

    /**
     * Fetch live data from Yahoo Finance; falls back to mock.
     * @param {string} symbol
     * @returns {Promise<{ daily: Array, weekly: Array, isLive: boolean }>}
     */
    fetchLiveData,

    /**
     * Get a quote snapshot (price, change, 52-week range, etc.).
     * @param {string} symbol
     * @returns {Promise<Object>}
     */
    getQuote,

    /**
     * Fetch data for all 6 ETFs in parallel.
     * @returns {Promise<Object>} – symbol -> { daily, weekly, isLive, quote }
     */
    getAllData,
  };
})();
