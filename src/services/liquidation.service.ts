import { Position, IPosition } from "../models/position.model";
import { getCachedPrice } from "./market.service";
import { sendPositionUpdate, PositionUpdate } from "./websocket.service";
import { debitBalanceByAddress, creditBalanceByAddress } from "./balance.service";
import { calculateUnrealizedPnl, wouldBeLiquidated } from "./position.service";

// Liquidation check interval
let liquidationInterval: NodeJS.Timeout | null = null;

// Track liquidation stats
interface LiquidationStats {
  totalLiquidations: number;
  totalValueLiquidated: number;
  lastLiquidationAt: Date | null;
}

const liquidationStats: LiquidationStats = {
  totalLiquidations: 0,
  totalValueLiquidated: 0,
  lastLiquidationAt: null,
};

/**
 * Execute liquidation for a single position
 * When liquidated:
 * - Position is closed at the liquidation price
 * - User loses their remaining margin (absorbed by the system)
 * - Position status is set to "liquidated"
 */
async function executePositionLiquidation(
  position: IPosition,
  currentPrice: number
): Promise<boolean> {
  try {
    // Calculate the loss at liquidation
    // At liquidation, the unrealized PnL equals approximately -(margin - maintenanceMargin)
    const unrealizedPnl = calculateUnrealizedPnl(position, currentPrice);
    
    // The user's margin absorbs the loss
    // Any remaining margin after the loss goes back to the user
    // If loss > margin, that's "bad debt" (handled by insurance fund in production)
    const marginRemaining = position.margin + unrealizedPnl;
    
    // Update position status
    position.status = "liquidated";
    position.closedAt = new Date();
    position.lastUpdatedAt = new Date();
    position.realizedPnl += unrealizedPnl;
    position.unrealizedPnl = 0;
    
    // Store the final size before zeroing
    const liquidatedSize = position.size;
    const liquidatedNotional = position.entryPrice * liquidatedSize;
    
    // Zero out the position
    position.size = 0;
    position.margin = 0;
    position.leverage = 0;
    position.liquidationPrice = 0;
    
    await position.save();
    
    // Handle balance settlement
    // If there's any margin remaining after the loss, credit it back
    // This shouldn't happen at true liquidation price, but handle edge cases
    if (marginRemaining > 0) {
      await creditBalanceByAddress(
        position.userAddress,
        marginRemaining,
        `Liquidation settlement - ${position.marketSymbol}`,
        position.positionId
      );
    } else if (marginRemaining < 0) {
      // Bad debt - in production, this would come from an insurance fund
      // For now, we just log it
      console.warn(
        `⚠️ Bad debt from liquidation: $${Math.abs(marginRemaining).toFixed(2)} for position ${position.positionId}`
      );
    }
    
    // Broadcast liquidation event
    const update: PositionUpdate = {
      positionId: position.positionId,
      marketSymbol: position.marketSymbol,
      side: position.side,
      size: 0,
      entryPrice: position.entryPrice,
      markPrice: currentPrice,
      margin: 0,
      leverage: 0,
      unrealizedPnl: 0,
      realizedPnl: position.realizedPnl,
      liquidationPrice: 0,
      status: "liquidated",
      timestamp: Date.now(),
    };
    
    sendPositionUpdate(position.userAddress, update);
    
    // Update stats
    liquidationStats.totalLiquidations++;
    liquidationStats.totalValueLiquidated += liquidatedNotional;
    liquidationStats.lastLiquidationAt = new Date();
    
    console.log(
      `🔥 LIQUIDATION: ${position.side.toUpperCase()} ${liquidatedSize} ${position.marketSymbol} ` +
      `@ $${currentPrice.toFixed(2)} | User: ${position.userAddress.slice(0, 10)}... | ` +
      `Entry: $${position.entryPrice.toFixed(2)} | Loss: $${Math.abs(unrealizedPnl).toFixed(2)}`
    );
    
    return true;
  } catch (error) {
    console.error(`Failed to liquidate position ${position.positionId}:`, error);
    return false;
  }
}

/**
 * Scan all open positions for a specific market and liquidate underwater ones
 */
async function scanMarketForLiquidations(marketSymbol: string): Promise<number> {
  const currentPrice = getCachedPrice(marketSymbol);
  
  if (!currentPrice) {
    return 0;
  }
  
  // Find all open positions in this market
  const positions = await Position.find({
    marketSymbol: marketSymbol.toUpperCase(),
    status: "open",
    size: { $gt: 0 },
  });
  
  let liquidationCount = 0;
  
  for (const position of positions) {
    // Check if position should be liquidated
    if (wouldBeLiquidated(position, currentPrice)) {
      const success = await executePositionLiquidation(position, currentPrice);
      if (success) {
        liquidationCount++;
      }
    }
  }
  
  return liquidationCount;
}

/**
 * Scan all markets for liquidations
 */
async function scanAllMarketsForLiquidations(): Promise<void> {
  try {
    // Get all unique market symbols with open positions
    const markets = await Position.distinct("marketSymbol", { status: "open" });
    
    let totalLiquidations = 0;
    
    for (const marketSymbol of markets) {
      const count = await scanMarketForLiquidations(marketSymbol);
      totalLiquidations += count;
    }
    
    if (totalLiquidations > 0) {
      console.log(`🔥 Liquidation scan complete: ${totalLiquidations} positions liquidated`);
    }
  } catch (error) {
    console.error("Error during liquidation scan:", error);
  }
}

/**
 * Start the liquidation engine
 * @param intervalMs How often to check for liquidations (default: 1000ms / 1 second)
 */
export function startLiquidationEngine(intervalMs: number = 1000): void {
  if (liquidationInterval) {
    console.log("⚠️ Liquidation engine already running");
    return;
  }
  
  console.log(`🔥 Starting liquidation engine (checking every ${intervalMs}ms)`);
  
  // Run initial scan
  scanAllMarketsForLiquidations();
  
  // Set up periodic scanning
  liquidationInterval = setInterval(async () => {
    await scanAllMarketsForLiquidations();
  }, intervalMs);
}

/**
 * Stop the liquidation engine
 */
export function stopLiquidationEngine(): void {
  if (liquidationInterval) {
    clearInterval(liquidationInterval);
    liquidationInterval = null;
    console.log("🔥 Liquidation engine stopped");
  }
}

/**
 * Check if liquidation engine is running
 */
export function isLiquidationEngineRunning(): boolean {
  return liquidationInterval !== null;
}

/**
 * Get liquidation statistics
 */
export function getLiquidationStats(): LiquidationStats {
  return { ...liquidationStats };
}

/**
 * Manually trigger a liquidation check for a specific position
 * Useful for testing or immediate checks after price updates
 */
export async function checkPositionLiquidation(positionId: string): Promise<{
  shouldLiquidate: boolean;
  liquidated: boolean;
  currentPrice: number | null;
  liquidationPrice: number;
}> {
  const position = await Position.findOne({ positionId, status: "open" });
  
  if (!position) {
    return {
      shouldLiquidate: false,
      liquidated: false,
      currentPrice: null,
      liquidationPrice: 0,
    };
  }
  
  const currentPrice = getCachedPrice(position.marketSymbol);
  
  if (!currentPrice) {
    return {
      shouldLiquidate: false,
      liquidated: false,
      currentPrice: null,
      liquidationPrice: position.liquidationPrice,
    };
  }
  
  const shouldLiquidate = wouldBeLiquidated(position, currentPrice);
  let liquidated = false;
  
  if (shouldLiquidate) {
    liquidated = await executePositionLiquidation(position, currentPrice);
  }
  
  return {
    shouldLiquidate,
    liquidated,
    currentPrice,
    liquidationPrice: position.liquidationPrice,
  };
}

/**
 * Get all positions currently at risk of liquidation
 * Returns positions within a certain percentage of their liquidation price
 */
export async function getPositionsAtRiskOfLiquidation(
  riskThresholdPercent: number = 5
): Promise<Array<{
  position: IPosition;
  currentPrice: number;
  distanceToLiquidation: number;
  distancePercent: number;
}>> {
  const atRisk: Array<{
    position: IPosition;
    currentPrice: number;
    distanceToLiquidation: number;
    distancePercent: number;
  }> = [];
  
  // Get all open positions
  const positions = await Position.find({ status: "open", size: { $gt: 0 } });
  
  for (const position of positions) {
    const currentPrice = getCachedPrice(position.marketSymbol);
    
    if (!currentPrice || position.liquidationPrice === 0) {
      continue;
    }
    
    // Calculate distance to liquidation
    let distanceToLiquidation: number;
    let distancePercent: number;
    
    if (position.side === "long") {
      // Long positions: liquidated when price drops below liquidation price
      distanceToLiquidation = currentPrice - position.liquidationPrice;
      distancePercent = (distanceToLiquidation / currentPrice) * 100;
    } else {
      // Short positions: liquidated when price rises above liquidation price
      distanceToLiquidation = position.liquidationPrice - currentPrice;
      distancePercent = (distanceToLiquidation / currentPrice) * 100;
    }
    
    // Check if within risk threshold
    if (distancePercent <= riskThresholdPercent && distancePercent > 0) {
      atRisk.push({
        position,
        currentPrice,
        distanceToLiquidation,
        distancePercent,
      });
    }
  }
  
  // Sort by risk (closest to liquidation first)
  atRisk.sort((a, b) => a.distancePercent - b.distancePercent);
  
  return atRisk;
}
