import { v4 as uuidv4 } from "uuid";
import { SpotOrder, ISpotOrder, SpotOrderSide, SpotOrderType } from "../models/spot-order.model";
import { SpotTrade, ISpotTrade } from "../models/spot-trade.model";
import { 
  lockSpotBalanceByAddress, 
  unlockSpotBalanceByAddress,
  settleSpotTrade,
  getSpotBalanceByAddress,
  creditSpotBalanceByAddress,
} from "./spot-balance.service";
import { 
  broadcastTradeExecuted, 
  sendOrderUpdate,
} from "./websocket.service";
import { updateSpotCandleFromTrade } from "./spot-candle.service";

// ============ Spot Order Book ============

interface SpotOrderBookLevel {
  price: number;
  quantity: number;
  orderCount: number;
}

interface SpotInMemoryOrderBook {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  bids: Map<number, SpotOrderBookLevel>;  // price -> level
  asks: Map<number, SpotOrderBookLevel>;  // price -> level
  lastUpdate: number;
}

const spotOrderBooks = new Map<string, SpotInMemoryOrderBook>();

/**
 * Initialize or get a spot order book for a market
 */
export function getOrCreateSpotOrderBook(
  marketSymbol: string, 
  baseAsset: string, 
  quoteAsset: string
): SpotInMemoryOrderBook {
  const symbol = marketSymbol.toUpperCase();
  
  if (!spotOrderBooks.has(symbol)) {
    spotOrderBooks.set(symbol, {
      symbol,
      baseAsset: baseAsset.toUpperCase(),
      quoteAsset: quoteAsset.toUpperCase(),
      bids: new Map(),
      asks: new Map(),
      lastUpdate: Date.now(),
    });
  }
  
  return spotOrderBooks.get(symbol)!;
}

/**
 * Add an order to the spot order book
 */
function addToSpotOrderBook(order: ISpotOrder): void {
  const book = getOrCreateSpotOrderBook(order.marketSymbol, order.baseAsset, order.quoteAsset);
  const side = order.side === "buy" ? book.bids : book.asks;
  
  const existing = side.get(order.price);
  if (existing) {
    existing.quantity += order.remainingQuantity;
    existing.orderCount += 1;
  } else {
    side.set(order.price, {
      price: order.price,
      quantity: order.remainingQuantity,
      orderCount: 1,
    });
  }
  
  book.lastUpdate = Date.now();
}

/**
 * Remove quantity from the spot order book
 */
function removeFromSpotOrderBook(
  marketSymbol: string, 
  baseAsset: string,
  quoteAsset: string,
  side: SpotOrderSide, 
  price: number, 
  quantity: number
): void {
  const book = getOrCreateSpotOrderBook(marketSymbol, baseAsset, quoteAsset);
  const bookSide = side === "buy" ? book.bids : book.asks;
  
  const level = bookSide.get(price);
  if (level) {
    level.quantity -= quantity;
    level.orderCount -= 1;
    
    if (level.quantity <= 0 || level.orderCount <= 0) {
      bookSide.delete(price);
    }
    
    book.lastUpdate = Date.now();
  }
}

/**
 * Get spot order book snapshot
 */
export function getSpotOrderBookSnapshot(
  marketSymbol: string,
  baseAsset: string,
  quoteAsset: string,
  depth: number = 20
): { symbol: string; bids: Array<{ price: number; quantity: number; total: number }>; asks: Array<{ price: number; quantity: number; total: number }>; timestamp: number } {
  const book = getOrCreateSpotOrderBook(marketSymbol, baseAsset, quoteAsset);
  
  const bids = Array.from(book.bids.values())
    .sort((a, b) => b.price - a.price)
    .slice(0, depth)
    .map((level) => ({
      price: level.price,
      quantity: level.quantity,
      total: level.price * level.quantity,
    }));
  
  const asks = Array.from(book.asks.values())
    .sort((a, b) => a.price - b.price)
    .slice(0, depth)
    .map((level) => ({
      price: level.price,
      quantity: level.quantity,
      total: level.price * level.quantity,
    }));
  
  return {
    symbol: marketSymbol,
    bids,
    asks,
    timestamp: book.lastUpdate,
  };
}

/**
 * Get best bid price for spot market
 */
export function getSpotBestBid(marketSymbol: string): number | null {
  const book = spotOrderBooks.get(marketSymbol.toUpperCase());
  if (!book || book.bids.size === 0) return null;
  return Math.max(...Array.from(book.bids.keys()));
}

/**
 * Get best ask price for spot market
 */
export function getSpotBestAsk(marketSymbol: string): number | null {
  const book = spotOrderBooks.get(marketSymbol.toUpperCase());
  if (!book || book.asks.size === 0) return null;
  return Math.min(...Array.from(book.asks.keys()));
}

// ============ Order Placement & Matching ============

interface PlaceSpotOrderParams {
  marketSymbol: string;
  baseAsset: string;
  quoteAsset: string;
  userAddress: string;
  side: SpotOrderSide;
  type: SpotOrderType;
  price?: number;
  quantity: number;    // Base asset quantity
  postOnly?: boolean;
}

interface PlaceSpotOrderResult {
  success: boolean;
  order?: ISpotOrder;
  trades?: ISpotTrade[];
  error?: string;
}

interface CancelSpotOrderResult {
  success: boolean;
  order?: ISpotOrder;
  error?: string;
}

/**
 * Round price to tick size
 */
function roundToTickSize(price: number, tickSize: number): number {
  return Math.round(price / tickSize) * tickSize;
}

/**
 * Round quantity to lot size
 */
function roundToLotSize(quantity: number, lotSize: number): number {
  return Math.round(quantity / lotSize) * lotSize;
}

/**
 * Place a new spot order
 */
export async function placeSpotOrder(params: PlaceSpotOrderParams): Promise<PlaceSpotOrderResult> {
  const {
    marketSymbol,
    baseAsset,
    quoteAsset,
    userAddress,
    side,
    type,
    price,
    quantity,
    postOnly = false,
  } = params;
  
  // Use default tick/lot sizes (could be fetched from market config)
  const tickSize = 0.01;
  const lotSize = 1;
  const minOrderSize = 1;
  
  // Validate quantity
  if (quantity <= 0) {
    return { success: false, error: "Order quantity must be greater than 0" };
  }
  
  const roundedQuantity = roundToLotSize(quantity, lotSize);
  if (roundedQuantity < minOrderSize) {
    return { success: false, error: `Minimum order size is ${minOrderSize}` };
  }
  
  // Determine order price
  let orderPrice: number;
  if (type === "market") {
    // For market orders, use best available price or a wide price
    const bestPrice = side === "buy" ? getSpotBestAsk(marketSymbol) : getSpotBestBid(marketSymbol);
    if (!bestPrice) {
      return { success: false, error: "No liquidity available for market order" };
    }
    // Use a price that will definitely match
    orderPrice = side === "buy" ? bestPrice * 1.1 : bestPrice * 0.9;
  } else {
    if (!price || price <= 0) {
      return { success: false, error: "Price is required for limit orders" };
    }
    orderPrice = roundToTickSize(price, tickSize);
  }
  
  // Calculate what needs to be locked
  // Buy: lock quote asset (USD) = price * quantity
  // Sell: lock base asset = quantity
  const lockedAsset = side === "buy" ? quoteAsset : baseAsset;
  const lockedAmount = side === "buy" ? orderPrice * roundedQuantity : roundedQuantity;
  
  // Generate order ID
  const orderId = `SPOT-${uuidv4()}`;
  
  // Lock the required balance
  const lockResult = await lockSpotBalanceByAddress(
    userAddress,
    lockedAsset,
    lockedAmount,
    `Spot order: ${side} ${roundedQuantity} ${baseAsset}`,
    orderId
  );
  
  if (!lockResult.success) {
    const balance = await getSpotBalanceByAddress(userAddress, lockedAsset);
    const available = balance?.free ?? 0;
    return { 
      success: false, 
      error: `Insufficient ${lockedAsset} balance. Required: ${lockedAmount.toFixed(2)}, Available: ${available.toFixed(2)}` 
    };
  }
  
  // Create the order
  const order = new SpotOrder({
    orderId,
    marketSymbol: marketSymbol.toUpperCase(),
    userId: null,
    userAddress: userAddress.toLowerCase(),
    baseAsset: baseAsset.toUpperCase(),
    quoteAsset: quoteAsset.toUpperCase(),
    side,
    type,
    price: orderPrice,
    quantity: roundedQuantity,
    filledQuantity: 0,
    remainingQuantity: roundedQuantity,
    averagePrice: 0,
    lockedAsset: lockedAsset.toUpperCase(),
    lockedAmount,
    isSynthetic: false,
    postOnly,
    status: "pending",
  });
  
  // Try to match the order
  let trades: ISpotTrade[];
  let remainingOrder: ISpotOrder;
  
  try {
    const matchResult = await matchSpotOrder(order);
    trades = matchResult.trades;
    remainingOrder = matchResult.remainingOrder;
  } catch (error) {
    // Unlock on failure
    await unlockSpotBalanceByAddress(
      userAddress,
      lockedAsset,
      lockedAmount,
      `Order matching failed: ${orderId}`,
      orderId
    );
    console.error(`❌ Spot order matching failed for ${orderId}:`, error);
    return { success: false, error: "Order matching failed. Please try again." };
  }
  
  // If post-only and would have matched, cancel
  if (postOnly && trades.length > 0) {
    await unlockSpotBalanceByAddress(
      userAddress,
      lockedAsset,
      lockedAmount,
      "Post-only order would have matched",
      orderId
    );
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
  try {
    await remainingOrder.save();
  } catch (error) {
    // Unlock remaining on save failure
    if (remainingOrder.remainingQuantity > 0) {
      const remainingLocked = side === "buy" 
        ? remainingOrder.price * remainingOrder.remainingQuantity 
        : remainingOrder.remainingQuantity;
      await unlockSpotBalanceByAddress(
        userAddress,
        lockedAsset,
        remainingLocked,
        `Order save failed: ${orderId}`,
        orderId
      );
    }
    console.error(`❌ Spot order save failed for ${orderId}:`, error);
    return { success: false, error: "Order could not be saved. Please try again." };
  }
  
  // Add remaining quantity to order book if limit order
  if (type === "limit" && remainingOrder.remainingQuantity > 0) {
    addToSpotOrderBook(remainingOrder);
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
 * Match a spot order against the book
 */
async function matchSpotOrder(order: ISpotOrder): Promise<{ trades: ISpotTrade[]; remainingOrder: ISpotOrder }> {
  const trades: ISpotTrade[] = [];
  const book = getOrCreateSpotOrderBook(order.marketSymbol, order.baseAsset, order.quoteAsset);
  
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
    const ordersAtPrice = await SpotOrder.find({
      marketSymbol: order.marketSymbol,
      side: order.side === "buy" ? "sell" : "buy",
      price,
      status: { $in: ["open", "partial"] },
    }).sort({ createdAt: 1 });
    
    for (const makerOrder of ordersAtPrice) {
      if (order.remainingQuantity <= 0) break;
      
      // Calculate fill quantity
      const fillQty = Math.min(order.remainingQuantity, makerOrder.remainingQuantity);
      const fillValue = makerOrder.price * fillQty;
      
      // Create trade
      const trade = new SpotTrade({
        tradeId: `STRD-${uuidv4()}`,
        marketSymbol: order.marketSymbol,
        baseAsset: order.baseAsset,
        quoteAsset: order.quoteAsset,
        makerOrderId: makerOrder.orderId,
        makerAddress: makerOrder.userAddress,
        makerIsSynthetic: makerOrder.isSynthetic,
        takerOrderId: order.orderId,
        takerAddress: order.userAddress,
        takerIsSynthetic: order.isSynthetic,
        side: order.side,
        price: makerOrder.price,
        quantity: fillQty,
        quoteQuantity: fillValue,
        makerFee: 0,
        takerFee: 0,
      });
      
      await trade.save();
      trades.push(trade);
      
      // Update candles with this trade
      await updateSpotCandleFromTrade(trade.marketSymbol, trade.price, trade.quantity);
      
      // Update quantities
      order.filledQuantity += fillQty;
      order.remainingQuantity -= fillQty;
      filledQuantity += fillQty;
      totalCost += fillValue;
      
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
      removeFromSpotOrderBook(
        order.marketSymbol,
        order.baseAsset,
        order.quoteAsset,
        makerOrder.side,
        makerOrder.price,
        fillQty
      );
      
      // Settle balances for both parties
      // Taker settlement
      if (order.userAddress && !order.isSynthetic) {
        await settleSpotTrade(
          order.userAddress,
          order.baseAsset,
          order.quoteAsset,
          order.side,
          fillQty,
          fillValue,
          trade.tradeId,
          makerOrder.price  // Price for avg cost tracking
        );
      }
      
      // Maker settlement (opposite side)
      if (makerOrder.userAddress && !makerOrder.isSynthetic) {
        await settleSpotTrade(
          makerOrder.userAddress,
          makerOrder.baseAsset,
          makerOrder.quoteAsset,
          makerOrder.side,
          fillQty,
          fillValue,
          trade.tradeId,
          makerOrder.price  // Price for avg cost tracking
        );
      }
      
      // Broadcast trade
      broadcastTradeExecuted(order.marketSymbol, {
        id: trade.tradeId,
        symbol: trade.marketSymbol,
        price: trade.price,
        quantity: trade.quantity,
        side: trade.side,
        timestamp: Date.now(),
      });
      
      // Notify maker
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
    
    // Update locked amount to reflect only remaining order
    const originalLockedAmount = order.lockedAmount;
    if (order.side === "buy") {
      // For buy orders, unlock the difference between locked and used
      order.lockedAmount = order.price * order.remainingQuantity;
    } else {
      // For sell orders, remaining locked = remaining quantity
      order.lockedAmount = order.remainingQuantity;
    }
    
    // The difference was consumed in the trade (handled by settleSpotTrade)
  }
  
  return { trades, remainingOrder: order };
}

/**
 * Cancel a spot order
 */
export async function cancelSpotOrder(orderId: string, userAddress: string): Promise<CancelSpotOrderResult> {
  const order = await SpotOrder.findOne({ 
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
    removeFromSpotOrderBook(
      order.marketSymbol,
      order.baseAsset,
      order.quoteAsset,
      order.side,
      order.price,
      order.remainingQuantity
    );
  }
  
  // Unlock remaining balance
  const remainingLocked = order.side === "buy"
    ? order.price * order.remainingQuantity
    : order.remainingQuantity;
  
  if (remainingLocked > 0) {
    await unlockSpotBalanceByAddress(
      userAddress,
      order.lockedAsset,
      remainingLocked,
      `Order cancelled: ${orderId}`,
      orderId
    );
  }
  
  // Update order
  order.status = "cancelled";
  order.cancelledAt = new Date();
  order.lockedAmount = 0;
  await order.save();
  
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

// ============ Query Functions ============

/**
 * Get user's open spot orders
 */
export async function getUserSpotOpenOrders(
  userAddress: string,
  marketSymbol?: string
): Promise<ISpotOrder[]> {
  const query: Record<string, unknown> = {
    userAddress: userAddress.toLowerCase(),
    status: { $in: ["open", "partial"] },
  };
  
  if (marketSymbol) {
    query.marketSymbol = marketSymbol.toUpperCase();
  }
  
  return SpotOrder.find(query).sort({ createdAt: -1 });
}

/**
 * Get user's spot order history
 */
export async function getUserSpotOrderHistory(
  userAddress: string,
  marketSymbol?: string,
  limit: number = 50,
  offset: number = 0
): Promise<ISpotOrder[]> {
  const query: Record<string, unknown> = {
    userAddress: userAddress.toLowerCase(),
  };
  
  if (marketSymbol) {
    query.marketSymbol = marketSymbol.toUpperCase();
  }
  
  return SpotOrder.find(query)
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit);
}

/**
 * Get user's spot trade history
 */
export async function getUserSpotTradeHistory(
  userAddress: string,
  marketSymbol?: string,
  limit: number = 50,
  offset: number = 0
): Promise<ISpotTrade[]> {
  const normalizedAddress = userAddress.toLowerCase();
  
  // Find trades where user is maker or taker (and not synthetic)
  const query: Record<string, unknown> = {
    $or: [
      { makerAddress: normalizedAddress, makerIsSynthetic: { $ne: true } },
      { takerAddress: normalizedAddress, takerIsSynthetic: { $ne: true } },
    ],
  };
  
  if (marketSymbol) {
    query.marketSymbol = marketSymbol.toUpperCase();
  }
  
  return SpotTrade.find(query)
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit);
}

/**
 * Get recent spot trades for a market
 */
export async function getRecentSpotTrades(
  marketSymbol: string,
  limit: number = 50
): Promise<ISpotTrade[]> {
  return SpotTrade.find({
    marketSymbol: marketSymbol.toUpperCase(),
  })
    .sort({ createdAt: -1 })
    .limit(limit);
}

/**
 * Get spot spread for a market
 */
export function getSpotSpread(marketSymbol: string): { bid: number | null; ask: number | null; spread: number | null } {
  const bid = getSpotBestBid(marketSymbol);
  const ask = getSpotBestAsk(marketSymbol);
  
  let spread: number | null = null;
  if (bid && ask) {
    spread = ((ask - bid) / bid) * 100;
  }
  
  return { bid, ask, spread };
}

// ============ Initialization ============

/**
 * Initialize spot orderbooks for all markets
 * Call this at startup to load existing orders into memory
 */
export async function initializeSpotOrderBooks(): Promise<void> {
  // Spot markets with their target prices
  const SPOT_MARKETS = [
    { symbol: "UMBREON-VMAX-SPOT", baseAsset: "UMBREON-VMAX", quoteAsset: "USD", targetPrice: 3400 },
  ];
  
  console.log("📚 Initializing spot orderbooks...");
  
  for (const market of SPOT_MARKETS) {
    // Initialize the orderbook structure
    getOrCreateSpotOrderBook(market.symbol, market.baseAsset, market.quoteAsset);
    
    // Load existing open orders from DB (both user and synthetic)
    const orders = await SpotOrder.find({
      marketSymbol: market.symbol.toUpperCase(),
      status: { $in: ["open", "partial"] },
    });
    
    for (const order of orders) {
      addToSpotOrderBook(order);
    }
    
    console.log(`   📖 ${market.symbol}: ${orders.length} orders loaded`);
    
    // Seed market with synthetic orders if empty
    if (orders.length === 0) {
      await seedSpotMarketOrders(
        market.symbol,
        market.baseAsset,
        market.quoteAsset,
        market.targetPrice,
        500  // 500 orders
      );
    }
  }
  
  console.log("✅ Spot orderbooks initialized");
}

/**
 * Clear a spot orderbook
 */
export function clearSpotOrderBook(marketSymbol: string): void {
  spotOrderBooks.delete(marketSymbol.toUpperCase());
}

// ============ Spot Market Maker / Seeding ============

/**
 * Simple hash function for generating synthetic addresses
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const hex = Math.abs(hash).toString(16).padStart(40, "0");
  return hex.slice(0, 40);
}

/**
 * Seed spot market with orders if empty
 * Creates 500 orders around the target price
 */
export async function seedSpotMarketOrders(
  marketSymbol: string,
  baseAsset: string,
  quoteAsset: string,
  targetPrice: number,
  numOrders: number = 500
): Promise<void> {
  const symbol = marketSymbol.toUpperCase();
  
  // Check if market already has orders
  const existingOrders = await SpotOrder.countDocuments({
    marketSymbol: symbol,
    status: { $in: ["open", "partial"] },
  });
  
  if (existingOrders > 0) {
    console.log(`   📊 ${symbol}: Already has ${existingOrders} orders, skipping seed`);
    return;
  }
  
  console.log(`   🌱 Seeding ${symbol} with ${numOrders} orders around $${targetPrice}...`);
  
  // Configuration
  const numLevels = 25;                    // 25 levels per side
  const ordersPerLevel = numOrders / (numLevels * 2); // Split evenly
  const spreadBps = 50;                    // 0.5% spread
  const levelSpacingBps = 20;              // 0.2% between levels
  
  // Calculate spread
  const halfSpread = (targetPrice * spreadBps) / 10000 / 2;
  const levelSpacing = (targetPrice * levelSpacingBps) / 10000;
  
  const ordersToCreate: Array<{
    orderId: string;
    marketSymbol: string;
    baseAsset: string;
    quoteAsset: string;
    side: "buy" | "sell";
    type: "limit";
    price: number;
    quantity: number;
    filledQuantity: number;
    remainingQuantity: number;
    averagePrice: number;
    lockedAsset: string;
    lockedAmount: number;
    isSynthetic: boolean;
    postOnly: boolean;
    status: "open";
    userAddress: string;
  }> = [];
  
  let orderCount = 0;
  
  for (let level = 0; level < numLevels; level++) {
    // Calculate prices for this level
    const bidPrice = Math.round((targetPrice - halfSpread - (level * levelSpacing)) * 100) / 100;
    const askPrice = Math.round((targetPrice + halfSpread + (level * levelSpacing)) * 100) / 100;
    
    // Size increases at deeper levels
    const baseSize = 1 + Math.floor(level / 5);
    
    for (let i = 0; i < ordersPerLevel; i++) {
      // Slight variation in size
      const sizeVariation = 0.8 + Math.random() * 0.4;
      const quantity = Math.max(1, Math.round(baseSize * sizeVariation));
      
      // Generate synthetic address
      const bidAddress = `0x${simpleHash(`spot-mm-bid-${level}-${i}`)}`.toLowerCase();
      const askAddress = `0x${simpleHash(`spot-mm-ask-${level}-${i}`)}`.toLowerCase();
      
      // Create bid order
      ordersToCreate.push({
        orderId: `SPOT-SEED-BID-${level}-${i}-${uuidv4().slice(0, 8)}`,
        marketSymbol: symbol,
        baseAsset: baseAsset.toUpperCase(),
        quoteAsset: quoteAsset.toUpperCase(),
        side: "buy",
        type: "limit",
        price: bidPrice,
        quantity,
        filledQuantity: 0,
        remainingQuantity: quantity,
        averagePrice: 0,
        lockedAsset: quoteAsset.toUpperCase(),
        lockedAmount: bidPrice * quantity,
        isSynthetic: true,
        postOnly: false,
        status: "open",
        userAddress: bidAddress,
      });
      
      // Create ask order
      ordersToCreate.push({
        orderId: `SPOT-SEED-ASK-${level}-${i}-${uuidv4().slice(0, 8)}`,
        marketSymbol: symbol,
        baseAsset: baseAsset.toUpperCase(),
        quoteAsset: quoteAsset.toUpperCase(),
        side: "sell",
        type: "limit",
        price: askPrice,
        quantity,
        filledQuantity: 0,
        remainingQuantity: quantity,
        averagePrice: 0,
        lockedAsset: baseAsset.toUpperCase(),
        lockedAmount: quantity,
        isSynthetic: true,
        postOnly: false,
        status: "open",
        userAddress: askAddress,
      });
      
      orderCount += 2;
    }
  }
  
  // Bulk insert orders
  if (ordersToCreate.length > 0) {
    await SpotOrder.insertMany(ordersToCreate);
    
    // Add to in-memory orderbook
    const book = getOrCreateSpotOrderBook(symbol, baseAsset, quoteAsset);
    for (const order of ordersToCreate) {
      const side = order.side === "buy" ? book.bids : book.asks;
      const existing = side.get(order.price);
      if (existing) {
        existing.quantity += order.remainingQuantity;
        existing.orderCount += 1;
      } else {
        side.set(order.price, {
          price: order.price,
          quantity: order.remainingQuantity,
          orderCount: 1,
        });
      }
    }
    book.lastUpdate = Date.now();
  }
  
  console.log(`   ✅ ${symbol}: Created ${orderCount} seed orders`);
  
  // Log orderbook summary
  const book = spotOrderBooks.get(symbol);
  if (book) {
    const bids = Array.from(book.bids.values()).sort((a, b) => b.price - a.price);
    const asks = Array.from(book.asks.values()).sort((a, b) => a.price - b.price);
    console.log(`      Best bid: $${bids[0]?.price.toFixed(2)} | Best ask: $${asks[0]?.price.toFixed(2)}`);
    console.log(`      Bid levels: ${bids.length} | Ask levels: ${asks.length}`);
  }
}
