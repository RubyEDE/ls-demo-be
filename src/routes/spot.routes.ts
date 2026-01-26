import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { AuthenticatedRequest } from "../types";
import {
  placeSpotOrder,
  cancelSpotOrder,
  getUserSpotOpenOrders,
  getUserSpotOrderHistory,
  getUserSpotTradeHistory,
  getRecentSpotTrades,
  getSpotOrderBookSnapshot,
  getSpotSpread,
} from "../services/spot-order.service";
import {
  getSpotCandles,
  getCurrentSpotCandle,
  hasEnoughSpotCandles,
} from "../services/spot-candle.service";
import { SpotCandleInterval } from "../models/spot-candle.model";
import {
  getAllSpotBalancesWithUsd,
  getSpotBalanceSummary,
  getSpotBalanceByAddress,
  getSpotBalanceHistory,
  getOrCreateSpotBalance,
  creditSpotBalance,
} from "../services/spot-balance.service";
import { findUserByAddress } from "../services/user.service";
import { Types } from "mongoose";

const router = Router();

// ============ Spot Markets (hardcoded for now, can be DB-driven later) ============

interface SpotMarket {
  symbol: string;
  name: string;
  baseAsset: string;
  quoteAsset: string;
  tickSize: number;
  lotSize: number;
  minOrderSize: number;
  status: "active" | "paused";
}

// Spot markets derived from perp markets (same CS:GO items)
const SPOT_MARKETS: SpotMarket[] = [
  {
    symbol: "UMBREON-VMAX-SPOT",
    name: "Umbreon VMAX 215/203 Spot",
    baseAsset: "UMBREON-VMAX",
    quoteAsset: "USD",
    tickSize: 0.01,
    lotSize: 1,
    minOrderSize: 1,
    status: "active",
  },
];

function getSpotMarket(symbol: string): SpotMarket | undefined {
  return SPOT_MARKETS.find(m => m.symbol.toUpperCase() === symbol.toUpperCase());
}

// ============ Public Routes ============

/**
 * GET /spot/markets
 * Get all spot markets
 */
router.get("/markets", async (_req: Request, res: Response) => {
  try {
    const marketsWithPrices = SPOT_MARKETS.map((market) => {
      const spread = getSpotSpread(market.symbol);
      
      return {
        symbol: market.symbol,
        name: market.name,
        baseAsset: market.baseAsset,
        quoteAsset: market.quoteAsset,
        bestBid: spread.bid,
        bestAsk: spread.ask,
        spread: spread.spread,
        tickSize: market.tickSize,
        lotSize: market.lotSize,
        minOrderSize: market.minOrderSize,
        status: market.status,
      };
    });
    
    res.json({ markets: marketsWithPrices });
  } catch (error) {
    console.error("Error fetching spot markets:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch markets" });
  }
});

/**
 * GET /spot/markets/:symbol
 * Get a specific spot market
 */
router.get("/markets/:symbol", async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const market = getSpotMarket(symbol);
    
    if (!market) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Market not found" });
    }
    
    const spread = getSpotSpread(market.symbol);
    
    res.json({
      symbol: market.symbol,
      name: market.name,
      baseAsset: market.baseAsset,
      quoteAsset: market.quoteAsset,
      bestBid: spread.bid,
      bestAsk: spread.ask,
      spread: spread.spread,
      tickSize: market.tickSize,
      lotSize: market.lotSize,
      minOrderSize: market.minOrderSize,
      status: market.status,
    });
  } catch (error) {
    console.error("Error fetching spot market:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch market" });
  }
});

/**
 * GET /spot/orderbook/:symbol
 * Get spot order book for a market
 */
router.get("/orderbook/:symbol", async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const depth = parseInt(req.query.depth as string) || 20;
    
    const market = getSpotMarket(symbol);
    if (!market) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Market not found" });
    }
    
    const orderBook = getSpotOrderBookSnapshot(
      market.symbol,
      market.baseAsset,
      market.quoteAsset,
      depth
    );
    
    res.json(orderBook);
  } catch (error) {
    console.error("Error fetching spot order book:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch order book" });
  }
});

/**
 * GET /spot/trades/history
 * Get user's spot trade history
 * NOTE: This must be defined BEFORE /trades/:symbol to avoid "history" being matched as a symbol
 */
router.get("/trades/history", authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  try {
    const marketSymbol = req.query.market as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    
    const trades = await getUserSpotTradeHistory(authReq.auth!.address, marketSymbol, limit, offset);
    
    res.json({
      trades: trades.map((t) => ({
        tradeId: t.tradeId,
        marketSymbol: t.marketSymbol,
        baseAsset: t.baseAsset,
        quoteAsset: t.quoteAsset,
        side: t.side,
        price: t.price,
        quantity: t.quantity,
        quoteQuantity: t.quoteQuantity,
        fee: t.takerAddress === authReq.auth!.address.toLowerCase() ? t.takerFee : t.makerFee,
        isMaker: t.makerAddress === authReq.auth!.address.toLowerCase(),
        timestamp: t.createdAt,
      })),
      pagination: {
        limit,
        offset,
        hasMore: trades.length === limit,
      },
    });
  } catch (error) {
    console.error("Error fetching spot trade history:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch trade history" });
  }
});

/**
 * GET /spot/trades/:symbol
 * Get recent spot trades for a market
 */
router.get("/trades/:symbol", async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    
    const market = getSpotMarket(symbol);
    if (!market) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Market not found" });
    }
    
    const trades = await getRecentSpotTrades(symbol, limit);
    
    res.json({
      trades: trades.map((t) => ({
        id: t.tradeId,
        price: t.price,
        quantity: t.quantity,
        side: t.side,
        timestamp: t.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching spot trades:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch trades" });
  }
});

// ============ Public Routes - Candles ============

/**
 * GET /spot/candles/:symbol
 * Get candle/OHLCV data for a spot market
 * Query params: interval (1m, 5m, 15m, 1h, 4h, 1d), limit (default 400, max 2000)
 */
router.get("/candles/:symbol", async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const interval = (req.query.interval as SpotCandleInterval) || "1m";
    const limit = Math.min(parseInt(req.query.limit as string) || 400, 2000);
    
    // Validate interval
    const validIntervals: SpotCandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
    if (!validIntervals.includes(interval)) {
      return res.status(400).json({
        error: "INVALID_INTERVAL",
        message: `Invalid interval. Must be one of: ${validIntervals.join(", ")}`,
      });
    }
    
    const market = getSpotMarket(symbol);
    if (!market) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Market not found" });
    }
    
    // Get historical candles
    const candles = await getSpotCandles(market.symbol, interval, limit);
    
    // Get current (live) candle
    const currentCandle = getCurrentSpotCandle(market.symbol, interval);
    
    // Check if we have enough data
    const check = await hasEnoughSpotCandles(market.symbol, interval, 50);
    
    res.json({
      symbol: market.symbol,
      interval,
      candles: candles.map((c) => ({
        timestamp: c.timestamp.getTime(),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        trades: c.trades,
        isClosed: c.isClosed,
      })),
      currentCandle: currentCandle ? {
        timestamp: currentCandle.timestamp.getTime(),
        open: currentCandle.open,
        high: currentCandle.high,
        low: currentCandle.low,
        close: currentCandle.close,
        volume: currentCandle.volume,
        trades: currentCandle.trades,
        isClosed: false,
      } : null,
      meta: {
        count: candles.length,
        hasEnoughData: check.hasEnough,
        available: check.count,
        required: check.required,
      },
    });
  } catch (error) {
    console.error("Error fetching spot candles:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch candles" });
  }
});

/**
 * GET /spot/candles/:symbol/status
 * Check if we have enough candle data for charting
 */
router.get("/candles/:symbol/status", async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    
    const market = getSpotMarket(symbol);
    if (!market) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Market not found" });
    }
    
    const intervals: SpotCandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
    const status: Record<string, { hasEnough: boolean; count: number; required: number }> = {};
    
    for (const interval of intervals) {
      status[interval] = await hasEnoughSpotCandles(market.symbol, interval, 50);
    }
    
    res.json({
      symbol: market.symbol,
      intervals: status,
    });
  } catch (error) {
    console.error("Error fetching spot candle status:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch candle status" });
  }
});

// ============ Authenticated Routes - Orders ============

/**
 * POST /spot/orders
 * Place a new spot order
 */
router.post("/orders", authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  try {
    const { marketSymbol, side, type, price, quantity, postOnly } = req.body;
    
    // Validate required fields
    if (!marketSymbol || !side || !type || !quantity) {
      return res.status(400).json({
        error: "INVALID_REQUEST",
        message: "Missing required fields: marketSymbol, side, type, quantity",
      });
    }
    
    if (!["buy", "sell"].includes(side)) {
      return res.status(400).json({
        error: "INVALID_REQUEST",
        message: "Side must be 'buy' or 'sell'",
      });
    }
    
    if (!["limit", "market"].includes(type)) {
      return res.status(400).json({
        error: "INVALID_REQUEST",
        message: "Type must be 'limit' or 'market'",
      });
    }
    
    if (type === "limit" && (!price || price <= 0)) {
      return res.status(400).json({
        error: "INVALID_REQUEST",
        message: "Price is required for limit orders",
      });
    }
    
    // Get market info
    const market = getSpotMarket(marketSymbol);
    if (!market) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Market not found",
      });
    }
    
    if (market.status !== "active") {
      return res.status(400).json({
        error: "MARKET_PAUSED",
        message: "Market is not active",
      });
    }
    
    const result = await placeSpotOrder({
      marketSymbol: market.symbol,
      baseAsset: market.baseAsset,
      quoteAsset: market.quoteAsset,
      userAddress: authReq.auth!.address,
      side,
      type,
      price,
      quantity,
      postOnly,
    });
    
    if (!result.success) {
      return res.status(400).json({
        error: "ORDER_FAILED",
        message: result.error,
      });
    }
    
    res.status(201).json({
      order: {
        orderId: result.order!.orderId,
        marketSymbol: result.order!.marketSymbol,
        baseAsset: result.order!.baseAsset,
        quoteAsset: result.order!.quoteAsset,
        side: result.order!.side,
        type: result.order!.type,
        price: result.order!.price,
        quantity: result.order!.quantity,
        filledQuantity: result.order!.filledQuantity,
        remainingQuantity: result.order!.remainingQuantity,
        averagePrice: result.order!.averagePrice,
        status: result.order!.status,
        createdAt: result.order!.createdAt,
      },
      trades: result.trades?.map((t) => ({
        tradeId: t.tradeId,
        price: t.price,
        quantity: t.quantity,
        quoteQuantity: t.quoteQuantity,
        side: t.side,
      })),
    });
  } catch (error) {
    console.error("Error placing spot order:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to place order" });
  }
});

/**
 * DELETE /spot/orders/:orderId
 * Cancel a spot order
 */
router.delete("/orders/:orderId", authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  try {
    const orderId = req.params.orderId as string;
    
    const result = await cancelSpotOrder(orderId, authReq.auth!.address);
    
    if (!result.success) {
      return res.status(400).json({
        error: "CANCEL_FAILED",
        message: result.error,
      });
    }
    
    res.json({
      success: true,
      order: {
        orderId: result.order!.orderId,
        status: result.order!.status,
        cancelledAt: result.order!.cancelledAt,
      },
    });
  } catch (error) {
    console.error("Error cancelling spot order:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to cancel order" });
  }
});

/**
 * GET /spot/orders
 * Get user's open spot orders
 */
router.get("/orders", authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  try {
    const marketSymbol = req.query.market as string | undefined;
    
    const orders = await getUserSpotOpenOrders(authReq.auth!.address, marketSymbol);
    
    res.json({
      orders: orders.map((o) => ({
        orderId: o.orderId,
        marketSymbol: o.marketSymbol,
        baseAsset: o.baseAsset,
        quoteAsset: o.quoteAsset,
        side: o.side,
        type: o.type,
        price: o.price,
        quantity: o.quantity,
        filledQuantity: o.filledQuantity,
        remainingQuantity: o.remainingQuantity,
        averagePrice: o.averagePrice,
        status: o.status,
        createdAt: o.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching spot orders:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch orders" });
  }
});

/**
 * GET /spot/orders/history
 * Get user's spot order history
 */
router.get("/orders/history", authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  try {
    const marketSymbol = req.query.market as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    
    const orders = await getUserSpotOrderHistory(authReq.auth!.address, marketSymbol, limit, offset);
    
    res.json({
      orders: orders.map((o) => ({
        orderId: o.orderId,
        marketSymbol: o.marketSymbol,
        baseAsset: o.baseAsset,
        quoteAsset: o.quoteAsset,
        side: o.side,
        type: o.type,
        price: o.price,
        quantity: o.quantity,
        filledQuantity: o.filledQuantity,
        averagePrice: o.averagePrice,
        status: o.status,
        createdAt: o.createdAt,
        filledAt: o.filledAt,
        cancelledAt: o.cancelledAt,
      })),
      pagination: {
        limit,
        offset,
        hasMore: orders.length === limit,
      },
    });
  } catch (error) {
    console.error("Error fetching spot order history:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch order history" });
  }
});

// ============ Authenticated Routes - Balances ============

/**
 * GET /spot/balances
 * Get all spot balances for user (includes USD from main perp balance)
 */
router.get("/balances", authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  try {
    const balances = await getAllSpotBalancesWithUsd(authReq.auth!.address);
    
    res.json({ balances });
  } catch (error) {
    console.error("Error fetching spot balances:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch balances" });
  }
});

/**
 * GET /spot/balances/summary
 * Get non-zero spot balances summary
 */
router.get("/balances/summary", authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  try {
    const summary = await getSpotBalanceSummary(authReq.auth!.address);
    
    res.json({ balances: summary });
  } catch (error) {
    console.error("Error fetching spot balance summary:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch balance summary" });
  }
});

/**
 * GET /spot/balances/:asset
 * Get spot balance for a specific asset
 */
router.get("/balances/:asset", authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  try {
    const asset = req.params.asset as string;
    
    const balance = await getSpotBalanceByAddress(authReq.auth!.address, asset);
    
    if (!balance) {
      return res.json({
        asset: asset.toUpperCase(),
        free: 0,
        locked: 0,
        total: 0,
      });
    }
    
    res.json({
      asset: balance.asset,
      free: balance.free,
      locked: balance.locked,
      total: balance.free + balance.locked,
    });
  } catch (error) {
    console.error("Error fetching spot balance:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch balance" });
  }
});

/**
 * GET /spot/balances/:asset/history
 * Get balance change history for an asset
 */
router.get("/balances/:asset/history", authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  try {
    const asset = req.params.asset as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    
    const history = await getSpotBalanceHistory(authReq.auth!.address, asset, limit, offset);
    
    res.json({
      changes: history,
      pagination: {
        limit,
        offset,
        hasMore: history.length === limit,
      },
    });
  } catch (error) {
    console.error("Error fetching spot balance history:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch balance history" });
  }
});

// ============ Test/Dev Endpoints ============

/**
 * POST /spot/faucet
 * Seed spot balances for testing (dev only)
 * Body: { asset: string, amount: number }
 */
router.post("/faucet", authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  try {
    const { asset, amount } = req.body;
    
    if (!asset || !amount || amount <= 0) {
      return res.status(400).json({
        error: "INVALID_REQUEST",
        message: "Asset and positive amount are required",
      });
    }
    
    // Find user
    const user = await findUserByAddress(authReq.auth!.address);
    if (!user) {
      return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
    }
    
    // Credit the balance
    const result = await creditSpotBalance(
      user._id as Types.ObjectId,
      authReq.auth!.address,
      asset,
      amount,
      "Spot faucet"
    );
    
    if (!result.success) {
      return res.status(400).json({
        error: "FAUCET_FAILED",
        message: result.error,
      });
    }
    
    res.json({
      success: true,
      balance: {
        asset: result.balance!.asset,
        free: result.balance!.free,
        locked: result.balance!.locked,
        total: result.balance!.free + result.balance!.locked,
      },
    });
  } catch (error) {
    console.error("Error in spot faucet:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to process faucet request" });
  }
});

export default router;
