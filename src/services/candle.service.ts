import { Candle, ICandle, CandleInterval, INTERVAL_MS, getCandleStart } from "../models/candle.model";
import { getCachedPrice } from "./market.service";
import { broadcastCandleUpdate } from "./websocket.service";

// Perpetuals DEX - Market is always open 24/7
// Synthetic candle variance settings
const SYNTHETIC_MIN_CHANGE = 0.01;         // Minimum $0.01 change per tick
const SYNTHETIC_VARIANCE_PERCENT = 0.002;  // 0.2% max variance per tick
const SYNTHETIC_MAX_DRIFT = 0.015;         // Max 1.5% drift from oracle price
const SYNTHETIC_MEAN_REVERSION = 0.1;      // Mean reversion (10% pull back per tick)

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
 */
function ensureCandleSpread(candle: CurrentCandle): void {
  const basePrice = candle.open;
  const spread = basePrice * 0.002; // 0.2% spread
  
  // Ensure high is above open and close
  const maxOC = Math.max(candle.open, candle.close);
  if (candle.high <= maxOC) {
    candle.high = Math.round((maxOC + spread * (0.5 + Math.random() * 0.5)) * 100) / 100;
  }
  
  // Ensure low is below open and close
  const minOC = Math.min(candle.open, candle.close);
  if (candle.low >= minOC) {
    candle.low = Math.round((minOC - spread * (0.5 + Math.random() * 0.5)) * 100) / 100;
  }
  
  // Ensure close is different from open
  if (Math.abs(candle.close - candle.open) < 0.01) {
    const direction = Math.random() > 0.5 ? 1 : -1;
    candle.close = Math.round((candle.open + direction * spread * Math.random()) * 100) / 100;
  }
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
 * Generate synthetic OHLC for a candle period
 * Ensures visible price movement in every candle
 * Stays anchored to oracle price - won't drift far
 */
function generateSyntheticOHLC(oraclePrice: number, previousClose?: number): {
  open: number;
  high: number;
  low: number;
  close: number;
} {
  // Start from previous close, but if it drifted too far, start from oracle
  let startPrice = previousClose || oraclePrice;
  const startDrift = Math.abs((startPrice - oraclePrice) / oraclePrice);
  if (startDrift > SYNTHETIC_MAX_DRIFT) {
    // Previous close drifted too far - reset closer to oracle (within 1% range)
    startPrice = oraclePrice * (1 + (startPrice > oraclePrice ? 0.01 : -0.01));
  }
  
  // Generate several price points within the candle
  const prices: number[] = [startPrice];
  let current = startPrice;
  
  // Simulate ~12 price ticks within a 1-minute candle
  for (let i = 0; i < 12; i++) {
    current = generateSyntheticPrice(oraclePrice, current);
    prices.push(current);
  }
  
  const open = prices[0];
  let high = Math.max(...prices);
  let low = Math.min(...prices);
  const close = prices[prices.length - 1];
  
  // Ensure high is at least $0.01 above open (but within limits)
  if (high <= open) {
    high = Math.min(open + SYNTHETIC_MIN_CHANGE, oraclePrice * (1 + SYNTHETIC_MAX_DRIFT));
  }
  
  // Ensure low is at least $0.01 below open (but within limits)
  if (low >= open) {
    low = Math.max(open - SYNTHETIC_MIN_CHANGE, oraclePrice * (1 - SYNTHETIC_MAX_DRIFT));
  }
  
  // Ensure there's always a wick (high > max(open,close) and low < min(open,close))
  const maxOC = Math.max(open, close);
  const minOC = Math.min(open, close);
  
  if (high <= maxOC) {
    high = Math.min(maxOC + SYNTHETIC_MIN_CHANGE + (Math.random() * 0.03), oraclePrice * (1 + SYNTHETIC_MAX_DRIFT));
  }
  if (low >= minOC) {
    low = Math.max(minOC - SYNTHETIC_MIN_CHANGE - (Math.random() * 0.03), oraclePrice * (1 - SYNTHETIC_MAX_DRIFT));
  }
  
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
    
    // Start new candle with slight spread
    const openPrice = price;
    const spread = price * 0.001; // 0.1% initial spread
    symbolCandles.set(interval, {
      open: openPrice,
      high: Math.round((openPrice + spread * Math.random()) * 100) / 100,
      low: Math.round((openPrice - spread * Math.random()) * 100) / 100,
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
      // New candle - create with initial spread
      const spread = price * 0.001;
      candle = {
        open: price,
        high: Math.round((price + spread * Math.random()) * 100) / 100,
        low: Math.round((price - spread * Math.random()) * 100) / 100,
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
    const variance = (Math.random() - 0.5) * price * 0.002; // +/- 0.1%
    ticks.push(Math.round((price + variance) * 100) / 100);
  }
  
  // Update candle with all ticks
  for (const tick of ticks) {
    candle.high = Math.max(candle.high, tick);
    candle.low = Math.min(candle.low, tick);
  }
  candle.close = price;
  
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
 */
async function saveCandle(
  symbol: string,
  interval: CandleInterval,
  candle: CurrentCandle,
  isClosed: boolean,
  isMarketOpen: boolean
): Promise<void> {
  await Candle.findOneAndUpdate(
    {
      marketSymbol: symbol,
      interval,
      timestamp: candle.timestamp,
    },
    {
      open: candle.open,
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
 * Backfill candles to ensure we have enough history
 * Generates synthetic historical candles if needed
 */
export async function backfillCandles(
  marketSymbol: string,
  interval: CandleInterval,
  count: number = 100
): Promise<number> {
  const symbol = marketSymbol.toUpperCase();
  const basePrice = getCachedPrice(symbol) || lastKnownPrices.get(symbol);
  
  if (!basePrice) {
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
  
  // Determine start time for backfill
  let startTime: Date;
  if (oldestCandle) {
    startTime = new Date(oldestCandle.timestamp.getTime() - intervalMs);
  } else {
    // No candles exist, start from (count * interval) ago
    startTime = new Date(now.getTime() - count * intervalMs);
  }
  
  // Generate candles backwards
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
  
  let currentPrice = basePrice;
  let currentTime = getCandleStart(startTime, interval);
  const targetCount = oldestCandle ? count : count;
  
  for (let i = 0; i < targetCount; i++) {
    // Check if candle already exists
    const exists = await Candle.findOne({
      marketSymbol: symbol,
      interval,
      timestamp: currentTime,
    });
    
    if (!exists) {
      // Generate synthetic OHLC
      const ohlc = generateSyntheticOHLC(basePrice, currentPrice);
      currentPrice = ohlc.close;
      
      candles.push({
        marketSymbol: symbol,
        interval,
        timestamp: new Date(currentTime),
        open: ohlc.open,
        high: ohlc.high,
        low: ohlc.low,
        close: ohlc.close,
        volume: 0,
        quoteVolume: 0,
        trades: 0,
        isClosed: true,
        isMarketOpen: true, // Perpetuals DEX is always open
      });
    }
    
    // Move to previous period
    currentTime = new Date(currentTime.getTime() - intervalMs);
  }
  
  // Bulk insert
  if (candles.length > 0) {
    await Candle.insertMany(candles.reverse(), { ordered: false }).catch(() => {
      // Ignore duplicate key errors
    });
  }
  
  console.log(`📊 Backfilled ${candles.length} ${interval} candles for ${symbol}`);
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
 * Initialize candles for all required markets
 */
export async function initializeCandles(): Promise<void> {
  const { REQUIRED_MARKETS } = await import("../models/market.model");
  
  console.log("📊 Initializing candle data...");
  
  for (const market of REQUIRED_MARKETS) {
    const symbol = market.symbol;
    
    // Check if we have enough 1m candles
    const check = await hasEnoughCandles(symbol, "1m", 60);
    
    if (!check.hasEnough) {
      console.log(`   ${symbol}: ${check.count}/${check.required} candles, backfilling...`);
      await backfillCandles(symbol, "1m", 100);
      
      // Also backfill larger intervals
      await backfillCandles(symbol, "5m", 50);
      await backfillCandles(symbol, "15m", 50);
      await backfillCandles(symbol, "1h", 50);
    } else {
      console.log(`   ${symbol}: ${check.count} candles ready`);
    }
  }
  
  // Start the generator
  startCandleGenerator();
}
