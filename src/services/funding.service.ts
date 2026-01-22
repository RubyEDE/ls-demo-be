import { Market, IMarket } from "../models/market.model";
import { Position, IPosition } from "../models/position.model";
import { getCachedPrice, getMarketPriceWithFallback } from "./market.service";
import { getBestBid, getBestAsk } from "./orderbook.service";
import { creditBalanceByAddress, debitBalanceByAddress } from "./balance.service";
import { sendPositionUpdate, PositionUpdate, broadcastFundingUpdate, broadcastFundingPayment, FundingUpdate, FundingPaymentEvent } from "./websocket.service";
import { calculateUnrealizedPnl, calculateLiquidationPrice } from "./position.service";

// Funding rate configuration
const FUNDING_RATE_CAP = 0.01; // Max funding rate per interval (1%)
const FUNDING_RATE_FLOOR = -0.01; // Min funding rate per interval (-1%)
const PREMIUM_INDEX_DAMPENER = 0.1; // Dampening factor for premium calculation

// Funding engine state
let fundingInterval: NodeJS.Timeout | null = null;
let fundingBroadcastInterval: NodeJS.Timeout | null = null;
let isProcessingFunding = false;

// Funding history tracking
interface FundingPayment {
  marketSymbol: string;
  fundingRate: number;
  timestamp: Date;
  longPayment: number; // Positive = longs pay, negative = longs receive
  shortPayment: number; // Positive = shorts pay, negative = shorts receive
  totalLongSize: number;
  totalShortSize: number;
  positionsProcessed: number;
}

interface FundingHistory {
  payments: FundingPayment[];
  maxHistory: number;
}

const fundingHistory: Map<string, FundingHistory> = new Map();
const MAX_FUNDING_HISTORY = 100; // Keep last 100 funding events per market

// Stats tracking
interface FundingStats {
  totalFundingProcessed: number;
  totalPaymentsDistributed: number;
  lastFundingAt: Date | null;
}

const fundingStats: FundingStats = {
  totalFundingProcessed: 0,
  totalPaymentsDistributed: 0,
  lastFundingAt: null,
};

/**
 * Calculate the mark price for a market
 * Mark price = weighted average of best bid/ask, or oracle price if no orderbook
 */
export function calculateMarkPrice(marketSymbol: string): number | null {
  const oraclePrice = getCachedPrice(marketSymbol);
  const bestBid = getBestBid(marketSymbol);
  const bestAsk = getBestAsk(marketSymbol);
  
  // If we have both bid and ask, use mid-price weighted with oracle
  if (bestBid && bestAsk) {
    const midPrice = (bestBid + bestAsk) / 2;
    // Weight: 70% mid-price, 30% oracle (helps prevent manipulation)
    if (oraclePrice) {
      return midPrice * 0.7 + oraclePrice * 0.3;
    }
    return midPrice;
  }
  
  // Fall back to oracle price
  return oraclePrice;
}

/**
 * Calculate the funding rate for a market
 * Funding Rate = Premium Index + clamp(Interest Rate - Premium Index, 0.05%, -0.05%)
 * 
 * For simplicity, we use:
 * Funding Rate = clamp((Mark Price - Index Price) / Index Price * dampener, floor, cap)
 */
export function calculateFundingRate(marketSymbol: string): number {
  const markPrice = calculateMarkPrice(marketSymbol);
  const indexPrice = getCachedPrice(marketSymbol); // Oracle price as index
  
  if (!markPrice || !indexPrice || indexPrice === 0) {
    return 0;
  }
  
  // Premium = (Mark - Index) / Index
  const premium = (markPrice - indexPrice) / indexPrice;
  
  // Apply dampening and clamp to bounds
  let fundingRate = premium * PREMIUM_INDEX_DAMPENER;
  fundingRate = Math.max(FUNDING_RATE_FLOOR, Math.min(FUNDING_RATE_CAP, fundingRate));
  
  // Round to 6 decimal places
  return Math.round(fundingRate * 1000000) / 1000000;
}

/**
 * Get the predicted funding rate for display (doesn't modify state)
 */
export function getPredictedFundingRate(marketSymbol: string): {
  fundingRate: number;
  markPrice: number | null;
  indexPrice: number | null;
  premium: number;
  nextFundingTime: Date | null;
} {
  const markPrice = calculateMarkPrice(marketSymbol);
  const indexPrice = getCachedPrice(marketSymbol);
  const fundingRate = calculateFundingRate(marketSymbol);
  
  const premium = markPrice && indexPrice && indexPrice !== 0
    ? (markPrice - indexPrice) / indexPrice
    : 0;
  
  return {
    fundingRate,
    markPrice,
    indexPrice,
    premium,
    nextFundingTime: null, // Will be filled by caller from market data
  };
}

/**
 * Process funding payment for a single position
 */
async function processPositionFunding(
  position: IPosition,
  fundingRate: number,
  markPrice: number
): Promise<{ success: boolean; payment: number; error?: string }> {
  // Position value at mark price
  const positionValue = position.size * markPrice;
  
  // Funding payment calculation:
  // - Positive funding rate: longs pay shorts
  // - Negative funding rate: shorts pay longs
  // Payment = Position Value * Funding Rate
  
  let payment: number;
  if (position.side === "long") {
    // Long positions: pay when funding is positive, receive when negative
    payment = positionValue * fundingRate;
  } else {
    // Short positions: receive when funding is positive, pay when negative
    payment = -positionValue * fundingRate;
  }
  
  // Apply funding to position's margin
  // Negative payment means user pays (reduces margin/balance)
  // Positive payment means user receives (increases balance)
  
  if (payment < 0) {
    // User pays funding
    const paymentAmount = Math.abs(payment);
    
    // Deduct from user's balance
    const debitResult = await debitBalanceByAddress(
      position.userAddress,
      paymentAmount,
      `Funding payment for ${position.marketSymbol} ${position.side}`,
      `funding_${position.positionId}_${Date.now()}`
    );
    
    if (!debitResult.success) {
      // If user can't pay, deduct from margin (risk of liquidation)
      position.margin -= paymentAmount;
      
      // Recalculate liquidation price with new margin
      const market = await Market.findOne({ symbol: position.marketSymbol });
      if (market) {
        position.liquidationPrice = calculateLiquidationPrice(
          position.side,
          position.entryPrice,
          position.margin,
          position.size,
          market.maintenanceMarginRate
        );
      }
    }
  } else if (payment > 0) {
    // User receives funding
    await creditBalanceByAddress(
      position.userAddress,
      payment,
      `Funding received for ${position.marketSymbol} ${position.side}`,
      `funding_${position.positionId}_${Date.now()}`
    );
  }
  
  // Update position's accumulated funding
  position.accumulatedFunding += payment;
  position.lastFundingTime = new Date();
  position.lastUpdatedAt = new Date();
  
  await position.save();
  
  // Broadcast position update
  const positionUpdate: PositionUpdate = {
    positionId: position.positionId,
    marketSymbol: position.marketSymbol,
    side: position.side,
    size: position.size,
    entryPrice: position.entryPrice,
    markPrice,
    margin: position.margin,
    leverage: position.leverage,
    unrealizedPnl: calculateUnrealizedPnl(position, markPrice),
    realizedPnl: position.realizedPnl,
    liquidationPrice: position.liquidationPrice,
    status: position.status,
    timestamp: Date.now(),
  };
  
  sendPositionUpdate(position.userAddress, positionUpdate);
  
  return { success: true, payment };
}

/**
 * Process funding for all positions in a market
 */
async function processFundingForMarket(market: IMarket): Promise<FundingPayment | null> {
  const marketSymbol = market.symbol;
  const markPrice = calculateMarkPrice(marketSymbol);
  
  if (!markPrice) {
    console.warn(`⚠️ No mark price available for ${marketSymbol}, skipping funding`);
    return null;
  }
  
  // Calculate current funding rate
  const fundingRate = calculateFundingRate(marketSymbol);
  
  // Get all open positions for this market
  const positions = await Position.find({
    marketSymbol: marketSymbol.toUpperCase(),
    status: "open",
    size: { $gt: 0 },
  });
  
  if (positions.length === 0) {
    // Still update market's next funding time
    await updateMarketFundingTime(market);
    return null;
  }
  
  let totalLongSize = 0;
  let totalShortSize = 0;
  let totalLongPayment = 0;
  let totalShortPayment = 0;
  let positionsProcessed = 0;
  
  console.log(`💰 Processing funding for ${marketSymbol}: rate=${(fundingRate * 100).toFixed(4)}%, positions=${positions.length}`);
  
  for (const position of positions) {
    const result = await processPositionFunding(position, fundingRate, markPrice);
    
    if (result.success) {
      positionsProcessed++;
      
      if (position.side === "long") {
        totalLongSize += position.size;
        totalLongPayment += result.payment;
      } else {
        totalShortSize += position.size;
        totalShortPayment += result.payment;
      }
    } else {
      console.error(`Failed to process funding for position ${position.positionId}: ${result.error}`);
    }
  }
  
  // Update market's funding rate and next funding time
  market.fundingRate = fundingRate;
  await updateMarketFundingTime(market);
  
  // Record funding payment
  const fundingPayment: FundingPayment = {
    marketSymbol,
    fundingRate,
    timestamp: new Date(),
    longPayment: totalLongPayment,
    shortPayment: totalShortPayment,
    totalLongSize,
    totalShortSize,
    positionsProcessed,
  };
  
  // Add to history
  addFundingToHistory(marketSymbol, fundingPayment);
  
  // Broadcast funding payment event via WebSocket
  const paymentEvent: FundingPaymentEvent = {
    symbol: marketSymbol,
    fundingRate,
    totalLongPayment,
    totalShortPayment,
    positionsProcessed,
    timestamp: Date.now(),
  };
  broadcastFundingPayment(marketSymbol, paymentEvent);
  
  // Broadcast updated funding rate info
  broadcastFundingRateUpdate(marketSymbol, market);
  
  console.log(
    `✅ Funding processed for ${marketSymbol}: ` +
    `${positionsProcessed} positions, ` +
    `longs paid $${totalLongPayment.toFixed(2)}, ` +
    `shorts paid $${totalShortPayment.toFixed(2)}`
  );
  
  return fundingPayment;
}

/**
 * Update market's next funding time
 */
async function updateMarketFundingTime(market: IMarket): Promise<void> {
  const nextFundingTime = new Date();
  nextFundingTime.setHours(nextFundingTime.getHours() + market.fundingInterval);
  
  market.nextFundingTime = nextFundingTime;
  await market.save();
}

/**
 * Add funding payment to history
 */
function addFundingToHistory(marketSymbol: string, payment: FundingPayment): void {
  if (!fundingHistory.has(marketSymbol)) {
    fundingHistory.set(marketSymbol, {
      payments: [],
      maxHistory: MAX_FUNDING_HISTORY,
    });
  }
  
  const history = fundingHistory.get(marketSymbol)!;
  history.payments.unshift(payment);
  
  // Trim to max history
  if (history.payments.length > history.maxHistory) {
    history.payments = history.payments.slice(0, history.maxHistory);
  }
}

/**
 * Process funding for all markets that are due
 */
async function processAllFunding(): Promise<void> {
  if (isProcessingFunding) {
    console.log("⏳ Funding already being processed, skipping...");
    return;
  }
  
  isProcessingFunding = true;
  
  try {
    const now = new Date();
    
    // Find markets where funding is due
    const marketsToProcess = await Market.find({
      status: "active",
      nextFundingTime: { $lte: now },
    });
    
    if (marketsToProcess.length === 0) {
      return;
    }
    
    console.log(`\n💰 ======= FUNDING ROUND =======`);
    console.log(`📅 Time: ${now.toISOString()}`);
    console.log(`📊 Markets due: ${marketsToProcess.length}`);
    
    for (const market of marketsToProcess) {
      try {
        const result = await processFundingForMarket(market);
        
        if (result) {
          fundingStats.totalFundingProcessed++;
          fundingStats.totalPaymentsDistributed += result.positionsProcessed;
        }
      } catch (error) {
        console.error(`Error processing funding for ${market.symbol}:`, error);
      }
    }
    
    fundingStats.lastFundingAt = now;
    console.log(`💰 ======= FUNDING COMPLETE =======\n`);
    
  } finally {
    isProcessingFunding = false;
  }
}

/**
 * Start the funding rate engine
 * @param checkIntervalMs How often to check for due funding (default: 60 seconds)
 * @param broadcastIntervalMs How often to broadcast funding rate updates (default: 10 seconds)
 */
export function startFundingEngine(checkIntervalMs: number = 60000, broadcastIntervalMs: number = 10000): void {
  if (fundingInterval) {
    console.log("⚠️ Funding engine already running");
    return;
  }
  
  console.log(`💰 Starting funding rate engine (checking every ${checkIntervalMs / 1000}s, broadcasting every ${broadcastIntervalMs / 1000}s)`);
  
  // Initialize next funding times for markets that don't have one set
  initializeMarketFundingTimes();
  
  // Run initial check
  processAllFunding();
  
  // Broadcast funding rates immediately on startup
  setTimeout(() => {
    broadcastAllFundingRates();
  }, 2000);
  
  // Set up periodic checking for due funding
  fundingInterval = setInterval(async () => {
    await processAllFunding();
  }, checkIntervalMs);
  
  // Set up periodic broadcasting of funding rate predictions
  // This ensures frontend gets real-time updates even between funding events
  fundingBroadcastInterval = setInterval(async () => {
    await broadcastAllFundingRates();
  }, broadcastIntervalMs);
}

/**
 * Stop the funding rate engine
 */
export function stopFundingEngine(): void {
  if (fundingInterval) {
    clearInterval(fundingInterval);
    fundingInterval = null;
  }
  if (fundingBroadcastInterval) {
    clearInterval(fundingBroadcastInterval);
    fundingBroadcastInterval = null;
  }
  console.log("💰 Funding rate engine stopped");
}

/**
 * Check if funding engine is running
 */
export function isFundingEngineRunning(): boolean {
  return fundingInterval !== null;
}

/**
 * Initialize next funding times for all markets
 */
async function initializeMarketFundingTimes(): Promise<void> {
  const now = new Date();
  
  const markets = await Market.find({ status: "active" });
  
  for (const market of markets) {
    // If next funding time is in the past or not set, schedule it for the future
    if (!market.nextFundingTime || market.nextFundingTime <= now) {
      const nextFunding = new Date();
      // Round to nearest funding interval boundary (e.g., 00:00, 08:00, 16:00 for 8h interval)
      const hours = nextFunding.getUTCHours();
      const intervalHours = market.fundingInterval;
      const nextIntervalHour = Math.ceil(hours / intervalHours) * intervalHours;
      
      nextFunding.setUTCHours(nextIntervalHour, 0, 0, 0);
      
      // If that's in the past, add one interval
      if (nextFunding <= now) {
        nextFunding.setHours(nextFunding.getHours() + intervalHours);
      }
      
      market.nextFundingTime = nextFunding;
      await market.save();
      
      console.log(`   💰 ${market.symbol}: next funding at ${nextFunding.toISOString()}`);
    }
  }
}

/**
 * Get funding rate information for a market
 */
export async function getFundingRateInfo(marketSymbol: string): Promise<{
  marketSymbol: string;
  currentFundingRate: number;
  predictedFundingRate: number;
  markPrice: number | null;
  indexPrice: number | null;
  premium: number;
  nextFundingTime: Date | null;
  fundingInterval: number;
  lastFunding: FundingPayment | null;
} | null> {
  const market = await Market.findOne({ symbol: marketSymbol.toUpperCase() });
  
  if (!market) {
    return null;
  }
  
  const predicted = getPredictedFundingRate(marketSymbol);
  const history = fundingHistory.get(marketSymbol.toUpperCase());
  const lastFunding = history?.payments[0] || null;
  
  // Use fallback to get index price from cache or database
  const indexPrice = getMarketPriceWithFallback(marketSymbol, market);
  
  return {
    marketSymbol: market.symbol,
    currentFundingRate: market.fundingRate,
    predictedFundingRate: predicted.fundingRate,
    markPrice: predicted.markPrice,
    indexPrice: indexPrice, // Use fallback instead of predicted.indexPrice
    premium: predicted.premium,
    nextFundingTime: market.nextFundingTime,
    fundingInterval: market.fundingInterval,
    lastFunding,
  };
}

/**
 * Get funding history for a market
 */
export function getFundingHistory(
  marketSymbol: string,
  limit: number = 20
): FundingPayment[] {
  const history = fundingHistory.get(marketSymbol.toUpperCase());
  
  if (!history) {
    return [];
  }
  
  return history.payments.slice(0, limit);
}

/**
 * Get global funding stats
 */
export function getFundingStats(): FundingStats & { isRunning: boolean } {
  return {
    ...fundingStats,
    isRunning: isFundingEngineRunning(),
  };
}

/**
 * Manually trigger funding for a specific market (for testing)
 */
export async function triggerFundingForMarket(marketSymbol: string): Promise<FundingPayment | null> {
  const market = await Market.findOne({ symbol: marketSymbol.toUpperCase() });
  
  if (!market) {
    console.warn(`Market ${marketSymbol} not found`);
    return null;
  }
  
  return processFundingForMarket(market);
}

/**
 * Get estimated funding payment for a position
 */
export function getEstimatedFundingPayment(
  marketSymbol: string,
  side: "long" | "short",
  size: number
): {
  fundingRate: number;
  estimatedPayment: number;
  paymentDirection: "pay" | "receive";
} {
  const markPrice = calculateMarkPrice(marketSymbol);
  const fundingRate = calculateFundingRate(marketSymbol);
  
  if (!markPrice) {
    return {
      fundingRate: 0,
      estimatedPayment: 0,
      paymentDirection: "pay",
    };
  }
  
  const positionValue = size * markPrice;
  
  let payment: number;
  if (side === "long") {
    payment = positionValue * fundingRate;
  } else {
    payment = -positionValue * fundingRate;
  }
  
  return {
    fundingRate,
    estimatedPayment: Math.abs(payment),
    paymentDirection: payment < 0 ? "pay" : "receive",
  };
}

/**
 * Calculate annualized funding rate
 */
export function getAnnualizedFundingRate(fundingRate: number, fundingInterval: number): number {
  // Number of funding periods per year
  const periodsPerYear = (365 * 24) / fundingInterval;
  
  // Annualized rate (simple, not compounded)
  return fundingRate * periodsPerYear;
}

/**
 * Broadcast funding rate update via WebSocket
 */
function broadcastFundingRateUpdate(marketSymbol: string, market: IMarket): void {
  const predicted = getPredictedFundingRate(marketSymbol);
  
  const update: FundingUpdate = {
    symbol: marketSymbol,
    fundingRate: market.fundingRate,
    predictedFundingRate: predicted.fundingRate,
    markPrice: predicted.markPrice || 0,
    indexPrice: predicted.indexPrice || 0,
    premium: predicted.premium,
    nextFundingTime: market.nextFundingTime?.getTime() || 0,
    timestamp: Date.now(),
  };
  
  broadcastFundingUpdate(marketSymbol, update);
}

/**
 * Periodically broadcast predicted funding rates for all markets
 * Called separately to provide real-time funding rate predictions
 */
export async function broadcastAllFundingRates(): Promise<void> {
  try {
    const markets = await Market.find({ status: "active" });
    
    for (const market of markets) {
      broadcastFundingRateUpdate(market.symbol, market);
    }
  } catch (error) {
    console.error("Error broadcasting funding rates:", error);
  }
}
