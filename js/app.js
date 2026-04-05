/**
 * ETF Buy Advisor — Main Application Orchestrator
 *
 * Initializes all modules, fetches data, runs indicator and scoring
 * calculations, and drives the UI.  Attach: window.App
 *
 * Dependencies (all expected on window):
 *   ETFConfig, DataService, Indicators, ScoringEngine, ChartEngine, UI
 */
window.App = (function () {
  'use strict';

  // -------------------------------------------------------------------------
  // 1. Application State
  // -------------------------------------------------------------------------

  const state = {
    profile: 'balanced',        // current scoring profile key
    instruments: {},            // { SPY: { config, candles, weeklyCandles, indicators, weeklyIndicators, score }, ... }
    marketRegime: null,         // overall market regime assessment
    rankings: [],               // sorted instrument rankings
    selectedSymbol: null,       // currently selected ETF for detail view
    alerts: [],                 // evaluated alert results
    dataSource: 'mock',         // 'live' or 'mock'
    lastUpdated: null           // Date of last successful data load
  };

  /** Handle for the auto-refresh interval so it can be cleared. */
  let _refreshInterval = null;

  /** Debounce timer for window resize. */
  let _resizeTimer = null;

  // -------------------------------------------------------------------------
  // 2. Initialization
  // -------------------------------------------------------------------------

  /**
   * Main initialization flow.
   * Called once on DOMContentLoaded.
   */
  async function init() {
    showLoading();

    try {
      // --- Fetch data -------------------------------------------------------
      let allData;
      try {
        allData = await DataService.getAllData();
        // Determine if data came back live (check first symbol)
        const firstKey = Object.keys(allData)[0];
        state.dataSource = (allData[firstKey] && allData[firstKey].isLive) ? 'live' : 'mock';
      } catch (err) {
        console.warn('[App] Live data fetch failed, falling back to mock data:', err);
        allData = {};
        state.dataSource = 'mock';
      }

      // --- Process each instrument ------------------------------------------
      const configs = ETFConfig.INSTRUMENTS;

      for (const cfg of configs) {
        try {
          // Get candle data — use fetched data or generate mock as fallback
          let data = allData[cfg.symbol];
          if (!data || !data.daily || data.daily.length === 0) {
            console.warn(`[App] No data for ${cfg.symbol}, generating mock data`);
            data = DataService.generateMockData(cfg.symbol, 365);
            state.dataSource = 'mock';
          }

          const candles = data.daily;
          const weeklyCandles = generateWeeklyCandles(candles);

          // Calculate technical indicators for both timeframes
          const indicators = Indicators.calculateAll(candles);
          const weeklyIndicators = Indicators.calculateAll(weeklyCandles);

          state.instruments[cfg.symbol] = {
            config: cfg,
            candles: candles,
            weeklyCandles: weeklyCandles,
            indicators: indicators,
            weeklyIndicators: weeklyIndicators,
            quote: data.quote || null,
            score: null  // calculated next
          };
        } catch (instErr) {
          console.error(`[App] Failed to process ${cfg.symbol}:`, instErr);
          // Continue with remaining instruments
        }
      }

      // --- Market regime ----------------------------------------------------
      state.marketRegime = ScoringEngine.scoreMarketRegime(state.instruments);

      // --- Composite scores -------------------------------------------------
      const scores = {};
      for (const symbol of Object.keys(state.instruments)) {
        try {
          const inst = state.instruments[symbol];
          const score = ScoringEngine.calculateCompositeScore(
            inst.config,
            inst.indicators,
            state.instruments,
            state.profile,
            inst.weeklyIndicators
          );
          inst.score = score;
          scores[symbol] = score;
        } catch (scoreErr) {
          console.error(`[App] Scoring failed for ${symbol}:`, scoreErr);
        }
      }

      // --- Rank instruments -------------------------------------------------
      state.rankings = ScoringEngine.rankInstruments(scores);

      // --- Evaluate alert conditions ----------------------------------------
      state.alerts = checkAlerts(state.instruments);

      // --- Update timestamp -------------------------------------------------
      state.lastUpdated = new Date();

    } catch (fatalErr) {
      console.error('[App] Critical initialization error:', fatalErr);
      // Attempt to show an error state in the UI
      showErrorState(fatalErr.message);
      return;
    }

    // --- Render UI ----------------------------------------------------------
    hideLoading();
    showMainContent();
    updateDataStatus();

    if (typeof UI !== 'undefined' && UI.init) {
      UI.init(state);
    }

    // --- Auto-refresh for live data (every 5 minutes) -----------------------
    if (state.dataSource === 'live') {
      _refreshInterval = setInterval(async () => {
        try {
          console.log('[App] Auto-refreshing live data...');
          await init();
        } catch (err) {
          console.error('[App] Auto-refresh failed:', err);
        }
      }, 5 * 60 * 1000);
    }

    // --- Bind events (only on first init) -----------------------------------
    bindEvents();
  }

  // -------------------------------------------------------------------------
  // 3. Profile Switching
  // -------------------------------------------------------------------------

  /**
   * Switch the active scoring profile and recalculate everything.
   * @param {string} profileName - 'conservative' | 'balanced' | 'aggressive'
   */
  function switchProfile(profileName) {
    if (!ETFConfig.SCORING_PROFILES[profileName]) {
      console.warn(`[App] Unknown profile: ${profileName}`);
      return;
    }

    state.profile = profileName;

    // Update strategy selector button states
    const buttons = document.querySelectorAll('#strategy-selector .strategy-btn');
    buttons.forEach(btn => {
      const isActive = btn.getAttribute('data-profile') === profileName;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });

    // Recalculate scores with new profile
    recalculate();
  }

  // -------------------------------------------------------------------------
  // 4. Instrument Selection
  // -------------------------------------------------------------------------

  /**
   * Select an instrument for detailed analysis view.
   * @param {string} symbol - ETF symbol, e.g. 'SPY'
   */
  function selectInstrument(symbol) {
    if (!state.instruments[symbol]) {
      console.warn(`[App] No data for symbol: ${symbol}`);
      return;
    }

    state.selectedSymbol = symbol;

    if (typeof UI !== 'undefined' && UI.renderDetailedView) {
      UI.renderDetailedView(symbol);
    }

    // Show the detail section and scroll to it
    const section = document.getElementById('detailed-section');
    if (section) {
      section.style.display = '';
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // -------------------------------------------------------------------------
  // 5. Deselect Instrument
  // -------------------------------------------------------------------------

  /**
   * Close the detailed analysis view.
   */
  function deselectInstrument() {
    state.selectedSymbol = null;

    const section = document.getElementById('detailed-section');
    if (section) {
      section.style.display = 'none';
    }
  }

  // -------------------------------------------------------------------------
  // 6. Recalculate
  // -------------------------------------------------------------------------

  /**
   * Re-run all scoring calculations and re-render the UI.
   * Useful after settings changes or profile switches.
   */
  function recalculate() {
    const scores = {};

    for (const symbol of Object.keys(state.instruments)) {
      try {
        const inst = state.instruments[symbol];
        const score = ScoringEngine.calculateCompositeScore(
          inst.config,
          inst.indicators,
          state.instruments,
          state.profile,
          inst.weeklyIndicators
        );
        inst.score = score;
        scores[symbol] = score;
      } catch (err) {
        console.error(`[App] Recalculation failed for ${symbol}:`, err);
      }
    }

    state.rankings = ScoringEngine.rankInstruments(scores);
    state.alerts = checkAlerts(state.instruments);

    // Re-render affected UI components
    if (typeof UI !== 'undefined') {
      if (UI.renderOverviewCards) UI.renderOverviewCards(state.instruments);
      if (UI.renderBestOpportunities) UI.renderBestOpportunities(state.rankings);
      if (UI.renderMarketRegime) UI.renderMarketRegime(state.marketRegime);
      if (UI.renderAlerts) UI.renderAlerts(state.instruments);
      if (UI.renderStrategySettings) UI.renderStrategySettings(state.profile);

      // Re-render detail view if one is selected
      if (state.selectedSymbol && UI.renderDetailedView) {
        UI.renderDetailedView(state.selectedSymbol);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 7. Alert Checking
  // -------------------------------------------------------------------------

  /**
   * Evaluate configured alert conditions against current instrument data.
   * @param {Object} instruments - App.state.instruments
   * @returns {Array<{symbol, alertType, message, triggered}>}
   */
  function checkAlerts(instruments) {
    const results = [];
    const alertConfigs = ETFConfig.ALERT_DEFAULTS.filter(a => a.enabled);

    for (const symbol of Object.keys(instruments)) {
      const inst = instruments[symbol];
      if (!inst.indicators || !inst.candles || inst.candles.length === 0) continue;

      const latestCandle = inst.candles[inst.candles.length - 1];
      const price = latestCandle.close;
      const ind = inst.indicators;

      for (const alert of alertConfigs) {
        let triggered = false;
        let message = '';

        switch (alert.condition) {
          // RSI drops below threshold
          case 'rsi_below': {
            const rsiValue = ind.rsi != null
              ? (Array.isArray(ind.rsi) ? ind.rsi[ind.rsi.length - 1] : ind.rsi)
              : null;
            if (rsiValue != null && rsiValue < alert.value) {
              triggered = true;
              message = `${symbol}: RSI at ${rsiValue.toFixed(1)} — below ${alert.value} threshold (oversold)`;
            }
            break;
          }

          // Price touches 50-day moving average
          case 'touches_ma': {
            const maPeriod = alert.period || 50;
            const maKey = `sma${maPeriod}`;
            const maValue = ind[maKey] != null
              ? (Array.isArray(ind[maKey]) ? ind[maKey][ind[maKey].length - 1] : ind[maKey])
              : null;
            if (maValue != null) {
              const distancePercent = Math.abs(price - maValue) / maValue;
              if (distancePercent <= 0.005) { // within 0.5%
                triggered = true;
                message = `${symbol}: Price ($${price.toFixed(2)}) within 0.5% of ${maPeriod}-day MA ($${maValue.toFixed(2)})`;
              }
            }
            break;
          }

          // MACD bullish crossover
          case 'macd_crossover': {
            const macd = ind.macd;
            if (macd && Array.isArray(macd.histogram) && macd.histogram.length >= 2) {
              const currHist = macd.histogram[macd.histogram.length - 1];
              const prevHist = macd.histogram[macd.histogram.length - 2];
              // Bullish crossover: histogram goes from negative to positive
              if (prevHist <= 0 && currHist > 0) {
                triggered = true;
                message = `${symbol}: Bullish MACD crossover detected — MACD line crossed above signal line`;
              }
            } else if (macd && macd.macdLine != null && macd.signalLine != null) {
              // Handle non-array MACD format
              if (macd.macdLine > macd.signalLine && macd.crossover === 'bullish') {
                triggered = true;
                message = `${symbol}: Bullish MACD crossover detected`;
              }
            }
            break;
          }

          // Breakout above resistance
          case 'breakout_above_resistance': {
            const resistance = ind.resistance != null
              ? (Array.isArray(ind.resistance) ? ind.resistance[0] : ind.resistance)
              : null;
            if (resistance != null && price > resistance) {
              triggered = true;
              message = `${symbol}: Breakout above resistance at $${resistance.toFixed(2)} — current price $${price.toFixed(2)}`;
            }
            break;
          }

          // Pullback into support zone
          case 'pullback_into_support': {
            const support = ind.support != null
              ? (Array.isArray(ind.support) ? ind.support[0] : ind.support)
              : null;
            if (support != null) {
              const distToSupport = Math.abs(price - support) / support;
              // Within 1% of support
              if (distToSupport <= 0.01) {
                // Volume confirmation: check if recent volume is above average
                const recentVolumes = inst.candles.slice(-5).map(c => c.volume);
                const avgVolume = inst.candles.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
                const recentAvg = recentVolumes.reduce((s, v) => s + v, 0) / recentVolumes.length;
                const hasVolumeConfirmation = recentAvg >= avgVolume * 0.9;

                if (hasVolumeConfirmation) {
                  triggered = true;
                  message = `${symbol}: Price ($${price.toFixed(2)}) pulling back to support at $${support.toFixed(2)} with volume confirmation`;
                }
              }
            }
            break;
          }

          default:
            break;
        }

        results.push({
          symbol: symbol,
          alertType: alert.condition,
          alertId: alert.id,
          message: message || `${symbol}: ${alert.label} — not triggered`,
          triggered: triggered
        });
      }
    }

    return results;
  }

  // -------------------------------------------------------------------------
  // 8. Weekly Candle Aggregation
  // -------------------------------------------------------------------------

  /**
   * Aggregate daily candles into weekly candles (Mon-Fri buckets).
   *
   * Each week:
   *   open   = Monday's open (or first day of the week)
   *   close  = Friday's close (or last day of the week)
   *   high   = max high across the week
   *   low    = min low across the week
   *   volume = sum of daily volumes
   *
   * @param {Array} dailyCandles - array of { date, open, high, low, close, volume }
   * @returns {Array} weekly candle array
   */
  function generateWeeklyCandles(dailyCandles) {
    if (!dailyCandles || dailyCandles.length === 0) return [];

    const weeks = [];
    let bucket = null;

    for (const candle of dailyCandles) {
      const d = new Date(candle.date + 'T00:00:00');
      // Calculate the Monday of this candle's week (ISO week start)
      const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon, ...
      const mondayOffset = (dayOfWeek + 6) % 7; // days since Monday
      const monday = new Date(d);
      monday.setDate(d.getDate() - mondayOffset);
      const weekKey = formatDateKey(monday);

      if (!bucket || bucket._weekKey !== weekKey) {
        // Finalize previous bucket
        if (bucket) {
          weeks.push(finalizeBucket(bucket));
        }
        // Start new bucket
        bucket = {
          _weekKey: weekKey,
          date: weekKey,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume
        };
      } else {
        // Extend existing bucket
        bucket.high = Math.max(bucket.high, candle.high);
        bucket.low = Math.min(bucket.low, candle.low);
        bucket.close = candle.close; // last day's close becomes weekly close
        bucket.volume += candle.volume;
      }
    }

    // Don't forget the final bucket
    if (bucket) {
      weeks.push(finalizeBucket(bucket));
    }

    return weeks;
  }

  /**
   * Strip the internal _weekKey from a bucket before returning.
   */
  function finalizeBucket(bucket) {
    return {
      date: bucket.date,
      open: bucket.open,
      high: bucket.high,
      low: bucket.low,
      close: bucket.close,
      volume: bucket.volume
    };
  }

  /**
   * Format a Date as YYYY-MM-DD.
   */
  function formatDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // -------------------------------------------------------------------------
  // 9. Event Binding
  // -------------------------------------------------------------------------

  /** Track whether events have been bound to avoid duplicate listeners. */
  let _eventsBound = false;

  /**
   * Set up all DOM event listeners.
   */
  function bindEvents() {
    if (_eventsBound) return;
    _eventsBound = true;

    // --- Strategy selector buttons ---
    const strategySelector = document.getElementById('strategy-selector');
    if (strategySelector) {
      strategySelector.addEventListener('click', function (e) {
        const btn = e.target.closest('.strategy-btn');
        if (!btn) return;
        const profile = btn.getAttribute('data-profile');
        if (profile) {
          switchProfile(profile);
        }
      });
    }

    // --- Close detail view button ---
    const closeDetailBtn = document.getElementById('close-detail-btn');
    if (closeDetailBtn) {
      closeDetailBtn.addEventListener('click', function () {
        deselectInstrument();
      });
    }

    // --- Settings toggle (expand/collapse) ---
    const settingsToggle = document.getElementById('settings-toggle');
    const settingsContent = document.getElementById('strategy-settings');
    if (settingsToggle && settingsContent) {
      settingsToggle.addEventListener('click', function () {
        const isExpanded = settingsToggle.getAttribute('aria-expanded') === 'true';
        settingsToggle.setAttribute('aria-expanded', String(!isExpanded));
        settingsContent.style.display = isExpanded ? 'none' : '';
      });
      // Keyboard support for collapsible
      settingsToggle.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          settingsToggle.click();
        }
      });
    }

    // --- How-it-works toggle (expand/collapse) ---
    const howToggle = document.getElementById('how-toggle');
    const howContent = document.getElementById('how-it-works');
    if (howToggle && howContent) {
      howToggle.addEventListener('click', function () {
        const isExpanded = howToggle.getAttribute('aria-expanded') === 'true';
        howToggle.setAttribute('aria-expanded', String(!isExpanded));
        howContent.style.display = isExpanded ? 'none' : '';
      });
      howToggle.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          howToggle.click();
        }
      });
    }

    // --- Modal close ---
    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', function (e) {
        // Close when clicking the backdrop (not the content)
        if (e.target === modalOverlay) {
          hideModal();
        }
      });
      // Also close on Escape key
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modalOverlay.style.display !== 'none') {
          hideModal();
        }
      });
    }

    // --- ETF card clicks (delegated) ---
    const overviewCards = document.getElementById('overview-cards');
    if (overviewCards) {
      overviewCards.addEventListener('click', function (e) {
        const card = e.target.closest('[data-symbol]');
        if (card) {
          const symbol = card.getAttribute('data-symbol');
          if (symbol) {
            selectInstrument(symbol);
          }
        }
      });
    }

    // --- Window resize: debounced chart redraw ---
    window.addEventListener('resize', function () {
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(function () {
        if (typeof ChartEngine !== 'undefined' && ChartEngine.redrawAll) {
          ChartEngine.redrawAll(state);
        }
      }, 250);
    });
  }

  // -------------------------------------------------------------------------
  // UI Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Show the loading screen overlay.
   */
  function showLoading() {
    const el = document.getElementById('loading-screen');
    if (el) el.style.display = '';
  }

  /**
   * Hide the loading screen overlay.
   */
  function hideLoading() {
    const el = document.getElementById('loading-screen');
    if (el) el.style.display = 'none';
  }

  /**
   * Show the main content area.
   */
  function showMainContent() {
    const el = document.getElementById('main-content');
    if (el) el.style.display = '';
  }

  /**
   * Update the data source status indicator and last-updated timestamp
   * in the header.
   */
  function updateDataStatus() {
    const statusEl = document.getElementById('data-status');
    const updatedEl = document.getElementById('last-updated');

    if (statusEl) {
      const dot = statusEl.querySelector('.status-dot');
      const text = statusEl.querySelector('.status-text');

      if (state.dataSource === 'live') {
        if (dot) dot.classList.add('live');
        if (dot) dot.classList.remove('mock');
        if (text) text.textContent = 'Live Data';
      } else {
        if (dot) dot.classList.add('mock');
        if (dot) dot.classList.remove('live');
        if (text) text.textContent = 'Simulated Data';
      }
    }

    if (updatedEl && state.lastUpdated) {
      const timeStr = state.lastUpdated.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      });
      updatedEl.textContent = `Updated ${timeStr}`;
    }
  }

  /**
   * Hide the modal overlay.
   */
  function hideModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  /**
   * Display an error state in the UI when initialization fails completely.
   * @param {string} message - error message to display
   */
  function showErrorState(message) {
    hideLoading();

    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.style.display = '';
      mainContent.innerHTML =
        '<div style="text-align:center;padding:4rem 2rem;">' +
          '<h2 style="color:#ef4444;margin-bottom:1rem;">Initialization Error</h2>' +
          '<p style="color:#a1a1aa;">The application failed to load. Please refresh the page to try again.</p>' +
          '<p style="color:#71717a;font-size:0.85rem;margin-top:0.5rem;">' +
            'Error: ' + (message || 'Unknown error') +
          '</p>' +
        '</div>';
    }
  }

  // -------------------------------------------------------------------------
  // 10. DOMContentLoaded — Boot the app
  // -------------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', function () {
    init().catch(function (err) {
      console.error('App initialization failed:', err);
      showErrorState(err.message);
    });
  });

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  return {
    /** Application state — read-only reference for other modules. */
    state: state,

    /** Initialize the application. */
    init: init,

    /** Switch the active scoring profile. */
    switchProfile: switchProfile,

    /** Select an ETF for detailed analysis. */
    selectInstrument: selectInstrument,

    /** Close the detailed analysis view. */
    deselectInstrument: deselectInstrument,

    /** Recalculate all scores and re-render. */
    recalculate: recalculate,

    /** Evaluate alert conditions. */
    checkAlerts: checkAlerts,

    /** Aggregate daily candles into weekly buckets. */
    generateWeeklyCandles: generateWeeklyCandles,

    /** Hide the modal overlay. */
    hideModal: hideModal
  };
})();
