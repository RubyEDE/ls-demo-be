import { v4 as uuidv4 } from "uuid";
import { SpotTrade } from "../models/spot-trade.model";
import { broadcastTradeExecuted } from "./websocket.service";
import { updateSpotCandleFromTrade } from "./spot-candle.service";

// ============================================================================
// Spot Market Maker Service
// ============================================================================
// Generates synthetic trades for spot markets to create realistic candle data.
// Creates trend-based price movements similar to the perps market maker.
// ============================================================================

interface SpotMarketMakerConfig {
  // Target price around which trades center
  targetPrice: number;
  
  // Trade generation
  tradeIntervalMs: number;     // How often to generate trades
  minTradesPerInterval: number;
  maxTradesPerInterval: number;
  minTradeSize: number;
  maxTradeSize: number;
  
  // Number of synthetic accounts
  numAccounts: number;
}

// Default configuration for UMBREON-VMAX-SPOT
const DEFAULT_CONFIG: SpotMarketMakerConfig = {
  targetPrice: 3400,           // $3,400 target price
  tradeIntervalMs: 3000,       // Generate trades every 3 seconds
  minTradesPerInterval: 1,
  maxTradesPerInterval: 3,
  minTradeSize: 0.1,
  maxTradeSize: 1.0,
  numAccounts: 100,
};

// Runtime state
let config: SpotMarketMakerConfig = { ...DEFAULT_CONFIG };
let isRunning = false;
let tradeInterval: NodeJS.Timeout | null = null;

// Synthetic accounts pool
let syntheticAccounts: string[] = [];

// Trend state per market
interface TrendState {
  direction: "up" | "down";
  startPrice: number;
  targetPrice: number;
  startTime: number;
  durationMs: number;
  currentPrice: number;
}

const marketTrends = new Map<string, TrendState>();

// Trend configuration
const TREND_MIN_DURATION_MS = 3 * 60 * 1000;  // 3 minutes
const TREND_MAX_DURATION_MS = 6 * 60 * 1000;  // 6 minutes
const TREND_MIN_MOVE_PERCENT = 0.5;           // 0.5% minimum move
const TREND_MAX_MOVE_PERCENT = 1.5;           // 1.5% maximum move
const MAX_DRIFT_FROM_TARGET_PERCENT = 2.0;    // Max 2% drift from target

/**
 * Generate deterministic synthetic wallet addresses
 */
function generateSyntheticAccounts(count: number): string[] {
  const accounts: string[] = [];
  for (let i = 0; i < count; i++) {
    const seed = `spot-synthetic-mm-${i}`;
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
 * Round to tick size
 */
function roundToTickSize(price: number, tickSize: number = 0.01): number {
  return Math.round(price / tickSize) * tickSize;
}

/**
 * Initialize the spot market maker
 */
export function initSpotMarketMaker(customConfig?: Partial<SpotMarketMakerConfig>): void {
  config = { ...DEFAULT_CONFIG, ...customConfig };
  syntheticAccounts = generateSyntheticAccounts(config.numAccounts);
  
  console.log("🎴 Spot Market Maker initialized:", {
    targetPrice: config.targetPrice,
    tradeIntervalMs: config.tradeIntervalMs,
    numAccounts: config.numAccounts,
  });
}

/**
 * Start the spot market maker
 */
export function startSpotMarketMaker(): void {
  if (isRunning) {
    console.log("🎴 Spot Market Maker is already running");
    return;
  }

  console.log("🎴 Starting Spot Market Maker...");
  isRunning = true;

  // Set up trade generation interval
  tradeInterval = setInterval(async () => {
    if (isRunning) {
      await generateSpotTrades("UMBREON-VMAX-SPOT");
    }
  }, config.tradeIntervalMs);

  console.log("✅ Spot Market Maker started");
}

/**
 * Stop the spot market maker
 */
export function stopSpotMarketMaker(): void {
  if (!isRunning) {
    console.log("🎴 Spot Market Maker is not running");
    return;
  }

  console.log("🎴 Stopping Spot Market Maker...");
  isRunning = false;

  if (tradeInterval) {
    clearInterval(tradeInterval);
    tradeInterval = null;
  }

  console.log("✅ Spot Market Maker stopped");
}

/**
 * Check if spot market maker is running
 */
export function isSpotMarketMakerRunning(): boolean {
  return isRunning;
}

/**
 * Get or create trend state for a market
 */
function getOrCreateTrend(symbol: string): TrendState {
  const existing = marketTrends.get(symbol);
  const now = Date.now();
  
  // Check if we need a new trend
  if (existing && (now - existing.startTime) < existing.durationMs) {
    return existing; // Current trend still active
  }
  
  // Use current trade price or target as base
  const currentPrice = existing?.currentPrice || config.targetPrice;
  
  // Calculate drift from target
  const driftPercent = ((currentPrice - config.targetPrice) / config.targetPrice) * 100;
  const absDrift = Math.abs(driftPercent);
  
  // Determine trend direction with mean reversion bias
  let direction: "up" | "down";
  let movePercent: number;
  
  if (absDrift > MAX_DRIFT_FROM_TARGET_PERCENT) {
    // Force reversion toward target
    direction = driftPercent > 0 ? "down" : "up";
    movePercent = absDrift - (MAX_DRIFT_FROM_TARGET_PERCENT * 0.5);
  } else if (absDrift > MAX_DRIFT_FROM_TARGET_PERCENT * 0.5) {
    // Moderate drift - bias toward target (70% chance)
    const shouldRevert = Math.random() < 0.7;
    direction = shouldRevert 
      ? (driftPercent > 0 ? "down" : "up")
      : (Math.random() > 0.5 ? "up" : "down");
    movePercent = TREND_MIN_MOVE_PERCENT + Math.random() * (TREND_MAX_MOVE_PERCENT - TREND_MIN_MOVE_PERCENT);
  } else {
    // Low drift - random with slight bias toward target
    const revertBias = driftPercent > 0 ? 0.4 : 0.6;
    direction = Math.random() < revertBias ? "up" : "down";
    movePercent = TREND_MIN_MOVE_PERCENT + Math.random() * (TREND_MAX_MOVE_PERCENT - TREND_MIN_MOVE_PERCENT);
  }
  
  const durationMs = TREND_MIN_DURATION_MS + Math.random() * (TREND_MAX_DURATION_MS - TREND_MIN_DURATION_MS);
  const moveFactor = direction === "up" ? (1 + movePercent / 100) : (1 - movePercent / 100);
  const targetPriceForTrend = currentPrice * moveFactor;
  
  const newTrend: TrendState = {
    direction,
    startPrice: currentPrice,
    targetPrice: targetPriceForTrend,
    startTime: now,
    durationMs,
    currentPrice,
  };
  
  marketTrends.set(symbol, newTrend);
  console.log(`🎴 ${symbol}: New ${direction} trend - ${movePercent.toFixed(1)}% over ${(durationMs / 60000).toFixed(1)}min ($${currentPrice.toFixed(2)} → $${targetPriceForTrend.toFixed(2)})`);
  
  return newTrend;
}

/**
 * Calculate the target price progress based on time elapsed
 */
function getTrendTargetPrice(trend: TrendState): number {
  const now = Date.now();
  const elapsed = now - trend.startTime;
  const progress = Math.min(1, elapsed / trend.durationMs);
  
  // Smooth easing
  const easedProgress = progress < 0.5
    ? 2 * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 2) / 2;
  
  return trend.startPrice + (trend.targetPrice - trend.startPrice) * easedProgress;
}

/**
 * Generate synthetic trades for a spot market
 */
async function generateSpotTrades(marketSymbol: string): Promise<void> {
  const symbol = marketSymbol.toUpperCase();
  
  // Get or create trend
  const trend = getOrCreateTrend(symbol);
  
  // Random number of trades
  const numTrades = Math.floor(
    Math.random() * (config.maxTradesPerInterval - config.minTradesPerInterval + 1) 
    + config.minTradesPerInterval
  );

  // Get target price based on trend progress
  const trendTarget = getTrendTargetPrice(trend);
  let currentPrice = trend.currentPrice;

  for (let i = 0; i < numTrades; i++) {
    // Determine side based on trend direction (80% with trend)
    const withTrend = Math.random() < 0.8;
    const side: "buy" | "sell" = withTrend
      ? (trend.direction === "up" ? "buy" : "sell")
      : (trend.direction === "up" ? "sell" : "buy");
    
    // Move toward trend target
    const distanceToTarget = trendTarget - currentPrice;
    const stepSize = Math.abs(distanceToTarget) * (0.02 + Math.random() * 0.08);
    const step = distanceToTarget > 0 ? stepSize : -stepSize;
    
    // Add noise
    const noise = currentPrice * (Math.random() - 0.5) * 0.001;
    
    // Calculate new trade price
    let tradePrice = roundToTickSize(currentPrice + step + noise);
    tradePrice = Math.max(config.targetPrice * 0.9, Math.min(config.targetPrice * 1.1, tradePrice));
    tradePrice = Math.round(tradePrice * 100) / 100;
    
    // Random quantity
    const quantity = Math.round(
      (Math.random() * (config.maxTradeSize - config.minTradeSize) + config.minTradeSize) * 100
    ) / 100;

    // Get two different accounts
    const makerAccount = getRandomAccount();
    let takerAccount = getRandomAccount();
    while (takerAccount === makerAccount) {
      takerAccount = getRandomAccount();
    }

    // Create synthetic trade
    const trade = new SpotTrade({
      tradeId: `SPOT-SYN-${uuidv4()}`,
      marketSymbol: symbol,
      makerOrderId: `SPOT-SYN-MKR-${uuidv4()}`,
      makerAddress: makerAccount,
      makerIsSynthetic: true,
      takerOrderId: `SPOT-SYN-TKR-${uuidv4()}`,
      takerAddress: takerAccount,
      takerIsSynthetic: true,
      side,
      baseAsset: "UMBREON-VMAX",
      quoteAsset: "USD",
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

    // Update candles
    try {
      await updateSpotCandleFromTrade(symbol, tradePrice, quantity);
    } catch (err) {
      // Non-critical
    }

    currentPrice = tradePrice;
  }

  // Update trend's current price
  trend.currentPrice = currentPrice;
}

/**
 * Get spot market maker stats
 */
export async function getSpotMarketMakerStats(): Promise<{
  isRunning: boolean;
  config: SpotMarketMakerConfig;
  trend: {
    direction: "up" | "down";
    startPrice: number;
    targetPrice: number;
    currentPrice: number;
    progressPercent: number;
    remainingSeconds: number;
  } | null;
  recentTradeCount: number;
}> {
  const trend = marketTrends.get("UMBREON-VMAX-SPOT");
  const now = Date.now();
  
  const recentTradeCount = await SpotTrade.countDocuments({
    marketSymbol: "UMBREON-VMAX-SPOT",
    makerIsSynthetic: true,
    takerIsSynthetic: true,
    createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
  });

  return {
    isRunning,
    config: { ...config },
    trend: trend ? {
      direction: trend.direction,
      startPrice: Math.round(trend.startPrice * 100) / 100,
      targetPrice: Math.round(trend.targetPrice * 100) / 100,
      currentPrice: Math.round(trend.currentPrice * 100) / 100,
      progressPercent: Math.round(Math.min(100, ((now - trend.startTime) / trend.durationMs) * 100)),
      remainingSeconds: Math.max(0, Math.round((trend.durationMs - (now - trend.startTime)) / 1000)),
    } : null,
    recentTradeCount,
  };
}
