import { v4 as uuidv4 } from "uuid";
import { Order, IOrder } from "../models/order.model";
import { Trade } from "../models/trade.model";
import { getActiveMarkets, getCachedPrice, roundToTickSize, roundToLotSize } from "./market.service";
import { addToOrderBook, removeFromOrderBook, getBestBid, getBestAsk } from "./orderbook.service";
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
 */
async function refreshMarketLiquidity(marketSymbol: string): Promise<void> {
  const symbol = marketSymbol.toUpperCase();
  
  // Get current oracle price
  const oraclePrice = getCachedPrice(symbol);
  if (!oraclePrice || oraclePrice <= 0) {
    console.log(`⏳ No price for ${symbol}, skipping...`);
    return;
  }

  // Cancel existing synthetic orders for this market
  await cancelMarketSyntheticOrders(symbol);

  // Generate new orders with multiple accounts
  const orders = generateOrdersWithAccounts(symbol, oraclePrice);
  
  // Place new orders
  for (const orderData of orders) {
    await placeSyntheticOrder(orderData);
  }

  const bidCount = orders.filter(o => o.side === "buy").length;
  const askCount = orders.filter(o => o.side === "sell").length;
  console.log(`📊 ${symbol}: ${orders.length} orders (${bidCount} bids, ${askCount} asks) @ $${oraclePrice.toFixed(2)}`);
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
 * Cancel all synthetic orders for a market
 */
async function cancelMarketSyntheticOrders(marketSymbol: string): Promise<void> {
  const symbol = marketSymbol.toUpperCase();
  
  // Get all open synthetic orders from DB
  const orders = await Order.find({
    marketSymbol: symbol,
    isSynthetic: true,
    status: { $in: ["open", "partial"] },
  });

  for (const order of orders) {
    // Remove from order book
    if (order.remainingQuantity > 0) {
      removeFromOrderBook(symbol, order.side, order.price, order.remainingQuantity);
    }

    // Update order status
    order.status = "cancelled";
    order.cancelledAt = new Date();
    await order.save();
  }

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
// Trade Generation
// ============================================================================

// Track last trade price per market for realistic price continuity
const lastTradePrice = new Map<string, number>();

// Max price drift per trade (0.1% = 10 bps)
const MAX_TRADE_DRIFT_BPS = 10;

/**
 * Get last trade price for a market, or initialize from oracle
 */
function getLastTradePrice(symbol: string): number | null {
  const cached = lastTradePrice.get(symbol);
  if (cached) return cached;
  
  // Initialize from oracle price if no trades yet
  const oraclePrice = getCachedPrice(symbol);
  if (oraclePrice) {
    lastTradePrice.set(symbol, oraclePrice);
    return oraclePrice;
  }
  
  return null;
}

/**
 * Update last trade price
 */
function setLastTradePrice(symbol: string, price: number): void {
  lastTradePrice.set(symbol, price);
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
 * Trades are based on last trade price with max 0.1% drift
 */
async function generateSyntheticTrades(marketSymbol: string): Promise<void> {
  const symbol = marketSymbol.toUpperCase();
  
  // Get last trade price (or oracle price as fallback)
  const lastPrice = getLastTradePrice(symbol);
  if (!lastPrice) {
    return; // Need a reference price
  }

  // Get best bid and ask for bounds
  const bestBid = getBestBid(symbol);
  const bestAsk = getBestAsk(symbol);
  
  if (!bestBid || !bestAsk) {
    return; // Need orderbook for bounds
  }

  // Random number of trades
  const numTrades = Math.floor(
    Math.random() * (config.maxTradesPerInterval - config.minTradesPerInterval + 1) 
    + config.minTradesPerInterval
  );

  let currentPrice = lastPrice;

  for (let i = 0; i < numTrades; i++) {
    // Random side based on slight bias from current position relative to mid
    const midPrice = (bestBid + bestAsk) / 2;
    const buyBias = currentPrice < midPrice ? 0.55 : 0.45; // Slight mean reversion
    const side: "buy" | "sell" = Math.random() < buyBias ? "buy" : "sell";
    
    // Calculate price drift from last trade (max 0.1% = 10 bps)
    // Random drift between -0.1% and +0.1%, biased by side
    const maxDrift = currentPrice * (MAX_TRADE_DRIFT_BPS / 10000);
    const driftDirection = side === "buy" ? 1 : -1;
    const randomFactor = Math.random() * 0.7 + 0.3; // 30-100% of max drift
    const drift = driftDirection * maxDrift * randomFactor;
    
    // Calculate new trade price
    let tradePrice = roundToTickSize(currentPrice + drift, 0.01);
    
    // Clamp to orderbook bounds (can't trade outside best bid/ask)
    tradePrice = Math.max(bestBid, Math.min(bestAsk, tradePrice));
    
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

  // Save last trade price for next interval
  setLastTradePrice(symbol, currentPrice);
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
      const spreadBps = spread && oraclePrice 
        ? Math.round((spread / oraclePrice) * 10000 * 100) / 100
        : null;

      // Count unique accounts
      const uniqueAccounts = new Set(orders.map(o => o.userAddress)).size;

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
