/**
 * ETF Buy Advisor — Configuration Module
 *
 * Central configuration for instruments, scoring profiles, labels, alerts,
 * tooltips, and regime classifications used throughout the application.
 */

window.ETFConfig = (function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. INSTRUMENTS — ETFs the advisor tracks
  // ---------------------------------------------------------------------------

  const INSTRUMENTS = [
    {
      symbol: 'SPY',
      name: 'SPDR S&P 500 ETF Trust',
      category: 'U.S. Large Cap',
      role: 'core',
      description: 'Tracks the S&P 500 index of 500 leading U.S. large-cap companies.',
      color: '#1f77b4'
    },
    {
      symbol: 'VOO',
      name: 'Vanguard S&P 500 ETF',
      category: 'U.S. Large Cap',
      role: 'core',
      description: 'Low-cost Vanguard fund tracking the S&P 500 index.',
      color: '#ff7f0e'
    },
    {
      symbol: 'VTI',
      name: 'Vanguard Total Stock Market ETF',
      category: 'Total U.S.',
      role: 'broad',
      description: 'Covers the entire U.S. equity market including small-, mid-, and large-cap stocks.',
      color: '#2ca02c'
    },
    {
      symbol: 'VT',
      name: 'Vanguard Total World Stock ETF',
      category: 'Global Equity',
      role: 'global',
      description: 'Provides exposure to stocks across developed and emerging markets worldwide.',
      color: '#d62728'
    },
    {
      symbol: 'VXUS',
      name: 'Vanguard Total International Stock ETF',
      category: 'International Ex-U.S.',
      role: 'international',
      description: 'Tracks international stocks outside the United States across developed and emerging markets.',
      color: '#9467bd'
    },
    {
      symbol: 'QQQ',
      name: 'Invesco QQQ Trust',
      category: 'Nasdaq Growth',
      role: 'growth',
      description: 'Tracks the Nasdaq-100 index, heavily weighted toward large-cap technology and growth stocks.',
      color: '#e377c2'
    }
  ];

  // ---------------------------------------------------------------------------
  // 2. SCORING_PROFILES — weight presets for the buy-opportunity score
  //    All weight values in each profile sum to 1.0.
  // ---------------------------------------------------------------------------

  const SCORING_PROFILES = {
    conservative: {
      weights: {
        trend: 0.30,
        momentum: 0.15,
        pullback: 0.15,
        support: 0.15,
        volume: 0.10,
        volatility: 0.10,
        marketRegime: 0.05
      },
      thresholds: {
        minTrendConfirmation: 3,       // require more indicators to confirm trend
        rsiOversold: 25,               // stricter RSI oversold level
        rsiOverbought: 70,             // earlier overbought warning
        minVolumeRatio: 1.3,           // higher volume confirmation required
        maxVolatilityPercentile: 60,   // avoid elevated-volatility entries
        pullbackDepthMin: 0.03,        // at least 3% pullback before entry
        pullbackDepthMax: 0.08         // avoid drops beyond 8%
      }
    },

    balanced: {
      weights: {
        trend: 0.25,
        momentum: 0.20,
        pullback: 0.15,
        support: 0.15,
        volume: 0.10,
        volatility: 0.10,
        marketRegime: 0.05
      },
      thresholds: {
        minTrendConfirmation: 2,
        rsiOversold: 30,
        rsiOverbought: 70,
        minVolumeRatio: 1.1,
        maxVolatilityPercentile: 70,
        pullbackDepthMin: 0.02,
        pullbackDepthMax: 0.10
      }
    },

    aggressive: {
      weights: {
        trend: 0.20,
        momentum: 0.20,
        pullback: 0.20,
        support: 0.15,
        volume: 0.10,
        volatility: 0.05,
        marketRegime: 0.10
      },
      thresholds: {
        minTrendConfirmation: 1,       // single indicator can confirm
        rsiOversold: 35,               // wider oversold band for earlier entry
        rsiOverbought: 75,             // allow more room before overbought
        minVolumeRatio: 0.9,           // lower volume bar for signals
        maxVolatilityPercentile: 85,   // tolerate higher volatility
        pullbackDepthMin: 0.01,        // shallower pullbacks accepted
        pullbackDepthMax: 0.15         // willing to buy deeper dips
      }
    }
  };

  // ---------------------------------------------------------------------------
  // 3. RATING_LABELS — human-readable labels for score ranges
  // ---------------------------------------------------------------------------

  const RATING_LABELS = [
    { min: 75, max: 100, label: 'Strong Buy Zone' },
    { min: 55, max: 74,  label: 'Buy Zone' },
    { min: 35, max: 54,  label: 'Watchlist' },
    { min: 15, max: 34,  label: 'Extended / Wait' },
    { min: 0,  max: 14,  label: 'Avoid for Now' }
  ];

  // ---------------------------------------------------------------------------
  // 4. ALERT_DEFAULTS — pre-configured alert conditions
  // ---------------------------------------------------------------------------

  const ALERT_DEFAULTS = [
    {
      id: 'rsi_oversold',
      label: 'RSI drops below 30',
      type: 'indicator',
      condition: 'rsi_below',
      value: 30,
      enabled: true
    },
    {
      id: 'price_touches_50ma',
      label: 'Price touches 50-day moving average',
      type: 'price',
      condition: 'touches_ma',
      period: 50,
      enabled: true
    },
    {
      id: 'macd_bullish_cross',
      label: 'Bullish MACD crossover',
      type: 'indicator',
      condition: 'macd_crossover',
      direction: 'bullish',
      enabled: true
    },
    {
      id: 'breakout_resistance',
      label: 'Breakout above resistance',
      type: 'price',
      condition: 'breakout_above_resistance',
      enabled: true
    },
    {
      id: 'pullback_support',
      label: 'Pullback into support zone',
      type: 'price',
      condition: 'pullback_into_support',
      enabled: true
    }
  ];

  // ---------------------------------------------------------------------------
  // 5. TOOLTIPS — short definitions for technical indicators and concepts
  // ---------------------------------------------------------------------------

  const TOOLTIPS = {
    rsi:
      'Relative Strength Index (RSI) measures the speed and magnitude of recent price changes on a 0–100 scale. Readings below 30 suggest oversold conditions; above 70 suggest overbought.',
    macd:
      'Moving Average Convergence Divergence (MACD) is a trend-following momentum indicator showing the relationship between two exponential moving averages (typically 12- and 26-period). A bullish crossover occurs when the MACD line crosses above the signal line.',
    atr:
      'Average True Range (ATR) measures market volatility by calculating the average range between each period\'s high and low, accounting for gaps. Higher ATR indicates greater volatility.',
    sma:
      'Simple Moving Average (SMA) calculates the arithmetic mean of a set of prices over a specified number of periods, smoothing out short-term fluctuations to reveal the underlying trend.',
    ema:
      'Exponential Moving Average (EMA) gives more weight to recent prices than the SMA, making it more responsive to new information and faster to react to price changes.',
    support:
      'A support level is a price zone where buying interest is historically strong enough to prevent further decline. It acts as a floor that price tends to bounce from.',
    resistance:
      'A resistance level is a price zone where selling pressure is historically strong enough to prevent further advance. It acts as a ceiling that price tends to pull back from.',
    trendRegime:
      'Trend regime classifies the current market structure — uptrend, downtrend, range-bound, or transitional — using a combination of moving averages and price action.',
    goldenCross:
      'A Golden Cross occurs when a shorter-term moving average (e.g. 50-day) crosses above a longer-term moving average (e.g. 200-day), signaling potential long-term bullish momentum.',
    deathCross:
      'A Death Cross occurs when a shorter-term moving average crosses below a longer-term moving average, signaling potential long-term bearish momentum.',
    stochasticRsi:
      'Stochastic RSI applies the stochastic oscillator formula to RSI values instead of price, producing a more sensitive momentum reading that oscillates between 0 and 1.',
    rateOfChange:
      'Rate of Change (ROC) measures the percentage change in price over a given number of periods, indicating how quickly momentum is accelerating or decelerating.',
    volatilityRegime:
      'Volatility regime categorizes the current level of market volatility (low, normal, elevated, high) based on historical ATR percentiles, helping guide position sizing and entry timing.',
    buyOpportunityScore:
      'The Buy Opportunity Score (0–100) aggregates trend, momentum, pullback, support, volume, volatility, and market-regime signals into a single rating that indicates how favorable current conditions are for a new entry.'
  };

  // ---------------------------------------------------------------------------
  // 6. VOLATILITY_REGIMES
  // ---------------------------------------------------------------------------

  const VOLATILITY_REGIMES = {
    low: 'Low Volatility Accumulation',
    normal: 'Normal',
    elevated: 'Elevated',
    high: 'High Risk'
  };

  // ---------------------------------------------------------------------------
  // 7. TREND_CLASSIFICATIONS
  // ---------------------------------------------------------------------------

  const TREND_CLASSIFICATIONS = {
    uptrend: 'Uptrend',
    pullbackInUptrend: 'Pullback in Uptrend',
    range: 'Range-Bound',
    downtrend: 'Downtrend',
    recovery: 'Recovery'
  };

  // ---------------------------------------------------------------------------
  // 8. MARKET_REGIMES
  // ---------------------------------------------------------------------------

  const MARKET_REGIMES = {
    riskOn: 'Risk-On',
    neutral: 'Neutral',
    riskOff: 'Risk-Off'
  };

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {
    INSTRUMENTS,
    SCORING_PROFILES,
    RATING_LABELS,
    ALERT_DEFAULTS,
    TOOLTIPS,
    VOLATILITY_REGIMES,
    TREND_CLASSIFICATIONS,
    MARKET_REGIMES
  };
})();
