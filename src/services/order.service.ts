import { v4 as uuidv4 } from "uuid";
import { Order, IOrder, OrderSide, OrderType } from "../models/order.model";
import { Trade, ITrade } from "../models/trade.model";
import { getMarket, roundToTickSize, roundToLotSize, getCachedPrice } from "./market.service";
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
import { handleTradeExecution } from "./position.service";

interface PlaceOrderParams {
  marketSymbol: string;
  userAddress: string;
  side: OrderSide;
  type: OrderType;
  price?: number;
  quantity: number;
  postOnly?: boolean;
  reduceOnly?: boolean;
}

interface PlaceOrderResult {
  success: boolean;
  order?: IOrder;
  trades?: ITrade[];
  error?: string;
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
  
  // Validate quantity
  if (quantity < market.minOrderSize) {
    return { success: false, error: `Minimum order size is ${market.minOrderSize}` };
  }
  
  if (quantity > market.maxOrderSize) {
    return { success: false, error: `Maximum order size is ${market.maxOrderSize}` };
  }
  
  // Round to lot size
  const roundedQuantity = roundToLotSize(quantity, market.lotSize);
  
  // For market orders, get the oracle price
  let orderPrice: number;
  if (type === "market") {
    const oraclePrice = getCachedPrice(marketSymbol);
    if (!oraclePrice) {
      return { success: false, error: "No price available" };
    }
    // Use a price far from market to ensure fill
    orderPrice = side === "buy" ? oraclePrice * 1.1 : oraclePrice * 0.9;
  } else {
    if (!price || price <= 0) {
      return { success: false, error: "Price is required for limit orders" };
    }
    orderPrice = roundToTickSize(price, market.tickSize);
  }
  
  // Calculate required margin
  const notionalValue = orderPrice * roundedQuantity;
  const requiredMargin = notionalValue * market.initialMarginRate;
  
  // Lock balance for the order
  const lockResult = await lockBalanceByAddress(
    userAddress,
    requiredMargin,
    `Order margin for ${marketSymbol}`,
    `ORDER-${uuidv4()}`
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
  
  // Create the order
  const order = new Order({
    orderId: `ORD-${uuidv4()}`,
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
    isSynthetic: false,
    postOnly,
    reduceOnly,
    status: "pending",
  });
  
  // Try to match the order
  const { trades, remainingOrder } = await matchOrder(order);
  
  // If post-only and would have matched, cancel
  if (postOnly && trades.length > 0) {
    // Unlock the margin
    await unlockBalanceByAddress(userAddress, requiredMargin, "Post-only order would have matched");
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
  
  // Save order
  await remainingOrder.save();
  
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
  
  return {
    success: true,
    order: remainingOrder,
    trades,
  };
}

/**
 * Match an order against the book
 */
async function matchOrder(order: IOrder): Promise<{ trades: ITrade[]; remainingOrder: IOrder }> {
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
      
      // Handle position update for taker (if not synthetic)
      if (order.userAddress && !order.isSynthetic) {
        const market = await getMarket(order.marketSymbol);
        if (market) {
          // Calculate margin used for this fill
          const fillMargin = makerOrder.price * fillQty * market.initialMarginRate;
          
          await handleTradeExecution(
            order.userAddress,
            order.marketSymbol,
            order.side,
            fillQty,
            makerOrder.price,
            fillMargin
          );
        }
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
      }
    }
    
    if (order.remainingQuantity <= 0) break;
  }
  
  // Update taker's average price
  if (filledQuantity > 0) {
    order.averagePrice = totalCost / filledQuantity;
  }
  
  return { trades, remainingOrder: order };
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
  
  // Unlock margin
  const market = await getMarket(order.marketSymbol);
  if (market) {
    const unlockedMargin = order.price * order.remainingQuantity * market.initialMarginRate;
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
