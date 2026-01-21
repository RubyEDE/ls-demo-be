import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { config } from "../config/env";
import { AuthPayload } from "../types";

// WebSocket event types
export interface ServerToClientEvents {
  // Price updates
  "price:update": (data: PriceUpdate) => void;
  "price:batch": (data: PriceUpdate[]) => void;
  
  // Order book events
  "orderbook:snapshot": (data: OrderBookSnapshot) => void;
  "orderbook:update": (data: OrderBookUpdate) => void;
  
  // Trade events
  "trade:executed": (data: TradeExecuted) => void;
  "trade:batch": (data: TradeExecuted[]) => void;
  
  // Candle events
  "candle:update": (data: CandleUpdate) => void;
  
  // Funding events
  "funding:update": (data: FundingUpdate) => void;
  "funding:payment": (data: FundingPaymentEvent) => void;
  
  // User-specific events
  "order:created": (data: OrderEvent) => void;
  "order:filled": (data: OrderEvent) => void;
  "order:cancelled": (data: OrderEvent) => void;
  "balance:updated": (data: BalanceUpdate) => void;
  "position:updated": (data: PositionUpdate) => void;
  "position:opened": (data: PositionUpdate) => void;
  "position:closed": (data: PositionUpdate) => void;
  "position:liquidated": (data: PositionUpdate) => void;
  
  // XP/Leveling events
  "xp:gained": (data: XPGainedEvent) => void;
  "xp:levelup": (data: LevelUpEvent) => void;
  
  // System events
  "error": (data: { code: string; message: string }) => void;
  "subscribed": (data: { channel: string; symbol?: string; interval?: string }) => void;
  "unsubscribed": (data: { channel: string; symbol?: string; interval?: string }) => void;
}

export interface ClientToServerEvents {
  // Subscribe to channels
  "subscribe:price": (symbol: string) => void;
  "unsubscribe:price": (symbol: string) => void;
  "subscribe:orderbook": (symbol: string) => void;
  "unsubscribe:orderbook": (symbol: string) => void;
  "subscribe:trades": (symbol: string) => void;
  "unsubscribe:trades": (symbol: string) => void;
  "subscribe:candles": (data: { symbol: string; interval?: string } | string) => void;
  "unsubscribe:candles": (data: { symbol: string; interval?: string } | string) => void;
  "subscribe:funding": (symbol: string) => void;
  "unsubscribe:funding": (symbol: string) => void;
  "subscribe:xp": () => void;
  "unsubscribe:xp": () => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId?: string;
  address?: string;
  authenticated: boolean;
}

// Data types
export interface PriceUpdate {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume?: number;
  timestamp: number;
}

export interface OrderBookEntry {
  price: number;
  quantity: number;
  total: number;
}

export interface OrderBookSnapshot {
  symbol: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  timestamp: number;
}

export interface OrderBookUpdate {
  symbol: string;
  side: "bid" | "ask";
  price: number;
  quantity: number;
  timestamp: number;
}

export interface TradeExecuted {
  id: string;
  symbol: string;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  timestamp: number;
}

export interface CandleUpdate {
  symbol: string;
  interval: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
  isClosed: boolean;
}

export interface OrderEvent {
  orderId: string;
  symbol: string;
  side: "buy" | "sell";
  type: "limit" | "market";
  price?: number;
  quantity: number;
  filledQuantity: number;
  status: "pending" | "open" | "partial" | "filled" | "cancelled";
  timestamp: number;
}

export interface BalanceUpdate {
  free: number;
  locked: number;
  total: number;
  timestamp: number;
}

export interface PositionUpdate {
  positionId: string;
  marketSymbol: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  markPrice: number;
  margin: number;
  leverage: number;
  unrealizedPnl: number;
  realizedPnl: number;
  liquidationPrice: number;
  status: "open" | "closed" | "liquidated";
  timestamp: number;
}

export interface FundingUpdate {
  symbol: string;
  fundingRate: number;
  predictedFundingRate: number;
  markPrice: number;
  indexPrice: number;
  premium: number;
  nextFundingTime: number;
  timestamp: number;
}

export interface FundingPaymentEvent {
  symbol: string;
  fundingRate: number;
  totalLongPayment: number;
  totalShortPayment: number;
  positionsProcessed: number;
  timestamp: number;
}

export interface XPGainedEvent {
  amount: number;
  reason: string;
  currentExperience: number;
  totalExperience: number;
  level: number;
  experienceForNextLevel: number;
  progressPercentage: number;
  timestamp: number;
}

export interface LevelUpEvent {
  previousLevel: number;
  newLevel: number;
  levelsGained: number;
  currentExperience: number;
  totalExperience: number;
  experienceForNextLevel: number;
  timestamp: number;
}

// Socket.IO server instance
let io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> | null = null;

// Track subscriptions
const subscriptions = new Map<string, Set<string>>(); // channel -> Set<socketId>

/**
 * Initialize WebSocket server
 */
export function initializeWebSocket(httpServer: HttpServer): Server {
  io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace("Bearer ", "");
    
    if (!token) {
      // Allow unauthenticated connections for public data
      socket.data.authenticated = false;
      return next();
    }
    
    try {
      const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
      socket.data.userId = payload.address;
      socket.data.address = payload.address;
      socket.data.authenticated = true;
      next();
    } catch {
      socket.data.authenticated = false;
      next();
    }
  });

  io.on("connection", (socket) => {
    console.log(`📡 WebSocket connected: ${socket.id} (authenticated: ${socket.data.authenticated})`);
    
    // Join user-specific room if authenticated
    if (socket.data.authenticated && socket.data.address) {
      socket.join(`user:${socket.data.address.toLowerCase()}`);
    }

    // Handle price subscriptions
    socket.on("subscribe:price", (symbol) => {
      const channel = `price:${symbol.toUpperCase()}`;
      socket.join(channel);
      addSubscription(channel, socket.id);
      socket.emit("subscribed", { channel: "price", symbol: symbol.toUpperCase() });
      console.log(`📊 ${socket.id} subscribed to ${channel}`);
    });

    socket.on("unsubscribe:price", (symbol) => {
      const channel = `price:${symbol.toUpperCase()}`;
      socket.leave(channel);
      removeSubscription(channel, socket.id);
      socket.emit("unsubscribed", { channel: "price", symbol: symbol.toUpperCase() });
    });

    // Handle order book subscriptions
    socket.on("subscribe:orderbook", (symbol) => {
      const channel = `orderbook:${symbol.toUpperCase()}`;
      socket.join(channel);
      addSubscription(channel, socket.id);
      socket.emit("subscribed", { channel: "orderbook", symbol: symbol.toUpperCase() });
      console.log(`📚 ${socket.id} subscribed to ${channel}`);
    });

    socket.on("unsubscribe:orderbook", (symbol) => {
      const channel = `orderbook:${symbol.toUpperCase()}`;
      socket.leave(channel);
      removeSubscription(channel, socket.id);
      socket.emit("unsubscribed", { channel: "orderbook", symbol: symbol.toUpperCase() });
    });

    // Handle trade subscriptions
    socket.on("subscribe:trades", (symbol) => {
      const channel = `trades:${symbol.toUpperCase()}`;
      socket.join(channel);
      addSubscription(channel, socket.id);
      socket.emit("subscribed", { channel: "trades", symbol: symbol.toUpperCase() });
      console.log(`💹 ${socket.id} subscribed to ${channel}`);
    });

    socket.on("unsubscribe:trades", (symbol) => {
      const channel = `trades:${symbol.toUpperCase()}`;
      socket.leave(channel);
      removeSubscription(channel, socket.id);
      socket.emit("unsubscribed", { channel: "trades", symbol: symbol.toUpperCase() });
    });

    // Handle candle subscriptions
    socket.on("subscribe:candles", (data) => {
      // Handle both object and string formats
      let symbol: string;
      let interval: string;
      
      if (typeof data === "string") {
        symbol = data.toUpperCase();
        interval = "1m";
      } else if (data && data.symbol) {
        symbol = data.symbol.toUpperCase();
        interval = data.interval || "1m";
      } else {
        socket.emit("error", { code: "INVALID_REQUEST", message: "Invalid subscription: symbol is required" });
        return;
      }
      
      const channel = `candles:${symbol}:${interval}`;
      socket.join(channel);
      addSubscription(channel, socket.id);
      socket.emit("subscribed", { channel: "candles", symbol, interval });
      console.log(`📊 ${socket.id} subscribed to ${channel}`);
    });

    socket.on("unsubscribe:candles", (data) => {
      let symbol: string;
      let interval: string;
      
      if (typeof data === "string") {
        symbol = data.toUpperCase();
        interval = "1m";
      } else if (data && data.symbol) {
        symbol = data.symbol.toUpperCase();
        interval = data.interval || "1m";
      } else {
        socket.emit("error", { code: "INVALID_REQUEST", message: "Invalid unsubscription: symbol is required" });
        return;
      }
      
      const channel = `candles:${symbol}:${interval}`;
      socket.leave(channel);
      removeSubscription(channel, socket.id);
      socket.emit("unsubscribed", { channel: "candles", symbol, interval });
    });

    // Handle funding subscriptions
    socket.on("subscribe:funding", (symbol) => {
      const channel = `funding:${symbol.toUpperCase()}`;
      socket.join(channel);
      addSubscription(channel, socket.id);
      socket.emit("subscribed", { channel: "funding", symbol: symbol.toUpperCase() });
      console.log(`💰 ${socket.id} subscribed to ${channel}`);
    });

    socket.on("unsubscribe:funding", (symbol) => {
      const channel = `funding:${symbol.toUpperCase()}`;
      socket.leave(channel);
      removeSubscription(channel, socket.id);
      socket.emit("unsubscribed", { channel: "funding", symbol: symbol.toUpperCase() });
    });

    // Handle XP subscriptions (requires authentication)
    socket.on("subscribe:xp", () => {
      if (!socket.data.authenticated || !socket.data.address) {
        socket.emit("error", { code: "UNAUTHORIZED", message: "Authentication required to subscribe to XP events" });
        return;
      }
      const channel = `xp:${socket.data.address.toLowerCase()}`;
      socket.join(channel);
      addSubscription(channel, socket.id);
      socket.emit("subscribed", { channel: "xp" });
      console.log(`✨ ${socket.id} subscribed to XP events`);
    });

    socket.on("unsubscribe:xp", () => {
      if (socket.data.address) {
        const channel = `xp:${socket.data.address.toLowerCase()}`;
        socket.leave(channel);
        removeSubscription(channel, socket.id);
        socket.emit("unsubscribed", { channel: "xp" });
      }
    });

    // Handle disconnection
    socket.on("disconnect", (reason) => {
      console.log(`📡 WebSocket disconnected: ${socket.id} (${reason})`);
      // Clean up subscriptions
      subscriptions.forEach((sockets, channel) => {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          subscriptions.delete(channel);
        }
      });
    });
  });

  return io;
}

/**
 * Get the Socket.IO server instance
 */
export function getIO(): Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> | null {
  return io;
}

/**
 * Broadcast price update to subscribers
 */
export function broadcastPriceUpdate(symbol: string, data: PriceUpdate): void {
  if (!io) return;
  io.to(`price:${symbol.toUpperCase()}`).emit("price:update", data);
}

/**
 * Broadcast batch price updates
 */
export function broadcastPriceBatch(updates: PriceUpdate[]): void {
  if (!io) return;
  
  // Group by symbol and send to respective rooms
  const bySymbol = new Map<string, PriceUpdate[]>();
  updates.forEach((update) => {
    const key = update.symbol.toUpperCase();
    if (!bySymbol.has(key)) {
      bySymbol.set(key, []);
    }
    bySymbol.get(key)!.push(update);
  });
  
  bySymbol.forEach((symbolUpdates, symbol) => {
    io!.to(`price:${symbol}`).emit("price:batch", symbolUpdates);
  });
}

/**
 * Broadcast order book snapshot
 */
export function broadcastOrderBookSnapshot(symbol: string, data: OrderBookSnapshot): void {
  if (!io) return;
  io.to(`orderbook:${symbol.toUpperCase()}`).emit("orderbook:snapshot", data);
}

/**
 * Broadcast order book update
 */
export function broadcastOrderBookUpdate(symbol: string, data: OrderBookUpdate): void {
  if (!io) return;
  io.to(`orderbook:${symbol.toUpperCase()}`).emit("orderbook:update", data);
}

/**
 * Broadcast trade execution
 */
export function broadcastTradeExecuted(symbol: string, data: TradeExecuted): void {
  if (!io) return;
  io.to(`trades:${symbol.toUpperCase()}`).emit("trade:executed", data);
}

/**
 * Broadcast candle update
 */
export function broadcastCandleUpdate(symbol: string, data: CandleUpdate): void {
  if (!io) return;
  const channel = `candles:${symbol.toUpperCase()}:${data.interval}`;
  io.to(channel).emit("candle:update", data);
}

/**
 * Send user-specific order update
 */
export function sendOrderUpdate(
  userAddress: string,
  event: "order:created" | "order:filled" | "order:cancelled",
  data: OrderEvent
): void {
  if (!io) return;
  io.to(`user:${userAddress.toLowerCase()}`).emit(event, data);
}

/**
 * Send user-specific balance update
 */
export function sendBalanceUpdate(userAddress: string, data: BalanceUpdate): void {
  if (!io) return;
  io.to(`user:${userAddress.toLowerCase()}`).emit("balance:updated", data);
}

/**
 * Send user-specific position update
 */
export function sendPositionUpdate(userAddress: string, data: PositionUpdate): void {
  if (!io) return;
  
  const room = `user:${userAddress.toLowerCase()}`;
  
  // Send appropriate event based on status
  if (data.status === "closed") {
    io.to(room).emit("position:closed", data);
  } else if (data.status === "liquidated") {
    io.to(room).emit("position:liquidated", data);
  } else if (data.size > 0) {
    io.to(room).emit("position:updated", data);
  }
  
  // Always send the general update
  io.to(room).emit("position:updated", data);
}

/**
 * Send position opened event
 */
export function sendPositionOpened(userAddress: string, data: PositionUpdate): void {
  if (!io) return;
  io.to(`user:${userAddress.toLowerCase()}`).emit("position:opened", data);
}

/**
 * Broadcast funding rate update
 */
export function broadcastFundingUpdate(symbol: string, data: FundingUpdate): void {
  if (!io) return;
  io.to(`funding:${symbol.toUpperCase()}`).emit("funding:update", data);
}

/**
 * Broadcast funding payment event (when funding is processed)
 */
export function broadcastFundingPayment(symbol: string, data: FundingPaymentEvent): void {
  if (!io) return;
  io.to(`funding:${symbol.toUpperCase()}`).emit("funding:payment", data);
}

/**
 * Send XP gained event to a user
 */
export function sendXPGained(userAddress: string, data: XPGainedEvent): void {
  if (!io) return;
  io.to(`xp:${userAddress.toLowerCase()}`).emit("xp:gained", data);
  // Also send to user's main room for backwards compatibility
  io.to(`user:${userAddress.toLowerCase()}`).emit("xp:gained", data);
}

/**
 * Send level up event to a user
 */
export function sendLevelUp(userAddress: string, data: LevelUpEvent): void {
  if (!io) return;
  io.to(`xp:${userAddress.toLowerCase()}`).emit("xp:levelup", data);
  // Also send to user's main room for backwards compatibility
  io.to(`user:${userAddress.toLowerCase()}`).emit("xp:levelup", data);
}

/**
 * Get active subscriptions for a channel
 */
export function getSubscriptionCount(channel: string): number {
  return subscriptions.get(channel)?.size || 0;
}

/**
 * Get all active channels
 */
export function getActiveChannels(): string[] {
  return Array.from(subscriptions.keys());
}

// Helper functions
function addSubscription(channel: string, socketId: string): void {
  if (!subscriptions.has(channel)) {
    subscriptions.set(channel, new Set());
  }
  subscriptions.get(channel)!.add(socketId);
}

function removeSubscription(channel: string, socketId: string): void {
  const sockets = subscriptions.get(channel);
  if (sockets) {
    sockets.delete(socketId);
    if (sockets.size === 0) {
      subscriptions.delete(channel);
    }
  }
}
