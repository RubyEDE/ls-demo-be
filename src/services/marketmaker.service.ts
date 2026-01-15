import { v4 as uuidv4 } from "uuid";
import { Order, IOrder } from "../models/order.model";
import { getMarket, getCachedPrice, roundToTickSize, roundToLotSize } from "./market.service";
import { rebuildOrderBook, broadcastOrderBook } from "./orderbook.service";

// Configuration for synthetic liquidity
interface LiquidityConfig {
  // Number of price levels on each side
  levels: number;
  // Spread from mid price (as percentage, e.g., 0.001 = 0.1%)
  spreadPercent: number;
  // Price increment between levels (as percentage)
  levelSpacingPercent: number;
  // Base quantity per level
  baseQuantity: number;
  // Quantity multiplier as we go away from mid (creates depth)
  quantityMultiplier: number;
  // Random variance for quantity (0-1)
  quantityVariance: number;
}

const DEFAULT_LIQUIDITY_CONFIG: LiquidityConfig = {
  levels: 25,                  // 25 bids + 25 asks = 50 orders total
  spreadPercent: 0.0005,      // 0.05% spread
  levelSpacingPercent: 0.0002, // 0.02% between levels
  baseQuantity: 5,
  quantityMultiplier: 1.2,
  quantityVariance: 0.3,
};

// Store synthetic orders per market
const syntheticOrders = new Map<string, IOrder[]>();

// Market maker update intervals
const mmIntervals = new Map<string, NodeJS.Timeout>();

/**
 * Generate synthetic orders around a price
 */
export async function generateSyntheticOrders(
  marketSymbol: string,
  midPrice: number,
  config: LiquidityConfig = DEFAULT_LIQUIDITY_CONFIG
): Promise<IOrder[]> {
  const market = await getMarket(marketSymbol);
  if (!market) {
    throw new Error(`Market not found: ${marketSymbol}`);
  }
  
  const orders: IOrder[] = [];
  
  // Calculate spread
  const halfSpread = midPrice * config.spreadPercent;
  const levelSpacing = midPrice * config.levelSpacingPercent;
  
  // Generate bid orders (below mid price)
  for (let i = 0; i < config.levels; i++) {
    const price = roundToTickSize(
      midPrice - halfSpread - (i * levelSpacing),
      market.tickSize
    );
    
    // Quantity increases with distance from mid
    const baseQty = config.baseQuantity * Math.pow(config.quantityMultiplier, i);
    const variance = 1 + (Math.random() - 0.5) * 2 * config.quantityVariance;
    const quantity = roundToLotSize(baseQty * variance, market.lotSize);
    
    const order = new Order({
      orderId: `SYN-BID-${uuidv4()}`,
      marketSymbol: market.symbol,
      userId: null,
      userAddress: null,
      side: "buy",
      type: "limit",
      price,
      quantity,
      filledQuantity: 0,
      remainingQuantity: quantity,
      averagePrice: 0,
      isSynthetic: true,
      postOnly: true,
      reduceOnly: false,
      status: "open",
    });
    
    orders.push(order);
  }
  
  // Generate ask orders (above mid price)
  for (let i = 0; i < config.levels; i++) {
    const price = roundToTickSize(
      midPrice + halfSpread + (i * levelSpacing),
      market.tickSize
    );
    
    // Quantity increases with distance from mid
    const baseQty = config.baseQuantity * Math.pow(config.quantityMultiplier, i);
    const variance = 1 + (Math.random() - 0.5) * 2 * config.quantityVariance;
    const quantity = roundToLotSize(baseQty * variance, market.lotSize);
    
    const order = new Order({
      orderId: `SYN-ASK-${uuidv4()}`,
      marketSymbol: market.symbol,
      userId: null,
      userAddress: null,
      side: "sell",
      type: "limit",
      price,
      quantity,
      filledQuantity: 0,
      remainingQuantity: quantity,
      averagePrice: 0,
      isSynthetic: true,
      postOnly: true,
      reduceOnly: false,
      status: "open",
    });
    
    orders.push(order);
  }
  
  return orders;
}

/**
 * Update synthetic liquidity for a market
 * Preserves user orders while refreshing synthetic liquidity
 */
export async function updateSyntheticLiquidity(
  marketSymbol: string,
  config: LiquidityConfig = DEFAULT_LIQUIDITY_CONFIG
): Promise<void> {
  const symbol = marketSymbol.toUpperCase();
  
  // Get current oracle price
  const price = getCachedPrice(symbol);
  if (!price) {
    console.warn(`No price available for ${symbol}, skipping liquidity update`);
    return;
  }
  
  // Remove ONLY synthetic orders from DB (user orders are preserved)
  await Order.deleteMany({
    marketSymbol: symbol,
    isSynthetic: true,
  });
  
  // Generate new synthetic orders
  const orders = await generateSyntheticOrders(symbol, price, config);
  
  // Save synthetic orders to DB
  for (const order of orders) {
    await order.save();
  }
  
  // Store reference
  syntheticOrders.set(symbol, orders);
  
  // Rebuild the entire order book from DB (includes both user and synthetic orders)
  await rebuildOrderBook(symbol);
  
  // Broadcast updated order book
  broadcastOrderBook(symbol);
  
  console.log(`💧 Updated liquidity for ${symbol}: ${orders.length} synthetic orders around $${price.toFixed(2)}`);
}

/**
 * Start market maker for a market
 */
export async function startMarketMaker(
  marketSymbol: string,
  intervalMs: number = 5000,
  config: LiquidityConfig = DEFAULT_LIQUIDITY_CONFIG
): Promise<void> {
  const symbol = marketSymbol.toUpperCase();
  
  if (mmIntervals.has(symbol)) {
    console.log(`Market maker already running for ${symbol}`);
    return;
  }
  
  console.log(`🤖 Starting market maker for ${symbol}`);
  
  // Initial update
  await updateSyntheticLiquidity(symbol, config);
  
  // Set up interval
  const interval = setInterval(async () => {
    try {
      await updateSyntheticLiquidity(symbol, config);
    } catch (error) {
      console.error(`Market maker error for ${symbol}:`, error);
    }
  }, intervalMs);
  
  mmIntervals.set(symbol, interval);
}

/**
 * Stop market maker for a market
 */
export async function stopMarketMaker(marketSymbol: string): Promise<void> {
  const symbol = marketSymbol.toUpperCase();
  
  const interval = mmIntervals.get(symbol);
  if (interval) {
    clearInterval(interval);
    mmIntervals.delete(symbol);
  }
  
  // Remove synthetic orders
  await Order.deleteMany({
    marketSymbol: symbol,
    isSynthetic: true,
  });
  
  syntheticOrders.delete(symbol);
  
  console.log(`🤖 Stopped market maker for ${symbol}`);
}

/**
 * Start market makers for all active markets
 */
export async function startAllMarketMakers(
  intervalMs: number = 5000,
  config: LiquidityConfig = DEFAULT_LIQUIDITY_CONFIG
): Promise<void> {
  const Market = (await import("../models/market.model")).Market;
  const markets = await Market.find({ status: "active" });
  
  for (const market of markets) {
    await startMarketMaker(market.symbol, intervalMs, config);
  }
}

/**
 * Start market makers for required markets with retry logic
 * This ensures the 3 core markets always have liquidity
 */
export async function startRequiredMarketMakers(
  intervalMs: number = 5000,
  maxRetries: number = 10,
  retryDelayMs: number = 2000,
  config: LiquidityConfig = DEFAULT_LIQUIDITY_CONFIG
): Promise<void> {
  const { REQUIRED_MARKETS } = await import("../models/market.model");
  
  console.log("🤖 Starting market makers for required markets...");
  
  for (const marketData of REQUIRED_MARKETS) {
    const symbol = marketData.symbol;
    let retries = 0;
    let started = false;
    
    while (!started && retries < maxRetries) {
      const price = getCachedPrice(symbol);
      
      if (price) {
        await startMarketMaker(symbol, intervalMs, config);
        started = true;
        console.log(`   ✅ Market maker started for ${symbol} @ $${price.toFixed(2)}`);
      } else {
        retries++;
        console.log(`   ⏳ Waiting for price data for ${symbol} (attempt ${retries}/${maxRetries})...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
    
    if (!started) {
      console.warn(`   ⚠️ Could not start market maker for ${symbol} - no price data after ${maxRetries} retries`);
    }
  }
}

/**
 * Stop all market makers
 */
export async function stopAllMarketMakers(): Promise<void> {
  const symbols = Array.from(mmIntervals.keys());
  
  for (const symbol of symbols) {
    await stopMarketMaker(symbol);
  }
}

/**
 * Get synthetic order count for a market
 */
export function getSyntheticOrderCount(marketSymbol: string): number {
  return syntheticOrders.get(marketSymbol.toUpperCase())?.length ?? 0;
}
