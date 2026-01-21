import { Market, IMarket, REQUIRED_MARKETS } from "../models/market.model";
import { getQuote } from "./finnhub.service";
import { broadcastPriceUpdate } from "./websocket.service";

// In-memory cache of market prices
const priceCache = new Map<string, { price: number; updatedAt: Date }>();

/**
 * Initialize markets - ensure required markets always exist
 * Uses upsert to create missing markets without affecting existing ones
 */
export async function initializeMarkets(): Promise<void> {
  console.log("🏪 Ensuring required markets exist...");
  
  for (const marketData of REQUIRED_MARKETS) {
    const existing = await Market.findOne({ symbol: marketData.symbol });
    
    if (!existing) {
      const market = new Market(marketData);
      await market.save();
      console.log(`   ✅ Created market: ${market.symbol}`);
    } else {
      console.log(`   ✓ Market exists: ${existing.symbol}`);
    }
  }
  
  const activeMarkets = await Market.find({ status: "active" });
  console.log(`🏪 ${activeMarkets.length} active markets ready: ${activeMarkets.map(m => m.symbol).join(", ")}`);
}

/**
 * Get all active markets
 */
export async function getActiveMarkets(): Promise<IMarket[]> {
  return Market.find({ status: "active" }).sort({ symbol: 1 });
}

/**
 * Get a market by symbol
 */
export async function getMarket(symbol: string): Promise<IMarket | null> {
  return Market.findOne({ symbol: symbol.toUpperCase() });
}

/**
 * Update oracle price for a market
 */
export async function updateOraclePrice(symbol: string, price: number): Promise<IMarket | null> {
  const market = await Market.findOneAndUpdate(
    { symbol: symbol.toUpperCase() },
    { 
      oraclePrice: price,
      oraclePriceUpdatedAt: new Date(),
    },
    { new: true }
  );
  
  if (market) {
    priceCache.set(symbol.toUpperCase(), { price, updatedAt: new Date() });
  }
  
  return market;
}

/**
 * Get cached oracle price
 */
export function getCachedPrice(symbol: string): number | null {
  const cached = priceCache.get(symbol.toUpperCase());
  return cached?.price ?? null;
}

/**
 * Fetch and update price from Finnhub
 */
export async function fetchAndUpdatePrice(marketSymbol: string): Promise<number | null> {
  const market = await getMarket(marketSymbol);
  if (!market) return null;
  
  try {
    const quote = await getQuote(market.finnhubSymbol);
    const price = quote.currentPrice;
    
    await updateOraclePrice(marketSymbol, price);
    
    // NOTE: We intentionally do NOT call setLastKnownPrice here.
    // lastKnownPrice should ONLY be set by actual trades, not oracle updates.
    // Candles track trade prices, not oracle prices (like a true perps exchange).
    
    // Broadcast price update via WebSocket
    broadcastPriceUpdate(marketSymbol, {
      symbol: marketSymbol,
      price: price,
      change: quote.change,
      changePercent: quote.percentChange,
      high: quote.highPrice,
      low: quote.lowPrice,
      timestamp: Date.now(),
    });
    
    return price;
  } catch (error) {
    console.error(`Failed to fetch price for ${marketSymbol}:`, error);
    return null;
  }
}

// Price update intervals per market
const priceUpdateIntervals = new Map<string, NodeJS.Timeout>();

/**
 * Start continuous price updates for a market
 */
export function startPriceUpdates(marketSymbol: string, intervalMs: number = 15000): void {
  if (priceUpdateIntervals.has(marketSymbol)) return;
  
  console.log(`📈 Starting price updates for ${marketSymbol}`);
  
  // Fetch immediately
  fetchAndUpdatePrice(marketSymbol);
  
  // Set up interval
  const interval = setInterval(() => {
    fetchAndUpdatePrice(marketSymbol);
  }, intervalMs);
  
  priceUpdateIntervals.set(marketSymbol, interval);
}

/**
 * Stop price updates for a market
 */
export function stopPriceUpdates(marketSymbol: string): void {
  const interval = priceUpdateIntervals.get(marketSymbol);
  if (interval) {
    clearInterval(interval);
    priceUpdateIntervals.delete(marketSymbol);
    console.log(`📉 Stopped price updates for ${marketSymbol}`);
  }
}

/**
 * Start price updates for all active markets
 */
export async function startAllPriceUpdates(intervalMs: number = 15000): Promise<void> {
  const markets = await getActiveMarkets();
  
  for (const market of markets) {
    startPriceUpdates(market.symbol, intervalMs);
  }
}

/**
 * Start price updates for required markets specifically
 * Ensures AAPL, GOOGL, MSFT always have price data
 */
export async function startRequiredPriceUpdates(intervalMs: number = 15000): Promise<void> {
  console.log("📈 Starting price updates for required markets...");
  
  for (const marketData of REQUIRED_MARKETS) {
    startPriceUpdates(marketData.symbol, intervalMs);
  }
}

/**
 * Stop all price updates
 */
export function stopAllPriceUpdates(): void {
  priceUpdateIntervals.forEach((_, symbol) => {
    stopPriceUpdates(symbol);
  });
}

/**
 * Round price to market tick size
 */
export function roundToTickSize(price: number, tickSize: number): number {
  return Math.round(price / tickSize) * tickSize;
}

/**
 * Round quantity to market lot size
 */
export function roundToLotSize(quantity: number, lotSize: number): number {
  return Math.round(quantity / lotSize) * lotSize;
}
