import { Candle, ICandle, CandleInterval, INTERVAL_MS, getCandleStart } from "../models/candle.model";
import { getCachedPrice } from "./market.service";
import { broadcastCandleUpdate } from "./websocket.service";

// Flag to prevent candle updates until backfill is complete
// This prevents live candles from being created before historical data exists
let candlesInitialized = false;

// Perpetuals DEX - Market is always open 24/7
// Synthetic candle variance settings for real-time updates
// Tuned for realistic equity movements (~$0.05-0.15 on $300 stocks)
const SYNTHETIC_MIN_CHANGE = 0.01;         // Minimum $0.01 change per tick
const SYNTHETIC_VARIANCE_PERCENT = 0.0003; // 0.03% variance (~$0.10 on $300 stock)
const SYNTHETIC_MAX_DRIFT = 0.002;         // Max 0.2% drift (~$0.60 on $300 stock)
const SYNTHETIC_MEAN_REVERSION = 0.15;     // Mean reversion (15% pull back per tick)

// ============================================================================
// REALISTIC HISTORICAL CANDLE GENERATION
// Uses momentum, volatility clustering, and natural market patterns
// ============================================================================

interface MarketState {
  trend: number;           // Current trend direction: -1 to 1
  volatility: number;      // Current volatility level: 0.5 to 2.0
  momentum: number;        // Recent price momentum
  trendStrength: number;   // How strong the current trend is
  trendDuration: number;   // How long current trend has lasted
}

// Generate a random number from a normal distribution (Box-Muller transform)
// CLAMPED to prevent extreme outliers that would cause price spikes
function randomNormal(mean: number = 0, stdDev: number = 1): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  // Clamp to +/- 2.5 standard deviations to prevent extreme outliers
  const clampedZ = Math.max(-2.5, Math.min(2.5, z));
  return mean + clampedZ * stdDev;
}

// Generate a realistic candle by simulating a CONTINUOUS PRICE PATH
// This creates proper OHLC where high/low are naturally constrained by the price path
function generateRealisticCandle(
  previousClose: number,
  state: MarketState,
  baseVolatility: number = 0.0003,  // ~0.03% base per candle for 1m
  anchorPrice?: number,              // Target price to anchor towards
  anchorStrength: number = 0         // 0-1: how strongly to pull towards anchor (increases near end)
): { open: number; high: number; low: number; close: number; newState: MarketState } {
  // Adjust volatility based on state (volatility clustering)
  const currentVolatility = baseVolatility * state.volatility;
  
  // OPEN: Start from previous close (with tiny gap for realism, +/- $0.02)
  const tinyGap = (Math.random() - 0.5) * 0.04;
  const open = Math.round((previousClose + tinyGap) * 100) / 100;
  
  // Simulate a continuous price path with ~20 ticks within the candle
  // This ensures high/low are naturally constrained by actual price movement
  const numTicks = 15 + Math.floor(Math.random() * 10); // 15-25 ticks
  const prices: number[] = [open];
  let currentPrice = open;
  
  // Trend bias is WEAK - random noise dominates
  // This creates organic price movement, not monotonic trends
  const baseBias = state.trend * state.trendStrength * 0.3 + state.momentum * 0.2;
  
  // Add per-candle random bias (some candles go against trend - "breathing")
  const candleNoise = randomNormal(0, 0.3);
  const trendBias = baseBias + candleNoise;
  
  for (let i = 0; i < numTicks; i++) {
    const prevPrice = currentPrice;
    
    // Each tick is a small random walk with trend bias
    // Volatility per tick = total volatility / sqrt(numTicks)
    const tickVolatility = currentVolatility / Math.sqrt(numTicks);
    
    // Direction influenced by trend, with randomness
    const direction = trendBias + randomNormal(0, 1);
    let tickChange = direction * tickVolatility * currentPrice;
    
    // Clamp each tick change to max 0.02% of price (~$0.06 on $300 stock)
    const maxTickChange = currentPrice * 0.0002;
    tickChange = Math.max(-maxTickChange, Math.min(maxTickChange, tickChange));
    
    // Apply anchoring pull if needed
    let anchorPull = 0;
    if (anchorPrice && anchorStrength > 0) {
      const drift = (currentPrice - anchorPrice) / anchorPrice;
      anchorPull = -drift * anchorStrength * tickVolatility * currentPrice * 2;
      // Clamp anchor pull too
      anchorPull = Math.max(-maxTickChange, Math.min(maxTickChange, anchorPull));
    }
    
    currentPrice = currentPrice + tickChange + anchorPull;
    
    // SANITY CHECK: Price can never move more than 0.05% from previous tick (~$0.15 on $300)
    const maxMove = prevPrice * 0.0005;
    if (Math.abs(currentPrice - prevPrice) > maxMove) {
      currentPrice = prevPrice + (currentPrice > prevPrice ? maxMove : -maxMove);
    }
    
    // Hard clamp to prevent extreme drift from anchor
    if (anchorPrice) {
      const maxDrift = 0.02 * (1 - anchorStrength * 0.5); // Max 2% drift
      const drift = (currentPrice - anchorPrice) / anchorPrice;
      if (Math.abs(drift) > maxDrift) {
        currentPrice = anchorPrice * (1 + (drift > 0 ? maxDrift : -maxDrift));
      }
    }
    
    prices.push(Math.round(currentPrice * 100) / 100);
  }
  
  // OHLC derived from the continuous price path
  let high = Math.max(...prices);
  let low = Math.min(...prices);
  let close = prices[prices.length - 1];
  
  // FINAL SANITY CHECK: Ensure candle range is reasonable (max 0.15% of open ~$0.50 on $300)
  const maxRange = open * 0.0015;
  if (high - low > maxRange) {
    // Compress the range towards the midpoint
    const mid = (high + low) / 2;
    high = mid + maxRange / 2;
    low = mid - maxRange / 2;
    // Ensure close is within bounds
    close = Math.max(low, Math.min(high, close));
  }
  
  // Calculate actual price change for state update
  const priceChange = (close - open) / open;
  
  // Update market state for next candle
  const newState = updateMarketState(state, priceChange);
  
  return { 
    open: Math.round(open * 100) / 100, 
    high: Math.round(high * 100) / 100, 
    low: Math.round(low * 100) / 100, 
    close: Math.round(close * 100) / 100, 
    newState 
  };
}

// Update market state based on recent price action
// Creates ORGANIC price behavior with breathing trends and gradual transitions
function updateMarketState(state: MarketState, priceChange: number): MarketState {
  // Update momentum with more smoothing (less reactive)
  const newMomentum = state.momentum * 0.85 + priceChange * 0.15;
  
  // Volatility evolves gradually - slow to rise, slow to fall
  // This creates natural volatility clustering without sudden spikes
  const volatilityShock = Math.abs(priceChange) / 0.005; // Normalized
  let newVolatility = state.volatility * 0.95 + 0.05; // Mean revert to 1.0
  if (volatilityShock > 1) {
    // Only increase volatility if move was larger than expected
    newVolatility += (volatilityShock - 1) * 0.02;
  }
  newVolatility = Math.max(0.7, Math.min(1.4, newVolatility)); // Tighter range
  
  // Trend evolves GRADUALLY - no sudden flips
  let newTrend = state.trend;
  let newTrendStrength = state.trendStrength;
  let newTrendDuration = state.trendDuration;
  
  // Check if price confirmed or rejected trend
  const movingWithTrend = (priceChange > 0 && state.trend > 0) || (priceChange < 0 && state.trend < 0);
  
  if (movingWithTrend) {
    newTrendDuration++;
    // Very gradual trend strengthening
    newTrendStrength = Math.min(0.6, state.trendStrength + 0.01);
  } else {
    // Counter-trend move - this is NORMAL and expected
    newTrendDuration = Math.max(0, newTrendDuration - 1);
    // Gradual weakening
    newTrendStrength = Math.max(0.1, state.trendStrength - 0.02);
  }
  
  // Trend naturally decays over time (mean reversion)
  // Strong decay keeps trends from becoming too persistent
  newTrend = newTrend * 0.97;
  
  // Add random noise to trend direction (trends "breathe")
  // This prevents monotonic moves
  newTrend += randomNormal(0, 0.03);
  
  // Gradual trend rotation - trends slowly evolve, don't flip
  // Small random drift in trend direction
  const trendDrift = randomNormal(0, 0.02);
  newTrend += trendDrift;
  
  // When trend has persisted long, gradually increase chance of reversal
  // But reversal happens GRADUALLY, not instantly
  if (newTrendDuration > 20) {
    // Long trend - start building reversal pressure
    const reversalPressure = (newTrendDuration - 20) * 0.002;
    newTrend -= Math.sign(newTrend) * reversalPressure; // Pull towards zero
    
    // Volatility tends to increase before reversals
    newVolatility += 0.01;
  }
  
  // Clamp trend to reasonable bounds (but allow it to reach zero = consolidation)
  newTrend = Math.max(-0.5, Math.min(0.5, newTrend));
  
  // Trend strength also decays
  newTrendStrength = newTrendStrength * 0.99;
  
  return {
    trend: newTrend,
    volatility: newVolatility,
    momentum: newMomentum,
    trendStrength: newTrendStrength,
    trendDuration: newTrendDuration,
  };
}

// Initialize a random market state
function initializeMarketState(): MarketState {
  return {
    trend: randomNormal(0, 0.15),         // Start with weak/no trend
    volatility: 0.9 + Math.random() * 0.2, // Start near baseline volatility
    momentum: 0,
    trendStrength: 0.2 + Math.random() * 0.2, // Weak initial trend strength
    trendDuration: 0,
  };
}

// Get base volatility for different intervals
// Tuned for realistic equity movements
function getBaseVolatility(interval: CandleInterval): number {
  // Volatility scales roughly with sqrt of time
  // Values tuned for visible but realistic price action
  const volatilityMap: Record<CandleInterval, number> = {
    "1m": 0.0003,   // ~0.03% per minute (~$0.10 on $300 stock)
    "5m": 0.0007,   // ~0.07% per 5 minutes (~$0.20)
    "15m": 0.0012,  // ~0.12% per 15 minutes (~$0.35)
    "1h": 0.0025,   // ~0.25% per hour (~$0.75)
    "4h": 0.005,    // ~0.5% per 4 hours (~$1.50)
    "1d": 0.012,    // ~1.2% per day (~$3.60 on $300 stock)
  };
  return volatilityMap[interval];
}

// In-memory current candles (for real-time updates)
interface CurrentCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
  timestamp: Date;
}

const currentCandles = new Map<string, Map<CandleInterval, CurrentCandle>>();

// Track last known prices for synthetic generation
const lastKnownPrices = new Map<string, number>();

/**
 * Ensure a candle has proper OHLC spread (not flat)
 * CRITICAL: high must be >= max(open, close), low must be <= min(open, close)
 */
function ensureCandleSpread(candle: CurrentCandle): void {
  const basePrice = candle.open;
  const spread = basePrice * 0.001; // 0.1% spread (smaller, more realistic)
  
  // First, ensure close is slightly different from open if they're too close
  if (Math.abs(candle.close - candle.open) < 0.01) {
    const direction = Math.random() > 0.5 ? 1 : -1;
    candle.close = Math.round((candle.open + direction * spread * (0.5 + Math.random() * 0.5)) * 100) / 100;
  }
  
  // Now ensure high/low contain BOTH open AND close
  const maxOC = Math.max(candle.open, candle.close);
  const minOC = Math.min(candle.open, candle.close);
  
  // High must be >= max(open, close)
  if (candle.high < maxOC) {
    candle.high = Math.round((maxOC + spread * (0.2 + Math.random() * 0.3)) * 100) / 100;
  }
  
  // Low must be <= min(open, close)
  if (candle.low > minOC) {
    candle.low = Math.round((minOC - spread * (0.2 + Math.random() * 0.3)) * 100) / 100;
  }
  
  // Final validation - this should never trigger but just in case
  candle.high = Math.max(candle.high, candle.open, candle.close);
  candle.low = Math.min(candle.low, candle.open, candle.close);
}

// Track last real price update time per symbol
const lastRealPriceUpdate = new Map<string, number>();
const SYNTHETIC_THRESHOLD_MS = 120000; // 2 minutes without real update = use synthetic

/**
 * Perpetuals DEX is always open 24/7
 */
export function isMarketOpen(): boolean {
  return true;
}

/**
 * Get market status info - Perpetuals DEX is always open 24/7
 */
export function getMarketStatus(): {
  isOpen: boolean;
  currentTime: string;
} {
  return {
    isOpen: true,
    currentTime: new Date().toISOString(),
  };
}

/**
 * Generate a synthetic price with small variance
 * Always produces a change (never stays flat)
 * Anchored to oracle price - won't drift far from it
 */
function generateSyntheticPrice(oraclePrice: number, previousClose?: number): number {
  const currentPrice = previousClose || oraclePrice;
  
  // Calculate how far we've drifted from oracle price
  const driftFromOracle = (currentPrice - oraclePrice) / oraclePrice;
  
  // If we've drifted too far, force price back towards oracle
  if (Math.abs(driftFromOracle) > SYNTHETIC_MAX_DRIFT) {
    // Strong correction - move 50% back towards oracle
    const correction = (oraclePrice - currentPrice) * 0.5;
    const newPrice = currentPrice + correction;
    return Math.round(newPrice * 100) / 100;
  }
  
  // Random direction - but bias towards oracle if drifted past 1%
  let direction: number;
  if (Math.abs(driftFromOracle) > 0.01) {
    // Bias direction back towards oracle (60% chance)
    direction = driftFromOracle > 0 ? (Math.random() > 0.4 ? -1 : 1) : (Math.random() > 0.4 ? 1 : -1);
  } else {
    direction = Math.random() > 0.5 ? 1 : -1;
  }
  
  // Random magnitude - small variance
  const percentChange = SYNTHETIC_MIN_CHANGE / currentPrice + Math.random() * SYNTHETIC_VARIANCE_PERCENT;
  
  // Apply mean reversion towards oracle price
  const meanReversion = -driftFromOracle * SYNTHETIC_MEAN_REVERSION;
  
  // Calculate new price
  const change = (direction * percentChange) + meanReversion;
  let newPrice = currentPrice * (1 + change);
  
  // Final check - hard cap at max drift from oracle
  const finalDrift = (newPrice - oraclePrice) / oraclePrice;
  if (Math.abs(finalDrift) > SYNTHETIC_MAX_DRIFT) {
    // Clamp to max drift
    newPrice = oraclePrice * (1 + (finalDrift > 0 ? SYNTHETIC_MAX_DRIFT : -SYNTHETIC_MAX_DRIFT));
  }
  
  // Ensure minimum change of $0.01
  if (Math.abs(newPrice - currentPrice) < SYNTHETIC_MIN_CHANGE) {
    newPrice = currentPrice + (direction * SYNTHETIC_MIN_CHANGE);
  }
  
  // Round to 2 decimal places
  return Math.round(newPrice * 100) / 100;
}

/**
 * Generate synthetic OHLC by simulating a CONTINUOUS PRICE PATH
 * Creates proper candles where high/low are naturally constrained
 * Stays anchored to oracle price - won't drift far
 */
function generateSyntheticOHLC(oraclePrice: number, previousClose?: number): {
  open: number;
  high: number;
  low: number;
  close: number;
} {
  // OPEN: Start from previous close (continuous), or oracle if too far drifted
  let open = previousClose || oraclePrice;
  const startDrift = Math.abs((open - oraclePrice) / oraclePrice);
  if (startDrift > SYNTHETIC_MAX_DRIFT) {
    // Gently pull back towards oracle
    open = open + (oraclePrice - open) * 0.5;
  }
  // Add tiny gap for realism (+/- $0.01)
  open = open + (Math.random() - 0.5) * 0.02;
  open = Math.round(open * 100) / 100;
  
  // Simulate continuous price path with ~10 ticks
  const numTicks = 8 + Math.floor(Math.random() * 5); // 8-12 ticks
  const prices: number[] = [open];
  let currentPrice = open;
  
  // Very small per-tick volatility for equities (~$0.01 moves)
  const tickVolatility = SYNTHETIC_VARIANCE_PERCENT / Math.sqrt(numTicks);
  
  // Slight directional bias (random per candle)
  const bias = (Math.random() - 0.5) * 0.3;
  
  for (let i = 0; i < numTicks; i++) {
    const prevPrice = currentPrice;
    
    // Random walk with slight bias
    const direction = bias + randomNormal(0, 1);
    let tickChange = direction * tickVolatility * currentPrice;
    
    // Clamp each tick change to max 0.02% of price (~$0.06 on $300 stock)
    const maxTickChange = currentPrice * 0.0002;
    tickChange = Math.max(-maxTickChange, Math.min(maxTickChange, tickChange));
    
    // Mean reversion towards oracle
    const drift = (currentPrice - oraclePrice) / oraclePrice;
    let reversion = -drift * SYNTHETIC_MEAN_REVERSION * tickVolatility * currentPrice;
    // Clamp reversion too
    reversion = Math.max(-maxTickChange, Math.min(maxTickChange, reversion));
    
    currentPrice = currentPrice + tickChange + reversion;
    
    // SANITY CHECK: Price can never move more than 0.05% from previous tick (~$0.15)
    const maxMove = prevPrice * 0.0005;
    if (Math.abs(currentPrice - prevPrice) > maxMove) {
      currentPrice = prevPrice + (currentPrice > prevPrice ? maxMove : -maxMove);
    }
    
    // Ensure we don't drift too far from oracle
    const newDrift = (currentPrice - oraclePrice) / oraclePrice;
    if (Math.abs(newDrift) > SYNTHETIC_MAX_DRIFT) {
      currentPrice = oraclePrice * (1 + (newDrift > 0 ? SYNTHETIC_MAX_DRIFT : -SYNTHETIC_MAX_DRIFT));
    }
    
    prices.push(Math.round(currentPrice * 100) / 100);
  }
  
  // OHLC derived from continuous price path - naturally constrained
  // high/low are simply the max/min of the actual price path
  let high = Math.max(...prices);
  let low = Math.min(...prices);
  let close = prices[prices.length - 1];
  
  // FINAL SANITY CHECK: Ensure candle range is reasonable (max 0.15% of open ~$0.50)
  const maxRange = open * 0.0015;
  if (high - low > maxRange) {
    const mid = (high + low) / 2;
    high = mid + maxRange / 2;
    low = mid - maxRange / 2;
    close = Math.max(low, Math.min(high, close));
  }
  
  // Ensure all values stay within 1% of oracle (hard safety limit)
  const minPrice = oraclePrice * 0.99;
  const maxPrice = oraclePrice * 1.01;
  high = Math.max(minPrice, Math.min(maxPrice, high));
  low = Math.max(minPrice, Math.min(maxPrice, low));
  close = Math.max(minPrice, Math.min(maxPrice, close));
  
  return {
    open: Math.round(open * 100) / 100,
    high: Math.round(high * 100) / 100,
    low: Math.round(low * 100) / 100,
    close: Math.round(close * 100) / 100,
  };
}

/**
 * Update candle with a new price tick
 * Always adds small variance to create realistic price movement
 * Anchored to oracle price - synthetic movement won't drift far
 */
export async function updateCandle(
  marketSymbol: string,
  price: number,
  volume: number = 0,
  isTrade: boolean = false,
  isRealPrice: boolean = true
): Promise<void> {
  // Skip candle updates until initialization is complete
  // This prevents live candles from being created before backfill data exists
  if (!candlesInitialized) {
    return;
  }
  
  const symbol = marketSymbol.toUpperCase();
  const now = new Date();
  
  // The oracle price is our anchor - synthetic prices stay close to it
  const oraclePrice = getCachedPrice(symbol) || price;
  
  // Get the last price we used for this symbol
  const lastPrice = lastKnownPrices.get(symbol);
  
  // Always add small variance to create realistic movement
  // This ensures candles aren't flat even when source price doesn't change
  let adjustedPrice = price;
  
  if (lastPrice) {
    // If price is exactly the same as last time, generate synthetic movement
    // Use oracle price as anchor to prevent drift
    if (Math.abs(price - lastPrice) < 0.01) {
      adjustedPrice = generateSyntheticPrice(oraclePrice, lastPrice);
    } else {
      // Real price change - still add tiny variance for realism
      const microVariance = (Math.random() - 0.5) * 0.02; // +/- $0.01
      adjustedPrice = Math.round((price + microVariance) * 100) / 100;
    }
  }
  
  // Store the adjusted price
  lastKnownPrices.set(symbol, adjustedPrice);
  
  // Track real price updates
  if (isRealPrice) {
    lastRealPriceUpdate.set(symbol, Date.now());
  }
  
  // Update candles for all intervals (market always open for perpetuals)
  const intervals: CandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
  
  for (const interval of intervals) {
    await updateCandleForInterval(symbol, interval, adjustedPrice, volume, isTrade, now, true);
  }
}

/**
 * Update candle for a specific interval
 * Generates synthetic price spread to ensure realistic OHLC
 */
async function updateCandleForInterval(
  symbol: string,
  interval: CandleInterval,
  price: number,
  volume: number,
  isTrade: boolean,
  now: Date,
  marketOpen: boolean
): Promise<void> {
  const candleStart = getCandleStart(now, interval);
  
  // Get or create in-memory candle map for this symbol
  if (!currentCandles.has(symbol)) {
    currentCandles.set(symbol, new Map());
  }
  const symbolCandles = currentCandles.get(symbol)!;
  
  // Check if we need to close the previous candle and start a new one
  const existing = symbolCandles.get(interval);
  
  if (existing && existing.timestamp.getTime() !== candleStart.getTime()) {
    // Ensure closed candle has proper OHLC spread
    ensureCandleSpread(existing);
    
    // Save the previous candle to DB
    await saveCandle(symbol, interval, existing, true, marketOpen);
    
    // Broadcast the closed candle
    broadcastCandleUpdate(symbol, {
      symbol,
      interval,
      timestamp: existing.timestamp.getTime(),
      open: existing.open,
      high: existing.high,
      low: existing.low,
      close: existing.close,
      volume: existing.volume,
      trades: existing.trades,
      isClosed: true,
    });
    
    // Start new candle - MUST open at previous close for price continuity
    // This prevents gaps when oracle price jumps
    const openPrice = existing.close;
    symbolCandles.set(interval, {
      open: openPrice,
      high: Math.max(openPrice, price), // Include both open and current price
      low: Math.min(openPrice, price),  // Include both open and current price
      close: price,
      volume: 0,
      trades: 0,
      timestamp: candleStart,
    });
  }
  
  // Get current candle (or create if doesn't exist)
  let candle = symbolCandles.get(interval);
  
  if (!candle) {
    // Try to load from DB first
    const dbCandle = await Candle.findOne({
      marketSymbol: symbol,
      interval,
      timestamp: candleStart,
    });
    
    if (dbCandle) {
      candle = {
        open: dbCandle.open,
        high: dbCandle.high,
        low: dbCandle.low,
        close: dbCandle.close,
        volume: dbCandle.volume,
        trades: dbCandle.trades,
        timestamp: candleStart,
      };
    } else {
      // New candle - try to get previous candle's close for continuity
      let openPrice = price;
      const prevCandle = await Candle.findOne({
        marketSymbol: symbol,
        interval,
        timestamp: { $lt: candleStart },
      }).sort({ timestamp: -1 });
      
      if (prevCandle) {
        openPrice = prevCandle.close; // Continue from previous close
      }
      
      candle = {
        open: openPrice,
        high: Math.max(openPrice, price), // Include both open and current price
        low: Math.min(openPrice, price),
        close: price,
        volume: 0,
        trades: 0,
        timestamp: candleStart,
      };
    }
    symbolCandles.set(interval, candle);
  }
  
  // Generate a few synthetic ticks around the price for realistic movement
  const ticks = [price];
  for (let i = 0; i < 3; i++) {
    const variance = (Math.random() - 0.5) * price * 0.001; // +/- 0.05%
    ticks.push(Math.round((price + variance) * 100) / 100);
  }
  
  // Update candle with all ticks
  for (const tick of ticks) {
    candle.high = Math.max(candle.high, tick);
    candle.low = Math.min(candle.low, tick);
  }
  candle.close = price;
  
  // CRITICAL: Ensure OHLC integrity after every update
  // high must be >= max(open, close), low must be <= min(open, close)
  candle.high = Math.max(candle.high, candle.open, candle.close);
  candle.low = Math.min(candle.low, candle.open, candle.close);
  
  if (isTrade) {
    candle.volume += volume;
    candle.trades += 1;
  }
  
  // Save to DB periodically (every update for 1m, less frequently for larger intervals)
  const shouldSave = interval === "1m" || Math.random() < 0.1;
  if (shouldSave) {
    await saveCandle(symbol, interval, candle, false, marketOpen);
  }
  
  // Broadcast update for 1m candles (real-time)
  if (interval === "1m") {
    broadcastCandleUpdate(symbol, {
      symbol,
      interval,
      timestamp: candle.timestamp.getTime(),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      trades: candle.trades,
      isClosed: false,
    });
  }
}

/**
 * Save candle to database
 * ENSURES price continuity by checking previous candle
 */
async function saveCandle(
  symbol: string,
  interval: CandleInterval,
  candle: CurrentCandle,
  isClosed: boolean,
  isMarketOpen: boolean
): Promise<void> {
  // CRITICAL: Ensure price continuity
  // Check if this candle already exists in DB
  const existingCandle = await Candle.findOne({
    marketSymbol: symbol,
    interval,
    timestamp: candle.timestamp,
  });
  
  let finalOpen = candle.open;
  
  // If this is a NEW candle (not updating existing), ensure it opens at previous close
  if (!existingCandle) {
    const prevCandle = await Candle.findOne({
      marketSymbol: symbol,
      interval,
      timestamp: { $lt: candle.timestamp },
    }).sort({ timestamp: -1 });
    
    if (prevCandle) {
      // New candle MUST open at previous candle's close
      finalOpen = prevCandle.close;
      // Update high/low to include the corrected open
      candle.high = Math.max(candle.high, finalOpen, candle.close);
      candle.low = Math.min(candle.low, finalOpen, candle.close);
    }
  } else {
    // Updating existing candle - keep its original open
    finalOpen = existingCandle.open;
  }
  
  await Candle.findOneAndUpdate(
    {
      marketSymbol: symbol,
      interval,
      timestamp: candle.timestamp,
    },
    {
      open: finalOpen,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      trades: candle.trades,
      isClosed,
      isMarketOpen,
    },
    { upsert: true, new: true }
  );
}

/**
 * Check if a symbol needs synthetic data (no real updates recently)
 */
function needsSyntheticData(symbol: string): boolean {
  const lastUpdate = lastRealPriceUpdate.get(symbol);
  if (!lastUpdate) return true;
  return Date.now() - lastUpdate > SYNTHETIC_THRESHOLD_MS;
}

/**
 * Generate synthetic candles when not receiving real price data
 * Runs every minute to ensure 24/7 candle coverage
 */
export async function generateSyntheticCandles(): Promise<void> {
  const { REQUIRED_MARKETS } = await import("../models/market.model");
  
  for (const market of REQUIRED_MARKETS) {
    const symbol = market.symbol;
    
    // Skip if we're receiving real price data
    if (!needsSyntheticData(symbol)) {
      continue;
    }
    
    const basePrice = getCachedPrice(symbol) || lastKnownPrices.get(symbol);
    
    if (!basePrice) continue;
    
    // Get the last close price
    const lastCandle = await Candle.findOne({
      marketSymbol: symbol,
      interval: "1m",
    }).sort({ timestamp: -1 });
    
    const previousClose = lastCandle?.close || basePrice;
    
    // Generate synthetic OHLC
    const synthetic = generateSyntheticOHLC(basePrice, previousClose);
    
    // Update candles with synthetic price (mark as not real)
    await updateCandle(symbol, synthetic.close, 0, false, false);
  }
}

/**
 * Get candles for a market
 */
export async function getCandles(
  marketSymbol: string,
  interval: CandleInterval,
  limit: number = 100,
  endTime?: Date
): Promise<ICandle[]> {
  const query: Record<string, unknown> = {
    marketSymbol: marketSymbol.toUpperCase(),
    interval,
  };
  
  if (endTime) {
    query.timestamp = { $lte: endTime };
  }
  
  return Candle.find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .then(candles => candles.reverse()); // Return in chronological order
}

/**
 * Get current (live) candle
 */
export function getCurrentCandle(
  marketSymbol: string,
  interval: CandleInterval
): CurrentCandle | null {
  const symbolCandles = currentCandles.get(marketSymbol.toUpperCase());
  if (!symbolCandles) return null;
  return symbolCandles.get(interval) || null;
}

/**
 * Check if we have enough candles for charting
 */
export async function hasEnoughCandles(
  marketSymbol: string,
  interval: CandleInterval,
  required: number = 50
): Promise<{ hasEnough: boolean; count: number; required: number }> {
  const count = await Candle.countDocuments({
    marketSymbol: marketSymbol.toUpperCase(),
    interval,
  });
  
  return {
    hasEnough: count >= required,
    count,
    required,
  };
}

/**
 * Aggregate 1m candles into larger interval candles
 * This ensures price consistency across all intervals
 */
export async function aggregateCandlesFromBase(
  marketSymbol: string,
  targetInterval: CandleInterval
): Promise<number> {
  const symbol = marketSymbol.toUpperCase();
  
  // Skip 1m - it's the base interval
  if (targetInterval === "1m") return 0;
  
  const targetIntervalMs = INTERVAL_MS[targetInterval];
  const baseIntervalMs = INTERVAL_MS["1m"];
  const candlesPerPeriod = targetIntervalMs / baseIntervalMs;
  
  // Get all 1m candles
  const baseCandles = await Candle.find({
    marketSymbol: symbol,
    interval: "1m",
  }).sort({ timestamp: 1 });
  
  if (baseCandles.length === 0) {
    console.warn(`No 1m candles found for ${symbol}, cannot aggregate`);
    return 0;
  }
  
  // Group 1m candles by target interval period
  const periodMap = new Map<number, ICandle[]>();
  
  for (const candle of baseCandles) {
    const periodStart = getCandleStart(candle.timestamp, targetInterval).getTime();
    if (!periodMap.has(periodStart)) {
      periodMap.set(periodStart, []);
    }
    periodMap.get(periodStart)!.push(candle);
  }
  
  // Create aggregated candles
  const aggregatedCandles: Array<{
    marketSymbol: string;
    interval: CandleInterval;
    timestamp: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    quoteVolume: number;
    trades: number;
    isClosed: boolean;
    isMarketOpen: boolean;
  }> = [];
  
  for (const [periodStart, candles] of periodMap) {
    // Sort candles within the period by timestamp
    candles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // Skip incomplete periods (unless it's the most recent one)
    const isCurrentPeriod = Date.now() - periodStart < targetIntervalMs;
    if (candles.length < candlesPerPeriod * 0.5 && !isCurrentPeriod) {
      continue; // Skip periods with less than half the expected candles
    }
    
    // Aggregate OHLC
    const open = candles[0].open;
    const close = candles[candles.length - 1].close;
    const high = Math.max(...candles.map(c => c.high));
    const low = Math.min(...candles.map(c => c.low));
    const volume = candles.reduce((sum, c) => sum + c.volume, 0);
    const trades = candles.reduce((sum, c) => sum + c.trades, 0);
    
    // Check if this candle already exists
    const exists = await Candle.findOne({
      marketSymbol: symbol,
      interval: targetInterval,
      timestamp: new Date(periodStart),
    });
    
    if (!exists) {
      aggregatedCandles.push({
        marketSymbol: symbol,
        interval: targetInterval,
        timestamp: new Date(periodStart),
        open,
        high,
        low,
        close,
        volume,
        quoteVolume: Math.round(volume * close),
        trades,
        isClosed: !isCurrentPeriod,
        isMarketOpen: true,
      });
    }
  }
  
  // Bulk insert
  if (aggregatedCandles.length > 0) {
    await Candle.insertMany(aggregatedCandles, { ordered: false }).catch(() => {
      // Ignore duplicate key errors
    });
    console.log(`📊 Aggregated ${aggregatedCandles.length} ${targetInterval} candles for ${symbol} from 1m data`);
  }
  
  return aggregatedCandles.length;
}

/**
 * Backfill candles to ensure we have enough history
 * Generates realistic synthetic historical candles using market simulation
 * 
 * CRITICAL: Always anchors to REAL oracle price to prevent outlier jumps
 * The LAST candle is forced to close at exactly the real price
 */
export async function backfillCandles(
  marketSymbol: string,
  interval: CandleInterval,
  count: number = 100
): Promise<number> {
  const symbol = marketSymbol.toUpperCase();
  const realPrice = getCachedPrice(symbol) || lastKnownPrices.get(symbol);
  
  if (!realPrice) {
    console.warn(`No base price available for ${symbol}, cannot backfill`);
    return 0;
  }
  
  // Find the oldest candle we have
  const oldestCandle = await Candle.findOne({
    marketSymbol: symbol,
    interval,
  }).sort({ timestamp: 1 });
  
  const intervalMs = INTERVAL_MS[interval];
  const now = new Date();
  
  // Determine end time for backfill (just before the oldest existing candle, or current time)
  let endTime: Date;
  if (oldestCandle) {
    endTime = new Date(oldestCandle.timestamp.getTime() - intervalMs);
  } else {
    // No candles exist, end at current time minus one interval
    endTime = new Date(getCandleStart(now, interval).getTime() - intervalMs);
  }
  
  // Calculate start time (go back 'count' periods from endTime)
  const startTime = new Date(endTime.getTime() - (count - 1) * intervalMs);
  
  // Generate candles FORWARD from startTime to endTime
  // Candles flow continuously - each opens at previous close
  // NO forced jumps - perp prices can naturally differ from oracle
  const candles: Array<{
    marketSymbol: string;
    interval: CandleInterval;
    timestamp: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    quoteVolume: number;
    trades: number;
    isClosed: boolean;
    isMarketOpen: boolean;
  }> = [];
  
  // Initialize market state for realistic generation
  let marketState = initializeMarketState();
  const baseVolatility = getBaseVolatility(interval);
  
  // Start at the real oracle price - no drift
  // This ensures backfill starts at a realistic price point
  let currentPrice = realPrice;
  
  let currentTime = getCandleStart(startTime, interval);
  const endTimestamp = endTime.getTime();
  
  while (currentTime.getTime() <= endTimestamp) {
    // Check if candle already exists
    const exists = await Candle.findOne({
      marketSymbol: symbol,
      interval,
      timestamp: currentTime,
    });
    
    if (!exists) {
      // Generate realistic candle - NO anchoring, just natural random walk
      // This creates smooth continuous price action with no jumps
      const result = generateRealisticCandle(
        currentPrice, 
        marketState, 
        baseVolatility,
        undefined,  // No anchor price
        0           // No anchor strength
      );
      marketState = result.newState;
      currentPrice = result.close;
      
      // Generate synthetic volume (higher during volatile periods)
      const baseVolume = 1000 + Math.random() * 5000;
      const volatilityBonus = marketState.volatility * 2000;
      const volume = Math.round(baseVolume + volatilityBonus);
      
      candles.push({
        marketSymbol: symbol,
        interval,
        timestamp: new Date(currentTime),
        open: result.open,
        high: result.high,
        low: result.low,
        close: result.close,
        volume: volume,
        quoteVolume: Math.round(volume * currentPrice),
        trades: Math.round(10 + Math.random() * 50),
        isClosed: true,
        isMarketOpen: true, // Perpetuals DEX is always open
      });
    } else {
      // Use existing candle's close for continuity
      currentPrice = exists.close;
    }
    
    // Move to next period
    currentTime = new Date(currentTime.getTime() + intervalMs);
  }
  
  // Bulk insert
  if (candles.length > 0) {
    await Candle.insertMany(candles, { ordered: false }).catch(() => {
      // Ignore duplicate key errors
    });
    
    // Log the price range for debugging
    const prices = candles.map(c => c.close);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const firstOpen = candles[0]?.open;
    const finalClose = candles[candles.length - 1]?.close;
    console.log(`📊 Backfilled ${candles.length} ${interval} candles for ${symbol}`);
    console.log(`   Started at: $${firstOpen?.toFixed(2)}, ended at: $${finalClose?.toFixed(2)}`);
    console.log(`   Price range: $${minPrice.toFixed(2)} - $${maxPrice.toFixed(2)} (oracle: $${realPrice.toFixed(2)})`);
  }
  
  return candles.length;
}

// Candle generation interval
let candleGeneratorInterval: NodeJS.Timeout | null = null;

/**
 * Start the candle generator (runs every minute)
 */
export function startCandleGenerator(): void {
  if (candleGeneratorInterval) return;
  
  console.log("📊 Starting candle generator...");
  
  // Generate immediately
  generateSyntheticCandles();
  
  // Then every minute
  candleGeneratorInterval = setInterval(() => {
    generateSyntheticCandles();
  }, 60 * 1000);
}

/**
 * Stop the candle generator
 */
export function stopCandleGenerator(): void {
  if (candleGeneratorInterval) {
    clearInterval(candleGeneratorInterval);
    candleGeneratorInterval = null;
    console.log("📊 Stopped candle generator");
  }
}

/**
 * Check if existing candle data is stale (price drifted too far from oracle)
 * Returns true if candles should be regenerated
 */
async function isCandelDataStale(symbol: string, oraclePrice: number): Promise<boolean> {
  const recentCandle = await Candle.findOne({
    marketSymbol: symbol,
    interval: "1m",
  }).sort({ timestamp: -1 });
  
  if (!recentCandle) return false; // No data = not stale, just missing
  
  // Check price drift
  const priceDrift = Math.abs(recentCandle.close - oraclePrice) / oraclePrice;
  
  // If price has drifted more than 5%, consider data stale
  // Perps can naturally differ from oracle, but 5%+ indicates old/bad data
  if (priceDrift > 0.05) {
    console.log(`   ⚠️ ${symbol}: Candle data stale! Last close: $${recentCandle.close.toFixed(2)}, oracle: $${oraclePrice.toFixed(2)} (${(priceDrift * 100).toFixed(1)}% drift)`);
    return true;
  }
  
  return false;
}

/**
 * Clear all candle data for a symbol (used when data is stale)
 */
async function clearCandleData(symbol: string): Promise<void> {
  const result = await Candle.deleteMany({ marketSymbol: symbol });
  console.log(`   🗑️ Cleared ${result.deletedCount} stale candles for ${symbol}`);
  
  // Also clear in-memory candles
  currentCandles.delete(symbol);
}

/**
 * Initialize candles for all required markets
 * 
 * IMPORTANT: Only backfills 1m candles, then AGGREGATES into larger intervals.
 * This ensures all intervals have consistent, connected price data.
 * 
 * Also detects and clears STALE data that would cause price jumps.
 */
export async function initializeCandles(): Promise<void> {
  const { REQUIRED_MARKETS } = await import("../models/market.model");
  
  console.log("📊 Initializing candle data...");
  
  for (const market of REQUIRED_MARKETS) {
    const symbol = market.symbol;
    
    // Get current oracle price
    const oraclePrice = getCachedPrice(symbol);
    
    // Check if existing data is stale (price drifted too far)
    if (oraclePrice) {
      const stale = await isCandelDataStale(symbol, oraclePrice);
      if (stale) {
        await clearCandleData(symbol);
      }
    }
    
    // Check if we have enough 1m candles
    const check = await hasEnoughCandles(symbol, "1m", 60);
    
    if (!check.hasEnough) {
      console.log(`   ${symbol}: ${check.count}/${check.required} 1m candles, backfilling...`);
      
      // Only backfill 1m candles - this is the base data
      await backfillCandles(symbol, "1m", 200); // Generate more 1m candles for better aggregation
      
      // AGGREGATE 1m candles into larger intervals (ensures price consistency!)
      console.log(`   ${symbol}: Aggregating into larger intervals...`);
      await aggregateCandlesFromBase(symbol, "5m");
      await aggregateCandlesFromBase(symbol, "15m");
      await aggregateCandlesFromBase(symbol, "1h");
      await aggregateCandlesFromBase(symbol, "4h");
      await aggregateCandlesFromBase(symbol, "1d");
    } else {
      console.log(`   ${symbol}: ${check.count} candles ready`);
      
      // Even if 1m candles exist, ensure larger intervals are properly aggregated
      const check5m = await hasEnoughCandles(symbol, "5m", 30);
      if (!check5m.hasEnough) {
        console.log(`   ${symbol}: Re-aggregating larger intervals from 1m data...`);
        await aggregateCandlesFromBase(symbol, "5m");
        await aggregateCandlesFromBase(symbol, "15m");
        await aggregateCandlesFromBase(symbol, "1h");
        await aggregateCandlesFromBase(symbol, "4h");
        await aggregateCandlesFromBase(symbol, "1d");
      }
    }
  }
  
  // Mark candles as initialized - now live updates can proceed
  candlesInitialized = true;
  console.log("📊 Candle initialization complete - live updates enabled");
  
  // Start the generator
  startCandleGenerator();
}
