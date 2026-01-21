import { Market, IMarket, REQUIRED_MARKETS } from "../models/market.model";
import { fetchAndUpdateSteamPrice } from "./steam-oracle.service";

// In-memory cache of market prices
const priceCache = new Map<string, { price: number; updatedAt: Date }>();

/**
 * Initialize markets - ensure required CS:GO markets always exist
 * Also removes any old markets not in the current config
 */
export async function initializeMarkets(): Promise<void> {
  console.log("🎮 Ensuring required CS:GO markets exist...");
  
  // Get valid symbols from config
  const validSymbols = REQUIRED_MARKETS.map(m => m.symbol);
  
  // Remove old markets not in current config
  const oldMarkets = await Market.find({ symbol: { $nin: validSymbols } });
  if (oldMarkets.length > 0) {
    console.log(`   🗑️ Removing ${oldMarkets.length} old market(s): ${oldMarkets.map(m => m.symbol).join(", ")}`);
    await Market.deleteMany({ symbol: { $nin: validSymbols } });
  }
  
  // Create/verify required markets
  for (const marketData of REQUIRED_MARKETS) {
    const existing = await Market.findOne({ symbol: marketData.symbol });
    
    if (!existing) {
      const market = new Market(marketData);
      await market.save();
      console.log(`   ✅ Created CS:GO market: ${market.symbol}`);
    } else {
      console.log(`   ✓ CS:GO market exists: ${existing.symbol}`);
    }
  }
  
  const activeMarkets = await Market.find({ status: "active" });
  console.log(`🎮 ${activeMarkets.length} active CS:GO markets ready: ${activeMarkets.map(m => m.symbol).join(", ")}`);
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
 * Fetch and update price from Steam Community Market
 */
export async function fetchAndUpdatePrice(marketSymbol: string): Promise<number | null> {
  const market = await getMarket(marketSymbol);
  if (!market) return null;
  
  try {
    // Use Steam oracle service for CS:GO items
    const price = await fetchAndUpdateSteamPrice(marketSymbol);
    
    if (price !== null) {
      await updateOraclePrice(marketSymbol, price);
      
      // NOTE: We intentionally do NOT call setLastKnownPrice here.
      // lastKnownPrice should ONLY be set by actual trades, not oracle updates.
      // Candles track trade prices, not oracle prices (like a true perps exchange).
    }
    
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
 * Start price updates for required CS:GO markets
 */
export async function startRequiredPriceUpdates(intervalMs: number = 15000): Promise<void> {
  console.log("🎮 Starting price updates for CS:GO markets...");
  
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
 * Never rounds positive quantities to zero (returns lotSize as minimum)
 */
export function roundToLotSize(quantity: number, lotSize: number): number {
  const rounded = Math.round(quantity / lotSize) * lotSize;
  // Prevent rounding positive quantities to zero
  if (rounded === 0 && quantity > 0) {
    return lotSize;
  }
  return rounded;
}
