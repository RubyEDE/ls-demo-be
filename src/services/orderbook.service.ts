import { Order, IOrder, OrderSide } from "../models/order.model";
import { getMarket, getCachedPrice, roundToTickSize } from "./market.service";
import { broadcastOrderBookSnapshot, broadcastOrderBookUpdate, OrderBookSnapshot, OrderBookEntry } from "./websocket.service";

// In-memory order book for fast access
interface OrderBookLevel {
  price: number;
  quantity: number;
  orderCount: number;
}

interface InMemoryOrderBook {
  symbol: string;
  bids: Map<number, OrderBookLevel>;  // price -> level
  asks: Map<number, OrderBookLevel>;  // price -> level
  lastUpdate: number;
}

const orderBooks = new Map<string, InMemoryOrderBook>();

/**
 * Initialize or get an order book for a market
 */
export function getOrCreateOrderBook(marketSymbol: string): InMemoryOrderBook {
  const symbol = marketSymbol.toUpperCase();
  
  if (!orderBooks.has(symbol)) {
    orderBooks.set(symbol, {
      symbol,
      bids: new Map(),
      asks: new Map(),
      lastUpdate: Date.now(),
    });
  }
  
  return orderBooks.get(symbol)!;
}

/**
 * Add an order to the in-memory order book
 */
export function addToOrderBook(order: IOrder): void {
  const book = getOrCreateOrderBook(order.marketSymbol);
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
  
  // Broadcast update
  broadcastOrderBookUpdate(order.marketSymbol, {
    symbol: order.marketSymbol,
    side: order.side === "buy" ? "bid" : "ask",
    price: order.price,
    quantity: side.get(order.price)!.quantity,
    timestamp: book.lastUpdate,
  });
}

/**
 * Remove quantity from the order book
 */
export function removeFromOrderBook(marketSymbol: string, side: OrderSide, price: number, quantity: number): void {
  const book = getOrCreateOrderBook(marketSymbol);
  const bookSide = side === "buy" ? book.bids : book.asks;
  
  const level = bookSide.get(price);
  if (level) {
    level.quantity -= quantity;
    level.orderCount -= 1;
    
    if (level.quantity <= 0 || level.orderCount <= 0) {
      bookSide.delete(price);
    }
    
    book.lastUpdate = Date.now();
    
    // Broadcast update
    broadcastOrderBookUpdate(marketSymbol, {
      symbol: marketSymbol,
      side: side === "buy" ? "bid" : "ask",
      price: price,
      quantity: level.quantity > 0 ? level.quantity : 0,
      timestamp: book.lastUpdate,
    });
  }
}

/**
 * Get order book snapshot
 */
export function getOrderBookSnapshot(marketSymbol: string, depth: number = 20): OrderBookSnapshot {
  const book = getOrCreateOrderBook(marketSymbol);
  
  // Convert bids to sorted array (descending by price)
  const bids: OrderBookEntry[] = Array.from(book.bids.values())
    .sort((a, b) => b.price - a.price)
    .slice(0, depth)
    .map((level) => ({
      price: level.price,
      quantity: level.quantity,
      total: level.price * level.quantity,
    }));
  
  // Convert asks to sorted array (ascending by price)
  const asks: OrderBookEntry[] = Array.from(book.asks.values())
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
 * Get best bid price
 */
export function getBestBid(marketSymbol: string): number | null {
  const book = getOrCreateOrderBook(marketSymbol);
  if (book.bids.size === 0) return null;
  return Math.max(...Array.from(book.bids.keys()));
}

/**
 * Get best ask price
 */
export function getBestAsk(marketSymbol: string): number | null {
  const book = getOrCreateOrderBook(marketSymbol);
  if (book.asks.size === 0) return null;
  return Math.min(...Array.from(book.asks.keys()));
}

/**
 * Get spread
 */
export function getSpread(marketSymbol: string): { bid: number | null; ask: number | null; spread: number | null } {
  const bid = getBestBid(marketSymbol);
  const ask = getBestAsk(marketSymbol);
  
  return {
    bid,
    ask,
    spread: bid && ask ? ask - bid : null,
  };
}

/**
 * Clear the order book for a market
 */
export function clearOrderBook(marketSymbol: string): void {
  const symbol = marketSymbol.toUpperCase();
  orderBooks.delete(symbol);
}

/**
 * Rebuild order book from database (includes both user and synthetic orders)
 * This preserves user orders when refreshing synthetic liquidity
 */
export async function rebuildOrderBook(marketSymbol: string): Promise<void> {
  const symbol = marketSymbol.toUpperCase();
  
  // Clear existing in-memory book
  clearOrderBook(symbol);
  
  // Load ALL open orders from DB (both user and synthetic)
  const orders = await Order.find({
    marketSymbol: symbol,
    status: { $in: ["open", "partial"] },
  });
  
  for (const order of orders) {
    addToOrderBook(order);
  }
  
  console.log(`📚 Rebuilt order book for ${symbol}: ${orders.length} orders (user + synthetic)`);
}

/**
 * Load order book from database
 */
export async function loadOrderBookFromDB(marketSymbol: string): Promise<void> {
  const symbol = marketSymbol.toUpperCase();
  
  // Clear existing in-memory book
  clearOrderBook(symbol);
  
  // Load open orders from DB
  const orders = await Order.find({
    marketSymbol: symbol,
    status: { $in: ["open", "partial"] },
  });
  
  for (const order of orders) {
    addToOrderBook(order);
  }
  
  console.log(`📚 Loaded ${orders.length} orders for ${symbol} order book`);
}

/**
 * Broadcast full order book snapshot
 */
export function broadcastOrderBook(marketSymbol: string, depth: number = 20): void {
  const snapshot = getOrderBookSnapshot(marketSymbol, depth);
  broadcastOrderBookSnapshot(marketSymbol, snapshot);
}
