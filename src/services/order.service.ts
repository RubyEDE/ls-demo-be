import { v4 as uuidv4 } from "uuid";
import { Order, IOrder, OrderSide, OrderType } from "../models/order.model";
import { Trade, ITrade } from "../models/trade.model";
import { getMarket, roundToTickSize, roundToLotSize, getCachedPrice, updateOraclePrice } from "./market.service";
import { IMarket } from "../models/market.model";
import { 
  addToOrderBook, 
  removeFromOrderBook, 
  getOrCreateOrderBook,
  broadcastOrderBook 
} from "./orderbook.service";
import { 
  broadcastTradeExecuted, 
  sendOrderUpdate, 
  sendBalanceUpdate 
} from "./websocket.service";
import { lockBalanceByAddress, unlockBalanceByAddress, getBalanceByAddress } from "./balance.service";
import { handleTradeExecution, getOpenPosition } from "./position.service";
import { updateCandleFromTrade } from "./candle.service";
import { 
  checkFirstOrderAchievement, 
  checkFirstMarketOrderAchievement,
  checkFirstLimitOrderAchievement,
  checkTradeCountAchievements,
  AchievementUnlockResult 
} from "./achievement.service";
import { awardTradeXP, awardPositionClosedXP } from "./leveling.service";
import { getEffectiveMaxLeverageByAddress } from "./talent.service";

// Default prices for markets when oracle is unavailable (fallback)
const DEFAULT_PRICES: Record<string, number> = {
  "AK47-REDLINE-PERP": 45.00,
  "GLOVE-CASE-PERP": 25.00,
  "WEAPON-CASE-3-PERP": 15.00,
};

/**
 * Get price for a market with fallbacks:
 * 1. Check in-memory price cache
 * 2. Check market's oraclePrice from database
 * 3. Fall back to default price
 */
function getMarketPriceWithFallback(symbol: string, market: IMarket): number | null {
  // First try the cached price (from recent Steam API fetch)
  const cachedPrice = getCachedPrice(symbol);
  if (cachedPrice && cachedPrice > 0) {
    return cachedPrice;
  }
  
  // Try the market's oracle price from database (may be from previous server run)
  if (market.oraclePrice && market.oraclePrice > 0) {
    // Also update the cache so subsequent calls are fast
    updateOraclePrice(symbol, market.oraclePrice);
    return market.oraclePrice;
  }
  
  // Fall back to default price
  const defaultPrice = DEFAULT_PRICES[symbol.toUpperCase()];
  if (defaultPrice) {
    // Update cache with default price
    updateOraclePrice(symbol, defaultPrice);
    return defaultPrice;
  }
  
  return null;
}

interface PlaceOrderParams {
  marketSymbol: string;
  userAddress: string;
  side: OrderSide;
  type: OrderType;
  price?: number;
  quantity: number;
  leverage?: number;  // User-specified leverage (1 to maxLeverage), defaults to maxLeverage
  postOnly?: boolean;
  reduceOnly?: boolean;
}

interface PlaceOrderResult {
  success: boolean;
  order?: IOrder;
  trades?: ITrade[];
  realizedPnl?: number;  // Total realized PnL if this order closed/reduced a position
  error?: string;
  newAchievements?: AchievementUnlockResult[];
}

interface CancelOrderResult {
  success: boolean;
  order?: IOrder;
  error?: string;
}

/**
 * Place a new order
 */
export async function placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult> {
  const {
    marketSymbol,
    userAddress,
    side,
    type,
    price,
    quantity,
    leverage: requestedLeverage,
    postOnly = false,
    reduceOnly = false,
  } = params;
  
  // Validate market
  const market = await getMarket(marketSymbol);
  if (!market) {
    return { success: false, error: "Market not found" };
  }
  
  if (market.status !== "active") {
    return { success: false, error: "Market is not active" };
  }
  
  // Get user's effective max leverage (base + talent bonus)
  const effectiveMaxLeverage = await getEffectiveMaxLeverageByAddress(userAddress, market.maxLeverage);
  
  // Validate and set leverage (default to market's base max leverage if not specified)
  const leverage = requestedLeverage ?? market.maxLeverage;
  if (leverage < 1 || leverage > effectiveMaxLeverage) {
    return { success: false, error: `Leverage must be between 1 and ${effectiveMaxLeverage}x (${market.maxLeverage}x base + ${effectiveMaxLeverage - market.maxLeverage}x talent bonus)` };
  }
  
  // Validate quantity (must be positive)
  if (quantity <= 0) {
    return { success: false, error: "Order quantity must be greater than 0" };
  }
  
  // Round to lot size
  let roundedQuantity = roundToLotSize(quantity, market.lotSize);
  
  // For reduceOnly orders, cap quantity to actual position size
  // This handles cases where position size doesn't align with lot size
  if (reduceOnly) {
    const position = await getOpenPosition(userAddress, marketSymbol);
    if (position) {
      // Check if this order would reduce the position (opposite side)
      const wouldReduce = (position.side === "long" && side === "sell") || 
                          (position.side === "short" && side === "buy");
      if (wouldReduce) {
        // Use the smaller of rounded quantity or exact position size
        // This allows closing fractional positions that don't align with lot size
        roundedQuantity = Math.min(roundedQuantity, position.size);
        if (roundedQuantity <= 0) {
          return { success: false, error: "No position to reduce" };
        }
      }
    } else {
      return { success: false, error: "No position to reduce" };
    }
  }
  
  // For market orders, get the oracle price (with fallbacks)
  let orderPrice: number;
  if (type === "market") {
    const oraclePrice = getMarketPriceWithFallback(marketSymbol, market);
    if (!oraclePrice) {
      return { success: false, error: "No price available for market" };
    }
    // Use a price far from market to ensure fill
    orderPrice = side === "buy" ? oraclePrice * 1.1 : oraclePrice * 0.9;
  } else {
    if (!price || price <= 0) {
      return { success: false, error: "Price is required for limit orders" };
    }
    orderPrice = roundToTickSize(price, market.tickSize);
  }
  
  // Calculate required margin based on leverage
  // margin = notionalValue / leverage
  const notionalValue = orderPrice * roundedQuantity;
  const requiredMargin = notionalValue / leverage;
  
  // Generate order ID upfront so we can use it for both the lock reference and order
  const orderId = `ORD-${uuidv4()}`;
  
  // Lock balance for the order (skip for reduceOnly - closing positions releases margin, doesn't require it)
  if (!reduceOnly) {
    const lockResult = await lockBalanceByAddress(
      userAddress,
      requiredMargin,
      `Order margin for ${marketSymbol}`,
      orderId  // Use the same ID for traceability
    );
    
    if (!lockResult.success) {
      // Get current balance to show helpful error
      const balance = await getBalanceByAddress(userAddress);
      const available = balance?.free ?? 0;
      return { 
        success: false, 
        error: `Insufficient balance. Required: $${requiredMargin.toFixed(2)}, Available: $${available.toFixed(2)}` 
      };
    }
  }
  
  // Create the order
  const order = new Order({
    orderId,
    marketSymbol: market.symbol,
    userId: null, // We use address for now
    userAddress: userAddress.toLowerCase(),
    side,
    type,
    price: orderPrice,
    quantity: roundedQuantity,
    filledQuantity: 0,
    remainingQuantity: roundedQuantity,
    averagePrice: 0,
    leverage,
    isSynthetic: false,
    postOnly,
    reduceOnly,
    status: "pending",
  });
  
  // Try to match the order - wrapped in try/catch to ensure margin is unlocked on failure
  let trades: ITrade[];
  let remainingOrder: IOrder;
  let realizedPnl: number = 0;
  try {
    const matchResult = await matchOrder(order);
    trades = matchResult.trades;
    remainingOrder = matchResult.remainingOrder;
    realizedPnl = matchResult.realizedPnl;
  } catch (error) {
    // Unlock margin on matching failure (only if we locked it)
    if (!reduceOnly) {
      await unlockBalanceByAddress(userAddress, requiredMargin, `Order matching failed: ${orderId}`);
    }
    console.error(`❌ Order matching failed for ${orderId}:`, error);
    return { success: false, error: "Order matching failed. Please try again." };
  }
  
  // If post-only and would have matched, cancel
  if (postOnly && trades.length > 0) {
    // Unlock the margin (only if we locked it - reduceOnly orders don't lock margin)
    if (!reduceOnly) {
      await unlockBalanceByAddress(userAddress, requiredMargin, "Post-only order would have matched");
    }
    return { success: false, error: "Post-only order would have matched immediately" };
  }
  
  // Update order status
  if (remainingOrder.remainingQuantity === 0) {
    remainingOrder.status = "filled";
    remainingOrder.filledAt = new Date();
  } else if (remainingOrder.filledQuantity > 0) {
    remainingOrder.status = "partial";
  } else {
    remainingOrder.status = "open";
  }
  
  // Save order - also wrapped in try/catch
  try {
    await remainingOrder.save();
  } catch (error) {
    // Unlock margin on save failure (only if we locked it and order wasn't filled)
    // For filled orders, the margin is now part of position, so don't unlock
    if (!reduceOnly && remainingOrder.remainingQuantity > 0) {
      const remainingMargin = (remainingOrder.price * remainingOrder.remainingQuantity) / leverage;
      await unlockBalanceByAddress(userAddress, remainingMargin, `Order save failed: ${orderId}`);
    }
    console.error(`❌ Order save failed for ${orderId}:`, error);
    return { success: false, error: "Order could not be saved. Please try again." };
  }
  
  // Add remaining quantity to order book if limit order
  if (type === "limit" && remainingOrder.remainingQuantity > 0) {
    addToOrderBook(remainingOrder);
  }
  
  // Notify user
  sendOrderUpdate(userAddress, "order:created", {
    orderId: remainingOrder.orderId,
    symbol: remainingOrder.marketSymbol,
    side: remainingOrder.side,
    type: remainingOrder.type,
    price: remainingOrder.price,
    quantity: remainingOrder.quantity,
    filledQuantity: remainingOrder.filledQuantity,
    status: remainingOrder.status,
    timestamp: Date.now(),
  });
  
  // If fully filled, also send filled event
  if (remainingOrder.status === "filled") {
    sendOrderUpdate(userAddress, "order:filled", {
      orderId: remainingOrder.orderId,
      symbol: remainingOrder.marketSymbol,
      side: remainingOrder.side,
      type: remainingOrder.type,
      price: remainingOrder.averagePrice,
      quantity: remainingOrder.quantity,
      filledQuantity: remainingOrder.filledQuantity,
      status: remainingOrder.status,
      timestamp: Date.now(),
    });
  }
  
  // Check for order achievements
  const newAchievements: AchievementUnlockResult[] = [];
  try {
    console.log(`🔍 Checking order achievements for ${userAddress}...`);
    
    // Check first order achievement (any order type)
    const firstOrderAchievement = await checkFirstOrderAchievement(userAddress);
    if (firstOrderAchievement) {
      console.log(`✅ First order achievement result:`, firstOrderAchievement.achievement.name);
      newAchievements.push(firstOrderAchievement);
    }
    
    // Check order type-specific achievements
    if (type === "market") {
      const marketOrderAchievement = await checkFirstMarketOrderAchievement(userAddress);
      if (marketOrderAchievement) {
        console.log(`✅ First market order achievement result:`, marketOrderAchievement.achievement.name);
        newAchievements.push(marketOrderAchievement);
      }
    } else if (type === "limit") {
      const limitOrderAchievement = await checkFirstLimitOrderAchievement(userAddress);
      if (limitOrderAchievement) {
        console.log(`✅ First limit order achievement result:`, limitOrderAchievement.achievement.name);
        newAchievements.push(limitOrderAchievement);
      }
    }
    
    // Check trade count achievements if any trades were executed
    if (trades.length > 0) {
      const tradeCountAchievements = await checkTradeCountAchievements(userAddress);
      if (tradeCountAchievements.length > 0) {
        newAchievements.push(...tradeCountAchievements);
      }
    }
  } catch (error) {
    console.error(`❌ Error checking order achievements:`, error);
  }
  
  return {
    success: true,
    order: remainingOrder,
    trades,
    realizedPnl: realizedPnl !== 0 ? realizedPnl : undefined,  // Only include if there was PnL
    newAchievements: newAchievements.length > 0 ? newAchievements : undefined,
  };
}

/**
 * Match an order against the book
 */
async function matchOrder(order: IOrder): Promise<{ trades: ITrade[]; remainingOrder: IOrder; realizedPnl: number }> {
  const trades: ITrade[] = [];
  const book = getOrCreateOrderBook(order.marketSymbol);
  
  // Get opposite side of the book
  const oppositeSide = order.side === "buy" ? book.asks : book.bids;
  
  // Sort by price (best first)
  const sortedPrices = Array.from(oppositeSide.keys()).sort((a, b) => 
    order.side === "buy" ? a - b : b - a
  );
  
  let filledQuantity = 0;
  let totalCost = 0;
  let totalRealizedPnl = 0;  // Track PnL from closing positions
  
  for (const price of sortedPrices) {
    // Check if price is acceptable
    if (order.side === "buy" && price > order.price) break;
    if (order.side === "sell" && price < order.price) break;
    
    // Get orders at this price level
    const ordersAtPrice = await Order.find({
      marketSymbol: order.marketSymbol,
      side: order.side === "buy" ? "sell" : "buy",
      price,
      status: { $in: ["open", "partial"] },
    }).sort({ createdAt: 1 });
    
    for (const makerOrder of ordersAtPrice) {
      if (order.remainingQuantity <= 0) break;
      
      // Calculate fill quantity
      const fillQty = Math.min(order.remainingQuantity, makerOrder.remainingQuantity);
      
      // Create trade
      const trade = new Trade({
        tradeId: `TRD-${uuidv4()}`,
        marketSymbol: order.marketSymbol,
        makerOrderId: makerOrder.orderId,
        makerAddress: makerOrder.userAddress,
        makerIsSynthetic: makerOrder.isSynthetic,
        takerOrderId: order.orderId,
        takerAddress: order.userAddress,
        takerIsSynthetic: order.isSynthetic,
        side: order.side,
        price: makerOrder.price,
        quantity: fillQty,
        quoteQuantity: makerOrder.price * fillQty,
        makerFee: 0,
        takerFee: 0,
      });
      
      await trade.save();
      trades.push(trade);
      
      // Update quantities
      order.filledQuantity += fillQty;
      order.remainingQuantity -= fillQty;
      filledQuantity += fillQty;
      totalCost += makerOrder.price * fillQty;
      
      makerOrder.filledQuantity += fillQty;
      makerOrder.remainingQuantity -= fillQty;
      
      // Update maker order status
      if (makerOrder.remainingQuantity === 0) {
        makerOrder.status = "filled";
        makerOrder.filledAt = new Date();
      } else {
        makerOrder.status = "partial";
      }
      
      // Update maker's average price
      if (makerOrder.filledQuantity > 0) {
        makerOrder.averagePrice = 
          (makerOrder.averagePrice * (makerOrder.filledQuantity - fillQty) + makerOrder.price * fillQty) / 
          makerOrder.filledQuantity;
      }
      
      await makerOrder.save();
      
      // Remove from order book
      removeFromOrderBook(
        order.marketSymbol,
        makerOrder.side,
        makerOrder.price,
        fillQty
      );
      
      // Broadcast trade
      broadcastTradeExecuted(order.marketSymbol, {
        id: trade.tradeId,
        symbol: trade.marketSymbol,
        price: trade.price,
        quantity: trade.quantity,
        side: trade.side,
        timestamp: Date.now(),
      });
      
      // Update candles with this trade
      updateCandleFromTrade(trade.marketSymbol, trade.price, trade.quantity).catch(err => {
        console.error("Error updating candle from trade:", err);
      });
      
      // Handle position update for taker (if not synthetic)
      if (order.userAddress && !order.isSynthetic) {
        // Calculate margin used for this fill based on order's leverage
        const fillMargin = (makerOrder.price * fillQty) / order.leverage;
        
        const positionResult = await handleTradeExecution(
          order.userAddress,
          order.marketSymbol,
          order.side,
          fillQty,
          makerOrder.price,
          fillMargin,
          order.reduceOnly  // Pass reduceOnly flag so position service knows if margin was locked
        );
        
        // Track realized PnL if this trade closed/reduced a position
        if (positionResult.realizedPnl !== undefined) {
          totalRealizedPnl += positionResult.realizedPnl;
          
          // Award XP for closing a position (more XP for profitable trades)
          awardPositionClosedXP(order.userAddress, positionResult.realizedPnl > 0).catch(err => {
            console.error(`❌ Error awarding position closed XP:`, err);
          });
        }
        
        // Award XP to taker for trade execution
        awardTradeXP(order.userAddress).catch(err => {
          console.error(`❌ Error awarding trade XP to taker:`, err);
        });
      }
      
      // Notify maker if not synthetic
      if (makerOrder.userAddress && !makerOrder.isSynthetic) {
        sendOrderUpdate(makerOrder.userAddress, "order:filled", {
          orderId: makerOrder.orderId,
          symbol: makerOrder.marketSymbol,
          side: makerOrder.side,
          type: makerOrder.type,
          price: makerOrder.averagePrice,
          quantity: makerOrder.quantity,
          filledQuantity: makerOrder.filledQuantity,
          status: makerOrder.status,
          timestamp: Date.now(),
        });
        
        // Award XP to maker for trade execution
        awardTradeXP(makerOrder.userAddress).catch(err => {
          console.error(`❌ Error awarding trade XP to maker:`, err);
        });
        
        // Check trade count achievements for maker
        checkTradeCountAchievements(makerOrder.userAddress).catch(err => {
          console.error(`❌ Error checking trade count achievements for maker:`, err);
        });
      }
    }
    
    if (order.remainingQuantity <= 0) break;
  }
  
  // Update taker's average price
  if (filledQuantity > 0) {
    order.averagePrice = totalCost / filledQuantity;
  }
  
  return { trades, remainingOrder: order, realizedPnl: totalRealizedPnl };
}

/**
 * Cancel an order
 */
export async function cancelOrder(orderId: string, userAddress: string): Promise<CancelOrderResult> {
  const order = await Order.findOne({ 
    orderId,
    userAddress: userAddress.toLowerCase(),
  });
  
  if (!order) {
    return { success: false, error: "Order not found" };
  }
  
  if (order.status === "filled" || order.status === "cancelled") {
    return { success: false, error: "Order cannot be cancelled" };
  }
  
  // Remove from order book
  if (order.remainingQuantity > 0) {
    removeFromOrderBook(
      order.marketSymbol,
      order.side,
      order.price,
      order.remainingQuantity
    );
  }
  
  // Update order status
  order.status = "cancelled";
  order.cancelledAt = new Date();
  await order.save();
  
  // Unlock margin based on order's leverage (only if order locked margin - reduceOnly orders don't)
  if (!order.reduceOnly) {
    const unlockedMargin = (order.price * order.remainingQuantity) / order.leverage;
    await unlockBalanceByAddress(userAddress, unlockedMargin, `Cancelled order ${orderId}`);
  }
  
  // Notify user
  sendOrderUpdate(userAddress, "order:cancelled", {
    orderId: order.orderId,
    symbol: order.marketSymbol,
    side: order.side,
    type: order.type,
    price: order.price,
    quantity: order.quantity,
    filledQuantity: order.filledQuantity,
    status: order.status,
    timestamp: Date.now(),
  });
  
  return { success: true, order };
}

/**
 * Get user's open orders
 */
export async function getUserOpenOrders(userAddress: string, marketSymbol?: string): Promise<IOrder[]> {
  const query: Record<string, unknown> = {
    userAddress: userAddress.toLowerCase(),
    status: { $in: ["open", "partial", "pending"] },
    isSynthetic: false,
  };
  
  if (marketSymbol) {
    query.marketSymbol = marketSymbol.toUpperCase();
  }
  
  return Order.find(query).sort({ createdAt: -1 });
}

/**
 * Get user's order history
 */
export async function getUserOrderHistory(
  userAddress: string,
  marketSymbol?: string,
  limit: number = 50,
  offset: number = 0
): Promise<IOrder[]> {
  const query: Record<string, unknown> = {
    userAddress: userAddress.toLowerCase(),
    isSynthetic: false,
  };
  
  if (marketSymbol) {
    query.marketSymbol = marketSymbol.toUpperCase();
  }
  
  return Order.find(query)
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit);
}

/**
 * Get user's trade history
 */
export async function getUserTradeHistory(
  userAddress: string,
  marketSymbol?: string,
  limit: number = 50,
  offset: number = 0
): Promise<ITrade[]> {
  const address = userAddress.toLowerCase();
  
  const query: Record<string, unknown> = {
    $or: [
      { makerAddress: address, makerIsSynthetic: false },
      { takerAddress: address, takerIsSynthetic: false },
    ],
  };
  
  if (marketSymbol) {
    query.marketSymbol = marketSymbol.toUpperCase();
  }
  
  return Trade.find(query)
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit);
}

/**
 * Get recent trades for a market
 */
export async function getRecentTrades(
  marketSymbol: string,
  limit: number = 50
): Promise<ITrade[]> {
  return Trade.find({ marketSymbol: marketSymbol.toUpperCase() })
    .sort({ createdAt: -1 })
    .limit(limit);
}

