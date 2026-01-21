import { v4 as uuidv4 } from "uuid";
import { Position, IPosition, PositionSide } from "../models/position.model";
import { getMarket, getCachedPrice } from "./market.service";
import { sendPositionUpdate, PositionUpdate } from "./websocket.service";
import { lockBalanceByAddress, unlockBalanceByAddress, creditBalanceByAddress } from "./balance.service";
import { 
  checkHighLeverageAchievement,
  checkFirstProfitableCloseAchievement,
  checkFirstLosingCloseAchievement,
} from "./achievement.service";

interface OpenPositionParams {
  marketSymbol: string;
  userAddress: string;
  side: PositionSide;
  size: number;
  entryPrice: number;
  margin: number;
}

interface UpdatePositionParams {
  position: IPosition;
  sizeDelta: number;      // Positive = increase, negative = decrease
  executionPrice: number;
  isReducing: boolean;
}

interface PositionResult {
  success: boolean;
  position?: IPosition;
  realizedPnl?: number;
  error?: string;
}

/**
 * Get or create a position for a user in a market
 */
export async function getOpenPosition(
  userAddress: string,
  marketSymbol: string
): Promise<IPosition | null> {
  return Position.findOne({
    userAddress: userAddress.toLowerCase(),
    marketSymbol: marketSymbol.toUpperCase(),
    status: "open",
  });
}

/**
 * Get all open positions for a user
 */
export async function getUserPositions(userAddress: string): Promise<IPosition[]> {
  const positions = await Position.find({
    userAddress: userAddress.toLowerCase(),
    status: "open",
  }).sort({ openedAt: -1 });
  
  // Update unrealized PnL for each position with current prices
  for (const position of positions) {
    const currentPrice = getCachedPrice(position.marketSymbol);
    if (currentPrice) {
      position.unrealizedPnl = calculateUnrealizedPnl(position, currentPrice);
    }
  }
  
  return positions;
}

/**
 * Get position history for a user
 */
export async function getPositionHistory(
  userAddress: string,
  marketSymbol?: string,
  limit: number = 50,
  offset: number = 0
): Promise<IPosition[]> {
  const query: Record<string, unknown> = {
    userAddress: userAddress.toLowerCase(),
    status: { $in: ["closed", "liquidated"] },
  };
  
  if (marketSymbol) {
    query.marketSymbol = marketSymbol.toUpperCase();
  }
  
  return Position.find(query)
    .sort({ closedAt: -1 })
    .skip(offset)
    .limit(limit);
}

/**
 * Calculate unrealized PnL for a position
 */
export function calculateUnrealizedPnl(position: IPosition, currentPrice: number): number {
  if (position.size === 0) return 0;
  
  const priceDiff = currentPrice - position.entryPrice;
  
  if (position.side === "long") {
    // Long: profit when price goes up
    return priceDiff * position.size;
  } else {
    // Short: profit when price goes down
    return -priceDiff * position.size;
  }
}

/**
 * Calculate liquidation price for a position
 * 
 * The liquidation price is where: equity = maintenance margin (at mark price)
 * 
 * For LONG positions:
 *   margin + (L - entryPrice) * size = L * size * MMR
 *   Solving for L: L = (entryPrice * size - margin) / (size * (1 - MMR))
 * 
 * For SHORT positions:
 *   margin - (L - entryPrice) * size = L * size * MMR
 *   Solving for L: L = (entryPrice * size + margin) / (size * (1 + MMR))
 */
export function calculateLiquidationPrice(
  side: PositionSide,
  entryPrice: number,
  margin: number,
  size: number,
  maintenanceMarginRate: number
): number {
  if (size === 0) return 0;
  
  // Ensure MMR is valid (should be between 0 and 1)
  const mmr = Math.max(0.001, Math.min(0.99, maintenanceMarginRate));
  
  if (side === "long") {
    // Long: liquidated when price drops
    // L = (entryPrice * size - margin) / (size * (1 - MMR))
    const numerator = entryPrice * size - margin;
    const denominator = size * (1 - mmr);
    const liquidationPrice = numerator / denominator;
    return Math.max(0, liquidationPrice);
  } else {
    // Short: liquidated when price rises
    // L = (entryPrice * size + margin) / (size * (1 + MMR))
    const numerator = entryPrice * size + margin;
    const denominator = size * (1 + mmr);
    return numerator / denominator;
  }
}

/**
 * Open a new position
 */
export async function openPosition(params: OpenPositionParams): Promise<PositionResult> {
  const { marketSymbol, userAddress, side, size, entryPrice, margin } = params;
  
  const market = await getMarket(marketSymbol);
  if (!market) {
    return { success: false, error: "Market not found" };
  }
  
  // Calculate liquidation price
  const liquidationPrice = calculateLiquidationPrice(
    side,
    entryPrice,
    margin,
    size,
    market.maintenanceMarginRate
  );
  
  // Calculate leverage
  const notionalValue = entryPrice * size;
  const leverage = notionalValue / margin;
  
  const position = new Position({
    positionId: `POS-${uuidv4()}`,
    marketSymbol: market.symbol,
    userAddress: userAddress.toLowerCase(),
    side,
    size,
    entryPrice,
    margin,
    leverage,
    unrealizedPnl: 0,
    realizedPnl: 0,
    liquidationPrice,
    totalFeesPaid: 0,
    accumulatedFunding: 0,
    lastFundingTime: new Date(),
    status: "open",
    openedAt: new Date(),
    lastUpdatedAt: new Date(),
  });
  
  await position.save();
  
  // Notify user via WebSocket
  broadcastPositionUpdate(position, getCachedPrice(marketSymbol) || entryPrice);
  
  console.log(`📊 Opened ${side} position for ${userAddress}: ${size} ${marketSymbol} @ $${entryPrice}`);
  
  // Check for high leverage achievement
  try {
    await checkHighLeverageAchievement(userAddress, leverage);
  } catch (error) {
    console.error(`❌ Error checking high leverage achievement:`, error);
  }
  
  return { success: true, position };
}

/**
 * Increase position size (add to existing position)
 */
export async function increasePosition(
  position: IPosition,
  additionalSize: number,
  executionPrice: number,
  additionalMargin: number
): Promise<PositionResult> {
  const market = await getMarket(position.marketSymbol);
  if (!market) {
    return { success: false, error: "Market not found" };
  }
  
  // Calculate new average entry price
  const totalValue = (position.entryPrice * position.size) + (executionPrice * additionalSize);
  const newSize = position.size + additionalSize;
  const newEntryPrice = totalValue / newSize;
  
  // Update position
  position.size = newSize;
  position.entryPrice = newEntryPrice;
  position.margin += additionalMargin;
  
  // Recalculate leverage and liquidation price
  const notionalValue = newEntryPrice * newSize;
  position.leverage = notionalValue / position.margin;
  position.liquidationPrice = calculateLiquidationPrice(
    position.side,
    newEntryPrice,
    position.margin,
    newSize,
    market.maintenanceMarginRate
  );
  
  position.lastUpdatedAt = new Date();
  await position.save();
  
  // Notify user
  broadcastPositionUpdate(position, getCachedPrice(position.marketSymbol) || executionPrice);
  
  console.log(`📊 Increased position ${position.positionId}: +${additionalSize} @ $${executionPrice}`);
  
  // Check for high leverage achievement
  try {
    await checkHighLeverageAchievement(position.userAddress, position.leverage);
  } catch (error) {
    console.error(`❌ Error checking high leverage achievement:`, error);
  }
  
  return { success: true, position };
}

/**
 * Decrease position size (partial close)
 */
export async function decreasePosition(
  position: IPosition,
  closeSize: number,
  executionPrice: number
): Promise<PositionResult> {
  if (closeSize > position.size) {
    return { success: false, error: "Close size exceeds position size" };
  }
  
  const market = await getMarket(position.marketSymbol);
  if (!market) {
    return { success: false, error: "Market not found" };
  }
  
  // Calculate realized PnL for the closed portion
  const priceDiff = executionPrice - position.entryPrice;
  let realizedPnl: number;
  
  if (position.side === "long") {
    realizedPnl = priceDiff * closeSize;
  } else {
    realizedPnl = -priceDiff * closeSize;
  }
  
  // Calculate margin to release (proportional to size closed)
  const marginToRelease = (closeSize / position.size) * position.margin;
  
  // Update position
  position.size -= closeSize;
  position.realizedPnl += realizedPnl;
  position.margin -= marginToRelease;
  position.lastUpdatedAt = new Date();
  
  // Release margin + PnL to user
  const totalReturn = marginToRelease + realizedPnl;
  if (totalReturn > 0) {
    await creditBalanceByAddress(
      position.userAddress,
      totalReturn,
      `Closed ${closeSize} ${position.marketSymbol} - PnL: ${realizedPnl >= 0 ? '+' : ''}$${realizedPnl.toFixed(2)}`,
      position.positionId
    );
  }
  
  if (position.size === 0) {
    // Position fully closed
    position.status = "closed";
    position.closedAt = new Date();
    position.liquidationPrice = 0;
    position.leverage = 0;
  } else {
    // Recalculate liquidation price for remaining position
    position.liquidationPrice = calculateLiquidationPrice(
      position.side,
      position.entryPrice,
      position.margin,
      position.size,
      market.maintenanceMarginRate
    );
    position.leverage = (position.entryPrice * position.size) / position.margin;
  }
  
  await position.save();
  
  // Notify user
  broadcastPositionUpdate(position, getCachedPrice(position.marketSymbol) || executionPrice);
  
  console.log(`📊 Decreased position ${position.positionId}: -${closeSize} @ $${executionPrice}, realized PnL: $${realizedPnl.toFixed(2)}`);
  
  // Check for profit/loss close achievements
  try {
    if (realizedPnl > 0) {
      await checkFirstProfitableCloseAchievement(position.userAddress, realizedPnl);
    } else if (realizedPnl < 0) {
      await checkFirstLosingCloseAchievement(position.userAddress, realizedPnl);
    }
  } catch (error) {
    console.error(`❌ Error checking close achievements:`, error);
  }
  
  return { success: true, position, realizedPnl };
}

/**
 * Close entire position
 */
export async function closePosition(
  position: IPosition,
  executionPrice: number
): Promise<PositionResult> {
  return decreasePosition(position, position.size, executionPrice);
}

/**
 * Handle a trade execution - update or create position
 */
export async function handleTradeExecution(
  userAddress: string,
  marketSymbol: string,
  tradeSide: "buy" | "sell",
  tradeSize: number,
  executionPrice: number,
  marginUsed: number
): Promise<PositionResult> {
  const market = await getMarket(marketSymbol);
  if (!market) {
    return { success: false, error: "Market not found" };
  }
  
  // Determine position side from trade side
  // Buy = going long or closing short
  // Sell = going short or closing long
  const positionSide: PositionSide = tradeSide === "buy" ? "long" : "short";
  
  // Get existing position
  const existingPosition = await getOpenPosition(userAddress, marketSymbol);
  
  if (!existingPosition) {
    // No existing position - open new one
    return openPosition({
      marketSymbol,
      userAddress,
      side: positionSide,
      size: tradeSize,
      entryPrice: executionPrice,
      margin: marginUsed,
    });
  }
  
  // Existing position exists
  if (existingPosition.side === positionSide) {
    // Same direction - increase position
    return increasePosition(existingPosition, tradeSize, executionPrice, marginUsed);
  } else {
    // Opposite direction - reduce or flip position
    if (tradeSize <= existingPosition.size) {
      // Just reducing position
      // First unlock the margin that was locked for this order since we're closing
      await unlockBalanceByAddress(userAddress, marginUsed, "Margin returned - closing position");
      return decreasePosition(existingPosition, tradeSize, executionPrice);
    } else {
      // Closing and opening opposite position
      const closeSize = existingPosition.size;
      const newPositionSize = tradeSize - closeSize;
      
      // First close existing position
      const closeResult = await closePosition(existingPosition, executionPrice);
      if (!closeResult.success) {
        return closeResult;
      }
      
      // Calculate margin for new position (proportional)
      const newMargin = (newPositionSize / tradeSize) * marginUsed;
      
      // Return excess margin
      const excessMargin = marginUsed - newMargin;
      if (excessMargin > 0) {
        await unlockBalanceByAddress(userAddress, excessMargin, "Excess margin returned");
      }
      
      // Open new position in opposite direction
      return openPosition({
        marketSymbol,
        userAddress,
        side: positionSide,
        size: newPositionSize,
        entryPrice: executionPrice,
        margin: newMargin,
      });
    }
  }
}

/**
 * Update unrealized PnL for all open positions in a market
 * Called when oracle price updates
 */
export async function updatePositionsPnl(marketSymbol: string, currentPrice: number): Promise<void> {
  const positions = await Position.find({
    marketSymbol: marketSymbol.toUpperCase(),
    status: "open",
  });
  
  for (const position of positions) {
    const newUnrealizedPnl = calculateUnrealizedPnl(position, currentPrice);
    
    // Only update if changed significantly (avoid too many DB writes)
    if (Math.abs(newUnrealizedPnl - position.unrealizedPnl) > 0.01) {
      position.unrealizedPnl = newUnrealizedPnl;
      position.lastUpdatedAt = new Date();
      await position.save();
      
      // Notify user
      broadcastPositionUpdate(position, currentPrice);
    }
  }
}

/**
 * Get position summary for a user
 */
export async function getPositionSummary(userAddress: string): Promise<{
  totalPositions: number;
  totalMargin: number;
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  positions: IPosition[];
}> {
  const positions = await getUserPositions(userAddress);
  
  let totalMargin = 0;
  let totalUnrealizedPnl = 0;
  let totalRealizedPnl = 0;
  
  for (const position of positions) {
    totalMargin += position.margin;
    totalUnrealizedPnl += position.unrealizedPnl;
    totalRealizedPnl += position.realizedPnl;
  }
  
  return {
    totalPositions: positions.length,
    totalMargin,
    totalUnrealizedPnl,
    totalRealizedPnl,
    positions,
  };
}

/**
 * Helper to broadcast position update via WebSocket
 */
function broadcastPositionUpdate(position: IPosition, currentPrice: number): void {
  const update: PositionUpdate = {
    positionId: position.positionId,
    marketSymbol: position.marketSymbol,
    side: position.side,
    size: position.size,
    entryPrice: position.entryPrice,
    markPrice: currentPrice,
    margin: position.margin,
    leverage: position.leverage,
    unrealizedPnl: calculateUnrealizedPnl(position, currentPrice),
    realizedPnl: position.realizedPnl,
    liquidationPrice: position.liquidationPrice,
    status: position.status,
    timestamp: Date.now(),
  };
  
  sendPositionUpdate(position.userAddress, update);
}

/**
 * Check if a position would be liquidated at a given price
 */
export function wouldBeLiquidated(position: IPosition, price: number): boolean {
  if (position.status !== "open" || position.size === 0) return false;
  
  if (position.side === "long") {
    return price <= position.liquidationPrice;
  } else {
    return price >= position.liquidationPrice;
  }
}

/**
 * Get all positions at risk of liquidation
 */
export async function getPositionsAtRisk(marketSymbol: string, currentPrice: number): Promise<IPosition[]> {
  const positions = await Position.find({
    marketSymbol: marketSymbol.toUpperCase(),
    status: "open",
  });
  
  return positions.filter((p) => wouldBeLiquidated(p, currentPrice));
}
