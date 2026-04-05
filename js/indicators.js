/**
 * Technical Indicators Calculation Module for ETF Buy Advisor
 *
 * Processes OHLCV candle arrays and computes a comprehensive set of
 * technical indicators used for buy/sell signal generation.
 *
 * Each candle: { date, open, high, low, close, volume }
 * All output arrays are padded with null at the start so they align
 * with the input array by index.
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Extract the 'close' field from an array of candles.
   */
  function extractCloses(candles) {
    return candles.map(function (c) { return c.close; });
  }

  /**
   * Return the last non-null value from an array, or null if none exists.
   */
  function lastValue(arr) {
    if (!arr || arr.length === 0) return null;
    for (var i = arr.length - 1; i >= 0; i--) {
      if (arr[i] !== null && arr[i] !== undefined && !isNaN(arr[i])) return arr[i];
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // 1. SMA  --  Simple Moving Average
  // ---------------------------------------------------------------------------
  /**
   * Computes the simple moving average over `period` bars.
   * Uses a running sum for O(n) performance.
   *
   * @param {number[]} closes - Array of closing prices.
   * @param {number}   period - Lookback window.
   * @returns {(number|null)[]} Array same length as closes, padded with null.
   */
  function SMA(closes, period) {
    var result = [];
    var len = closes.length;
    if (len === 0 || period <= 0) return result;

    var sum = 0;
    for (var i = 0; i < len; i++) {
      sum += closes[i];
      if (i < period - 1) {
        // Not enough bars yet
        result.push(null);
      } else {
        if (i >= period) {
          // Slide the window: subtract the element leaving the window
          sum -= closes[i - period];
        }
        result.push(sum / period);
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // 2. EMA  --  Exponential Moving Average
  // ---------------------------------------------------------------------------
  /**
   * Computes the exponential moving average.
   * The first valid value is seeded with the SMA over the initial `period` bars.
   * Multiplier k = 2 / (period + 1).
   *
   * @param {number[]} closes - Array of closing prices.
   * @param {number}   period - Lookback window.
   * @returns {(number|null)[]} Array same length as closes, padded with null.
   */
  function EMA(closes, period) {
    var result = [];
    var len = closes.length;
    if (len === 0 || period <= 0) return result;

    var k = 2 / (period + 1); // smoothing multiplier

    // Seed: SMA of first `period` values
    var sum = 0;
    for (var i = 0; i < len; i++) {
      if (i < period - 1) {
        sum += closes[i];
        result.push(null);
      } else if (i === period - 1) {
        sum += closes[i];
        result.push(sum / period); // first EMA value = SMA
      } else {
        // EMA = close * k + prevEMA * (1 - k)
        var prev = result[i - 1];
        result.push(closes[i] * k + prev * (1 - k));
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // 3. RSI  --  Relative Strength Index
  // ---------------------------------------------------------------------------
  /**
   * Computes the RSI using the smoothed (Wilder) method.
   *
   * Step 1: Calculate price changes.
   * Step 2: Seed avgGain and avgLoss with the SMA of the first `period` changes.
   * Step 3: Smooth with Wilder's formula: avg = (prev * (period-1) + current) / period.
   * RSI = 100 - 100 / (1 + avgGain / avgLoss).
   *
   * @param {number[]} closes - Array of closing prices.
   * @param {number}   [period=14] - RSI period.
   * @returns {(number|null)[]} Array same length as closes, padded with null.
   */
  function RSI(closes, period) {
    if (period === undefined) period = 14;
    var result = [];
    var len = closes.length;
    if (len < period + 1) {
      // Not enough data for even one RSI value
      for (var x = 0; x < len; x++) result.push(null);
      return result;
    }

    // First bar has no change
    result.push(null);

    // Calculate initial average gain / loss over first `period` changes
    var gainSum = 0;
    var lossSum = 0;
    for (var i = 1; i <= period; i++) {
      var change = closes[i] - closes[i - 1];
      if (change > 0) gainSum += change;
      else lossSum += Math.abs(change);
      result.push(null); // pad these bars
    }

    var avgGain = gainSum / period;
    var avgLoss = lossSum / period;

    // First RSI value at index = period
    var rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

    // Wilder smoothing for the rest
    for (var j = period + 1; j < len; j++) {
      var ch = closes[j] - closes[j - 1];
      var gain = ch > 0 ? ch : 0;
      var loss = ch < 0 ? Math.abs(ch) : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      if (avgLoss === 0) {
        result.push(100);
      } else {
        result.push(100 - 100 / (1 + avgGain / avgLoss));
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // 4. MACD  --  Moving Average Convergence Divergence
  // ---------------------------------------------------------------------------
  /**
   * MACD Line   = EMA(fast) - EMA(slow)
   * Signal Line = EMA of MACD Line over `signal` bars
   * Histogram   = MACD Line - Signal Line
   *
   * @param {number[]} closes
   * @param {number}   [fast=12]
   * @param {number}   [slow=26]
   * @param {number}   [signal=9]
   * @returns {{ macdLine: (number|null)[], signalLine: (number|null)[], histogram: (number|null)[] }}
   */
  function MACD(closes, fast, slow, signal) {
    if (fast === undefined) fast = 12;
    if (slow === undefined) slow = 26;
    if (signal === undefined) signal = 9;

    var emaFast = EMA(closes, fast);
    var emaSlow = EMA(closes, slow);
    var len = closes.length;

    // MACD line: difference of the two EMAs (null until both are available)
    var macdLine = [];
    for (var i = 0; i < len; i++) {
      if (emaFast[i] !== null && emaSlow[i] !== null) {
        macdLine.push(emaFast[i] - emaSlow[i]);
      } else {
        macdLine.push(null);
      }
    }

    // Signal line: EMA of the non-null MACD values, then map back
    // Collect non-null MACD values
    var macdVals = [];
    var macdIndices = [];
    for (var m = 0; m < len; m++) {
      if (macdLine[m] !== null) {
        macdVals.push(macdLine[m]);
        macdIndices.push(m);
      }
    }

    var signalRaw = EMA(macdVals, signal);

    // Map signal values back to full-length array
    var signalLine = new Array(len);
    for (var s = 0; s < len; s++) signalLine[s] = null;
    for (var r = 0; r < macdIndices.length; r++) {
      signalLine[macdIndices[r]] = signalRaw[r];
    }

    // Histogram
    var histogram = [];
    for (var h = 0; h < len; h++) {
      if (macdLine[h] !== null && signalLine[h] !== null) {
        histogram.push(macdLine[h] - signalLine[h]);
      } else {
        histogram.push(null);
      }
    }

    return { macdLine: macdLine, signalLine: signalLine, histogram: histogram };
  }

  // ---------------------------------------------------------------------------
  // 5. ATR  --  Average True Range
  // ---------------------------------------------------------------------------
  /**
   * True Range = max(high - low, |high - prevClose|, |low - prevClose|)
   * ATR is the Wilder-smoothed average of True Range over `period` bars.
   *
   * @param {{ high: number, low: number, close: number }[]} candles
   * @param {number} [period=14]
   * @returns {(number|null)[]}
   */
  function ATR(candles, period) {
    if (period === undefined) period = 14;
    var len = candles.length;
    var result = [];

    if (len === 0) return result;

    // Compute True Range for each bar
    var tr = [candles[0].high - candles[0].low]; // first bar: just high - low
    for (var i = 1; i < len; i++) {
      var h = candles[i].high;
      var l = candles[i].low;
      var pc = candles[i - 1].close;
      tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }

    // Seed ATR with SMA of first `period` true ranges
    if (len < period) {
      for (var x = 0; x < len; x++) result.push(null);
      return result;
    }

    var sum = 0;
    for (var j = 0; j < period; j++) {
      sum += tr[j];
      result.push(null);
    }
    result[period - 1] = sum / period; // first ATR value

    // Wilder smoothing: ATR = (prevATR * (period - 1) + TR) / period
    for (var k = period; k < len; k++) {
      var prevATR = result[k - 1];
      result.push((prevATR * (period - 1) + tr[k]) / period);
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // 6. Stochastic RSI
  // ---------------------------------------------------------------------------
  /**
   * StochRSI applies the Stochastic oscillator formula to RSI values.
   *
   * StochRSI = (RSI - lowest RSI over stochPeriod) / (highest RSI - lowest RSI)
   * %K = SMA(StochRSI, kSmooth)
   * %D = SMA(%K, dSmooth)
   *
   * @param {number[]} closes
   * @param {number}   [rsiPeriod=14]
   * @param {number}   [stochPeriod=14]
   * @param {number}   [kSmooth=3]
   * @param {number}   [dSmooth=3]
   * @returns {{ k: (number|null)[], d: (number|null)[] }}
   */
  function stochasticRSI(closes, rsiPeriod, stochPeriod, kSmooth, dSmooth) {
    if (rsiPeriod === undefined) rsiPeriod = 14;
    if (stochPeriod === undefined) stochPeriod = 14;
    if (kSmooth === undefined) kSmooth = 3;
    if (dSmooth === undefined) dSmooth = 3;

    var rsiValues = RSI(closes, rsiPeriod);
    var len = rsiValues.length;

    // Raw Stochastic RSI (0-100 scale)
    var rawStoch = [];
    for (var i = 0; i < len; i++) {
      if (rsiValues[i] === null || i < stochPeriod - 1) {
        rawStoch.push(null);
        continue;
      }

      // Look back stochPeriod bars for min/max RSI
      var minRSI = Infinity;
      var maxRSI = -Infinity;
      var valid = true;
      for (var j = i - stochPeriod + 1; j <= i; j++) {
        if (j < 0 || rsiValues[j] === null) {
          valid = false;
          break;
        }
        if (rsiValues[j] < minRSI) minRSI = rsiValues[j];
        if (rsiValues[j] > maxRSI) maxRSI = rsiValues[j];
      }

      if (!valid || maxRSI === minRSI) {
        // If all RSI values in the window are equal, StochRSI is 0 (or 100 if at ceiling)
        rawStoch.push(valid ? 50 : null);
      } else {
        rawStoch.push(((rsiValues[i] - minRSI) / (maxRSI - minRSI)) * 100);
      }
    }

    // %K = SMA of rawStoch over kSmooth
    // Collect non-null values to compute SMA, then map back
    var kLine = [];
    for (var ki = 0; ki < len; ki++) {
      if (rawStoch[ki] === null) {
        kLine.push(null);
        continue;
      }
      // Look back kSmooth bars in rawStoch
      var kSum = 0;
      var kCount = 0;
      for (var kb = ki - kSmooth + 1; kb <= ki; kb++) {
        if (kb >= 0 && rawStoch[kb] !== null) {
          kSum += rawStoch[kb];
          kCount++;
        }
      }
      kLine.push(kCount === kSmooth ? kSum / kSmooth : null);
    }

    // %D = SMA of %K over dSmooth
    var dLine = [];
    for (var di = 0; di < len; di++) {
      if (kLine[di] === null) {
        dLine.push(null);
        continue;
      }
      var dSum = 0;
      var dCount = 0;
      for (var db = di - dSmooth + 1; db <= di; db++) {
        if (db >= 0 && kLine[db] !== null) {
          dSum += kLine[db];
          dCount++;
        }
      }
      dLine.push(dCount === dSmooth ? dSum / dSmooth : null);
    }

    return { k: kLine, d: dLine };
  }

  // ---------------------------------------------------------------------------
  // 7. Rate of Change (ROC)
  // ---------------------------------------------------------------------------
  /**
   * ROC = ((close - close_n_bars_ago) / close_n_bars_ago) * 100
   *
   * @param {number[]} closes
   * @param {number}   period
   * @returns {(number|null)[]}
   */
  function rateOfChange(closes, period) {
    var result = [];
    var len = closes.length;
    for (var i = 0; i < len; i++) {
      if (i < period || closes[i - period] === 0) {
        result.push(null);
      } else {
        result.push(((closes[i] - closes[i - period]) / closes[i - period]) * 100);
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // 8. Bollinger Bands
  // ---------------------------------------------------------------------------
  /**
   * Middle = SMA(period)
   * Upper  = Middle + stdDev * standardDeviation
   * Lower  = Middle - stdDev * standardDeviation
   *
   * Standard deviation is computed over the same `period` window.
   *
   * @param {number[]} closes
   * @param {number}   [period=20]
   * @param {number}   [stdDev=2]
   * @returns {{ upper: (number|null)[], middle: (number|null)[], lower: (number|null)[] }}
   */
  function bollingerBands(closes, period, stdDev) {
    if (period === undefined) period = 20;
    if (stdDev === undefined) stdDev = 2;

    var middle = SMA(closes, period);
    var upper = [];
    var lower = [];
    var len = closes.length;

    for (var i = 0; i < len; i++) {
      if (middle[i] === null) {
        upper.push(null);
        lower.push(null);
        continue;
      }
      // Compute standard deviation over the window [i - period + 1 .. i]
      var mean = middle[i];
      var sqSum = 0;
      for (var j = i - period + 1; j <= i; j++) {
        var diff = closes[j] - mean;
        sqSum += diff * diff;
      }
      var sd = Math.sqrt(sqSum / period);
      upper.push(mean + stdDev * sd);
      lower.push(mean - stdDev * sd);
    }

    return { upper: upper, middle: middle, lower: lower };
  }

  // ---------------------------------------------------------------------------
  // 9. SMA Slope
  // ---------------------------------------------------------------------------
  /**
   * Percentage change of the SMA over the last `lookback` bars.
   * slope = ((sma[i] - sma[i - lookback]) / sma[i - lookback]) * 100
   *
   * @param {(number|null)[]} smaValues
   * @param {number}          [lookback=5]
   * @returns {(number|null)[]}
   */
  function smaSlope(smaValues, lookback) {
    if (lookback === undefined) lookback = 5;
    var result = [];
    var len = smaValues.length;
    for (var i = 0; i < len; i++) {
      if (
        i < lookback ||
        smaValues[i] === null ||
        smaValues[i - lookback] === null ||
        smaValues[i - lookback] === 0
      ) {
        result.push(null);
      } else {
        result.push(
          ((smaValues[i] - smaValues[i - lookback]) / smaValues[i - lookback]) * 100
        );
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // 10. Golden / Death Cross Detection
  // ---------------------------------------------------------------------------
  /**
   * A Golden Cross occurs when the SMA50 crosses above the SMA200.
   * A Death Cross occurs when the SMA50 crosses below the SMA200.
   *
   * @param {(number|null)[]} sma50
   * @param {(number|null)[]} sma200
   * @returns {{ type: string, index: number, date: * }[]}
   */
  function detectGoldenDeathCross(sma50, sma200) {
    var crosses = [];
    var len = Math.min(sma50.length, sma200.length);

    for (var i = 1; i < len; i++) {
      if (
        sma50[i] === null || sma200[i] === null ||
        sma50[i - 1] === null || sma200[i - 1] === null
      ) {
        continue;
      }

      var prevAbove = sma50[i - 1] > sma200[i - 1];
      var currAbove = sma50[i] > sma200[i];

      if (!prevAbove && currAbove) {
        crosses.push({ type: "golden", index: i, date: null });
      } else if (prevAbove && !currAbove) {
        crosses.push({ type: "death", index: i, date: null });
      }
    }
    return crosses;
  }

  // ---------------------------------------------------------------------------
  // 11. Swing Highs and Lows
  // ---------------------------------------------------------------------------
  /**
   * A swing high is a bar whose high is greater than the highs of the
   * surrounding `lookback` bars on each side.
   * A swing low is a bar whose low is less than the lows of the surrounding
   * `lookback` bars on each side.
   *
   * @param {{ high: number, low: number, date: * }[]} candles
   * @param {number} [lookback=5]
   * @returns {{ type: string, index: number, price: number, date: * }[]}
   */
  function findSwingHighsLows(candles, lookback) {
    if (lookback === undefined) lookback = 5;
    var points = [];
    var len = candles.length;

    for (var i = lookback; i < len - lookback; i++) {
      var isSwingHigh = true;
      var isSwingLow = true;

      for (var j = 1; j <= lookback; j++) {
        if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) {
          isSwingHigh = false;
        }
        if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
          isSwingLow = false;
        }
        if (!isSwingHigh && !isSwingLow) break;
      }

      if (isSwingHigh) {
        points.push({
          type: "high",
          index: i,
          price: candles[i].high,
          date: candles[i].date
        });
      }
      if (isSwingLow) {
        points.push({
          type: "low",
          index: i,
          price: candles[i].low,
          date: candles[i].date
        });
      }
    }
    return points;
  }

  // ---------------------------------------------------------------------------
  // 12. Support / Resistance Detection
  // ---------------------------------------------------------------------------
  /**
   * Clusters swing highs and lows into price zones using a simple
   * agglomerative approach:
   *   1. Collect all swing point prices.
   *   2. Sort them.
   *   3. Group points that are within a tolerance (0.5% of the first point
   *      in the cluster) into the same zone.
   *   4. Each zone's price = average of its members; strength = count.
   *   5. Return the top `numLevels` supports and resistances by strength.
   *
   * @param {{ high: number, low: number, close: number, date: * }[]} candles
   * @param {number} [numLevels=5]
   * @returns {{ supports: { price: number, strength: number }[], resistances: { price: number, strength: number }[] }}
   */
  function detectSupportResistance(candles, numLevels) {
    if (numLevels === undefined) numLevels = 5;

    var swingPoints = findSwingHighsLows(candles, 5);
    if (swingPoints.length === 0) {
      return { supports: [], resistances: [] };
    }

    var lastClose = candles[candles.length - 1].close;

    // Separate swing highs and lows
    var highs = swingPoints.filter(function (p) { return p.type === "high"; });
    var lows = swingPoints.filter(function (p) { return p.type === "low"; });

    /**
     * Cluster an array of prices into zones.
     * tolerance: fraction of price (0.5%) to group nearby levels.
     */
    function clusterPrices(prices) {
      if (prices.length === 0) return [];
      prices.sort(function (a, b) { return a - b; });

      var clusters = [];
      var cluster = [prices[0]];

      for (var i = 1; i < prices.length; i++) {
        var clusterAvg = cluster.reduce(function (s, v) { return s + v; }, 0) / cluster.length;
        // If within 1.5% of the cluster average, merge
        if (Math.abs(prices[i] - clusterAvg) / clusterAvg < 0.015) {
          cluster.push(prices[i]);
        } else {
          clusters.push(cluster);
          cluster = [prices[i]];
        }
      }
      clusters.push(cluster);

      // Convert clusters to { price, strength }
      return clusters.map(function (c) {
        var avg = c.reduce(function (s, v) { return s + v; }, 0) / c.length;
        return { price: Math.round(avg * 100) / 100, strength: c.length };
      });
    }

    var resistanceZones = clusterPrices(highs.map(function (p) { return p.price; }));
    var supportZones = clusterPrices(lows.map(function (p) { return p.price; }));

    // Filter: resistances above current price, supports below
    resistanceZones = resistanceZones.filter(function (z) { return z.price >= lastClose; });
    supportZones = supportZones.filter(function (z) { return z.price <= lastClose; });

    // Sort by strength descending, take top N
    resistanceZones.sort(function (a, b) { return b.strength - a.strength; });
    supportZones.sort(function (a, b) { return b.strength - a.strength; });

    return {
      supports: supportZones.slice(0, numLevels),
      resistances: resistanceZones.slice(0, numLevels)
    };
  }

  // ---------------------------------------------------------------------------
  // 13. Volume Analysis
  // ---------------------------------------------------------------------------
  /**
   * Computes volume-based metrics:
   *   avgVolume      - SMA of volume over `period`.
   *   relativeVolume - latest volume / avgVolume.
   *   upVolumeRatio  - fraction of up-days in the period window.
   *   isAccumulation - true if relativeVolume > 1 and upVolumeRatio > 0.5.
   *
   * @param {{ close: number, volume: number }[]} candles
   * @param {number} [period=20]
   * @returns {{ avgVolume: number|null, relativeVolume: number|null, upVolumeRatio: number|null, isAccumulation: boolean }}
   */
  function volumeAnalysis(candles, period) {
    if (period === undefined) period = 20;
    var len = candles.length;

    if (len < period) {
      return {
        avgVolume: null,
        relativeVolume: null,
        upVolumeRatio: null,
        isAccumulation: false
      };
    }

    // Average volume over the last `period` bars
    var volSum = 0;
    var upDays = 0;
    for (var i = len - period; i < len; i++) {
      volSum += candles[i].volume;
      if (i > 0 && candles[i].close > candles[i - 1].close) {
        upDays++;
      }
    }
    var avgVolume = volSum / period;
    var latestVolume = candles[len - 1].volume;
    var relativeVolume = avgVolume > 0 ? latestVolume / avgVolume : null;
    var upVolumeRatio = upDays / (period - 1); // period-1 because first bar has no prev

    return {
      avgVolume: avgVolume,
      relativeVolume: relativeVolume,
      upVolumeRatio: Math.round(upVolumeRatio * 1000) / 1000,
      isAccumulation: relativeVolume > 1 && upVolumeRatio > 0.5
    };
  }

  // ---------------------------------------------------------------------------
  // 14. Distance from Moving Average
  // ---------------------------------------------------------------------------
  /**
   * Percentage distance of the current close from a moving average value.
   * Positive means price is above MA, negative means below.
   *
   * @param {number} close
   * @param {number} maValue
   * @returns {number|null}
   */
  function distanceFromMA(close, maValue) {
    if (maValue === null || maValue === undefined || maValue === 0) return null;
    return ((close - maValue) / maValue) * 100;
  }

  // ---------------------------------------------------------------------------
  // 15. Distance from 52-Week High
  // ---------------------------------------------------------------------------
  /**
   * Percentage the latest close is below the 252-day high.
   * Returns a negative number (e.g. -5 means 5% below the high).
   *
   * @param {number[]} closes
   * @returns {number|null}
   */
  function distanceFrom52WeekHigh(closes) {
    var len = closes.length;
    if (len === 0) return null;

    var lookback = Math.min(252, len);
    var high = -Infinity;
    for (var i = len - lookback; i < len; i++) {
      if (closes[i] > high) high = closes[i];
    }
    var latest = closes[len - 1];
    return high === 0 ? null : ((latest - high) / high) * 100;
  }

  // ---------------------------------------------------------------------------
  // 16. Distance from 52-Week Low
  // ---------------------------------------------------------------------------
  /**
   * Percentage the latest close is above the 252-day low.
   * Returns a positive number (e.g. 10 means 10% above the low).
   *
   * @param {number[]} closes
   * @returns {number|null}
   */
  function distanceFrom52WeekLow(closes) {
    var len = closes.length;
    if (len === 0) return null;

    var lookback = Math.min(252, len);
    var low = Infinity;
    for (var i = len - lookback; i < len; i++) {
      if (closes[i] < low) low = closes[i];
    }
    var latest = closes[len - 1];
    return low === 0 ? null : ((latest - low) / low) * 100;
  }

  // ---------------------------------------------------------------------------
  // 17. calculateAll  --  Master Function
  // ---------------------------------------------------------------------------
  /**
   * Computes every indicator and returns a comprehensive result object.
   *
   * @param {{ date: *, open: number, high: number, low: number, close: number, volume: number }[]} candles
   * @returns {object} Full indicator suite.
   */
  function calculateAll(candles) {
    if (!candles || candles.length === 0) {
      return null;
    }

    var closes = extractCloses(candles);
    var len = closes.length;
    var latestClose = closes[len - 1];

    // Moving Averages
    var sma20 = SMA(closes, 20);
    var sma50 = SMA(closes, 50);
    var sma100 = SMA(closes, 100);
    var sma200 = SMA(closes, 200);
    var ema12 = EMA(closes, 12);
    var ema26 = EMA(closes, 26);

    // Oscillators
    var rsi = RSI(closes, 14);
    var macd = MACD(closes, 12, 26, 9);
    var atr = ATR(candles, 14);
    var stochRSI = stochasticRSI(closes, 14, 14, 3, 3);

    // Momentum
    var roc5 = rateOfChange(closes, 5);
    var roc10 = rateOfChange(closes, 10);
    var roc20 = rateOfChange(closes, 20);

    // Volatility
    var bollinger = bollingerBands(closes, 20, 2);

    // Trend / Slope
    var sma20Slope = smaSlope(sma20, 5);
    var sma50Slope = smaSlope(sma50, 5);
    var sma200Slope = smaSlope(sma200, 5);

    // Cross detection
    var goldenDeathCrosses = detectGoldenDeathCross(sma50, sma200);
    // Enrich with dates from candles
    for (var c = 0; c < goldenDeathCrosses.length; c++) {
      var idx = goldenDeathCrosses[c].index;
      if (idx < candles.length) {
        goldenDeathCrosses[c].date = candles[idx].date;
      }
    }

    // Structure
    var swingPoints = findSwingHighsLows(candles, 5);
    var supportResistance = detectSupportResistance(candles, 5);

    // Volume
    var volAnalysis = volumeAnalysis(candles, 20);

    // Distance from MAs
    var distFromMAs = {
      d20: distanceFromMA(latestClose, lastValue(sma20)),
      d50: distanceFromMA(latestClose, lastValue(sma50)),
      d100: distanceFromMA(latestClose, lastValue(sma100)),
      d200: distanceFromMA(latestClose, lastValue(sma200))
    };

    // 52-week extremes
    var distFrom52High = distanceFrom52WeekHigh(closes);
    var distFrom52Low = distanceFrom52WeekLow(closes);

    // Latest values snapshot (most recent non-null value of each)
    var latestValues = {
      close: latestClose,
      rsi: lastValue(rsi),
      macdLine: lastValue(macd.macdLine),
      macdSignal: lastValue(macd.signalLine),
      macdHist: lastValue(macd.histogram),
      atr: lastValue(atr),
      sma20: lastValue(sma20),
      sma50: lastValue(sma50),
      sma100: lastValue(sma100),
      sma200: lastValue(sma200),
      stochK: lastValue(stochRSI.k),
      stochD: lastValue(stochRSI.d),
      roc5: lastValue(roc5),
      roc10: lastValue(roc10),
      roc20: lastValue(roc20),
      relativeVolume: volAnalysis.relativeVolume,
      upVolumeRatio: volAnalysis.upVolumeRatio
    };

    return {
      sma20: sma20,
      sma50: sma50,
      sma100: sma100,
      sma200: sma200,
      ema12: ema12,
      ema26: ema26,
      rsi: rsi,
      macd: macd,
      atr: atr,
      stochRSI: stochRSI,
      roc5: roc5,
      roc10: roc10,
      roc20: roc20,
      bollinger: bollinger,
      sma20Slope: sma20Slope,
      sma50Slope: sma50Slope,
      sma200Slope: sma200Slope,
      goldenDeathCrosses: goldenDeathCrosses,
      swingPoints: swingPoints,
      supportResistance: supportResistance,
      volumeAnalysis: volAnalysis,
      distFromMAs: distFromMAs,
      distFrom52High: distFrom52High,
      distFrom52Low: distFrom52Low,
      latestValues: latestValues
    };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  window.Indicators = {
    SMA: SMA,
    EMA: EMA,
    RSI: RSI,
    MACD: MACD,
    ATR: ATR,
    stochasticRSI: stochasticRSI,
    rateOfChange: rateOfChange,
    bollingerBands: bollingerBands,
    smaSlope: smaSlope,
    detectGoldenDeathCross: detectGoldenDeathCross,
    findSwingHighsLows: findSwingHighsLows,
    detectSupportResistance: detectSupportResistance,
    volumeAnalysis: volumeAnalysis,
    distanceFromMA: distanceFromMA,
    distanceFrom52WeekHigh: distanceFrom52WeekHigh,
    distanceFrom52WeekLow: distanceFrom52WeekLow,
    calculateAll: calculateAll
  };
})();
