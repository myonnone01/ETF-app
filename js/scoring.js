/**
 * scoring.js - Composite Buy Opportunity Scoring Engine
 * Calculates weighted scores across 7 technical components and produces
 * buy opportunity ratings, entry plans, and advisor commentary.
 */
window.ScoringEngine = (function() {
  'use strict';

  function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

  // ── 1. TREND REGIME SCORING ──────────────────────────────────────────
  function scoreTrend(ind) {
    if (!ind || !ind.latestValues) return { score: 50, label: 'Range', details: 'Insufficient data' };
    const lv = ind.latestValues;
    let score = 50;
    const details = [];

    // Price vs moving averages (each worth up to ~8 points)
    if (lv.close > lv.sma20) { score += 6; details.push('Above 20-day MA'); }
    else { score -= 6; details.push('Below 20-day MA'); }
    if (lv.close > lv.sma50) { score += 7; details.push('Above 50-day MA'); }
    else { score -= 7; details.push('Below 50-day MA'); }
    if (lv.close > lv.sma100) { score += 5; details.push('Above 100-day MA'); }
    else { score -= 5; }
    if (lv.close > lv.sma200) { score += 8; details.push('Above 200-day MA'); }
    else { score -= 10; details.push('Below 200-day MA'); }

    // MA stacking order (bullish: 20>50>100>200)
    if (lv.sma20 > lv.sma50 && lv.sma50 > lv.sma100 && lv.sma100 > lv.sma200) {
      score += 10; details.push('Bullish MA stack');
    } else if (lv.sma20 < lv.sma50 && lv.sma50 < lv.sma100 && lv.sma100 < lv.sma200) {
      score -= 10; details.push('Bearish MA stack');
    }

    // Slope of key MAs
    const s20 = ind.sma20Slope || 0, s50 = ind.sma50Slope || 0, s200 = ind.sma200Slope || 0;
    if (s20 > 0) score += 3; else score -= 3;
    if (s50 > 0) score += 4; else score -= 4;
    if (s200 > 0) { score += 5; details.push('200-day MA rising'); }
    else { score -= 6; details.push('200-day MA declining'); }

    // Classify trend
    let label;
    if (score >= 75) label = 'Uptrend';
    else if (score >= 55 && lv.close < lv.sma20 && lv.close > lv.sma50) label = 'Pullback in Uptrend';
    else if (score >= 40) label = 'Range';
    else if (score >= 25 && s200 > 0) label = 'Recovery';
    else label = 'Downtrend';

    return { score: clamp(score, 0, 100), label, details: details.join('; ') };
  }

  // ── 2. MOMENTUM SCORING ──────────────────────────────────────────────
  function scoreMomentum(ind) {
    if (!ind || !ind.latestValues) return { score: 50, label: 'Neutral', details: 'Insufficient data' };
    const lv = ind.latestValues;
    let score = 50;
    const details = [];

    // RSI scoring - favor oversold-bounce zone (30-50) in uptrend context
    const rsi = lv.rsi || 50;
    if (rsi >= 30 && rsi <= 45) { score += 15; details.push('RSI in buy zone (' + rsi.toFixed(1) + ')'); }
    else if (rsi > 45 && rsi <= 55) { score += 8; details.push('RSI neutral (' + rsi.toFixed(1) + ')'); }
    else if (rsi > 55 && rsi <= 65) { score += 4; details.push('RSI healthy (' + rsi.toFixed(1) + ')'); }
    else if (rsi > 65 && rsi <= 70) { score -= 2; details.push('RSI getting warm (' + rsi.toFixed(1) + ')'); }
    else if (rsi > 70) { score -= 15; details.push('RSI overbought (' + rsi.toFixed(1) + ')'); }
    else if (rsi < 30) { score += 5; details.push('RSI deeply oversold (' + rsi.toFixed(1) + ') - risky'); }

    // MACD
    const hist = lv.macdHist || 0;
    if (hist > 0 && lv.macdLine > lv.macdSignal) { score += 10; details.push('MACD bullish'); }
    else if (hist < 0 && lv.macdLine < lv.macdSignal) { score -= 8; details.push('MACD bearish'); }
    if (Math.abs(hist) < 0.5 && lv.macdLine > lv.macdSignal) { score += 5; details.push('MACD turning up'); }

    // Stochastic RSI
    if (lv.stochK != null && lv.stochD != null) {
      if (lv.stochK < 20 && lv.stochK > lv.stochD) { score += 8; details.push('StochRSI oversold turning up'); }
      else if (lv.stochK > 80) { score -= 6; details.push('StochRSI overbought'); }
    }

    // Rate of change
    const roc10 = lv.roc10 || 0;
    if (roc10 > 0 && roc10 < 5) { score += 4; details.push('Positive momentum'); }
    else if (roc10 > 8) { score -= 5; details.push('Momentum overextended'); }
    else if (roc10 < -5) { score -= 4; details.push('Negative momentum'); }

    let label;
    if (rsi < 35) label = 'Oversold Bounce Potential';
    else if (score >= 65) label = 'Momentum Confirmation';
    else if (rsi > 70) label = 'Overbought / Extended';
    else if (score < 35) label = 'Momentum Divergence Warning';
    else label = 'Neutral Momentum';

    return { score: clamp(score, 0, 100), label, details: details.join('; ') };
  }

  // ── 3. PULLBACK QUALITY SCORING ──────────────────────────────────────
  function scorePullback(ind) {
    if (!ind || !ind.latestValues) return { score: 50, label: 'Neutral', details: 'Insufficient data' };
    const lv = ind.latestValues;
    const d52h = ind.distFrom52High || 0; // negative number (distance below high)
    const d20 = ind.distFromMAs ? ind.distFromMAs.d20 : 0;
    const d50 = ind.distFromMAs ? ind.distFromMAs.d50 : 0;
    const d200 = ind.distFromMAs ? ind.distFromMAs.d200 : 0;
    let score = 50;
    const details = [];

    // Distance from 52-week high: 3-10% pullback is ideal buying zone
    const pctFromHigh = Math.abs(d52h);
    if (pctFromHigh >= 3 && pctFromHigh <= 7) { score += 18; details.push('Healthy ' + pctFromHigh.toFixed(1) + '% pullback from highs'); }
    else if (pctFromHigh > 7 && pctFromHigh <= 12) { score += 10; details.push('Moderate ' + pctFromHigh.toFixed(1) + '% pullback'); }
    else if (pctFromHigh > 12 && pctFromHigh <= 20) { score += 2; details.push('Deep ' + pctFromHigh.toFixed(1) + '% pullback - elevated risk'); }
    else if (pctFromHigh > 20) { score -= 10; details.push('Severe ' + pctFromHigh.toFixed(1) + '% decline'); }
    else if (pctFromHigh < 2) { score -= 5; details.push('Near highs (' + pctFromHigh.toFixed(1) + '% from high) - limited upside'); }

    // Pullback to specific MA support
    if (d50 <= 0 && d50 > -2 && lv.close > lv.sma200) {
      score += 15; details.push('Pulling back to 50-day MA support');
    } else if (d20 <= 0 && d20 > -1 && lv.close > lv.sma50) {
      score += 10; details.push('Shallow dip to 20-day MA');
    } else if (d200 <= 0 && d200 > -3) {
      score += 5; details.push('Testing 200-day MA support');
    }

    // Penalize falling knife scenarios
    if (lv.close < lv.sma200 && (ind.sma200Slope || 0) < 0) {
      score -= 15; details.push('Below declining 200-day MA - knife catch risk');
    }

    let label;
    if (score >= 70 && lv.close > lv.sma200) label = 'Healthy Pullback in Strong Uptrend';
    else if (score >= 50 && pctFromHigh > 10) label = 'Deep Pullback with Elevated Risk';
    else if (lv.close < lv.sma200 && (ind.sma200Slope || 0) < 0) label = 'Trend Breakdown';
    else if (pctFromHigh < 2) label = 'No Pullback (Extended)';
    else label = 'Shallow Dip';

    return { score: clamp(score, 0, 100), label, details: details.join('; ') };
  }

  // ── 4. SUPPORT/RESISTANCE SCORING ────────────────────────────────────
  function scoreSupport(ind, price) {
    if (!ind || !ind.supportResistance) return { score: 50, label: 'Neutral', details: 'No S/R data', idealEntryBands: null };
    const sr = ind.supportResistance;
    const lv = ind.latestValues;
    let score = 50;
    const details = [];

    // Find nearest support and resistance
    const supports = (sr.supports || []).filter(s => s.price < price).sort((a, b) => b.price - a.price);
    const resistances = (sr.resistances || []).filter(r => r.price > price).sort((a, b) => a.price - b.price);
    const nearestSupport = supports[0] ? supports[0].price : (lv.sma200 || price * 0.9);
    const nearestResistance = resistances[0] ? resistances[0].price : price * 1.1;

    const distToSupport = ((price - nearestSupport) / price) * 100;
    const distToResistance = ((nearestResistance - price) / price) * 100;

    // Near support = good buying location
    if (distToSupport < 2) { score += 18; details.push('Near strong support at $' + nearestSupport.toFixed(2)); }
    else if (distToSupport < 4) { score += 12; details.push('Close to support'); }
    else if (distToSupport < 7) { score += 5; }

    // Near resistance = poor buying location
    if (distToResistance < 2) { score -= 12; details.push('Near resistance at $' + nearestResistance.toFixed(2)); }
    else if (distToResistance < 4) { score -= 6; details.push('Approaching resistance'); }
    else { score += 5; details.push('Room to run before resistance'); }

    // Reward/risk based on support/resistance
    const rrRatio = distToResistance / Math.max(distToSupport, 0.5);
    if (rrRatio > 3) { score += 8; details.push('Favorable reward/risk ratio'); }
    else if (rrRatio < 1) { score -= 8; details.push('Poor reward/risk ratio'); }

    const atr = lv.atr || (price * 0.015);
    const idealEntryBands = {
      buyNow: { low: nearestSupport, high: nearestSupport + atr },
      buyOnPullback: { low: nearestSupport - atr * 0.5, high: nearestSupport },
      breakoutBuy: { trigger: nearestResistance, target: nearestResistance + atr * 2 },
      tooExtended: nearestResistance + atr * 3
    };

    let label;
    if (distToSupport < 3 && distToResistance > 5) label = 'Ideal Buy Location';
    else if (distToResistance < 3) label = 'Near Resistance - Wait';
    else label = 'Neutral Location';

    return { score: clamp(score, 0, 100), label, details: details.join('; '), idealEntryBands };
  }

  // ── 5. VOLUME SCORING ────────────────────────────────────────────────
  function scoreVolume(ind) {
    if (!ind || !ind.latestValues) return { score: 50, label: 'Normal', details: 'No volume data' };
    const lv = ind.latestValues;
    let score = 50;
    const details = [];

    const rv = lv.relativeVolume || 1;
    const uvr = lv.upVolumeRatio || 0.5;

    // Up-volume ratio
    if (uvr > 0.6) { score += 15; details.push('Strong up-volume ratio (' + (uvr * 100).toFixed(0) + '%)'); }
    else if (uvr > 0.5) { score += 5; details.push('Positive volume bias'); }
    else if (uvr < 0.4) { score -= 12; details.push('Distribution detected'); }
    else { score -= 3; details.push('Weak volume bias'); }

    // Relative volume
    if (rv > 1.3) { score += 8; details.push('Above-average volume'); }
    else if (rv < 0.7) { score -= 8; details.push('Low volume - weak conviction'); }

    let label;
    if (score >= 65 && uvr > 0.6) label = 'Strong Accumulation';
    else if (score <= 35) label = 'Distribution Warning';
    else if (rv < 0.7) label = 'Weak Volume';
    else label = 'Normal';

    return { score: clamp(score, 0, 100), label, details: details.join('; ') };
  }

  // ── 6. VOLATILITY SCORING ────────────────────────────────────────────
  function scoreVolatility(ind) {
    if (!ind || !ind.latestValues) return { score: 50, label: 'Normal', details: 'No data', regime: 'Normal' };
    const lv = ind.latestValues;
    let score = 50;
    const details = [];

    const atr = lv.atr || 1;
    const atrPct = (atr / lv.close) * 100;

    // Lower volatility = better for accumulation
    if (atrPct < 0.8) { score += 20; details.push('Low volatility - ideal for accumulation'); }
    else if (atrPct < 1.2) { score += 10; details.push('Normal volatility'); }
    else if (atrPct < 2.0) { score -= 5; details.push('Elevated volatility'); }
    else { score -= 15; details.push('High volatility - unstable'); }

    // Estimate reward/risk
    const sr = ind.supportResistance || { supports: [], resistances: [] };
    const supports = (sr.supports || []).filter(s => s.price < lv.close);
    const resistances = (sr.resistances || []).filter(r => r.price > lv.close);
    const nearSupport = supports.length > 0 ? supports[supports.length - 1].price : lv.close - atr * 3;
    const nearResist = resistances.length > 0 ? resistances[0].price : lv.close + atr * 3;
    const reward = nearResist - lv.close;
    const risk = lv.close - nearSupport;
    const rrRatio = risk > 0 ? reward / risk : 1;

    if (rrRatio > 2.5) { score += 10; details.push('Reward/risk: ' + rrRatio.toFixed(1) + ':1'); }
    else if (rrRatio < 1) { score -= 10; details.push('Poor reward/risk: ' + rrRatio.toFixed(1) + ':1'); }

    let regime;
    if (atrPct < 0.8) regime = 'Low Volatility Accumulation';
    else if (atrPct < 1.2) regime = 'Normal';
    else if (atrPct < 2.0) regime = 'Elevated';
    else regime = 'High Risk';

    return { score: clamp(score, 0, 100), label: regime, details: details.join('; '), regime, rewardRisk: rrRatio, atrPct };
  }

  // ── 7. MARKET REGIME SCORING ─────────────────────────────────────────
  function scoreMarketRegime(allInstrumentsData) {
    let score = 50;
    const details = [];

    // Use SPY as primary market proxy
    const spy = allInstrumentsData['SPY'];
    if (spy && spy.indicators && spy.indicators.latestValues) {
      const spyLv = spy.indicators.latestValues;
      if (spyLv.close > spyLv.sma200) { score += 12; details.push('S&P 500 above 200-day MA'); }
      else { score -= 15; details.push('S&P 500 below 200-day MA'); }
      if (spyLv.close > spyLv.sma50) { score += 8; details.push('S&P 500 above 50-day MA'); }
      else { score -= 8; }
      if (spyLv.rsi > 40 && spyLv.rsi < 65) { score += 5; details.push('S&P 500 RSI healthy'); }
    }

    // Count how many instruments are in uptrends
    let bullCount = 0, totalCount = 0;
    Object.keys(allInstrumentsData).forEach(sym => {
      const d = allInstrumentsData[sym];
      if (d && d.indicators && d.indicators.latestValues) {
        totalCount++;
        const lv = d.indicators.latestValues;
        if (lv.close > lv.sma50 && lv.close > lv.sma200) bullCount++;
      }
    });
    const bullPct = totalCount > 0 ? bullCount / totalCount : 0.5;
    if (bullPct > 0.7) { score += 10; details.push('Majority of ETFs trending up'); }
    else if (bullPct < 0.3) { score -= 10; details.push('Most ETFs trending down'); }

    let label;
    if (score >= 65) label = 'Risk-On';
    else if (score >= 40) label = 'Neutral';
    else label = 'Risk-Off';

    return { score: clamp(score, 0, 100), label, details: details.join('; ') };
  }

  // ── 8. ADVISOR COMMENTARY ────────────────────────────────────────────
  function generateAdvisorCommentary(instrumentConfig, compositeScore, components, ind) {
    const lv = ind.latestValues || {};
    const role = instrumentConfig.role || 'core';
    const sym = instrumentConfig.symbol;
    const commentary = {};

    // What looks attractive
    const strongComponents = Object.entries(components).filter(([k, v]) => v.score >= 60).map(([k]) => k);
    if (strongComponents.length >= 4) {
      commentary.attractive = 'Multiple technical factors are aligned favorably, with strength in ' + strongComponents.slice(0, 3).join(', ') + '.';
    } else if (strongComponents.length >= 2) {
      commentary.attractive = 'Some constructive signals from ' + strongComponents.join(' and ') + ', though not full confirmation yet.';
    } else {
      commentary.attractive = 'Limited positive signals at this time. Patience is warranted.';
    }

    // Instrument-specific flavor
    if (role === 'core') {
      commentary.attractive += ' ' + sym + ' is a core U.S. large-cap holding' + (compositeScore >= 60 ? ' currently offering a clean entry point.' : ' but conditions could improve.');
    } else if (role === 'broad') {
      commentary.attractive += ' The broader U.S. market ' + (compositeScore >= 55 ? 'supports accumulation beyond mega-caps.' : 'shows mixed participation signals.');
    } else if (role === 'global') {
      commentary.attractive += ' Global diversification ' + (compositeScore >= 55 ? 'currently improves the technical setup.' : 'is facing headwinds across international markets.');
    } else if (role === 'international') {
      commentary.attractive += ' International equities are ' + (compositeScore >= 55 ? 'in a constructive zone for building exposure.' : 'still lagging and require patience.');
    } else if (role === 'growth') {
      commentary.attractive += ' Growth and momentum names are ' + (compositeScore >= 60 ? 'showing healthy pullback behavior.' : (compositeScore < 40 ? 'in an overextended or risk-off phase.' : 'in a transitional state.'));
    }

    // What is missing
    const weakComponents = Object.entries(components).filter(([k, v]) => v.score < 45).map(([k]) => k);
    if (weakComponents.length > 0) {
      commentary.missing = 'Weaker readings in ' + weakComponents.join(', ') + ' suggest incomplete confirmation.';
    } else {
      commentary.missing = 'No major technical headwinds identified. Setup is well-supported.';
    }

    // What would confirm
    if (lv.close < lv.sma50) {
      commentary.confirm = 'A reclaim of the 50-day moving average ($' + (lv.sma50 || 0).toFixed(2) + ') would significantly strengthen the setup.';
    } else if (lv.rsi < 40) {
      commentary.confirm = 'RSI stabilizing above 40 with positive MACD momentum would confirm a buy signal.';
    } else {
      commentary.confirm = 'Continued holding above key moving averages with stable or improving breadth confirms the buy case.';
    }

    // What would invalidate
    if (lv.sma200) {
      commentary.invalidate = 'A decisive break below the 200-day MA ($' + lv.sma200.toFixed(2) + ') would invalidate the accumulation thesis.';
    } else {
      commentary.invalidate = 'A break below recent swing lows with expanding volume would signal caution.';
    }

    // Conviction
    if (compositeScore >= 70 && strongComponents.length >= 4) {
      commentary.conviction = 'High conviction — multiple signals align for a disciplined entry.';
    } else if (compositeScore >= 50) {
      commentary.conviction = 'Medium conviction — setup is developing but awaiting full confirmation.';
    } else {
      commentary.conviction = 'Low conviction — conditions do not favor aggressive accumulation at this time.';
    }

    return commentary;
  }

  // ── 9. MASTER COMPOSITE SCORING ──────────────────────────────────────
  function calculateCompositeScore(instrumentConfig, indicators, allData, profile) {
    profile = profile || 'balanced';
    const profiles = window.ETFConfig ? window.ETFConfig.SCORING_PROFILES : null;
    const weights = profiles && profiles[profile] ? profiles[profile].weights : {
      trend: 0.25, momentum: 0.20, pullback: 0.15, support: 0.15,
      volume: 0.10, volatility: 0.10, marketRegime: 0.05
    };

    const lv = indicators.latestValues || {};
    const price = lv.close || 0;

    // Calculate all component scores
    const components = {
      trend: scoreTrend(indicators),
      momentum: scoreMomentum(indicators),
      pullback: scorePullback(indicators),
      support: scoreSupport(indicators, price),
      volume: scoreVolume(indicators),
      volatility: scoreVolatility(indicators),
      marketRegime: scoreMarketRegime(allData)
    };

    // Weighted composite
    let rawScore = 0;
    rawScore += components.trend.score * weights.trend;
    rawScore += components.momentum.score * weights.momentum;
    rawScore += components.pullback.score * weights.pullback;
    rawScore += components.support.score * weights.support;
    rawScore += components.volume.score * weights.volume;
    rawScore += components.volatility.score * weights.volatility;
    rawScore += components.marketRegime.score * weights.marketRegime;

    // ── Instrument-specific adjustments ──
    const role = instrumentConfig.role || 'core';
    if (role === 'core') {
      // SPY/VOO: bonus for clean broad-market pullback
      if (components.trend.score > 55 && components.pullback.score > 60) rawScore += 3;
    } else if (role === 'growth') {
      // QQQ: momentum emphasis, higher-beta risk control
      if (components.momentum.score > 65) rawScore += 4;
      if (components.volatility.score < 35) rawScore -= 5;
    } else if (role === 'international') {
      // VXUS: bonus for recovery, penalty if lagging
      if (components.trend.label === 'Recovery') rawScore += 5;
      if (components.trend.score < 35 && components.marketRegime.score > 55) rawScore -= 5;
    } else if (role === 'broad') {
      // VTI: breadth bonus
      if (components.volume.score > 60) rawScore += 3;
    } else if (role === 'global') {
      // VT: balanced global assessment
      if (components.marketRegime.score > 55 && components.trend.score > 50) rawScore += 3;
    }

    // ── Bias rules ──
    // Penalize below declining 200-day MA (falling knife)
    if (lv.close < lv.sma200 && (indicators.sma200Slope || 0) < 0) {
      rawScore -= 8;
    }
    // Confluence bonus: 4+ components above 60
    const confluenceCount = Object.values(components).filter(c => c.score >= 60).length;
    if (confluenceCount >= 5) rawScore += 6;
    else if (confluenceCount >= 4) rawScore += 3;

    const compositeScore = clamp(Math.round(rawScore), 0, 100);

    // Rating label
    let ratingLabel, ratingColor;
    if (compositeScore >= 75) { ratingLabel = 'Strong Buy Zone'; ratingColor = '#22c55e'; }
    else if (compositeScore >= 55) { ratingLabel = 'Buy Zone'; ratingColor = '#4ade80'; }
    else if (compositeScore >= 35) { ratingLabel = 'Watchlist'; ratingColor = '#eab308'; }
    else if (compositeScore >= 15) { ratingLabel = 'Extended / Wait'; ratingColor = '#f97316'; }
    else { ratingLabel = 'Avoid for Now'; ratingColor = '#ef4444'; }

    // Conviction
    let conviction;
    if (compositeScore >= 70 && confluenceCount >= 4) conviction = 'High';
    else if (compositeScore >= 50 && confluenceCount >= 2) conviction = 'Medium';
    else conviction = 'Low';

    // Entry plan
    const atr = lv.atr || (price * 0.015);
    const entryBands = components.support.idealEntryBands || {
      buyNow: { low: price - atr, high: price },
      buyOnPullback: { low: price - atr * 2, high: price - atr },
      breakoutBuy: { trigger: price + atr, target: price + atr * 3 },
      tooExtended: price + atr * 4
    };

    const entryPlan = {
      buyNowZone: entryBands.buyNow,
      buyOnPullbackZone: entryBands.buyOnPullback,
      breakoutBuyZone: entryBands.breakoutBuy,
      tooExtendedLevel: entryBands.tooExtended,
      scalingPlan: [
        'Buy 25% at $' + price.toFixed(2) + ' if support holds near $' + entryBands.buyNow.low.toFixed(2),
        'Add 25% on confirmation above $' + (lv.sma50 || price * 1.02).toFixed(2),
        'Add 50% if breakout above $' + (entryBands.breakoutBuy.trigger || price * 1.05).toFixed(2) + ' and retest succeeds'
      ],
      confirmationTrigger: lv.close < lv.sma50
        ? 'Reclaim of 50-day MA at $' + (lv.sma50 || 0).toFixed(2)
        : 'Hold above 20-day MA at $' + (lv.sma20 || 0).toFixed(2) + ' with improving momentum',
      invalidationLevel: Math.min(lv.sma200 || price * 0.9, entryBands.buyOnPullback.low)
    };

    // Advisor commentary
    const advisorCommentary = generateAdvisorCommentary(instrumentConfig, compositeScore, components, indicators);

    return {
      symbol: instrumentConfig.symbol,
      compositeScore,
      ratingLabel,
      ratingColor,
      componentScores: components,
      trendClassification: components.trend.label,
      momentumLabel: components.momentum.label,
      pullbackLabel: components.pullback.label,
      volatilityRegime: components.volatility.regime,
      marketRegimeLabel: components.marketRegime.label,
      idealEntryBands: entryBands,
      entryPlan,
      confluenceCount,
      conviction,
      advisorCommentary
    };
  }

  // ── 10. RANK INSTRUMENTS ─────────────────────────────────────────────
  function rankInstruments(allScores) {
    return Object.values(allScores)
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .map((s, i) => {
        // Top reason: pick highest-scoring component
        const topComponent = Object.entries(s.componentScores)
          .sort((a, b) => b[1].score - a[1].score)[0];
        const topReason = topComponent
          ? topComponent[0].charAt(0).toUpperCase() + topComponent[0].slice(1) + ' score: ' + topComponent[1].score + ' — ' + (topComponent[1].details || topComponent[1].label)
          : 'Balanced signals';
        return {
          rank: i + 1,
          symbol: s.symbol,
          score: s.compositeScore,
          ratingLabel: s.ratingLabel,
          ratingColor: s.ratingColor,
          topReason
        };
      });
  }

  return {
    scoreTrend,
    scoreMomentum,
    scorePullback,
    scoreSupport,
    scoreVolume,
    scoreVolatility,
    scoreMarketRegime,
    calculateCompositeScore,
    generateAdvisorCommentary,
    rankInstruments
  };
})();
