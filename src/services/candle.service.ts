import { Candle, ICandle, CandleInterval, INTERVAL_MS, getCandleStart } from "../models/candle.model";
import { Trade } from "../models/trade.model";
import { getCachedPrice } from "./market.service";
import { broadcastCandleUpdate } from "./websocket.service";
import { REQUIRED_MARKETS } from "../models/market.model";
import cron, { ScheduledTask } from "node-cron";

// In-memory current candles for real-time updates
interface CurrentCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  trades: number;
  timestamp: Date;
}

const currentCandles = new Map<string, Map<CandleInterval, CurrentCandle>>();

// Track last known prices per symbol (from trades ONLY - not oracle)
const lastKnownPrices = new Map<string, number>();

/**
 * Get the price to use for a new candle (in priority order):
 * 1. Last trade price (from lastKnownPrices)
 * 2. Previous candle's close price
 * 3. Oracle/finnhub price (ONLY for very first candle ever)
 */
async function getPriceForNewCandle(symbol: string): Promise<number | null> {
  // 1. First priority: last trade price
  const tradePrice = lastKnownPrices.get(symbol);
  if (tradePrice) {
    return tradePrice;
  }
  
  // 2. Second priority: previous candle's close price
  const prevCandle = await Candle.findOne({
    marketSymbol: symbol,
    isClosed: true,
  }).sort({ timestamp: -1 });
  
  if (prevCandle) {
    return prevCandle.close;
  }
  
  // 3. Last resort (first candle ever): use oracle price
  const oraclePrice = getCachedPrice(symbol);
  return oraclePrice || null;
}

/**
 * Perpetuals DEX is always open 24/7
 */
export function isMarketOpen(): boolean {
  return true;
}

/**
 * Get market status info
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
 * Get or set the last known price for a symbol
 */
export function getLastKnownPrice(symbol: string): number | undefined {
  return lastKnownPrices.get(symbol.toUpperCase());
}

export function setLastKnownPrice(symbol: string, price: number): void {
  lastKnownPrices.set(symbol.toUpperCase(), price);
}

/**
 * Update candle with a new trade
 * Called when trades are executed to update real-time candles
 */
export async function updateCandleFromTrade(
  marketSymbol: string,
  price: number,
  quantity: number
): Promise<void> {
  const symbol = marketSymbol.toUpperCase();
  const now = new Date();
  const quoteVolume = price * quantity;
  
  // Update last known price
  lastKnownPrices.set(symbol, price);
  
  // Update candles for all intervals
  const intervals: CandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
  
  for (const interval of intervals) {
    await updateCandleForInterval(symbol, interval, price, quantity, quoteVolume, now);
  }
}

/**
 * Update candle for a specific interval with a trade
 */
async function updateCandleForInterval(
  symbol: string,
  interval: CandleInterval,
  price: number,
  quantity: number,
  quoteVolume: number,
  now: Date
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
    // Save and close the previous candle
    await saveCandle(symbol, interval, existing, true);
    
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
    const dbCandle = await Candle.findOne({
      marketSymbol: symbol,
      interval,
      timestamp: candleStart,
    });
    
    if (dbCandle && !dbCandle.isClosed) {
      // Continue updating existing candle
      const candle: CurrentCandle = {
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
  
  // Save to DB periodically (always for 1m, randomly for others)
  const shouldSave = interval === "1m" || Math.random() < 0.2;
  if (shouldSave) {
    await saveCandle(symbol, interval, candle, false);
  }
  
  // Broadcast real-time update for all intervals
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

/**
 * Save candle to database
 */
async function saveCandle(
  symbol: string,
  interval: CandleInterval,
  candle: CurrentCandle,
  isClosed: boolean
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
      quoteVolume: candle.quoteVolume,
      trades: candle.trades,
      isClosed,
      isMarketOpen: true,
    },
    { upsert: true, new: true }
  );
}

/**
 * Generate candles from trades for the previous minute
 * This runs every minute to ensure candles exist even during quiet periods
 */
async function generateCandlesFromTrades(): Promise<void> {
  const now = new Date();
  const intervals: CandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
  
  for (const market of REQUIRED_MARKETS) {
    const symbol = market.symbol;
    
    // Get price for new candles (trades > prev candle close > oracle for first ever)
    const priceForNewCandle = await getPriceForNewCandle(symbol);
    
    for (const interval of intervals) {
      const candleStart = getCandleStart(now, interval);
      
      // Check if this candle period is complete (we're past the end)
      const prevCandleStart = new Date(candleStart.getTime() - INTERVAL_MS[interval]);
      const isPrevCandleComplete = now.getTime() >= candleStart.getTime();
      
      // First, ensure in-memory current candles map exists
      if (!currentCandles.has(symbol)) {
        currentCandles.set(symbol, new Map());
      }
      const symbolCandles = currentCandles.get(symbol)!;
      
      // Check if we have an in-memory candle from the previous period that needs closing
      const inMemoryPrevCandle = symbolCandles.get(interval);
      if (inMemoryPrevCandle && inMemoryPrevCandle.timestamp.getTime() === prevCandleStart.getTime() && isPrevCandleComplete) {
        // Close and save the in-memory candle
        await saveCandle(symbol, interval, inMemoryPrevCandle, true);
        
        // Broadcast the closed candle
        broadcastCandleUpdate(symbol, {
          symbol,
          interval,
          timestamp: inMemoryPrevCandle.timestamp.getTime(),
          open: inMemoryPrevCandle.open,
          high: inMemoryPrevCandle.high,
          low: inMemoryPrevCandle.low,
          close: inMemoryPrevCandle.close,
          volume: inMemoryPrevCandle.volume,
          trades: inMemoryPrevCandle.trades,
          isClosed: true,
        });
        
        // Clear this candle from memory so a new one is created
        symbolCandles.delete(interval);
      }
      
      if (isPrevCandleComplete) {
        // Check if previous candle exists in DB and is not closed
        const existingCandle = await Candle.findOne({
          marketSymbol: symbol,
          interval,
          timestamp: prevCandleStart,
        });
        
        if (existingCandle && !existingCandle.isClosed) {
          // Mark it as closed
          existingCandle.isClosed = true;
          await existingCandle.save();
          
          // Broadcast closed candle
          broadcastCandleUpdate(symbol, {
            symbol,
            interval,
            timestamp: existingCandle.timestamp.getTime(),
            open: existingCandle.open,
            high: existingCandle.high,
            low: existingCandle.low,
            close: existingCandle.close,
            volume: existingCandle.volume,
            trades: existingCandle.trades,
            isClosed: true,
          });
        } else if (!existingCandle) {
          // No candle exists for the previous period - create one from trades
          const trades = await Trade.find({
            marketSymbol: symbol,
            createdAt: {
              $gte: prevCandleStart,
              $lt: candleStart,
            },
          }).sort({ createdAt: 1 });
          
          if (trades.length > 0) {
            // Aggregate trades into candle
            const prices = trades.map(t => t.price);
            const volumes = trades.map(t => t.quantity);
            const quoteVolumes = trades.map(t => t.quoteQuantity);
            
            const candle = new Candle({
              marketSymbol: symbol,
              interval,
              timestamp: prevCandleStart,
              open: prices[0],
              high: Math.max(...prices),
              low: Math.min(...prices),
              close: prices[prices.length - 1],
              volume: volumes.reduce((a, b) => a + b, 0),
              quoteVolume: quoteVolumes.reduce((a, b) => a + b, 0),
              trades: trades.length,
              isClosed: true,
              isMarketOpen: true,
            });
            
            await candle.save();
            
            // Update last known price
            lastKnownPrices.set(symbol, prices[prices.length - 1]);
            
            // Broadcast closed candle
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
              isClosed: true,
            });
          } else if (priceForNewCandle) {
            // No trades - create a flat candle using previous candle close (or oracle for first ever)
            const candle = new Candle({
              marketSymbol: symbol,
              interval,
              timestamp: prevCandleStart,
              open: priceForNewCandle,
              high: priceForNewCandle,
              low: priceForNewCandle,
              close: priceForNewCandle,
              volume: 0,
              quoteVolume: 0,
              trades: 0,
              isClosed: true,
              isMarketOpen: true,
            });
            
            try {
              await candle.save();
              
              // Broadcast closed flat candle
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
                isClosed: true,
              });
            } catch {
              // Ignore duplicate key errors
            }
          }
        }
      }
      
      // Ensure current candle exists in memory for this interval
      if (!symbolCandles.has(interval)) {
        // Try to load from DB or create new
        const dbCandle = await Candle.findOne({
          marketSymbol: symbol,
          interval,
          timestamp: candleStart,
        });
        
        if (dbCandle && !dbCandle.isClosed) {
          symbolCandles.set(interval, {
            open: dbCandle.open,
            high: dbCandle.high,
            low: dbCandle.low,
            close: dbCandle.close,
            volume: dbCandle.volume,
            quoteVolume: dbCandle.quoteVolume,
            trades: dbCandle.trades,
            timestamp: candleStart,
          });
        } else if (priceForNewCandle) {
          // Create new candle with previous candle close (or oracle for first ever)
          const newCandle: CurrentCandle = {
            open: priceForNewCandle,
            high: priceForNewCandle,
            low: priceForNewCandle,
            close: priceForNewCandle,
            volume: 0,
            quoteVolume: 0,
            trades: 0,
            timestamp: candleStart,
          };
          symbolCandles.set(interval, newCandle);
          
          // Save to DB immediately
          await saveCandle(symbol, interval, newCandle, false);
          
          // Broadcast the new current candle
          broadcastCandleUpdate(symbol, {
            symbol,
            interval,
            timestamp: newCandle.timestamp.getTime(),
            open: newCandle.open,
            high: newCandle.high,
            low: newCandle.low,
            close: newCandle.close,
            volume: newCandle.volume,
            trades: newCandle.trades,
            isClosed: false,
          });
        }
      } else {
        // Candle exists in memory - ensure timestamp is current
        const existingCandle = symbolCandles.get(interval)!;
        if (existingCandle.timestamp.getTime() !== candleStart.getTime()) {
          // This candle is from a previous period - create new one using prev close
          const newPrice = priceForNewCandle || existingCandle.close;
          const newCandle: CurrentCandle = {
            open: newPrice,
            high: newPrice,
            low: newPrice,
            close: newPrice,
            volume: 0,
            quoteVolume: 0,
            trades: 0,
            timestamp: candleStart,
          };
          symbolCandles.set(interval, newCandle);
          await saveCandle(symbol, interval, newCandle, false);
        }
      }
    }
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
    .then(candles => candles.reverse());
}

/**
 * Get current (live) candle from memory
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
 * Seed initial candles using the oracle price if no candles exist
 * Creates minimal history so charts have something to show
 */
async function seedInitialCandles(symbol: string, basePrice: number): Promise<void> {
  const intervals: CandleInterval[] = ["1m", "5m", "15m", "1h"];
  
  for (const interval of intervals) {
    const count = await Candle.countDocuments({
      marketSymbol: symbol,
      interval,
    });
    
    if (count < 10) {
      // Create 30 candles of history
      const now = new Date();
      const candleStart = getCandleStart(now, interval);
      const intervalMs = INTERVAL_MS[interval];
      
      const candles = [];
      let currentPrice = basePrice;
      
      for (let i = 29; i >= 0; i--) {
        const timestamp = new Date(candleStart.getTime() - i * intervalMs);
        
        // Check if candle already exists
        const exists = await Candle.findOne({
          marketSymbol: symbol,
          interval,
          timestamp,
        });
        
        if (!exists) {
          // Small random walk for variety
          const change = (Math.random() - 0.5) * basePrice * 0.005;
          currentPrice = Math.max(basePrice * 0.95, Math.min(basePrice * 1.05, currentPrice + change));
          
          candles.push({
            marketSymbol: symbol,
            interval,
            timestamp,
            open: currentPrice,
            high: currentPrice * (1 + Math.random() * 0.002),
            low: currentPrice * (1 - Math.random() * 0.002),
            close: currentPrice,
            volume: 0,
            quoteVolume: 0,
            trades: 0,
            isClosed: i > 0, // Current candle is not closed
            isMarketOpen: true,
          });
        }
      }
      
      if (candles.length > 0) {
        await Candle.insertMany(candles, { ordered: false }).catch(() => {
          // Ignore duplicate key errors
        });
        console.log(`   📊 Seeded ${candles.length} ${interval} candles for ${symbol}`);
      }
    }
  }
}

// Cron job for candle generation (runs every minute at :00 seconds)
let candleGeneratorCron: ScheduledTask | null = null;

// Cron job for real-time candle broadcasts (runs every 5 seconds)
let candleBroadcastCron: ScheduledTask | null = null;

/**
 * Broadcast current candle state for all markets and intervals (real-time updates)
 * This ensures charts get updates even when no trades are occurring
 * 
 * NOTE: We only update OHLC from trades (lastKnownPrices), NOT from oracle prices.
 * If no trades occur, the candle stays flat at the previous candle's close.
 */
async function broadcastCurrentCandles(): Promise<void> {
  const intervals: CandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
  
  for (const market of REQUIRED_MARKETS) {
    const symbol = market.symbol;
    const symbolCandles = currentCandles.get(symbol);
    
    if (!symbolCandles) continue;
    
    // Only use trade prices (NOT oracle) for live updates
    const tradePrice = lastKnownPrices.get(symbol);
    
    // Broadcast all interval candles
    for (const interval of intervals) {
      const candle = symbolCandles.get(interval);
      if (candle) {
        // Only update OHLC if we have a trade price AND no trades yet in this candle
        // This keeps the candle in sync with latest trade even if trade happened before candle start
        if (tradePrice && candle.trades === 0) {
          candle.close = tradePrice;
          candle.high = Math.max(candle.high, tradePrice);
          candle.low = Math.min(candle.low, tradePrice);
        }
        
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
  }
}

/**
 * Start the candle generator (runs every minute at :00 seconds via cron)
 */
export function startCandleGenerator(): void {
  if (candleGeneratorCron) return;
  
  console.log("📊 Starting candle generator (cron: every minute at :00)...");
  
  // Generate immediately for current state
  generateCandlesFromTrades().catch(err => {
    console.error("Error generating candles:", err);
  });
  
  // Schedule candle generation at the start of every minute (XX:XX:00)
  // Cron pattern: "0 * * * * *" = at second 0 of every minute
  candleGeneratorCron = cron.schedule("0 * * * * *", () => {
    generateCandlesFromTrades().catch(err => {
      console.error("Error generating candles:", err);
    });
  });
  
  // Start real-time candle broadcasts (every 5 seconds)
  // Cron pattern: "*/5 * * * * *" = every 5 seconds
  if (!candleBroadcastCron) {
    console.log("📊 Starting real-time candle broadcasts (cron: every 5s)...");
    candleBroadcastCron = cron.schedule("*/5 * * * * *", () => {
      broadcastCurrentCandles().catch(err => {
        console.error("Error broadcasting candles:", err);
      });
    });
  }
}

/**
 * Stop the candle generator
 */
export function stopCandleGenerator(): void {
  if (candleGeneratorCron) {
    candleGeneratorCron.stop();
    candleGeneratorCron = null;
    console.log("📊 Stopped candle generator");
  }
  
  if (candleBroadcastCron) {
    candleBroadcastCron.stop();
    candleBroadcastCron = null;
    console.log("📊 Stopped candle broadcasts");
  }
}

/**
 * Initialize candles for all required markets
 * 
 * Priority for initial price:
 * 1. Most recent trade from DB (not implemented here - trades set lastKnownPrices when they occur)
 * 2. Most recent closed candle's close price
 * 3. Oracle price (ONLY for first candle ever - used to seed initial data)
 */
export async function initializeCandles(): Promise<void> {
  console.log("📊 Initializing candle data...");
  
  for (const market of REQUIRED_MARKETS) {
    const symbol = market.symbol;
    
    // Check if we have any existing candles
    const mostRecentCandle = await Candle.findOne({
      marketSymbol: symbol,
      isClosed: true,
    }).sort({ timestamp: -1 });
    
    if (mostRecentCandle) {
      // Use last candle's close as the starting price (NOT setting lastKnownPrices - only trades do that)
      console.log(`   ${symbol}: Found existing candles, last close: $${mostRecentCandle.close.toFixed(2)}`);
    } else {
      // No candles exist - seed initial candles using oracle price (first run ever)
      const oraclePrice = getCachedPrice(symbol);
      if (oraclePrice) {
        console.log(`   ${symbol}: No candles found, seeding with oracle price: $${oraclePrice.toFixed(2)}`);
        await seedInitialCandles(symbol, oraclePrice);
      }
    }
    
    // Check candle count
    const check = await hasEnoughCandles(symbol, "1m", 10);
    console.log(`   ${symbol}: ${check.count} candles ${check.hasEnough ? "✓" : "(seeding...)"}`);
  }
  
  // Start the generator
  startCandleGenerator();
}

/**
 * Backfill candles for a market using oracle price
 * Creates historical candles if none exist
 */
export async function backfillCandles(
  marketSymbol: string,
  interval: CandleInterval,
  count: number = 100
): Promise<number> {
  const symbol = marketSymbol.toUpperCase();
  const basePrice = lastKnownPrices.get(symbol) || getCachedPrice(symbol);
  
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
  
  for (let i = 0; i < count; i++) {
    // Check if candle already exists
    const exists = await Candle.findOne({
      marketSymbol: symbol,
      interval,
      timestamp: currentTime,
    });
    
    if (!exists) {
      // Small random walk for historical variety
      const change = (Math.random() - 0.5) * basePrice * 0.003;
      currentPrice = Math.max(basePrice * 0.95, Math.min(basePrice * 1.05, currentPrice + change));
      
      const high = currentPrice * (1 + Math.random() * 0.002);
      const low = currentPrice * (1 - Math.random() * 0.002);
      
      candles.push({
        marketSymbol: symbol,
        interval,
        timestamp: new Date(currentTime),
        open: currentPrice,
        high,
        low,
        close: currentPrice,
        volume: 0,
        quoteVolume: 0,
        trades: 0,
        isClosed: true,
        isMarketOpen: true,
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

// Legacy export for compatibility (updateCandle now maps to updateCandleFromTrade)
export const updateCandle = updateCandleFromTrade;
