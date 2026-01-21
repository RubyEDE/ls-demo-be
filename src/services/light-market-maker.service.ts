import { v4 as uuidv4 } from "uuid";
import { Order, IOrder, OrderType, OrderSide } from "../models/order.model";
import { Trade } from "../models/trade.model";
import { getActiveMarkets, getCachedPrice, roundToTickSize, roundToLotSize } from "./market.service";
import { addToOrderBook, removeFromOrderBook, getBestBid, getBestAsk, clearOrderBook, broadcastOrderBook } from "./orderbook.service";
import { broadcastTradeExecuted } from "./websocket.service";
import { updateCandleFromTrade } from "./candle.service";

// ============================================================================
// Light Market Maker Service
// ============================================================================
// A market maker that provides liquidity using synthetic accounts.
// Creates 500 synthetic wallets, places 50 levels of orders per side,
// and generates trades between synthetic accounts to simulate activity.
// ============================================================================

interface MarketMakerConfig {
  // Account configuration
  numAccounts: number;         // Number of synthetic accounts (e.g., 500)
  
  // Spread configuration
  spreadBps: number;           // Base spread in basis points (e.g., 30 = 0.3%)
  
  // Order book depth
  numLevels: number;           // Number of price levels per side (e.g., 50)
  levelSpacingBps: number;     // Spacing between levels in bps (e.g., 5 = 0.05%)
  
  // Order sizing
  baseOrderSize: number;       // Base order size per level
  sizeMultiplier: number;      // Multiply size for each deeper level
  sizeVariance: number;        // Random variance for sizes (0-1)
  
  // Orders per level
  ordersPerLevel: number;      // How many orders at each price level
  
  // Timing
  refreshIntervalMs: number;   // How often to refresh orders (e.g., 30000 = 30s)
  
  // Trade generation
  enableTradeGeneration: boolean;
  tradeIntervalMs: number;     // How often to generate trades
  minTradesPerInterval: number;
  maxTradesPerInterval: number;
  minTradeSize: number;
  maxTradeSize: number;
  
  // Enabled markets (empty = all markets)
  enabledMarkets: string[];
}

// Default configuration - 500 accounts, 50 levels
const DEFAULT_CONFIG: MarketMakerConfig = {
  numAccounts: 500,           // 500 synthetic accounts
  spreadBps: 20,              // 0.2% spread
  numLevels: 50,              // 50 levels per side (100 total)
  levelSpacingBps: 5,         // 0.05% between levels
  baseOrderSize: 0.5,         // 0.5 units base size
  sizeMultiplier: 1.05,       // 5% more at each deeper level
  sizeVariance: 0.3,          // 30% random variance
  ordersPerLevel: 3,          // 3 orders per price level
  refreshIntervalMs: 30000,   // Refresh every 30 seconds
  enableTradeGeneration: true,
  tradeIntervalMs: 2000,      // Generate trades every 2 seconds
  minTradesPerInterval: 1,
  maxTradesPerInterval: 5,
  minTradeSize: 0.1,
  maxTradeSize: 2.0,
  enabledMarkets: [],         // Empty = all markets
};

// Runtime state
let config: MarketMakerConfig = { ...DEFAULT_CONFIG };
let isRunning = false;
let refreshInterval: NodeJS.Timeout | null = null;
let tradeInterval: NodeJS.Timeout | null = null;

// Synthetic accounts pool
let syntheticAccounts: string[] = [];

// Track synthetic orders per market
const syntheticOrderIds = new Map<string, Set<string>>();

/**
 * Generate deterministic synthetic wallet addresses
 */
function generateSyntheticAccounts(count: number): string[] {
  const accounts: string[] = [];
  for (let i = 0; i < count; i++) {
    // Create deterministic addresses using a seed
    const seed = `synthetic-mm-account-${i}`;
    const hash = simpleHash(seed);
    const address = `0x${hash.slice(0, 40)}`.toLowerCase();
    accounts.push(address);
  }
  return accounts;
}

/**
 * Simple hash function for generating addresses
 */
function simpleHash(str: string): string {
  let hash = "";
  for (let i = 0; i < 64; i++) {
    const charCode = str.charCodeAt(i % str.length);
    const val = ((charCode * (i + 1) * 31) % 16).toString(16);
    hash += val;
  }
  return hash;
}

/**
 * Get a random synthetic account
 */
function getRandomAccount(): string {
  const idx = Math.floor(Math.random() * syntheticAccounts.length);
  return syntheticAccounts[idx];
}

/**
 * Initialize the light market maker with optional configuration
 */
export function initLightMarketMaker(customConfig?: Partial<MarketMakerConfig>): void {
  config = { ...DEFAULT_CONFIG, ...customConfig };
  
  // Generate synthetic accounts
  syntheticAccounts = generateSyntheticAccounts(config.numAccounts);
  
  console.log("🤖 Light Market Maker initialized with config:", {
    numAccounts: config.numAccounts,
    spreadBps: config.spreadBps,
    numLevels: config.numLevels,
    levelSpacingBps: config.levelSpacingBps,
    ordersPerLevel: config.ordersPerLevel,
    totalOrdersPerSide: config.numLevels * config.ordersPerLevel,
    refreshIntervalMs: config.refreshIntervalMs,
    tradeGeneration: config.enableTradeGeneration,
    enabledMarkets: config.enabledMarkets.length > 0 ? config.enabledMarkets : "all",
  });
}

/**
 * Start the light market maker
 */
export async function startLightMarketMaker(): Promise<void> {
  if (isRunning) {
    console.log("🤖 Light Market Maker is already running");
    return;
  }

  console.log("🤖 Starting Light Market Maker...");
  console.log(`   📊 ${config.numAccounts} synthetic accounts`);
  console.log(`   📈 ${config.numLevels} price levels per side`);
  console.log(`   📝 ${config.ordersPerLevel} orders per level`);
  console.log(`   💹 Trade generation: ${config.enableTradeGeneration ? "enabled" : "disabled"}`);
  
  isRunning = true;

  // Initial liquidity placement
  await refreshAllMarkets();

  // Set up refresh interval
  refreshInterval = setInterval(async () => {
    if (isRunning) {
      await refreshAllMarkets();
    }
  }, config.refreshIntervalMs);

  // Set up trade generation
  if (config.enableTradeGeneration) {
    tradeInterval = setInterval(async () => {
      if (isRunning) {
        await generateTradesForAllMarkets();
      }
    }, config.tradeIntervalMs);
  }

  console.log("✅ Light Market Maker started");
}

/**
 * Stop the light market maker
 */
export async function stopLightMarketMaker(): Promise<void> {
  if (!isRunning) {
    console.log("🤖 Light Market Maker is not running");
    return;
  }

  console.log("🤖 Stopping Light Market Maker...");
  isRunning = false;

  // Clear intervals
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
  if (tradeInterval) {
    clearInterval(tradeInterval);
    tradeInterval = null;
  }

  // Cancel all synthetic orders
  await cancelAllSyntheticOrders();

  console.log("✅ Light Market Maker stopped");
}

/**
 * Check if market maker is running
 */
export function isMarketMakerRunning(): boolean {
  return isRunning;
}

/**
 * Get current configuration
 */
export function getMarketMakerConfig(): MarketMakerConfig {
  return { ...config };
}

/**
 * Update configuration (will apply on next refresh)
 */
export function updateMarketMakerConfig(newConfig: Partial<MarketMakerConfig>): void {
  config = { ...config, ...newConfig };
  
  // Regenerate accounts if count changed
  if (newConfig.numAccounts) {
    syntheticAccounts = generateSyntheticAccounts(config.numAccounts);
  }
  
  console.log("🤖 Light Market Maker config updated:", newConfig);
}

/**
 * Refresh liquidity for all enabled markets
 */
async function refreshAllMarkets(): Promise<void> {
  try {
    const markets = await getActiveMarkets();
    const enabledMarkets = config.enabledMarkets.length > 0
      ? markets.filter(m => config.enabledMarkets.includes(m.symbol))
      : markets;

    for (const market of enabledMarkets) {
      await refreshMarketLiquidity(market.symbol);
    }
  } catch (error) {
    console.error("❌ Error refreshing markets:", error);
  }
}

/**
 * Refresh liquidity for a single market
 * Centers orderbook around current trade price (from trend), not oracle
 */
async function refreshMarketLiquidity(marketSymbol: string): Promise<void> {
  const symbol = marketSymbol.toUpperCase();
  
  // Get price (oracle or fallback default)
  const basePrice = getMarketPrice(symbol);
  if (!basePrice || basePrice <= 0) {
    return; // Skip silently if no price
  }

  // Use current trend price if available, otherwise base price
  const trend = marketTrends.get(symbol);
  const centerPrice = trend?.currentPrice || basePrice;

  // 1. Bulk delete all synthetic orders from DB
  await Order.deleteMany({
    marketSymbol: symbol,
    isSynthetic: true,
  });

  // 2. Clear in-memory orderbook completely
  clearOrderBook(symbol);

  // 3. Load any real user orders back into orderbook
  const userOrders = await Order.find({
    marketSymbol: symbol,
    isSynthetic: false,
    status: { $in: ["open", "partial"] },
  });
  for (const order of userOrders) {
    addToOrderBook(order);
  }

  // 4. Generate and place new synthetic orders
  const syntheticOrders = generateOrdersWithAccounts(symbol, centerPrice);
  
  // Bulk insert synthetic orders
  const orderDocs = syntheticOrders.map(o => ({
    orderId: `SYN-${uuidv4()}`,
    marketSymbol: o.marketSymbol,
    userId: null,
    userAddress: o.userAddress,
    side: o.side as OrderSide,
    type: "limit" as OrderType,
    price: o.price,
    quantity: o.quantity,
    filledQuantity: 0,
    remainingQuantity: o.quantity,
    averagePrice: 0,
    isSynthetic: true,
    postOnly: false,
    reduceOnly: false,
    status: "open" as const,
  }));

  // Bulk insert to DB
  const insertedOrders = await Order.insertMany(orderDocs);

  // Add to in-memory orderbook
  for (const order of insertedOrders) {
    addToOrderBook(order as unknown as IOrder);
  }

  // Update tracking
  syntheticOrderIds.set(symbol, new Set(insertedOrders.map(o => o.orderId)));

  // Broadcast updated orderbook to WebSocket subscribers
  broadcastOrderBook(symbol);
}

/**
 * Generate bid and ask orders with multiple accounts
 */
function generateOrdersWithAccounts(
  marketSymbol: string,
  oraclePrice: number
): Array<{
  marketSymbol: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  userAddress: string;
}> {
  const orders: Array<{
    marketSymbol: string;
    side: "buy" | "sell";
    price: number;
    quantity: number;
    userAddress: string;
  }> = [];

  const halfSpreadBps = config.spreadBps / 2;

  // Generate bid orders (buy side)
  for (let level = 0; level < config.numLevels; level++) {
    const priceBps = halfSpreadBps + (level * config.levelSpacingBps);
    const basePrice = oraclePrice * (1 - priceBps / 10000);
    
    // Multiple orders per level from different accounts
    for (let o = 0; o < config.ordersPerLevel; o++) {
      // Small price variance within the level
      const priceVariance = (Math.random() - 0.5) * oraclePrice * 0.0001;
      const price = roundToTickSize(basePrice + priceVariance, 0.01);
      
      // Size with variance
      const baseQty = config.baseOrderSize * Math.pow(config.sizeMultiplier, level);
      const variance = 1 + (Math.random() - 0.5) * 2 * config.sizeVariance;
      const quantity = Math.max(0.01, roundToLotSize(baseQty * variance, 0.01));

      orders.push({
        marketSymbol,
        side: "buy",
        price,
        quantity,
        userAddress: getRandomAccount(),
      });
    }
  }

  // Generate ask orders (sell side)
  for (let level = 0; level < config.numLevels; level++) {
    const priceBps = halfSpreadBps + (level * config.levelSpacingBps);
    const basePrice = oraclePrice * (1 + priceBps / 10000);
    
    // Multiple orders per level from different accounts
    for (let o = 0; o < config.ordersPerLevel; o++) {
      // Small price variance within the level
      const priceVariance = (Math.random() - 0.5) * oraclePrice * 0.0001;
      const price = roundToTickSize(basePrice + priceVariance, 0.01);
      
      // Size with variance
      const baseQty = config.baseOrderSize * Math.pow(config.sizeMultiplier, level);
      const variance = 1 + (Math.random() - 0.5) * 2 * config.sizeVariance;
      const quantity = Math.max(0.01, roundToLotSize(baseQty * variance, 0.01));

      orders.push({
        marketSymbol,
        side: "sell",
        price,
        quantity,
        userAddress: getRandomAccount(),
      });
    }
  }

  return orders;
}

/**
 * Place a synthetic order
 */
async function placeSyntheticOrder(params: {
  marketSymbol: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  userAddress: string;
}): Promise<IOrder> {
  const orderId = `SYN-${uuidv4()}`;
  
  const order = new Order({
    orderId,
    marketSymbol: params.marketSymbol,
    userId: null,
    userAddress: params.userAddress,
    side: params.side,
    type: "limit",
    price: params.price,
    quantity: params.quantity,
    filledQuantity: 0,
    remainingQuantity: params.quantity,
    averagePrice: 0,
    isSynthetic: true,
    postOnly: false,
    reduceOnly: false,
    status: "open",
  });

  await order.save();

  // Add to in-memory order book
  addToOrderBook(order);

  // Track this order
  if (!syntheticOrderIds.has(params.marketSymbol)) {
    syntheticOrderIds.set(params.marketSymbol, new Set());
  }
  syntheticOrderIds.get(params.marketSymbol)!.add(orderId);

  return order;
}

/**
 * Cancel all synthetic orders for a market (bulk operation)
 */
async function cancelMarketSyntheticOrders(marketSymbol: string): Promise<void> {
  const symbol = marketSymbol.toUpperCase();
  
  // Bulk delete all synthetic orders from DB (much faster than one-by-one)
  await Order.deleteMany({
    marketSymbol: symbol,
    isSynthetic: true,
  });

  // Clear tracking
  syntheticOrderIds.delete(symbol);
}

/**
 * Cancel all synthetic orders across all markets
 */
async function cancelAllSyntheticOrders(): Promise<void> {
  const markets = Array.from(syntheticOrderIds.keys());
  
  for (const market of markets) {
    await cancelMarketSyntheticOrders(market);
  }

  // Also cancel any orphaned synthetic orders in DB
  await Order.updateMany(
    {
      isSynthetic: true,
      status: { $in: ["open", "partial"] },
    },
    {
      $set: {
        status: "cancelled",
        cancelledAt: new Date(),
      },
    }
  );

  syntheticOrderIds.clear();
  console.log("🗑️ Cancelled all synthetic orders");
}

// ============================================================================
// Trade Generation - Trend-Based System
// ============================================================================

// Trend state per market
interface TrendState {
  direction: "up" | "down";      // Current trend direction
  startPrice: number;            // Price at trend start
  targetPrice: number;           // Target price for this trend
  startTime: number;             // When trend started (ms)
  durationMs: number;            // How long this trend should last
  currentPrice: number;          // Current trade price
}

// Track trend state per market
const marketTrends = new Map<string, TrendState>();

// Trend configuration
const TREND_MIN_DURATION_MS = 5 * 60 * 1000;  // 5 minutes
const TREND_MAX_DURATION_MS = 8 * 60 * 1000;  // 8 minutes
const TREND_MIN_MOVE_PERCENT = 1.0;           // 1% minimum move
const TREND_MAX_MOVE_PERCENT = 2.0;           // 2% maximum move
const MAX_DRIFT_FROM_ORACLE_PERCENT = 3.0;    // Max 3% drift from oracle before forced reversion

// Default prices for markets when oracle is unavailable (fallback)
const DEFAULT_PRICES: Record<string, number> = {
  "AK47-REDLINE-PERP": 45.00,
  "GLOVE-CASE-PERP": 25.00,
  "WEAPON-CASE-3-PERP": 15.00,
  // Stocks (if still used)
  "AAPL-PERP": 250.00,
  "GOOGL-PERP": 175.00,
  "MSFT-PERP": 450.00,
};

/**
 * Get price for a market - oracle price, or fallback to default
 */
function getMarketPrice(symbol: string): number | null {
  const oracle = getCachedPrice(symbol);
  if (oracle && oracle > 0) {
    return oracle;
  }
  // Fallback to default price
  return DEFAULT_PRICES[symbol.toUpperCase()] || null;
}

/**
 * Get or create trend state for a market
 * Includes mean reversion to keep price near oracle
 */
function getOrCreateTrend(symbol: string): TrendState | null {
  const existing = marketTrends.get(symbol);
  const now = Date.now();
  
  // Check if we need a new trend
  if (existing && (now - existing.startTime) < existing.durationMs) {
    return existing; // Current trend still active
  }
  
  // Get oracle price (or fallback default)
  const oraclePrice = getMarketPrice(symbol);
  if (!oraclePrice) {
    return null;
  }
  
  // Use current trade price or oracle as base
  const currentPrice = existing?.currentPrice || oraclePrice;
  
  // Calculate drift from oracle
  const driftPercent = ((currentPrice - oraclePrice) / oraclePrice) * 100;
  const absDrift = Math.abs(driftPercent);
  
  // Determine trend direction with mean reversion bias
  let direction: "up" | "down";
  let movePercent: number;
  
  if (absDrift > MAX_DRIFT_FROM_ORACLE_PERCENT) {
    // Force reversion toward oracle - we've drifted too far
    direction = driftPercent > 0 ? "down" : "up";
    // Move enough to get back within bounds
    movePercent = absDrift - (MAX_DRIFT_FROM_ORACLE_PERCENT * 0.5);
    console.log(`⚠️ ${symbol}: Forcing reversion to oracle (drift: ${driftPercent.toFixed(2)}%)`);
  } else if (absDrift > MAX_DRIFT_FROM_ORACLE_PERCENT * 0.5) {
    // Moderate drift - bias toward oracle (70% chance to revert)
    const shouldRevert = Math.random() < 0.7;
    if (shouldRevert) {
      direction = driftPercent > 0 ? "down" : "up";
    } else {
      direction = Math.random() > 0.5 ? "up" : "down";
    }
    movePercent = TREND_MIN_MOVE_PERCENT + Math.random() * (TREND_MAX_MOVE_PERCENT - TREND_MIN_MOVE_PERCENT);
  } else {
    // Low drift - random direction with slight bias toward oracle
    const revertBias = driftPercent > 0 ? 0.4 : 0.6; // Slight bias toward oracle
    direction = Math.random() < revertBias ? "up" : "down";
    movePercent = TREND_MIN_MOVE_PERCENT + Math.random() * (TREND_MAX_MOVE_PERCENT - TREND_MIN_MOVE_PERCENT);
  }
  
  const durationMs = TREND_MIN_DURATION_MS + Math.random() * (TREND_MAX_DURATION_MS - TREND_MIN_DURATION_MS);
  
  const moveFactor = direction === "up" ? (1 + movePercent / 100) : (1 - movePercent / 100);
  const targetPrice = currentPrice * moveFactor;
  
  const newTrend: TrendState = {
    direction,
    startPrice: currentPrice,
    targetPrice,
    startTime: now,
    durationMs,
    currentPrice: currentPrice,
  };
  
  marketTrends.set(symbol, newTrend);
  console.log(`📈 ${symbol}: New ${direction} trend - ${movePercent.toFixed(1)}% over ${(durationMs / 60000).toFixed(1)}min ($${currentPrice.toFixed(2)} → $${targetPrice.toFixed(2)}) [oracle: $${oraclePrice.toFixed(2)}, drift: ${driftPercent.toFixed(1)}%]`);
  
  // Refresh orderbook to center around new trend start price (async, don't await)
  refreshMarketLiquidity(symbol).catch(err => {
    console.error(`Failed to refresh orderbook for ${symbol}:`, err);
  });
  
  return newTrend;
}

/**
 * Calculate the target price progress based on time elapsed in trend
 */
function getTrendTargetPrice(trend: TrendState): number {
  const now = Date.now();
  const elapsed = now - trend.startTime;
  const progress = Math.min(1, elapsed / trend.durationMs);
  
  // Smooth easing - accelerate in middle, slow at ends
  const easedProgress = progress < 0.5
    ? 2 * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 2) / 2;
  
  return trend.startPrice + (trend.targetPrice - trend.startPrice) * easedProgress;
}

/**
 * Generate trades for all enabled markets
 */
async function generateTradesForAllMarkets(): Promise<void> {
  try {
    const markets = await getActiveMarkets();
    const enabledMarkets = config.enabledMarkets.length > 0
      ? markets.filter(m => config.enabledMarkets.includes(m.symbol))
      : markets;

    for (const market of enabledMarkets) {
      await generateSyntheticTrades(market.symbol);
    }
  } catch (error) {
    console.error("❌ Error generating trades:", error);
  }
}

/**
 * Generate synthetic trades for a market
 * Follows trend direction with 1-2% moves over 5-8 minute periods
 */
async function generateSyntheticTrades(marketSymbol: string): Promise<void> {
  const symbol = marketSymbol.toUpperCase();
  
  // Get or create trend for this market
  const trend = getOrCreateTrend(symbol);
  if (!trend) {
    return;
  }

  // Get best bid and ask for bounds
  const bestBid = getBestBid(symbol);
  const bestAsk = getBestAsk(symbol);
  
  if (!bestBid || !bestAsk) {
    return;
  }

  // Random number of trades
  const numTrades = Math.floor(
    Math.random() * (config.maxTradesPerInterval - config.minTradesPerInterval + 1) 
    + config.minTradesPerInterval
  );

  // Get target price based on trend progress
  const trendTarget = getTrendTargetPrice(trend);
  let currentPrice = trend.currentPrice;

  for (let i = 0; i < numTrades; i++) {
    // Determine side based on trend direction (80% with trend, 20% against)
    const withTrend = Math.random() < 0.8;
    const side: "buy" | "sell" = withTrend
      ? (trend.direction === "up" ? "buy" : "sell")
      : (trend.direction === "up" ? "sell" : "buy");
    
    // Move toward trend target with small steps
    const distanceToTarget = trendTarget - currentPrice;
    const stepSize = Math.abs(distanceToTarget) * (0.02 + Math.random() * 0.08); // 2-10% of remaining distance
    const step = distanceToTarget > 0 ? stepSize : -stepSize;
    
    // Add small noise
    const noise = currentPrice * (Math.random() - 0.5) * 0.001; // ±0.05% noise
    
    // Calculate new trade price
    let tradePrice = roundToTickSize(currentPrice + step + noise, 0.01);
    
    // Clamp to orderbook bounds and fix floating point precision
    tradePrice = Math.max(bestBid * 0.99, Math.min(bestAsk * 1.01, tradePrice));
    tradePrice = Math.round(tradePrice * 100) / 100;
    
    // Random quantity within range
    const quantity = roundToLotSize(
      Math.random() * (config.maxTradeSize - config.minTradeSize) + config.minTradeSize,
      0.01
    );

    // Get two different accounts for maker and taker
    const makerAccount = getRandomAccount();
    let takerAccount = getRandomAccount();
    while (takerAccount === makerAccount) {
      takerAccount = getRandomAccount();
    }

    // Create synthetic trade
    const trade = new Trade({
      tradeId: `SYN-TRD-${uuidv4()}`,
      marketSymbol: symbol,
      makerOrderId: `SYN-MKR-${uuidv4()}`,
      makerAddress: makerAccount,
      makerIsSynthetic: true,
      takerOrderId: `SYN-TKR-${uuidv4()}`,
      takerAddress: takerAccount,
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

    // Update candles with this trade
    try {
      await updateCandleFromTrade(symbol, tradePrice, quantity);
    } catch (err) {
      // Non-critical, don't fail
    }

    // Update current price for next trade in this batch
    currentPrice = tradePrice;
  }

  // Update trend's current price for next interval
  trend.currentPrice = currentPrice;
}

// ============================================================================
// Stats & Info
// ============================================================================

/**
 * Get stats about current synthetic liquidity
 */
export async function getLiquidityStats(): Promise<{
  isRunning: boolean;
  config: MarketMakerConfig;
  syntheticAccounts: number;
  markets: Array<{
    symbol: string;
    bidOrders: number;
    askOrders: number;
    totalBidQuantity: number;
    totalAskQuantity: number;
    bestBid: number | null;
    bestAsk: number | null;
    spread: number | null;
    spreadBps: number | null;
    oraclePrice: number | null;
    uniqueAccounts: number;
    trend: {
      direction: "up" | "down";
      startPrice: number;
      targetPrice: number;
      currentPrice: number;
      progressPercent: number;
      remainingSeconds: number;
      driftFromOraclePercent: number | null;
    } | null;
  }>;
}> {
  const markets = await getActiveMarkets();
  const enabledMarkets = config.enabledMarkets.length > 0
    ? markets.filter(m => config.enabledMarkets.includes(m.symbol))
    : markets;

  const marketStats = await Promise.all(
    enabledMarkets.map(async (market) => {
      const orders = await Order.find({
        marketSymbol: market.symbol,
        isSynthetic: true,
        status: { $in: ["open", "partial"] },
      });

      const bidOrders = orders.filter(o => o.side === "buy");
      const askOrders = orders.filter(o => o.side === "sell");

      const totalBidQuantity = bidOrders.reduce((sum, o) => sum + o.remainingQuantity, 0);
      const totalAskQuantity = askOrders.reduce((sum, o) => sum + o.remainingQuantity, 0);

      const bestBid = bidOrders.length > 0
        ? Math.max(...bidOrders.map(o => o.price))
        : null;
      const bestAsk = askOrders.length > 0
        ? Math.min(...askOrders.map(o => o.price))
        : null;

      const spread = bestBid && bestAsk ? bestAsk - bestBid : null;
      const oraclePrice = getCachedPrice(market.symbol);
      const effectivePrice = getMarketPrice(market.symbol);
      const spreadBps = spread && effectivePrice 
        ? Math.round((spread / effectivePrice) * 10000 * 100) / 100
        : null;

      // Count unique accounts
      const uniqueAccounts = new Set(orders.map(o => o.userAddress)).size;

      // Get trend info with drift from index price
      const trend = marketTrends.get(market.symbol);
      const now = Date.now();
      const driftFromOracle = trend && effectivePrice 
        ? Math.round(((trend.currentPrice - effectivePrice) / effectivePrice) * 10000) / 100
        : null;
      const trendInfo = trend ? {
        direction: trend.direction,
        startPrice: Math.round(trend.startPrice * 100) / 100,
        targetPrice: Math.round(trend.targetPrice * 100) / 100,
        currentPrice: Math.round(trend.currentPrice * 100) / 100,
        progressPercent: Math.round(Math.min(100, ((now - trend.startTime) / trend.durationMs) * 100)),
        remainingSeconds: Math.max(0, Math.round((trend.durationMs - (now - trend.startTime)) / 1000)),
        driftFromOraclePercent: driftFromOracle,
      } : null;

      return {
        symbol: market.symbol,
        bidOrders: bidOrders.length,
        askOrders: askOrders.length,
        totalBidQuantity: Math.round(totalBidQuantity * 100) / 100,
        totalAskQuantity: Math.round(totalAskQuantity * 100) / 100,
        bestBid,
        bestAsk,
        spread: spread ? Math.round(spread * 100) / 100 : null,
        spreadBps,
        oraclePrice,
        uniqueAccounts,
        trend: trendInfo,
      };
    })
  );

  return {
    isRunning,
    config: { ...config },
    syntheticAccounts: syntheticAccounts.length,
    markets: marketStats,
  };
}

/**
 * Force refresh a specific market's liquidity
 */
export async function forceRefreshMarket(marketSymbol: string): Promise<void> {
  await refreshMarketLiquidity(marketSymbol);
}

/**
 * Force refresh all markets' liquidity
 */
export async function forceRefreshAll(): Promise<void> {
  await refreshAllMarkets();
}

/**
 * Get count of synthetic orders for a market (for compatibility with routes)
 */
export async function getSyntheticOrderCount(marketSymbol: string): Promise<number> {
  const count = await Order.countDocuments({
    marketSymbol: marketSymbol.toUpperCase(),
    isSynthetic: true,
    status: { $in: ["open", "partial"] },
  });
  return count;
}

/**
 * Get list of synthetic accounts
 */
export function getSyntheticAccounts(): string[] {
  return [...syntheticAccounts];
}

/**
 * Get recent synthetic trades count
 */
export async function getRecentSyntheticTradeCount(
  marketSymbol: string,
  sinceMinutes: number = 5
): Promise<number> {
  const since = new Date(Date.now() - sinceMinutes * 60 * 1000);
  const count = await Trade.countDocuments({
    marketSymbol: marketSymbol.toUpperCase(),
    makerIsSynthetic: true,
    takerIsSynthetic: true,
    createdAt: { $gte: since },
  });
  return count;
}
