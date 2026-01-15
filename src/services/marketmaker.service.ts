import { v4 as uuidv4 } from "uuid";
import { Order, IOrder } from "../models/order.model";
import { Trade } from "../models/trade.model";
import { getMarket, getCachedPrice, roundToTickSize, roundToLotSize } from "./market.service";
import { rebuildOrderBook, broadcastOrderBook, getBestAsk, getBestBid } from "./orderbook.service";
import { broadcastTradeExecuted } from "./websocket.service";
import { updateCandle } from "./candle.service";

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

// Configuration for synthetic trades
interface TradeGeneratorConfig {
  // Min/max trades to generate per interval
  minTrades: number;
  maxTrades: number;
  // Min/max quantity per trade
  minQuantity: number;
  maxQuantity: number;
  // Interval between trade batches (ms)
  intervalMs: number;
}

const DEFAULT_TRADE_CONFIG: TradeGeneratorConfig = {
  minTrades: 1,
  maxTrades: 2,
  minQuantity: 0.1,
  maxQuantity: 1.5,
  intervalMs: 500,       // Generate trades every 500ms
};

// Store synthetic orders per market
const syntheticOrders = new Map<string, IOrder[]>();

// Market maker update intervals
const mmIntervals = new Map<string, NodeJS.Timeout>();

// Trade generator intervals
const tradeIntervals = new Map<string, NodeJS.Timeout>();

// Price drift tracking per market (simulates market pressure)
interface PriceDrift {
  drift: number;          // Current drift from oracle price (as percentage, e.g., 0.001 = 0.1%)
  momentum: number;       // Current momentum (-1 to 1, negative = bearish, positive = bullish)
  lastUpdate: number;
}

const priceDrifts = new Map<string, PriceDrift>();

// Get or create price drift for a market
function getOrCreatePriceDrift(symbol: string): PriceDrift {
  if (!priceDrifts.has(symbol)) {
    priceDrifts.set(symbol, {
      drift: 0,
      momentum: 0,
      lastUpdate: Date.now(),
    });
  }
  return priceDrifts.get(symbol)!;
}

// Update price drift based on trade activity
function updatePriceDrift(symbol: string, side: "buy" | "sell", quantity: number): void {
  const drift = getOrCreatePriceDrift(symbol);
  
  // Buy pressure pushes price up, sell pressure pushes down
  const impact = side === "buy" ? 0.00005 : -0.00005;
  const quantityFactor = Math.min(quantity / 2, 1); // Cap impact from large trades
  
  // Update momentum (with decay)
  drift.momentum = drift.momentum * 0.95 + (side === "buy" ? 0.1 : -0.1) * quantityFactor;
  drift.momentum = Math.max(-1, Math.min(1, drift.momentum)); // Clamp to [-1, 1]
  
  // Update drift (bounded to prevent runaway prices)
  drift.drift += impact * quantityFactor;
  drift.drift = Math.max(-0.005, Math.min(0.005, drift.drift)); // Max 0.5% drift from oracle
  
  drift.lastUpdate = Date.now();
}

// Apply random walk to price drift (called periodically)
function applyRandomWalk(symbol: string): void {
  const drift = getOrCreatePriceDrift(symbol);
  
  // Random walk component
  const randomStep = (Math.random() - 0.5) * 0.0002; // Small random step
  
  // Mean reversion (slowly pull back to oracle price)
  const reversion = -drift.drift * 0.02;
  
  // Momentum influence
  const momentumInfluence = drift.momentum * 0.0001;
  
  drift.drift += randomStep + reversion + momentumInfluence;
  drift.drift = Math.max(-0.005, Math.min(0.005, drift.drift)); // Max 0.5% drift
  
  // Decay momentum
  drift.momentum *= 0.98;
}

// Get adjusted mid price based on drift
function getAdjustedMidPrice(symbol: string, oraclePrice: number): number {
  const drift = getOrCreatePriceDrift(symbol);
  return oraclePrice * (1 + drift.drift);
}

/**
 * Generate synthetic orders around a price with dynamic variation
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
  const drift = getOrCreatePriceDrift(marketSymbol);
  
  // Calculate spread with slight randomization
  const spreadVariance = 1 + (Math.random() - 0.5) * 0.2; // +/- 10% spread variation
  const halfSpread = midPrice * config.spreadPercent * spreadVariance;
  
  // Adjust spread based on momentum (wider spread when volatile)
  const momentumSpreadAdjust = 1 + Math.abs(drift.momentum) * 0.3;
  const adjustedHalfSpread = halfSpread * momentumSpreadAdjust;
  
  // Generate bid orders (below mid price)
  for (let i = 0; i < config.levels; i++) {
    // Add per-level random variation
    const levelVariance = (Math.random() - 0.5) * midPrice * 0.0001;
    const levelSpacing = midPrice * config.levelSpacingPercent * (1 + Math.random() * 0.3);
    
    const price = roundToTickSize(
      midPrice - adjustedHalfSpread - (i * levelSpacing) + levelVariance,
      market.tickSize
    );
    
    // Quantity increases with distance from mid, with variance
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
    // Add per-level random variation
    const levelVariance = (Math.random() - 0.5) * midPrice * 0.0001;
    const levelSpacing = midPrice * config.levelSpacingPercent * (1 + Math.random() * 0.3);
    
    const price = roundToTickSize(
      midPrice + adjustedHalfSpread + (i * levelSpacing) + levelVariance,
      market.tickSize
    );
    
    // Quantity increases with distance from mid, with variance
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
  const oraclePrice = getCachedPrice(symbol);
  if (!oraclePrice) {
    console.warn(`No price available for ${symbol}, skipping liquidity update`);
    return;
  }
  
  // Apply random walk to price drift
  applyRandomWalk(symbol);
  
  // Get adjusted mid price based on drift and momentum
  const adjustedMidPrice = getAdjustedMidPrice(symbol, oraclePrice);
  
  // Remove ONLY synthetic orders from DB (user orders are preserved)
  await Order.deleteMany({
    marketSymbol: symbol,
    isSynthetic: true,
  });
  
  // Generate new synthetic orders around the adjusted price
  const orders = await generateSyntheticOrders(symbol, adjustedMidPrice, config);
  
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
  
  const drift = getOrCreatePriceDrift(symbol);
  console.log(`💧 Updated liquidity for ${symbol}: ${orders.length} orders @ $${adjustedMidPrice.toFixed(2)} (drift: ${(drift.drift * 100).toFixed(3)}%, momentum: ${drift.momentum.toFixed(2)})`);
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
  
  // Also start trade generator
  await startTradeGenerator(symbol);
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
  
  // Stop trade generator
  stopTradeGenerator(symbol);
  
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
  
  // Stop any remaining trade generators
  stopAllTradeGenerators();
}

/**
 * Get synthetic order count for a market
 */
export function getSyntheticOrderCount(marketSymbol: string): number {
  return syntheticOrders.get(marketSymbol.toUpperCase())?.length ?? 0;
}

// ============ Synthetic Trade Generation ============

/**
 * Generate synthetic trades to simulate market activity
 * Uses best bid/ask from the orderbook for realistic prices
 */
export async function generateSyntheticTrades(
  marketSymbol: string,
  config: TradeGeneratorConfig = DEFAULT_TRADE_CONFIG
): Promise<void> {
  const symbol = marketSymbol.toUpperCase();
  
  const market = await getMarket(symbol);
  if (!market) {
    return;
  }
  
  // Get best bid and ask from orderbook
  const bestAsk = getBestAsk(symbol);
  const bestBid = getBestBid(symbol);
  
  // Need both bid and ask to generate trades
  if (!bestAsk || !bestBid) {
    return;
  }
  
  // Random number of trades this batch
  const numTrades = Math.floor(
    Math.random() * (config.maxTrades - config.minTrades + 1) + config.minTrades
  );
  
  for (let i = 0; i < numTrades; i++) {
    // Random side - determines if we trade at bid or ask
    const side: "buy" | "sell" = Math.random() > 0.5 ? "buy" : "sell";
    
    // Price is best ask for buys, best bid for sells (like a market order)
    const tradePrice = side === "buy" ? bestAsk : bestBid;
    
    // Random quantity
    const quantity = roundToLotSize(
      Math.random() * (config.maxQuantity - config.minQuantity) + config.minQuantity,
      market.lotSize
    );
    
    // Create synthetic trade
    const trade = new Trade({
      tradeId: `SYN-TRD-${uuidv4()}`,
      marketSymbol: symbol,
      makerOrderId: `SYN-MKR-${uuidv4()}`,
      makerAddress: null,
      makerIsSynthetic: true,
      takerOrderId: `SYN-TKR-${uuidv4()}`,
      takerAddress: null,
      takerIsSynthetic: true,
      side,
      price: tradePrice,
      quantity,
      quoteQuantity: tradePrice * quantity,
      makerFee: 0,
      takerFee: 0,
    });
    
    await trade.save();
    
    // Broadcast trade via WebSocket
    broadcastTradeExecuted(symbol, {
      id: trade.tradeId,
      symbol: trade.marketSymbol,
      price: trade.price,
      quantity: trade.quantity,
      side: trade.side,
      timestamp: Date.now(),
    });
    
    // Update price drift based on this trade (affects future orderbook)
    updatePriceDrift(symbol, side, quantity);
    
    // Update candles with this trade
    try {
      await updateCandle(symbol, tradePrice, quantity, true, false);
    } catch (err) {
      // Candle update is non-critical, don't fail on error
    }
  }
}

/**
 * Start synthetic trade generator for a market
 */
export async function startTradeGenerator(
  marketSymbol: string,
  config: TradeGeneratorConfig = DEFAULT_TRADE_CONFIG
): Promise<void> {
  const symbol = marketSymbol.toUpperCase();
  
  if (tradeIntervals.has(symbol)) {
    return; // Already running
  }
  
  console.log(`📈 Starting trade generator for ${symbol}`);
  
  // Generate initial trades
  await generateSyntheticTrades(symbol, config);
  
  // Set up interval
  const interval = setInterval(async () => {
    try {
      await generateSyntheticTrades(symbol, config);
    } catch (error) {
      console.error(`Trade generator error for ${symbol}:`, error);
    }
  }, config.intervalMs);
  
  tradeIntervals.set(symbol, interval);
}

/**
 * Stop synthetic trade generator for a market
 */
export function stopTradeGenerator(marketSymbol: string): void {
  const symbol = marketSymbol.toUpperCase();
  
  const interval = tradeIntervals.get(symbol);
  if (interval) {
    clearInterval(interval);
    tradeIntervals.delete(symbol);
    console.log(`📈 Stopped trade generator for ${symbol}`);
  }
}

/**
 * Stop all trade generators
 */
export function stopAllTradeGenerators(): void {
  const symbols = Array.from(tradeIntervals.keys());
  for (const symbol of symbols) {
    stopTradeGenerator(symbol);
  }
}
