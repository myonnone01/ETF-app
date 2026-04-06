/**
 * ui.js - UI Rendering & Interaction Manager
 * Handles all DOM rendering, event binding, and view management.
 */
window.UI = (function() {
  'use strict';

  let appData = null;

  function formatNum(n, d) { return n != null ? Number(n).toFixed(d || 2) : '--'; }
  function formatPct(n, d) { return n != null ? (n >= 0 ? '+' : '') + Number(n).toFixed(d || 1) + '%' : '--'; }
  function formatCurrency(n) { return n != null ? '$' + Number(n).toFixed(2) : '--'; }
  function getScoreColor(s) {
    if (s >= 75) return '#22c55e';
    if (s >= 55) return '#4ade80';
    if (s >= 35) return '#eab308';
    if (s >= 15) return '#f97316';
    return '#ef4444';
  }
  function getRatingClass(label) {
    if (!label) return 'rating-watchlist';
    if (label.includes('Strong')) return 'rating-strong-buy';
    if (label.includes('Buy')) return 'rating-buy';
    if (label.includes('Watch')) return 'rating-watchlist';
    if (label.includes('Extended') || label.includes('Wait')) return 'rating-extended';
    return 'rating-avoid';
  }
  function tip(text) {
    return '<span class="tooltip"><span class="tip-icon">?</span><span class="tip-text">' + text + '</span></span>';
  }

  // ── INIT ─────────────────────────────────────────────────────────────
  function init(data) {
    appData = data;
    renderDisclaimer();
    renderOverviewCards(data.instruments);
    renderBestOpportunities(data.rankings);
    renderMarketRegime(data.marketRegime);
    renderAlerts(data.instruments);
    renderComparisons(data.instruments);
    renderStrategySettings(data.profile || 'balanced');
    renderHowItWorks();
  }

  // ── DISCLAIMER ───────────────────────────────────────────────────────
  function renderDisclaimer() {
    const el = document.getElementById('disclaimer-bar');
    if (el) el.innerHTML = 'This tool provides educational market analysis and technical decision support only. Not personalized investment advice. Past performance does not guarantee future results.';
  }

  // ── OVERVIEW CARDS ───────────────────────────────────────────────────
  function renderOverviewCards(instruments) {
    const container = document.getElementById('overview-cards');
    if (!container) return;
    const symbols = ['SPY', 'VOO', 'VTI', 'VT', 'VXUS', 'QQQ'];
    let html = '';

    symbols.forEach(sym => {
      const inst = instruments[sym];
      if (!inst) return;
      const lv = inst.indicators ? inst.indicators.latestValues : {};
      const score = inst.score ? inst.score.compositeScore : 0;
      const rating = inst.score ? inst.score.ratingLabel : 'Watchlist';
      const trend = inst.score ? inst.score.trendClassification : '--';
      const config = inst.config || {};
      const candles = inst.candles || [];
      const last = candles.length > 0 ? candles[candles.length - 1] : {};
      const prev = candles.length > 1 ? candles[candles.length - 2] : last;
      const change = (last.close || 0) - (prev.close || last.close || 0);
      const changePct = prev.close ? (change / prev.close) * 100 : 0;
      const d52h = inst.indicators ? inst.indicators.distFrom52High : 0;
      const color = getScoreColor(score);

      html += '<div class="etf-card" data-symbol="' + sym + '">' +
        '<div class="etf-card-header">' +
          '<span class="etf-symbol">' + sym + '</span>' +
          '<span class="etf-category">' + (config.category || '') + '</span>' +
        '</div>' +
        '<div class="etf-price">' +
          '<span class="price">' + formatCurrency(last.close) + '</span>' +
          '<span class="change ' + (change >= 0 ? 'positive' : 'negative') + '">' +
            (change >= 0 ? '+' : '') + formatNum(change) + ' (' + formatPct(changePct) + ')' +
          '</span>' +
        '</div>' +
        '<div class="etf-score">' +
          '<div class="score-circle" style="--score:' + score + ';--color:' + color + '">' +
            '<span>' + Math.round(score) + '</span>' +
          '</div>' +
          '<span class="rating-badge ' + getRatingClass(rating) + '">' + rating + '</span>' +
        '</div>' +
        '<div class="etf-meta">' +
          '<span>Trend: <strong>' + trend + '</strong></span>' +
          '<span>RSI: <strong class="' + (lv.rsi > 70 ? 'text-red' : lv.rsi < 30 ? 'text-green' : '') + '">' + formatNum(lv.rsi, 1) + '</strong></span>' +
          '<span>From High: <strong>' + formatPct(d52h) + '</strong></span>' +
        '</div>' +
        '<canvas class="sparkline" data-sparkline="' + sym + '"></canvas>' +
      '</div>';
    });

    container.innerHTML = html;

    // Draw sparklines
    requestAnimationFrame(() => {
      symbols.forEach(sym => {
        const inst = instruments[sym];
        if (!inst || !inst.candles) return;
        const canvas = container.querySelector('[data-sparkline="' + sym + '"]');
        if (canvas) {
          const closes = inst.candles.map(c => c.close);
          const color = getScoreColor(inst.score ? inst.score.compositeScore : 50);
          window.ChartEngine.drawSparkline(canvas, closes, color, canvas.clientWidth || 175, 36);
        }
      });
    });

    // Click handlers
    container.querySelectorAll('.etf-card').forEach(card => {
      card.addEventListener('click', () => {
        const sym = card.dataset.symbol;
        container.querySelectorAll('.etf-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        if (window.App && window.App.selectInstrument) window.App.selectInstrument(sym);
      });
    });
  }

  // ── BEST OPPORTUNITIES ───────────────────────────────────────────────
  function renderBestOpportunities(rankings) {
    const el = document.getElementById('best-opportunities');
    if (!el || !rankings) return;
    let html = '';
    rankings.forEach((r, i) => {
      const color = getScoreColor(r.score);
      html += '<div class="opportunity-item">' +
        '<span class="opp-rank ' + (i === 0 ? 'top' : '') + '">' + r.rank + '</span>' +
        '<span class="opp-symbol">' + r.symbol + '</span>' +
        '<div class="opp-score-bar"><div class="opp-score-fill" style="width:' + r.score + '%;background:' + color + '"></div></div>' +
        '<span class="opp-score-val" style="color:' + color + '">' + r.score + '</span>' +
        '<span class="opp-reason" title="' + (r.topReason || '') + '">' + (r.topReason || '') + '</span>' +
      '</div>';
    });
    el.innerHTML = html;
  }

  // ── DETAILED VIEW ────────────────────────────────────────────────────
  function renderDetailedView(symbol) {
    const section = document.getElementById('detailed-section');
    const container = document.getElementById('detailed-view');
    const title = document.getElementById('detail-title');
    if (!section || !container || !appData) return;

    const inst = appData.instruments[symbol];
    if (!inst) return;

    const lv = inst.indicators ? inst.indicators.latestValues : {};
    const score = inst.score || {};
    const components = score.componentScores || {};
    const entryPlan = score.entryPlan || {};
    const commentary = score.advisorCommentary || {};
    const config = inst.config || {};

    section.style.display = 'block';
    title.textContent = symbol + ' — ' + (config.name || 'Detailed Analysis');

    let html = '<div class="detail-grid">';

    // ── Charts Panel (full width) ──
    html += '<div class="detail-panel full-width">' +
      '<div class="detail-panel-header">Price Chart with Technical Overlays</div>' +
      '<div class="chart-container"><canvas id="detail-price-chart" style="width:100%;height:350px"></canvas></div>' +
      '<div style="display:flex;gap:8px;margin-top:8px">' +
        '<div class="chart-container" style="flex:1"><canvas id="detail-rsi-chart" style="width:100%;height:90px"></canvas></div>' +
        '<div class="chart-container" style="flex:1"><canvas id="detail-macd-chart" style="width:100%;height:90px"></canvas></div>' +
      '</div>' +
    '</div>';

    // ── Technical Summary ──
    html += '<div class="detail-panel">' +
      '<div class="detail-panel-header">Technical Summary</div>' +
      '<div class="tech-grid">' +
        techItem('Price', formatCurrency(lv.close)) +
        techItem('52-Week High', formatPct(inst.indicators ? inst.indicators.distFrom52High : 0) + ' from high') +
        techItem('SMA 20', formatCurrency(lv.sma20), lv.close > lv.sma20) +
        techItem('SMA 50', formatCurrency(lv.sma50), lv.close > lv.sma50) +
        techItem('SMA 100', formatCurrency(lv.sma100), lv.close > lv.sma100) +
        techItem('SMA 200', formatCurrency(lv.sma200), lv.close > lv.sma200) +
        techItem('RSI (14)', formatNum(lv.rsi, 1), lv.rsi >= 30 && lv.rsi <= 70) +
        techItem('MACD', formatNum(lv.macdHist, 3), lv.macdHist > 0) +
        techItem('ATR', formatNum(lv.atr, 2)) +
        techItem('Stoch RSI K', formatNum(lv.stochK, 1)) +
        techItem('Rel. Volume', formatNum(lv.relativeVolume, 2) + 'x') +
        techItem('ROC (10)', formatPct(lv.roc10)) +
      '</div>' +
    '</div>';

    // ── Score Breakdown ──
    html += '<div class="detail-panel">' +
      '<div class="detail-panel-header">Score Breakdown</div>' +
      '<div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap">' +
        '<div><canvas id="detail-gauge" width="160" height="104"></canvas></div>' +
        '<div><canvas id="detail-radar" width="200" height="200"></canvas></div>' +
      '</div>' +
      '<div class="score-components" style="margin-top:12px">';
    ['trend', 'momentum', 'pullback', 'support', 'volume', 'volatility', 'marketRegime'].forEach(key => {
      const c = components[key] || { score: 0, label: '' };
      const color = getScoreColor(c.score);
      const name = key === 'marketRegime' ? 'Market' : key.charAt(0).toUpperCase() + key.slice(1);
      html += '<div class="score-row">' +
        '<span class="name">' + name + '</span>' +
        '<div class="bar"><div class="bar-fill" style="width:' + c.score + '%;background:' + color + '"></div></div>' +
        '<span class="val" style="color:' + color + '">' + Math.round(c.score) + '</span>' +
      '</div>';
    });
    html += '</div>';

    // Confluence checklist
    html += '<ul class="confluence-list">';
    ['trend', 'momentum', 'pullback', 'support', 'volume', 'volatility', 'marketRegime'].forEach(key => {
      const c = components[key] || { score: 0 };
      const pass = c.score >= 60;
      const name = key === 'marketRegime' ? 'Market Context' : key.charAt(0).toUpperCase() + key.slice(1);
      html += '<li><span class="' + (pass ? 'check' : 'cross') + '">' + (pass ? '\u2713' : '\u2717') + '</span> ' + name + ' (' + Math.round(c.score) + ')</li>';
    });
    html += '</ul>';

    // Conviction
    const conv = score.conviction || 'Low';
    const convClass = conv === 'High' ? 'conviction-high' : conv === 'Medium' ? 'conviction-medium' : 'conviction-low';
    html += '<div class="conviction-meter"><span class="conviction-label">Conviction:</span> <span class="conviction-value ' + convClass + '">' + conv + '</span> &middot; Confluence: ' + (score.confluenceCount || 0) + '/7</div>';
    html += '</div>';

    // ── Entry Plan ──
    html += '<div class="detail-panel">' +
      '<div class="detail-panel-header">Entry Plan</div>' +
      '<div class="entry-zones">';
    if (entryPlan.buyNowZone) {
      html += '<div class="entry-zone buy-now"><span class="zone-label">Buy Now Zone</span><span class="zone-value">' + formatCurrency(entryPlan.buyNowZone.low) + ' \u2013 ' + formatCurrency(entryPlan.buyNowZone.high) + '</span></div>';
    }
    if (entryPlan.buyOnPullbackZone) {
      html += '<div class="entry-zone pullback"><span class="zone-label">Buy on Pullback</span><span class="zone-value">' + formatCurrency(entryPlan.buyOnPullbackZone.low) + ' \u2013 ' + formatCurrency(entryPlan.buyOnPullbackZone.high) + '</span></div>';
    }
    if (entryPlan.breakoutBuyZone) {
      html += '<div class="entry-zone breakout"><span class="zone-label">Breakout Buy</span><span class="zone-value">Above ' + formatCurrency(entryPlan.breakoutBuyZone.trigger) + '</span></div>';
    }
    if (entryPlan.tooExtendedLevel) {
      html += '<div class="entry-zone extended"><span class="zone-label">Too Extended</span><span class="zone-value">Above ' + formatCurrency(entryPlan.tooExtendedLevel) + '</span></div>';
    }
    html += '</div>';

    // Scaling plan
    if (entryPlan.scalingPlan) {
      html += '<h4 style="margin:10px 0 6px">Suggested Scaling Plan</h4><ul class="scaling-plan">';
      entryPlan.scalingPlan.forEach(step => { html += '<li>' + step + '</li>'; });
      html += '</ul>';
    }

    if (entryPlan.confirmationTrigger) {
      html += '<div style="margin-top:10px;font-size:0.75rem"><span class="text-blue">Confirmation:</span> ' + entryPlan.confirmationTrigger + '</div>';
    }
    if (entryPlan.invalidationLevel) {
      html += '<div style="font-size:0.75rem"><span class="text-red">Invalidation:</span> Below ' + formatCurrency(entryPlan.invalidationLevel) + '</div>';
    }
    html += '</div>';

    // ── Risk + Multi-Timeframe ──
    html += '<div class="detail-panel">' +
      '<div class="detail-panel-header">Risk Assessment</div>' +
      '<div class="tech-grid">' +
        techItem('Volatility Regime', score.volatilityRegime || '--') +
        techItem('ATR', formatCurrency(lv.atr)) +
        techItem('ATR %', formatPct((lv.atr / lv.close) * 100, 2)) +
      '</div>' +
      '<div class="detail-panel-header" style="margin-top:14px">Multi-Timeframe Alignment</div>' +
      '<div class="timeframe-grid">' +
        '<div class="tf-item"><div class="tf-label">Daily</div><div class="tf-value">' + (score.trendClassification || '--') + '</div></div>' +
        '<div class="tf-item"><div class="tf-label">Weekly</div><div class="tf-value">' + (inst.weeklyTrend || score.trendClassification || '--') + '</div></div>' +
        '<div class="tf-item ' + (score.trendClassification === 'Uptrend' || score.trendClassification === 'Pullback in Uptrend' ? 'tf-aligned' : '') + '"><div class="tf-label">Aligned?</div><div class="tf-value">' + (score.trendClassification === 'Uptrend' || score.trendClassification === 'Pullback in Uptrend' ? 'Yes' : 'No') + '</div></div>' +
      '</div>' +
    '</div>';

    // ── Advisor Commentary ──
    html += '<div class="detail-panel">' +
      '<div class="detail-panel-header">Advisor Commentary</div>' +
      '<div class="advisor-commentary">';
    if (commentary.attractive) html += '<div class="commentary-item"><div class="marker marker-green">What Looks Attractive</div><div class="text">' + commentary.attractive + '</div></div>';
    if (commentary.missing) html += '<div class="commentary-item"><div class="marker marker-yellow">What Is Missing</div><div class="text">' + commentary.missing + '</div></div>';
    if (commentary.confirm) html += '<div class="commentary-item"><div class="marker marker-blue">What Would Confirm</div><div class="text">' + commentary.confirm + '</div></div>';
    if (commentary.invalidate) html += '<div class="commentary-item"><div class="marker marker-red">What Would Invalidate</div><div class="text">' + commentary.invalidate + '</div></div>';
    if (commentary.conviction) html += '<div class="commentary-item"><div class="marker marker-purple">Conviction</div><div class="text">' + commentary.conviction + '</div></div>';
    html += '</div></div>';

    html += '</div>'; // close detail-grid
    container.innerHTML = html;

    // Draw charts
    requestAnimationFrame(() => {
      const priceCanvas = document.getElementById('detail-price-chart');
      if (priceCanvas && inst.candles) {
        window.ChartEngine.drawPriceChart(priceCanvas, inst.candles, inst.indicators, { width: priceCanvas.clientWidth, height: 350 });
      }
      const rsiCanvas = document.getElementById('detail-rsi-chart');
      if (rsiCanvas && inst.indicators && inst.indicators.rsi) {
        window.ChartEngine.drawRSIChart(rsiCanvas, inst.indicators.rsi, { width: rsiCanvas.clientWidth, height: 90 });
      }
      const macdCanvas = document.getElementById('detail-macd-chart');
      if (macdCanvas && inst.indicators && inst.indicators.macd) {
        window.ChartEngine.drawMACDChart(macdCanvas, inst.indicators.macd, { width: macdCanvas.clientWidth, height: 90 });
      }
      const gaugeCanvas = document.getElementById('detail-gauge');
      if (gaugeCanvas) {
        window.ChartEngine.drawGaugeChart(gaugeCanvas, score.compositeScore || 0, 160);
      }
      const radarCanvas = document.getElementById('detail-radar');
      if (radarCanvas) {
        window.ChartEngine.drawRadarChart(radarCanvas, components, 200);
      }
    });

    // Scroll to detail
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function techItem(label, value, isPositive) {
    let cls = '';
    if (isPositive === true) cls = ' text-green';
    else if (isPositive === false) cls = ' text-red';
    return '<div class="tech-item"><div class="label">' + label + '</div><div class="value' + cls + '">' + value + '</div></div>';
  }

  // ── MARKET REGIME ────────────────────────────────────────────────────
  function renderMarketRegime(regime) {
    const el = document.getElementById('market-regime');
    if (!el || !regime) return;

    const regimeClass = regime.label === 'Risk-On' ? 'regime-risk-on' : regime.label === 'Risk-Off' ? 'regime-risk-off' : 'regime-neutral';
    let html = '<div class="regime-badge ' + regimeClass + '">' + regime.label + '</div>';

    // Trend statuses from instruments
    if (appData && appData.instruments) {
      const trends = [
        { label: 'S&P 500 (SPY)', sym: 'SPY' },
        { label: 'Nasdaq (QQQ)', sym: 'QQQ' },
        { label: 'International (VXUS)', sym: 'VXUS' }
      ];
      trends.forEach(t => {
        const inst = appData.instruments[t.sym];
        const trend = inst && inst.score ? inst.score.trendClassification : '--';
        const isUp = trend === 'Uptrend' || trend === 'Pullback in Uptrend';
        html += '<div class="regime-item"><span class="label">' + t.label + '</span><span class="value ' + (isUp ? 'text-green' : 'text-red') + '">' + (isUp ? '\u25B2 ' : '\u25BC ') + trend + '</span></div>';
      });
    }

    html += '<div class="regime-explanation">' + (regime.details || 'Market conditions are being assessed.') +
      ' Overall regime score: ' + regime.score + '/100.</div>';
    el.innerHTML = html;
  }

  // ── ALERTS ───────────────────────────────────────────────────────────
  function renderAlerts(instruments) {
    const el = document.getElementById('alerts-panel');
    if (!el) return;

    let triggeredHtml = '';
    let watchHtml = '';
    const symbols = ['SPY', 'VOO', 'VTI', 'VT', 'VXUS', 'QQQ'];

    symbols.forEach(sym => {
      const inst = instruments[sym];
      if (!inst || !inst.indicators) return;
      const lv = inst.indicators.latestValues || {};

      // Check alert conditions
      if (lv.rsi < 35) triggeredHtml += '<div class="triggered-alert"><span class="triggered-dot"></span>' + sym + ': RSI oversold at ' + formatNum(lv.rsi, 1) + '</div>';
      if (lv.macdHist > 0 && lv.macdLine > lv.macdSignal) triggeredHtml += '<div class="triggered-alert"><span class="triggered-dot"></span>' + sym + ': Bullish MACD crossover</div>';
      const d50 = inst.indicators.distFromMAs ? inst.indicators.distFromMAs.d50 : null;
      if (d50 != null && Math.abs(d50) < 1) triggeredHtml += '<div class="triggered-alert"><span class="triggered-dot"></span>' + sym + ': Near 50-day MA support</div>';
    });

    if (!triggeredHtml) triggeredHtml = '<div style="font-size:0.75rem;color:#5a5c66;padding:8px 0">No alerts triggered currently.</div>';

    let html = '<div class="alerts-grid">' +
      '<div class="alert-card">' +
        '<h3>Triggered Signals</h3>' +
        '<div class="triggered-alerts">' + triggeredHtml + '</div>' +
        '<div class="what-changed"><h4>What Changed Today</h4>';

    symbols.forEach(sym => {
      const inst = instruments[sym];
      if (!inst || !inst.score) return;
      const s = inst.score;
      if (s.compositeScore >= 60) html += '<div class="change-item">' + sym + ' shows a buy-grade score of ' + s.compositeScore + '</div>';
    });
    html += '</div></div>';

    html += '<div class="alert-card"><h3>Watchlist Conditions</h3>';
    const alerts = [
      { desc: 'RSI drops below 30', active: true },
      { desc: 'Price touches 50-day MA', active: true },
      { desc: 'Bullish MACD crossover', active: true },
      { desc: 'Breakout above resistance', active: false },
      { desc: 'Pullback into support with volume', active: false }
    ];
    alerts.forEach(a => {
      html += '<div class="alert-item"><span class="alert-desc">' + a.desc + '</span><div class="alert-toggle ' + (a.active ? 'active' : '') + '"></div></div>';
    });
    html += '</div></div>';
    el.innerHTML = html;

    // Toggle handlers
    el.querySelectorAll('.alert-toggle').forEach(toggle => {
      toggle.addEventListener('click', () => toggle.classList.toggle('active'));
    });
  }

  // ── COMPARISONS ──────────────────────────────────────────────────────
  function renderComparisons(instruments) {
    const el = document.getElementById('comparison-section');
    if (!el) return;

    const pairs = [
      { a: 'SPY', b: 'VOO', roleA: 'Trading proxy', roleB: 'Core allocation' },
      { a: 'VTI', b: 'VOO', roleA: 'Total U.S. market', roleB: 'S&P 500 only' },
      { a: 'VT', b: 'VXUS', roleA: 'Global equity', roleB: 'International only' },
      { a: 'QQQ', b: 'SPY', roleA: 'Growth / Momentum', roleB: 'Broad market' }
    ];

    let html = '<div class="comparison-grid">';
    pairs.forEach((pair, idx) => {
      const instA = instruments[pair.a];
      const instB = instruments[pair.b];
      if (!instA || !instB) return;
      const scoreA = instA.score ? instA.score.compositeScore : 0;
      const scoreB = instB.score ? instB.score.compositeScore : 0;
      const winner = scoreA >= scoreB ? pair.a : pair.b;

      html += '<div class="comparison-card">' +
        '<div class="comparison-header">' +
          '<span style="font-weight:600">' + pair.a + '</span>' +
          '<span class="vs-label">VS</span>' +
          '<span style="font-weight:600">' + pair.b + '</span>' +
        '</div>' +
        '<div class="comparison-chart"><canvas id="comp-chart-' + idx + '" style="width:100%;height:130px"></canvas></div>' +
        '<div class="comparison-scores">' +
          '<span style="color:' + getScoreColor(scoreA) + '">' + pair.a + ': ' + scoreA + ' ' + (winner === pair.a ? '<span class="comp-winner">Better Entry</span>' : '') + '</span>' +
          '<span style="color:' + getScoreColor(scoreB) + '">' + pair.b + ': ' + scoreB + ' ' + (winner === pair.b ? '<span class="comp-winner">Better Entry</span>' : '') + '</span>' +
        '</div>' +
        '<div class="comparison-role">' + pair.a + ': ' + pair.roleA + ' &middot; ' + pair.b + ': ' + pair.roleB + '</div>' +
      '</div>';
    });
    html += '</div>';
    el.innerHTML = html;

    // Draw comparison charts
    requestAnimationFrame(() => {
      pairs.forEach((pair, idx) => {
        const canvas = document.getElementById('comp-chart-' + idx);
        const instA = instruments[pair.a];
        const instB = instruments[pair.b];
        if (canvas && instA && instB && instA.candles && instB.candles) {
          const closesA = instA.candles.map(c => c.close);
          const closesB = instB.candles.map(c => c.close);
          window.ChartEngine.drawComparisonChart(canvas, closesA, closesB, pair.a, pair.b, { width: canvas.clientWidth, height: 130 });
        }
      });
    });
  }

  // ── STRATEGY SETTINGS ────────────────────────────────────────────────
  function renderStrategySettings(profile) {
    const el = document.getElementById('strategy-settings');
    if (!el) return;

    const profiles = window.ETFConfig ? window.ETFConfig.SCORING_PROFILES : {};
    const current = profiles[profile] || profiles.balanced || { weights: { trend: 0.25, momentum: 0.20, pullback: 0.15, support: 0.15, volume: 0.10, volatility: 0.10, marketRegime: 0.05 } };

    let html = '<p style="font-size:0.8rem;color:#8b8d97;margin-bottom:14px">Current profile: <strong class="text-blue">' + profile.charAt(0).toUpperCase() + profile.slice(1) + '</strong></p>';
    html += '<div class="weight-grid">';
    Object.entries(current.weights).forEach(([key, val]) => {
      const name = key === 'marketRegime' ? 'Market Context' : key.charAt(0).toUpperCase() + key.slice(1);
      html += '<div class="weight-item">' +
        '<div class="weight-label"><span>' + name + '</span><span>' + (val * 100).toFixed(0) + '%</span></div>' +
        '<div class="weight-bar"><div class="weight-fill" style="width:' + (val * 100 * 3.33) + '%"></div></div>' +
      '</div>';
    });
    html += '</div>';

    const descriptions = {
      conservative: 'Requires strong trend confirmation across multiple timeframes. Prefers well-established support, low volatility, and broad market tailwinds before signaling a buy. Best for patient, risk-averse accumulators.',
      balanced: 'Balances trend quality with pullback opportunity. Accepts moderate risk for well-supported entries. The default mode for disciplined long-term investors.',
      aggressive: 'Allows earlier entries on pullbacks and oversold readings. Accepts higher risk for potentially better entry prices. Suited for investors comfortable buying into weakness with a long horizon.'
    };
    html += '<div class="profile-desc">' + (descriptions[profile] || descriptions.balanced) + '</div>';

    // Data Source settings
    var savedKey = localStorage.getItem('etf_av_api_key') || '';
    var savedWorkerUrl = localStorage.getItem('etf_worker_url') || '';
    html += '<div class="data-source-settings" style="margin-top:24px;padding-top:18px;border-top:1px solid #2a2d3a">' +
      '<h3 style="font-size:0.95rem;margin-bottom:10px;color:#c8cad0">Data Source</h3>' +
      '<p style="font-size:0.8rem;color:#8b8d97;margin-bottom:12px">' +
        'The app tries data sources in order: Worker API &rarr; Yahoo Direct &rarr; CORS Proxies &rarr; Alpha Vantage &rarr; Mock Data. ' +
        'Configure optional sources below for the most reliable live data.' +
      '</p>' +
      // Worker URL
      '<div style="margin-bottom:12px">' +
        '<label style="font-size:0.8rem;color:#8b8d97;display:block;margin-bottom:4px">Cloudflare Worker URL <span style="color:#6b6d77">(fastest, most reliable)</span></label>' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
          '<input type="text" id="worker-url" placeholder="https://etf-buy-advisor-api.yourname.workers.dev" ' +
            'value="' + savedWorkerUrl + '" ' +
            'style="flex:1;min-width:250px;padding:8px 12px;background:#12141c;border:1px solid #2a2d3a;border-radius:6px;color:#e8e9ed;font-size:0.85rem;font-family:inherit">' +
          '<button id="save-worker-url" style="padding:8px 16px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.85rem;font-family:inherit">Save</button>' +
        '</div>' +
        '<p style="font-size:0.75rem;color:#6b6d77;margin-top:4px">' +
          'Deploy your own free API proxy in 2 min. See <code style="color:#8b8d97">worker/README.md</code> in the repo.' +
        '</p>' +
      '</div>' +
      // Alpha Vantage key
      '<div style="margin-bottom:12px">' +
        '<label style="font-size:0.8rem;color:#8b8d97;display:block;margin-bottom:4px">Alpha Vantage API Key <span style="color:#6b6d77">(backup source)</span></label>' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
          '<input type="text" id="av-api-key" placeholder="Your free API key" ' +
            'value="' + savedKey + '" ' +
            'style="flex:1;min-width:200px;padding:8px 12px;background:#12141c;border:1px solid #2a2d3a;border-radius:6px;color:#e8e9ed;font-size:0.85rem;font-family:inherit">' +
          '<button id="save-av-key" style="padding:8px 16px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.85rem;font-family:inherit">Save</button>' +
        '</div>' +
        '<p style="font-size:0.75rem;color:#6b6d77;margin-top:4px">' +
          'Get a free key at <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noopener" style="color:#3b82f6">alphavantage.co</a> (25 requests/day).' +
        '</p>' +
      '</div>' +
      '<div style="display:flex;gap:8px;align-items:center">' +
        '<button id="refresh-data" style="padding:8px 16px;background:#22c55e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.85rem;font-family:inherit">Refresh Data Now</button>' +
        '<span id="data-source-status" style="font-size:0.8rem;color:#8b8d97"></span>' +
      '</div>' +
      '<p style="font-size:0.75rem;color:#6b6d77;margin-top:8px">' +
        'All settings are stored locally in your browser only. No data is sent to third parties except the configured data providers.' +
      '</p>' +
    '</div>';

    el.innerHTML = html;

    // Bind data source buttons
    var saveWorkerBtn = document.getElementById('save-worker-url');
    var saveAvBtn = document.getElementById('save-av-key');
    var refreshBtn = document.getElementById('refresh-data');

    function flashButton(btn, msg, origMsg) {
      btn.textContent = msg;
      btn.style.background = '#22c55e';
      setTimeout(function() { btn.textContent = origMsg; btn.style.background = '#3b82f6'; }, 2000);
    }

    if (saveWorkerBtn) {
      saveWorkerBtn.addEventListener('click', function() {
        var url = document.getElementById('worker-url').value.trim();
        if (url) {
          localStorage.setItem('etf_worker_url', url);
          flashButton(saveWorkerBtn, 'Saved!', 'Save');
        } else {
          localStorage.removeItem('etf_worker_url');
          flashButton(saveWorkerBtn, 'Cleared', 'Save');
        }
      });
    }
    if (saveAvBtn) {
      saveAvBtn.addEventListener('click', function() {
        var key = document.getElementById('av-api-key').value.trim();
        if (key) {
          localStorage.setItem('etf_av_api_key', key);
          flashButton(saveAvBtn, 'Saved!', 'Save');
        } else {
          localStorage.removeItem('etf_av_api_key');
          flashButton(saveAvBtn, 'Cleared', 'Save');
        }
      });
    }
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function() {
        refreshBtn.textContent = 'Refreshing...';
        refreshBtn.disabled = true;
        // Clear the service worker data cache so we get fresh data
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_DATA_CACHE' });
        }
        if (window.App && window.App.init) {
          window.App.init().then(function() {
            refreshBtn.textContent = 'Refresh Data Now';
            refreshBtn.disabled = false;
          }).catch(function() {
            refreshBtn.textContent = 'Refresh Data Now';
            refreshBtn.disabled = false;
          });
        }
      });
    }
  }

  // ── HOW IT WORKS ─────────────────────────────────────────────────────
  function renderHowItWorks() {
    const el = document.getElementById('how-it-works');
    if (!el) return;

    const sections = [
      { title: 'Scoring Model Overview', content: 'The Buy Opportunity Score is a composite of 7 technical components, each scored 0\u2013100. A weighted average produces the final score. Weights are configurable via strategy profiles (Conservative, Balanced, Aggressive). Scores are biased toward confluence: setups where multiple factors align receive bonus points. Single-indicator signals alone do not produce high scores.' },
      { title: 'Trend Regime (25%)', content: 'Evaluates price position relative to 20, 50, 100, and 200-day moving averages. Checks MA stacking order (bullish: 20>50>100>200), slope direction of key MAs, and golden/death cross events. Classifies the trend as Uptrend, Pullback in Uptrend, Range, Downtrend, or Recovery.' },
      { title: 'Momentum (20%)', content: 'Analyzes RSI(14), MACD histogram and crossovers, Stochastic RSI, and Rate of Change. Favors the "oversold bounce" zone (RSI 30\u201345 in an uptrend) and penalizes overbought conditions (RSI >70). Interprets momentum as confirmation, divergence warning, or extension.' },
      { title: 'Pullback Quality (15%)', content: 'Measures distance from 52-week highs and proximity to key moving average support. A 3\u201310% pullback in a strong uptrend scores highest. Deep pullbacks below declining 200-day MAs score lowest (falling knife risk). Distinguishes healthy, deep, and breakdown scenarios.' },
      { title: 'Support / Resistance (15%)', content: 'Identifies swing highs/lows to build support and resistance zones. Rewards buying near support with room to resistance. Penalizes entries near resistance with poor reward/risk. Generates ideal entry bands and breakout levels.' },
      { title: 'Volume Confirmation (10%)', content: 'Compares current volume to 20-day average. Tracks up-volume vs down-volume ratio. Strong accumulation (high up-volume ratio, above-average volume) scores well. Low volume rallies or distribution patterns are flagged.' },
      { title: 'Volatility & Risk (10%)', content: 'Uses ATR to assess volatility regime. Low volatility with constructive price action = ideal for accumulation. High volatility = elevated risk. Estimates reward/risk ratio based on support/resistance proximity.' },
      { title: 'Market Regime (5%)', content: 'Uses SPY as the broad market proxy. Checks whether the majority of tracked ETFs are trending above key MAs. Classifies environment as Risk-On, Neutral, or Risk-Off. Penalizes buy signals that fight a clearly weak market.' },
      { title: 'Bias Rules & Confluence', content: 'The system is biased toward quality pullbacks in primary uptrends. It penalizes catching falling knives below a declining 200-day MA. It rewards setups where weekly trend is bullish and daily is pulling back. A confluence bonus is awarded when 4+ components score above 60. Single-indicator signals are not sufficient for high scores.' },
      { title: 'Disclaimer', content: 'This application provides educational market analysis and decision support tools only. It does not constitute personalized investment advice or a recommendation to buy or sell securities. Past performance and technical indicators do not guarantee future results. All investment involves risk. Consult a qualified financial advisor.' }
    ];

    let html = '';
    sections.forEach((s, i) => {
      html += '<div class="how-section">' +
        '<div class="how-section-header" data-how-idx="' + i + '">' + s.title + '<span class="toggle-icon">\u25BC</span></div>' +
        '<div class="how-section-content" id="how-content-' + i + '"><p>' + s.content + '</p></div>' +
      '</div>';
    });
    el.innerHTML = html;

    // Accordion toggle
    el.querySelectorAll('.how-section-header').forEach(header => {
      header.addEventListener('click', () => {
        const idx = header.dataset.howIdx;
        const content = document.getElementById('how-content-' + idx);
        if (content) content.classList.toggle('open');
        header.querySelector('.toggle-icon').classList.toggle('open');
      });
    });
  }

  return {
    init,
    renderOverviewCards,
    renderBestOpportunities,
    renderDetailedView,
    renderMarketRegime,
    renderAlerts,
    renderComparisons,
    renderStrategySettings,
    renderHowItWorks,
    renderDisclaimer,
    getScoreColor,
    getRatingClass
  };
})();
