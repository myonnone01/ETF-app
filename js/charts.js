/**
 * charts.js - Canvas-based Financial Chart Engine
 * Renders sparklines, candlestick charts, RSI, MACD, gauges, radar, and comparison charts.
 */
window.ChartEngine = (function() {
  'use strict';

  function mapRange(v, inMin, inMax, outMin, outMax) {
    if (inMax === inMin) return (outMin + outMax) / 2;
    return outMin + ((v - inMin) / (inMax - inMin)) * (outMax - outMin);
  }
  function formatPrice(p) { return '$' + (p || 0).toFixed(2); }
  function formatDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[dt.getMonth()] + ' ' + dt.getDate();
  }
  function formatMonthYear(d) {
    const dt = new Date(d);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[dt.getMonth()] + ' ' + dt.getFullYear().toString().slice(2);
  }

  function setupCanvas(canvas, w, h) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return ctx;
  }

  // ── SPARKLINE ────────────────────────────────────────────────────────
  function drawSparkline(canvas, closes, color, w, h) {
    if (!canvas || !closes || closes.length < 2) return;
    w = w || canvas.clientWidth || 120;
    h = h || canvas.clientHeight || 40;
    color = color || '#22c55e';
    const ctx = setupCanvas(canvas, w, h);
    const data = closes.slice(-60);
    const min = Math.min(...data);
    const max = Math.max(...data);
    const pad = 2;

    ctx.clearRect(0, 0, w, h);

    // Gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color + '40');
    grad.addColorStop(1, color + '05');

    ctx.beginPath();
    ctx.moveTo(pad, h - pad);
    for (let i = 0; i < data.length; i++) {
      const x = mapRange(i, 0, data.length - 1, pad, w - pad);
      const y = mapRange(data[i], min, max, h - pad, pad);
      if (i === 0) ctx.lineTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineTo(w - pad, h - pad);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = mapRange(i, 0, data.length - 1, pad, w - pad);
      const y = mapRange(data[i], min, max, h - pad, pad);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // End dot
    const lastX = w - pad;
    const lastY = mapRange(data[data.length - 1], min, max, h - pad, pad);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // ── PRICE CHART ──────────────────────────────────────────────────────
  function drawPriceChart(canvas, candles, indicators, options) {
    if (!canvas || !candles || candles.length < 10) return;
    options = options || {};
    const w = options.width || canvas.clientWidth || 800;
    const h = options.height || canvas.clientHeight || 400;
    const ctx = setupCanvas(canvas, w, h);

    const days = options.days || 180;
    const data = candles.slice(-days);
    const margin = { top: 10, right: 65, bottom: 30, left: 10 };
    const chartW = w - margin.left - margin.right;
    const volH = h * 0.18;
    const priceH = h - margin.top - margin.bottom - volH;

    // Background
    ctx.fillStyle = '#1a1d28';
    ctx.fillRect(0, 0, w, h);

    // Find price range
    let pMin = Infinity, pMax = -Infinity, vMax = 0;
    data.forEach(c => {
      if (c.low < pMin) pMin = c.low;
      if (c.high > pMax) pMax = c.high;
      if (c.volume > vMax) vMax = c.volume;
    });
    const pPad = (pMax - pMin) * 0.05;
    pMin -= pPad; pMax += pPad;

    const barW = Math.max(1, (chartW / data.length) * 0.7);
    const gap = chartW / data.length;

    function priceY(p) { return margin.top + mapRange(p, pMax, pMin, 0, priceH); }
    function volY(v) { return h - margin.bottom - mapRange(v, 0, vMax, 0, volH); }
    function barX(i) { return margin.left + i * gap + gap / 2; }

    // Grid lines
    ctx.strokeStyle = '#ffffff08';
    ctx.lineWidth = 0.5;
    const priceStep = (pMax - pMin) / 6;
    for (let i = 0; i <= 6; i++) {
      const p = pMin + priceStep * i;
      const y = priceY(p);
      ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(w - margin.right, y); ctx.stroke();
    }

    // Volume bars
    data.forEach((c, i) => {
      const x = barX(i);
      const barTop = volY(c.volume);
      const barBottom = h - margin.bottom;
      ctx.fillStyle = c.close >= c.open ? '#22c55e30' : '#ef444430';
      ctx.fillRect(x - barW / 2, barTop, barW, barBottom - barTop);
    });

    // Support/resistance zones from indicators
    if (indicators && indicators.supportResistance) {
      const sr = indicators.supportResistance;
      (sr.supports || []).forEach(s => {
        if (s.price >= pMin && s.price <= pMax) {
          const y = priceY(s.price);
          ctx.fillStyle = '#22c55e12';
          ctx.fillRect(margin.left, y - 3, chartW, 6);
          ctx.strokeStyle = '#22c55e40';
          ctx.lineWidth = 0.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(w - margin.right, y); ctx.stroke();
          ctx.setLineDash([]);
        }
      });
      (sr.resistances || []).forEach(r => {
        if (r.price >= pMin && r.price <= pMax) {
          const y = priceY(r.price);
          ctx.fillStyle = '#ef444412';
          ctx.fillRect(margin.left, y - 3, chartW, 6);
          ctx.strokeStyle = '#ef444440';
          ctx.lineWidth = 0.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(margin.left, y); ctx.lineTo(w - margin.right, y); ctx.stroke();
          ctx.setLineDash([]);
        }
      });
    }

    // Moving average lines
    function drawMA(values, color, startIdx) {
      if (!values || values.length === 0) return;
      const offset = candles.length - days;
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      let started = false;
      for (let i = 0; i < data.length; i++) {
        const idx = offset + i;
        if (idx >= 0 && idx < values.length && values[idx] != null) {
          const x = barX(i);
          const y = priceY(values[idx]);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    if (indicators) {
      drawMA(indicators.sma200, '#ef444480');
      drawMA(indicators.sma100, '#8b5cf680');
      drawMA(indicators.sma50, '#f59e0b90');
      drawMA(indicators.sma20, '#3b82f690');
    }

    // Candlesticks
    data.forEach((c, i) => {
      const x = barX(i);
      const bull = c.close >= c.open;
      const bodyTop = priceY(bull ? c.close : c.open);
      const bodyBot = priceY(bull ? c.open : c.close);
      const bodyH = Math.max(1, bodyBot - bodyTop);

      // Wick
      ctx.strokeStyle = bull ? '#22c55e' : '#ef4444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, priceY(c.high));
      ctx.lineTo(x, priceY(c.low));
      ctx.stroke();

      // Body
      ctx.fillStyle = bull ? '#22c55e' : '#ef4444';
      ctx.fillRect(x - barW / 2, bodyTop, barW, bodyH);
    });

    // Price axis labels
    ctx.fillStyle = '#8b8d97';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'left';
    for (let i = 0; i <= 6; i++) {
      const p = pMin + priceStep * i;
      ctx.fillText(formatPrice(p), w - margin.right + 5, priceY(p) + 3);
    }

    // Current price highlight
    if (data.length > 0) {
      const lastPrice = data[data.length - 1].close;
      const lastY = priceY(lastPrice);
      ctx.fillStyle = data[data.length - 1].close >= data[data.length - 1].open ? '#22c55e' : '#ef4444';
      ctx.fillRect(w - margin.right, lastY - 8, 60, 16);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(formatPrice(lastPrice), w - margin.right + 4, lastY + 3);
    }

    // Date axis
    ctx.fillStyle = '#5a5c66';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'center';
    const dateStep = Math.max(1, Math.floor(data.length / 8));
    for (let i = 0; i < data.length; i += dateStep) {
      ctx.fillText(formatDate(data[i].date), barX(i), h - margin.bottom + 15);
    }

    // MA Legend
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'left';
    const legendItems = [
      { label: 'MA20', color: '#3b82f6' },
      { label: 'MA50', color: '#f59e0b' },
      { label: 'MA100', color: '#8b5cf6' },
      { label: 'MA200', color: '#ef4444' }
    ];
    legendItems.forEach((item, idx) => {
      const lx = margin.left + 10 + idx * 60;
      ctx.fillStyle = item.color;
      ctx.fillRect(lx, margin.top + 5, 12, 2);
      ctx.fillStyle = '#8b8d97';
      ctx.fillText(item.label, lx + 16, margin.top + 9);
    });
  }

  // ── RSI CHART ──────────────────────────��─────────────────────────────
  function drawRSIChart(canvas, rsiValues, options) {
    if (!canvas || !rsiValues) return;
    options = options || {};
    const w = options.width || canvas.clientWidth || 800;
    const h = options.height || 100;
    const ctx = setupCanvas(canvas, w, h);
    const days = options.days || 180;
    const data = rsiValues.slice(-days);
    const margin = { top: 5, right: 65, bottom: 5, left: 10 };
    const chartW = w - margin.left - margin.right;

    ctx.fillStyle = '#1a1d28';
    ctx.fillRect(0, 0, w, h);

    function rsiY(v) { return margin.top + mapRange(v, 100, 0, 0, h - margin.top - margin.bottom); }

    // Overbought/oversold zones
    ctx.fillStyle = '#ef444415';
    ctx.fillRect(margin.left, rsiY(100), chartW, rsiY(70) - rsiY(100));
    ctx.fillStyle = '#22c55e15';
    ctx.fillRect(margin.left, rsiY(30), chartW, rsiY(0) - rsiY(30));

    // Threshold lines
    ctx.strokeStyle = '#ef444440';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(margin.left, rsiY(70)); ctx.lineTo(w - margin.right, rsiY(70)); ctx.stroke();
    ctx.strokeStyle = '#22c55e40';
    ctx.beginPath(); ctx.moveTo(margin.left, rsiY(30)); ctx.lineTo(w - margin.right, rsiY(30)); ctx.stroke();
    ctx.strokeStyle = '#ffffff20';
    ctx.beginPath(); ctx.moveTo(margin.left, rsiY(50)); ctx.lineTo(w - margin.right, rsiY(50)); ctx.stroke();
    ctx.setLineDash([]);

    // RSI line
    const gap = chartW / data.length;
    ctx.beginPath();
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 1.5;
    let started = false;
    for (let i = 0; i < data.length; i++) {
      if (data[i] != null) {
        const x = margin.left + i * gap + gap / 2;
        const y = rsiY(data[i]);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#8b8d97';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('70', w - margin.right + 5, rsiY(70) + 3);
    ctx.fillText('30', w - margin.right + 5, rsiY(30) + 3);
    ctx.fillText('RSI', margin.left + 2, margin.top + 10);

    // Current RSI value
    const lastRSI = data.filter(d => d != null).pop();
    if (lastRSI != null) {
      const color = lastRSI > 70 ? '#ef4444' : lastRSI < 30 ? '#22c55e' : '#a78bfa';
      ctx.fillStyle = color;
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(lastRSI.toFixed(1), w - margin.right + 5, rsiY(lastRSI) + 3);
    }
  }

  // ── MACD CHART ───────────────────��───────────────────────────────���───
  function drawMACDChart(canvas, macd, options) {
    if (!canvas || !macd) return;
    options = options || {};
    const w = options.width || canvas.clientWidth || 800;
    const h = options.height || 100;
    const ctx = setupCanvas(canvas, w, h);
    const days = options.days || 180;
    const margin = { top: 5, right: 65, bottom: 5, left: 10 };
    const chartW = w - margin.left - margin.right;

    ctx.fillStyle = '#1a1d28';
    ctx.fillRect(0, 0, w, h);

    const macdLine = (macd.macdLine || []).slice(-days);
    const signalLine = (macd.signalLine || []).slice(-days);
    const histogram = (macd.histogram || []).slice(-days);

    // Find range
    let minV = Infinity, maxV = -Infinity;
    [...macdLine, ...signalLine, ...histogram].forEach(v => {
      if (v != null) { if (v < minV) minV = v; if (v > maxV) maxV = v; }
    });
    if (minV === Infinity) return;
    const pad = (maxV - minV) * 0.1 || 1;
    minV -= pad; maxV += pad;

    function macdY(v) { return margin.top + mapRange(v, maxV, minV, 0, h - margin.top - margin.bottom); }
    const gap = chartW / Math.max(histogram.length, 1);
    const zeroY = macdY(0);

    // Zero line
    ctx.strokeStyle = '#ffffff20';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(margin.left, zeroY); ctx.lineTo(w - margin.right, zeroY); ctx.stroke();

    // Histogram bars
    const barW = Math.max(1, gap * 0.6);
    histogram.forEach((v, i) => {
      if (v == null) return;
      const x = margin.left + i * gap + gap / 2;
      const y = macdY(v);
      ctx.fillStyle = v >= 0 ? '#22c55e80' : '#ef444480';
      ctx.fillRect(x - barW / 2, Math.min(y, zeroY), barW, Math.abs(y - zeroY));
    });

    // MACD and signal lines
    function drawLine(data, color) {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 1.2;
      let s = false;
      data.forEach((v, i) => {
        if (v != null) {
          const x = margin.left + i * gap + gap / 2;
          const y = macdY(v);
          if (!s) { ctx.moveTo(x, y); s = true; } else ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    }
    drawLine(macdLine, '#3b82f6');
    drawLine(signalLine, '#f59e0b');

    // Labels
    ctx.fillStyle = '#8b8d97';
    ctx.font = '9px Inter, sans-serif';
    ctx.fillText('MACD', margin.left + 2, margin.top + 10);
  }

  // ── GAUGE CHART ──────────────────���───────────────────────────────────
  function drawGaugeChart(canvas, score, size) {
    if (!canvas) return;
    size = size || 160;
    const ctx = setupCanvas(canvas, size, size * 0.65);
    const cx = size / 2, cy = size * 0.55;
    const radius = size * 0.38;
    const startAngle = Math.PI;
    const endAngle = 2 * Math.PI;

    ctx.fillStyle = '#1a1d28';
    ctx.fillRect(0, 0, size, size * 0.65);

    // Background arc
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle);
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#2a2d3a';
    ctx.stroke();

    // Score arc with gradient color
    const scoreAngle = startAngle + (score / 100) * Math.PI;
    const gradient = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
    gradient.addColorStop(0, '#ef4444');
    gradient.addColorStop(0.3, '#f59e0b');
    gradient.addColorStop(0.5, '#eab308');
    gradient.addColorStop(0.7, '#4ade80');
    gradient.addColorStop(1, '#22c55e');

    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, scoreAngle);
    ctx.lineWidth = 14;
    ctx.strokeStyle = gradient;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Score text
    ctx.fillStyle = '#e8e9ed';
    ctx.font = 'bold 28px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(score), cx, cy - 5);

    ctx.fillStyle = '#8b8d97';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText('/ 100', cx, cy + 14);
  }

  // ── RADAR CHART ──────────────────────────────────────────────────────
  function drawRadarChart(canvas, components, size) {
    if (!canvas || !components) return;
    size = size || 200;
    const ctx = setupCanvas(canvas, size, size);
    const cx = size / 2, cy = size / 2;
    const maxR = size * 0.35;

    ctx.fillStyle = '#1a1d28';
    ctx.fillRect(0, 0, size, size);

    const labels = ['Trend', 'Momentum', 'Pullback', 'Support', 'Volume', 'Volatility', 'Market'];
    const keys = ['trend', 'momentum', 'pullback', 'support', 'volume', 'volatility', 'marketRegime'];
    const n = labels.length;
    const angleStep = (2 * Math.PI) / n;
    const startAngle = -Math.PI / 2;

    function getPoint(angle, r) {
      return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
    }

    // Grid circles
    [25, 50, 75, 100].forEach(level => {
      const r = (level / 100) * maxR;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const p = getPoint(startAngle + i * angleStep, r);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = '#ffffff10';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });

    // Axis lines
    for (let i = 0; i < n; i++) {
      const p = getPoint(startAngle + i * angleStep, maxR);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = '#ffffff10';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Data polygon
    ctx.beginPath();
    keys.forEach((key, i) => {
      const val = components[key] ? components[key].score : 50;
      const r = (val / 100) * maxR;
      const p = getPoint(startAngle + i * angleStep, r);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = '#3b82f625';
    ctx.fill();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Data points
    keys.forEach((key, i) => {
      const val = components[key] ? components[key].score : 50;
      const r = (val / 100) * maxR;
      const p = getPoint(startAngle + i * angleStep, r);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#3b82f6';
      ctx.fill();
    });

    // Labels
    ctx.fillStyle = '#8b8d97';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    labels.forEach((label, i) => {
      const p = getPoint(startAngle + i * angleStep, maxR + 16);
      ctx.fillText(label, p.x, p.y);
    });
  }

  // ── COMPARISON CHART ─────────────────────────────────────────────────
  function drawComparisonChart(canvas, series1, series2, label1, label2, options) {
    if (!canvas || !series1 || !series2) return;
    options = options || {};
    const w = options.width || canvas.clientWidth || 400;
    const h = options.height || 150;
    const ctx = setupCanvas(canvas, w, h);
    const margin = { top: 20, right: 10, bottom: 20, left: 10 };
    const chartW = w - margin.left - margin.right;
    const chartH = h - margin.top - margin.bottom;

    ctx.fillStyle = '#1a1d28';
    ctx.fillRect(0, 0, w, h);

    // Normalize both series to start at 100
    const days = 90;
    const d1 = series1.slice(-days);
    const d2 = series2.slice(-days);
    if (d1.length < 2 || d2.length < 2) return;
    const n1 = d1.map(v => (v / d1[0]) * 100);
    const n2 = d2.map(v => (v / d2[0]) * 100);
    const len = Math.min(n1.length, n2.length);

    const allVals = [...n1.slice(0, len), ...n2.slice(0, len)];
    const minV = Math.min(...allVals) - 1;
    const maxV = Math.max(...allVals) + 1;

    function yPos(v) { return margin.top + mapRange(v, maxV, minV, 0, chartH); }
    const gap = chartW / (len - 1);

    // Lines
    function drawSeries(data, color) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < len; i++) {
        const x = margin.left + i * gap;
        const y = yPos(data[i]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    drawSeries(n1, '#3b82f6');
    drawSeries(n2, '#f59e0b');

    // 100 line
    ctx.strokeStyle = '#ffffff15';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(margin.left, yPos(100)); ctx.lineTo(w - margin.right, yPos(100)); ctx.stroke();
    ctx.setLineDash([]);

    // Legend
    ctx.font = '9px Inter, sans-serif';
    const perf1 = ((n1[len - 1] - 100)).toFixed(1);
    const perf2 = ((n2[len - 1] - 100)).toFixed(1);
    ctx.fillStyle = '#3b82f6';
    ctx.textAlign = 'left';
    ctx.fillText(label1 + ' (' + (perf1 >= 0 ? '+' : '') + perf1 + '%)', margin.left, margin.top - 5);
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'right';
    ctx.fillText(label2 + ' (' + (perf2 >= 0 ? '+' : '') + perf2 + '%)', w - margin.right, margin.top - 5);
  }

  return {
    drawSparkline,
    drawPriceChart,
    drawRSIChart,
    drawMACDChart,
    drawGaugeChart,
    drawRadarChart,
    drawComparisonChart
  };
})();
