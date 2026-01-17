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
  spreadPercent: 0.0001,      // 0.01% spread (~$0.03 on $300 stock = tight spread)
  levelSpacingPercent: 0.00005, // 0.005% between levels (~$0.015 per level)
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
  maxTrades: 1,          // Usually just 1 trade at a time
  minQuantity: 0.1,
  maxQuantity: 0.8,      // Smaller trades
  intervalMs: 3000,      // Generate trades every 3 seconds (much calmer)
};

// Store synthetic orders per market
const syntheticOrders = new Map<string, IOrder[]>();

// Market maker update intervals
const mmIntervals = new Map<string, NodeJS.Timeout>();

// Trade generator intervals
const tradeIntervals = new Map<string, NodeJS.Timeout>();

// ============ Market State Machine ============
// Creates realistic market behavior with trends, consolidation, and momentum

type MarketPhase = "trending_up" | "trending_down" | "consolidation" | "breakout" | "reversal";

interface MarketState {
  phase: MarketPhase;           // Current market phase
  phaseDuration: number;        // How long we've been in this phase (in ticks)
  phaseTarget: number;          // Target duration for this phase
  drift: number;                // Current drift from oracle price (percentage)
  momentum: number;             // Current momentum (-1 to 1)
  volatility: number;           // Current volatility multiplier (0.5 to 2.0)
  buyPressure: number;          // Accumulated buy pressure (0 to 1)
  lastUpdate: number;
}

const marketStates = new Map<string, MarketState>();

// Initialize or get market state
function getOrCreateMarketState(symbol: string): MarketState {
  if (!marketStates.has(symbol)) {
    // Start with a random initial phase
    const phases: MarketPhase[] = ["trending_up", "trending_down", "consolidation"];
    const initialPhase = phases[Math.floor(Math.random() * phases.length)];
    
    marketStates.set(symbol, {
      phase: initialPhase,
      phaseDuration: 0,
      phaseTarget: 20 + Math.floor(Math.random() * 40), // 20-60 ticks
      drift: 0,
      momentum: initialPhase === "trending_up" ? 0.3 : initialPhase === "trending_down" ? -0.3 : 0,
      volatility: 1.0,
      buyPressure: 0.5, // Neutral
      lastUpdate: Date.now(),
    });
  }
  return marketStates.get(symbol)!;
}

// Transition to a new market phase
function transitionPhase(state: MarketState): void {
  const currentPhase = state.phase;
  let newPhase: MarketPhase;
  
  // Determine next phase based on current phase and randomness
  const rand = Math.random();
  
  switch (currentPhase) {
    case "trending_up":
      if (rand < 0.3) newPhase = "consolidation";
      else if (rand < 0.5) newPhase = "reversal";
      else if (rand < 0.7) newPhase = "breakout";
      else newPhase = "trending_up"; // Continue trend
      break;
      
    case "trending_down":
      if (rand < 0.3) newPhase = "consolidation";
      else if (rand < 0.5) newPhase = "reversal";
      else if (rand < 0.7) newPhase = "breakout";
      else newPhase = "trending_down"; // Continue trend
      break;
      
    case "consolidation":
      if (rand < 0.35) newPhase = "trending_up";
      else if (rand < 0.7) newPhase = "trending_down";
      else if (rand < 0.85) newPhase = "breakout";
      else newPhase = "consolidation"; // Continue consolidation
      break;
      
    case "breakout":
      // Breakouts typically lead to trends
      if (rand < 0.6) newPhase = state.momentum > 0 ? "trending_up" : "trending_down";
      else newPhase = "reversal";
      break;
      
    case "reversal":
      // Reversals flip the trend
      if (state.momentum > 0) newPhase = "trending_down";
      else newPhase = "trending_up";
      break;
      
    default:
      newPhase = "consolidation";
  }
  
  // Apply phase transition
  state.phase = newPhase;
  state.phaseDuration = 0;
  state.phaseTarget = getPhaseTargetDuration(newPhase);
  
  // Adjust momentum and volatility for new phase
  switch (newPhase) {
    case "trending_up":
      state.momentum = 0.3 + Math.random() * 0.4; // 0.3 to 0.7
      state.volatility = 0.8 + Math.random() * 0.4; // Moderate volatility
      break;
    case "trending_down":
      state.momentum = -(0.3 + Math.random() * 0.4); // -0.3 to -0.7
      state.volatility = 0.8 + Math.random() * 0.5; // Slightly higher on downtrends
      break;
    case "consolidation":
      state.momentum *= 0.3; // Dampen momentum
      state.volatility = 0.5 + Math.random() * 0.3; // Low volatility
      break;
    case "breakout":
      state.volatility = 1.5 + Math.random() * 0.5; // High volatility
      state.momentum = state.momentum > 0 ? 0.6 : -0.6; // Strong directional move
      break;
    case "reversal":
      state.momentum = -state.momentum * 0.8; // Flip momentum
      state.volatility = 1.2 + Math.random() * 0.4; // Elevated volatility
      break;
  }
}

function getPhaseTargetDuration(phase: MarketPhase): number {
  switch (phase) {
    case "trending_up":
    case "trending_down":
      return 30 + Math.floor(Math.random() * 60); // 30-90 ticks (trends last longer)
    case "consolidation":
      return 20 + Math.floor(Math.random() * 40); // 20-60 ticks
    case "breakout":
      return 5 + Math.floor(Math.random() * 10); // 5-15 ticks (quick)
    case "reversal":
      return 8 + Math.floor(Math.random() * 12); // 8-20 ticks
    default:
      return 30;
  }
}

// Update market state (called each trade generation cycle)
function updateMarketState(symbol: string): void {
  const state = getOrCreateMarketState(symbol);
  
  state.phaseDuration++;
  state.lastUpdate = Date.now();
  
  // Check for phase transition
  if (state.phaseDuration >= state.phaseTarget) {
    transitionPhase(state);
  }
  
  // Apply gradual changes within the phase
  // Momentum decay towards 0 (mean reversion)
  state.momentum *= 0.99;
  
  // Volatility mean reversion towards 1.0
  state.volatility = state.volatility * 0.98 + 1.0 * 0.02;
  
  // Drift mean reversion towards 0 (back to oracle price)
  state.drift *= 0.98;
  
  // Clamp values - tight bounds for realistic equity movements
  state.drift = Math.max(-0.0005, Math.min(0.0005, state.drift)); // Max 0.05% drift
  state.momentum = Math.max(-1, Math.min(1, state.momentum));
  state.volatility = Math.max(0.5, Math.min(1.5, state.volatility)); // Tighter volatility range
}

// Determine trade side based on market state (returns buy probability)
function getTradeBias(state: MarketState): number {
  let buyProb = 0.5; // Base 50/50
  
  // Adjust based on phase
  switch (state.phase) {
    case "trending_up":
      buyProb = 0.6 + state.momentum * 0.2; // 60-80% buy bias
      break;
    case "trending_down":
      buyProb = 0.4 + state.momentum * 0.2; // 20-40% buy bias
      break;
    case "consolidation":
      // Oscillate around 50% with slight noise
      buyProb = 0.45 + Math.random() * 0.1;
      break;
    case "breakout":
      // Strong directional bias
      buyProb = state.momentum > 0 ? 0.75 : 0.25;
      break;
    case "reversal":
      // Counter-trend trades increase
      buyProb = state.momentum > 0 ? 0.35 : 0.65;
      break;
  }
  
  // Add some randomness
  buyProb += (Math.random() - 0.5) * 0.1;
  
  return Math.max(0.15, Math.min(0.85, buyProb)); // Clamp to prevent 100% one-sided
}

// Get trade intensity based on market state (affects number of trades)
function getTradeIntensity(state: MarketState): number {
  switch (state.phase) {
    case "trending_up":
    case "trending_down":
      return 1.0 + state.volatility * 0.3;
    case "consolidation":
      return 0.6 + Math.random() * 0.2; // Lower activity
    case "breakout":
      return 1.8 + Math.random() * 0.5; // High activity
    case "reversal":
      return 1.4 + Math.random() * 0.3; // Elevated activity
    default:
      return 1.0;
  }
}

// Legacy compatibility - maps to new system
interface PriceDrift {
  drift: number;
  momentum: number;
  lastUpdate: number;
}

const priceDrifts = new Map<string, PriceDrift>();

function getOrCreatePriceDrift(symbol: string): PriceDrift {
  const state = getOrCreateMarketState(symbol);
  // Return a view that's compatible with existing code
  return {
    drift: state.drift,
    momentum: state.momentum,
    lastUpdate: state.lastUpdate,
  };
}

// Update price drift based on trade activity
function updatePriceDrift(symbol: string, side: "buy" | "sell", quantity: number): void {
  const state = getOrCreateMarketState(symbol);
  
  // Buy pressure pushes price up, sell pressure pushes down
  // Very small impact - realistic for equities (moves of $0.01-0.03 on ~$300 stocks)
  const impact = side === "buy" ? 0.000008 : -0.000008; // ~$0.0025 per trade on $300 stock
  const quantityFactor = Math.min(quantity / 2, 1); // Cap impact from large trades
  
  // Update momentum based on trade flow (subtle)
  const momentumImpact = (side === "buy" ? 0.02 : -0.02) * quantityFactor;
  state.momentum = state.momentum * 0.98 + momentumImpact;
  state.momentum = Math.max(-1, Math.min(1, state.momentum));
  
  // Update drift (bounded - max ~0.05% = ~$0.15 on $300 stock)
  state.drift += impact * quantityFactor * state.volatility;
  state.drift = Math.max(-0.0005, Math.min(0.0005, state.drift)); // Max 0.05% drift from oracle
  
  // Update buy pressure tracker
  state.buyPressure = state.buyPressure * 0.95 + (side === "buy" ? 0.05 : 0);
  
  state.lastUpdate = Date.now();
}

// Apply random walk to price drift (called periodically)
function applyRandomWalk(symbol: string): void {
  const state = getOrCreateMarketState(symbol);
  
  // Update market state machine
  updateMarketState(symbol);
  
  // Random walk component - very small for realistic equity movements
  // ~$0.01-0.02 moves on a $300 stock
  const randomStep = (Math.random() - 0.5) * 0.00003 * state.volatility;
  
  // Mean reversion (slowly pull back to oracle price)
  const reversion = -state.drift * 0.05;
  
  // Phase-based momentum influence (subtle)
  let momentumInfluence = state.momentum * 0.00002;
  if (state.phase === "breakout") {
    momentumInfluence *= 1.5; // Slightly stronger moves during breakouts
  } else if (state.phase === "consolidation") {
    momentumInfluence *= 0.3; // Weaker moves during consolidation
  }
  
  state.drift += randomStep + reversion + momentumInfluence;
  state.drift = Math.max(-0.0005, Math.min(0.0005, state.drift)); // Max 0.05% drift (~$0.15 on $300)
}

// Get adjusted mid price based on drift
// ANCHORED to oracle price - never drifts more than 0.1%
function getAdjustedMidPrice(symbol: string, oraclePrice: number): number {
  const state = getOrCreateMarketState(symbol);
  // Clamp drift to max 0.1% (safety check)
  const clampedDrift = Math.max(-0.001, Math.min(0.001, state.drift));
  return oraclePrice * (1 + clampedDrift);
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
  const state = getOrCreateMarketState(marketSymbol);
  
  // Calculate spread with slight randomization
  const spreadVariance = 1 + (Math.random() - 0.5) * 0.2; // +/- 10% spread variation
  const halfSpread = midPrice * config.spreadPercent * spreadVariance;
  
  // Adjust spread based on volatility and phase
  let spreadMultiplier = 1 + Math.abs(state.momentum) * 0.3;
  if (state.phase === "breakout" || state.phase === "reversal") {
    spreadMultiplier *= 1.3; // Wider spreads during volatile phases
  } else if (state.phase === "consolidation") {
    spreadMultiplier *= 0.8; // Tighter spreads during consolidation
  }
  spreadMultiplier *= state.volatility;
  const adjustedHalfSpread = halfSpread * spreadMultiplier;
  
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
  
  const state = getOrCreateMarketState(symbol);
  console.log(`💧 Updated liquidity for ${symbol}: ${orders.length} orders @ $${adjustedMidPrice.toFixed(2)} [${state.phase}] (drift: ${(state.drift * 100).toFixed(3)}%, momentum: ${state.momentum.toFixed(2)}, vol: ${state.volatility.toFixed(2)})`);
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
 * Uses market state machine for realistic patterns (trends, consolidation, breakouts)
 * ANCHORED to Finnhub/oracle price - trades stay within tight bounds of real price
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
  
  // Get oracle price - this is our anchor from Finnhub
  const oraclePrice = getCachedPrice(symbol);
  if (!oraclePrice) {
    return; // Don't trade without oracle price
  }
  
  // Get best bid and ask from orderbook
  let bestAsk = getBestAsk(symbol);
  let bestBid = getBestBid(symbol);
  
  // Need both bid and ask to generate trades
  if (!bestAsk || !bestBid) {
    return;
  }
  
  // CRITICAL: Validate orderbook prices against oracle
  // If bid/ask have drifted more than 0.5% from oracle, reset them to oracle-based prices
  const maxDriftFromOracle = 0.005; // 0.5%
  const askDrift = Math.abs(bestAsk - oraclePrice) / oraclePrice;
  const bidDrift = Math.abs(bestBid - oraclePrice) / oraclePrice;
  
  if (askDrift > maxDriftFromOracle || bidDrift > maxDriftFromOracle) {
    // Orderbook has drifted too far - use oracle-based prices instead
    const tightSpread = oraclePrice * 0.0001; // 0.01% spread
    bestAsk = oraclePrice + tightSpread;
    bestBid = oraclePrice - tightSpread;
  }
  
  // Get market state for intelligent trade generation
  const state = getOrCreateMarketState(symbol);
  
  // Calculate number of trades based on market phase intensity
  const intensity = getTradeIntensity(state);
  const baseNumTrades = Math.floor(
    Math.random() * (config.maxTrades - config.minTrades + 1) + config.minTrades
  );
  const numTrades = Math.max(1, Math.round(baseNumTrades * intensity));
  
  // Get buy probability based on market state
  const buyProbability = getTradeBias(state);
  
  // Sometimes generate trade bursts (clusters of same-direction trades)
  const isBurst = Math.random() < 0.15; // 15% chance of burst
  const burstDirection = Math.random() < buyProbability ? "buy" : "sell";
  
  for (let i = 0; i < numTrades; i++) {
    // Determine trade side based on market state
    let side: "buy" | "sell";
    
    if (isBurst) {
      // During bursts, all trades go same direction (with small chance of counter-trade)
      side = Math.random() < 0.85 ? burstDirection : (burstDirection === "buy" ? "sell" : "buy");
    } else {
      // Normal trading - use buy probability from market state
      side = Math.random() < buyProbability ? "buy" : "sell";
    }
    
    // Price is best ask for buys, best bid for sells (like a market order)
    let tradePrice = side === "buy" ? bestAsk : bestBid;
    
    // Add tiny variance for realism (+/- $0.01)
    tradePrice = tradePrice + (Math.random() - 0.5) * 0.02;
    
    // FINAL ANCHOR CHECK: Ensure trade price stays within 0.3% of oracle
    const tradeDrift = (tradePrice - oraclePrice) / oraclePrice;
    const maxTradeDrift = 0.003; // 0.3%
    if (Math.abs(tradeDrift) > maxTradeDrift) {
      tradePrice = oraclePrice * (1 + (tradeDrift > 0 ? maxTradeDrift : -maxTradeDrift));
    }
    
    // Round to 2 decimal places
    tradePrice = Math.round(tradePrice * 100) / 100;
    
    // Quantity varies by market phase
    let quantityMultiplier = 1.0;
    if (state.phase === "breakout") {
      quantityMultiplier = 1.5 + Math.random() * 1.0; // Larger trades during breakouts
    } else if (state.phase === "consolidation") {
      quantityMultiplier = 0.6 + Math.random() * 0.4; // Smaller trades during consolidation
    } else if (isBurst) {
      quantityMultiplier = 1.2 + Math.random() * 0.8; // Larger trades during bursts
    }
    
    const quantity = roundToLotSize(
      (Math.random() * (config.maxQuantity - config.minQuantity) + config.minQuantity) * quantityMultiplier,
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
