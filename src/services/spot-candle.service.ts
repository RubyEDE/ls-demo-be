import { SpotCandle, ISpotCandle, SpotCandleInterval, SPOT_INTERVAL_MS, getSpotCandleStart } from "../models/spot-candle.model";
import { broadcastCandleUpdate } from "./websocket.service";
import cron, { ScheduledTask } from "node-cron";

// ============================================================================
// Spot Candle Service
// ============================================================================
// Manages candle/OHLCV data for spot markets.
// Tracks price history, updates from trades, and seeds historical data.
// ============================================================================

// In-memory current candles for real-time updates
interface CurrentSpotCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  trades: number;
  timestamp: Date;
}

const currentSpotCandles = new Map<string, Map<SpotCandleInterval, CurrentSpotCandle>>();

// Track last known prices per symbol (from trades)
const spotLastKnownPrices = new Map<string, number>();

// ============ Price Tracking ============

/**
 * Get the last known price for a spot symbol
 */
export function getSpotLastKnownPrice(symbol: string): number | undefined {
  return spotLastKnownPrices.get(symbol.toUpperCase());
}

/**
 * Set the last known price for a spot symbol
 */
export function setSpotLastKnownPrice(symbol: string, price: number): void {
  spotLastKnownPrices.set(symbol.toUpperCase(), price);
}

// ============ Trade Updates ============

/**
 * Update candle with a new spot trade
 * Called when trades are executed to update real-time candles
 */
export async function updateSpotCandleFromTrade(
  marketSymbol: string,
  price: number,
  quantity: number
): Promise<void> {
  const symbol = marketSymbol.toUpperCase();
  const now = new Date();
  const quoteVolume = price * quantity;
  
  // Update last known price
  spotLastKnownPrices.set(symbol, price);
  
  // Update candles for all intervals
  const intervals: SpotCandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
  
  for (const interval of intervals) {
    await updateSpotCandleForInterval(symbol, interval, price, quantity, quoteVolume, now);
  }
}

/**
 * Update candle for a specific interval with a trade
 */
async function updateSpotCandleForInterval(
  symbol: string,
  interval: SpotCandleInterval,
  price: number,
  quantity: number,
  quoteVolume: number,
  now: Date
): Promise<void> {
  const candleStart = getSpotCandleStart(now, interval);
  
  // Get or create in-memory candle map for this symbol
  if (!currentSpotCandles.has(symbol)) {
    currentSpotCandles.set(symbol, new Map());
  }
  const symbolCandles = currentSpotCandles.get(symbol)!;
  
  // Check if we need to close the previous candle and start a new one
  const existing = symbolCandles.get(interval);
  
  if (existing && existing.timestamp.getTime() !== candleStart.getTime()) {
    // Save and close the previous candle
    await saveSpotCandle(symbol, interval, existing, true);
    
    // Broadcast the closed candle (using spot: prefix for channel)
    broadcastCandleUpdate(`spot:${symbol}`, {
      symbol: `spot:${symbol}`,
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
    
    // Start new candle
    symbolCandles.set(interval, {
      open: price,
      high: price,
      low: price,
      close: price,
      volume: quantity,
      quoteVolume,
      trades: 1,
      timestamp: candleStart,
    });
  } else if (!existing) {
    // Try to load from DB first
    const dbCandle = await SpotCandle.findOne({
      marketSymbol: symbol,
      interval,
      timestamp: candleStart,
    });
    
    if (dbCandle && !dbCandle.isClosed) {
      // Continue updating existing candle
      const candle: CurrentSpotCandle = {
        open: dbCandle.open,
        high: Math.max(dbCandle.high, price),
        low: Math.min(dbCandle.low, price),
        close: price,
        volume: dbCandle.volume + quantity,
        quoteVolume: dbCandle.quoteVolume + quoteVolume,
        trades: dbCandle.trades + 1,
        timestamp: candleStart,
      };
      symbolCandles.set(interval, candle);
    } else {
      // Create new candle
      symbolCandles.set(interval, {
        open: price,
        high: price,
        low: price,
        close: price,
        volume: quantity,
        quoteVolume,
        trades: 1,
        timestamp: candleStart,
      });
    }
  } else {
    // Update existing in-memory candle
    existing.high = Math.max(existing.high, price);
    existing.low = Math.min(existing.low, price);
    existing.close = price;
    existing.volume += quantity;
    existing.quoteVolume += quoteVolume;
    existing.trades += 1;
  }
  
  // Get current candle for saving/broadcasting
  const candle = symbolCandles.get(interval)!;
  
  // Save to DB periodically
  const shouldSave = interval === "1m" || Math.random() < 0.2;
  if (shouldSave) {
    await saveSpotCandle(symbol, interval, candle, false);
  }
  
  // Broadcast real-time update
  broadcastCandleUpdate(`spot:${symbol}`, {
    symbol: `spot:${symbol}`,
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

/**
 * Save candle to database
 */
async function saveSpotCandle(
  symbol: string,
  interval: SpotCandleInterval,
  candle: CurrentSpotCandle,
  isClosed: boolean
): Promise<void> {
  await SpotCandle.findOneAndUpdate(
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
      quoteVolume: candle.quoteVolume,
      trades: candle.trades,
      isClosed,
    },
    { upsert: true }
  );
}

// ============ Query Functions ============

/**
 * Get historical candles for a spot market
 */
export async function getSpotCandles(
  symbol: string,
  interval: SpotCandleInterval,
  limit: number = 400
): Promise<ISpotCandle[]> {
  const candles = await SpotCandle.find({
    marketSymbol: symbol.toUpperCase(),
    interval,
  })
    .sort({ timestamp: -1 })
    .limit(limit);
  
  return candles.reverse();
}

/**
 * Get the current (live) candle for a spot market
 */
export function getCurrentSpotCandle(
  symbol: string,
  interval: SpotCandleInterval
): CurrentSpotCandle | null {
  const symbolCandles = currentSpotCandles.get(symbol.toUpperCase());
  if (!symbolCandles) return null;
  return symbolCandles.get(interval) || null;
}

/**
 * Check if we have enough candle data
 */
export async function hasEnoughSpotCandles(
  symbol: string,
  interval: SpotCandleInterval,
  required: number = 50
): Promise<{ hasEnough: boolean; count: number; required: number }> {
  const count = await SpotCandle.countDocuments({
    marketSymbol: symbol.toUpperCase(),
    interval,
    isClosed: true,
  });
  
  return {
    hasEnough: count >= required,
    count,
    required,
  };
}

// ============ Historical Data Seeding ============

/**
 * Seed historical candles for a spot market
 * Creates realistic price action around the target price
 */
export async function seedSpotCandles(
  marketSymbol: string,
  targetPrice: number,
  daysBack: number = 30
): Promise<void> {
  const symbol = marketSymbol.toUpperCase();
  
  // Check if candles already exist
  const existingCount = await SpotCandle.countDocuments({ marketSymbol: symbol });
  if (existingCount > 0) {
    console.log(`   📊 ${symbol}: Already has ${existingCount} candles, skipping seed`);
    
    // Set last known price from most recent candle
    const latestCandle = await SpotCandle.findOne({ marketSymbol: symbol })
      .sort({ timestamp: -1 });
    if (latestCandle) {
      spotLastKnownPrices.set(symbol, latestCandle.close);
      console.log(`      Last price: $${latestCandle.close.toFixed(2)}`);
    }
    return;
  }
  
  console.log(`   🌱 Seeding ${symbol} candles for ${daysBack} days around $${targetPrice}...`);
  
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;
  const startTime = now - (daysBack * msPerDay);
  
  // Generate 1-minute candles first, then aggregate
  const oneMinMs = SPOT_INTERVAL_MS["1m"];
  const totalMinutes = Math.floor((now - startTime) / oneMinMs);
  
  // Price simulation parameters
  let currentPrice = targetPrice;
  const volatilityBase = 0.002; // 0.2% base volatility per minute
  const trendStrength = 0.0001; // Slight mean reversion
  
  const candlesToInsert: Array<{
    marketSymbol: string;
    interval: SpotCandleInterval;
    timestamp: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    quoteVolume: number;
    trades: number;
    isClosed: boolean;
  }> = [];
  
  // Generate all 1m candles
  const oneMinCandles: CurrentSpotCandle[] = [];
  
  for (let i = 0; i < totalMinutes; i++) {
    const timestamp = new Date(startTime + (i * oneMinMs));
    
    // Random price movement with mean reversion
    const meanReversionForce = (targetPrice - currentPrice) / targetPrice * trendStrength;
    const randomChange = (Math.random() - 0.5) * 2 * volatilityBase;
    const priceChange = currentPrice * (randomChange + meanReversionForce);
    
    const open = currentPrice;
    const close = currentPrice + priceChange;
    
    // Generate high/low with some variance
    const range = Math.abs(priceChange) + (currentPrice * volatilityBase * 0.5 * Math.random());
    const high = Math.max(open, close) + range * Math.random();
    const low = Math.min(open, close) - range * Math.random();
    
    // Random volume (higher during certain hours)
    const hour = timestamp.getUTCHours();
    const isActiveHour = (hour >= 13 && hour <= 21); // US market hours
    const baseVolume = isActiveHour ? 3 : 1;
    const volume = Math.floor(baseVolume + Math.random() * 5);
    const trades = Math.floor(1 + Math.random() * 10);
    
    const candle: CurrentSpotCandle = {
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
      quoteVolume: volume * ((open + close) / 2),
      trades,
      timestamp,
    };
    
    oneMinCandles.push(candle);
    currentPrice = close;
  }
  
  // Insert 1m candles
  for (const candle of oneMinCandles) {
    candlesToInsert.push({
      marketSymbol: symbol,
      interval: "1m",
      timestamp: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      quoteVolume: candle.quoteVolume,
      trades: candle.trades,
      isClosed: true,
    });
  }
  
  // Aggregate to higher timeframes
  const intervals: SpotCandleInterval[] = ["5m", "15m", "1h", "4h", "1d"];
  
  for (const interval of intervals) {
    const intervalMs = SPOT_INTERVAL_MS[interval];
    const aggregated = aggregateCandles(oneMinCandles, intervalMs, symbol, interval);
    candlesToInsert.push(...aggregated);
  }
  
  // Bulk insert in batches
  const batchSize = 1000;
  for (let i = 0; i < candlesToInsert.length; i += batchSize) {
    const batch = candlesToInsert.slice(i, i + batchSize);
    await SpotCandle.insertMany(batch, { ordered: false }).catch(() => {
      // Ignore duplicate key errors
    });
  }
  
  // Set last known price
  if (oneMinCandles.length > 0) {
    const lastCandle = oneMinCandles[oneMinCandles.length - 1];
    spotLastKnownPrices.set(symbol, lastCandle.close);
  }
  
  console.log(`   ✅ ${symbol}: Created ${candlesToInsert.length} candles`);
  console.log(`      Last price: $${currentPrice.toFixed(2)}`);
}

/**
 * Aggregate 1m candles to higher timeframes
 */
function aggregateCandles(
  oneMinCandles: CurrentSpotCandle[],
  intervalMs: number,
  symbol: string,
  interval: SpotCandleInterval
): Array<{
  marketSymbol: string;
  interval: SpotCandleInterval;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  trades: number;
  isClosed: boolean;
}> {
  const result: Array<{
    marketSymbol: string;
    interval: SpotCandleInterval;
    timestamp: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    quoteVolume: number;
    trades: number;
    isClosed: boolean;
  }> = [];
  
  // Group by interval period
  const groups = new Map<number, CurrentSpotCandle[]>();
  
  for (const candle of oneMinCandles) {
    const periodStart = Math.floor(candle.timestamp.getTime() / intervalMs) * intervalMs;
    if (!groups.has(periodStart)) {
      groups.set(periodStart, []);
    }
    groups.get(periodStart)!.push(candle);
  }
  
  // Aggregate each group
  for (const [periodStart, candles] of groups) {
    if (candles.length === 0) continue;
    
    const aggregated = {
      marketSymbol: symbol,
      interval,
      timestamp: new Date(periodStart),
      open: candles[0].open,
      high: Math.max(...candles.map(c => c.high)),
      low: Math.min(...candles.map(c => c.low)),
      close: candles[candles.length - 1].close,
      volume: candles.reduce((sum, c) => sum + c.volume, 0),
      quoteVolume: candles.reduce((sum, c) => sum + c.quoteVolume, 0),
      trades: candles.reduce((sum, c) => sum + c.trades, 0),
      isClosed: true,
    };
    
    result.push(aggregated);
  }
  
  return result;
}

// ============ Initialization ============

let candleGeneratorTask: ScheduledTask | null = null;
let candleBroadcastTask: ScheduledTask | null = null;

/**
 * Initialize spot candle service
 * Seeds historical data and starts background tasks
 */
export async function initializeSpotCandles(
  markets: Array<{ symbol: string; targetPrice: number }>
): Promise<void> {
  console.log("📊 Initializing spot candle data...");
  
  for (const market of markets) {
    await seedSpotCandles(market.symbol, market.targetPrice, 30);
  }
  
  // Start candle generator (creates empty candles when no trades)
  if (candleGeneratorTask) {
    candleGeneratorTask.stop();
  }
  candleGeneratorTask = cron.schedule("0 * * * * *", async () => {
    await generateSpotCandlesForAllMarkets(markets);
  });
  console.log("📊 Starting spot candle generator (cron: every minute at :00)...");
  
  // Start real-time candle broadcasts
  if (candleBroadcastTask) {
    candleBroadcastTask.stop();
  }
  candleBroadcastTask = cron.schedule("*/5 * * * * *", async () => {
    await broadcastCurrentSpotCandles(markets);
  });
  console.log("📊 Starting spot candle broadcasts (cron: every 5s)...");
}

/**
 * Generate candles for all markets (fills gaps when no trades)
 */
async function generateSpotCandlesForAllMarkets(
  markets: Array<{ symbol: string; targetPrice: number }>
): Promise<void> {
  const now = new Date();
  const intervals: SpotCandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
  
  for (const market of markets) {
    const symbol = market.symbol.toUpperCase();
    const lastPrice = spotLastKnownPrices.get(symbol) || market.targetPrice;
    
    // Ensure candle map exists
    if (!currentSpotCandles.has(symbol)) {
      currentSpotCandles.set(symbol, new Map());
    }
    const symbolCandles = currentSpotCandles.get(symbol)!;
    
    for (const interval of intervals) {
      const candleStart = getSpotCandleStart(now, interval);
      const existing = symbolCandles.get(interval);
      
      // If no current candle or it's from a previous period, create/update
      if (!existing || existing.timestamp.getTime() !== candleStart.getTime()) {
        // Close previous candle if exists
        if (existing) {
          await saveSpotCandle(symbol, interval, existing, true);
        }
        
        // Create flat candle at last known price
        symbolCandles.set(interval, {
          open: lastPrice,
          high: lastPrice,
          low: lastPrice,
          close: lastPrice,
          volume: 0,
          quoteVolume: 0,
          trades: 0,
          timestamp: candleStart,
        });
      }
    }
  }
}

/**
 * Broadcast current candles for all markets
 */
async function broadcastCurrentSpotCandles(
  markets: Array<{ symbol: string; targetPrice: number }>
): Promise<void> {
  const intervals: SpotCandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
  
  for (const market of markets) {
    const symbol = market.symbol.toUpperCase();
    const symbolCandles = currentSpotCandles.get(symbol);
    if (!symbolCandles) continue;
    
    for (const interval of intervals) {
      const candle = symbolCandles.get(interval);
      if (!candle) continue;
      
      broadcastCandleUpdate(`spot:${symbol}`, {
        symbol: `spot:${symbol}`,
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
}
