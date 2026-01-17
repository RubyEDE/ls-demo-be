import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { AuthenticatedRequest } from "../types";
import { getActiveMarkets, getMarket, getCachedPrice } from "../services/market.service";
import { getOrderBookSnapshot, getSpread } from "../services/orderbook.service";
import { getSyntheticOrderCount } from "../services/marketmaker.service";
import { 
  placeOrder, 
  cancelOrder, 
  getUserOpenOrders, 
  getUserOrderHistory,
  getUserTradeHistory,
  getRecentTrades 
} from "../services/order.service";
import {
  getUserPositions,
  getPositionHistory,
  getPositionSummary,
  getOpenPosition,
  closePosition,
  calculateUnrealizedPnl,
} from "../services/position.service";
import {
  getCandles,
  getCurrentCandle,
  hasEnoughCandles,
  getMarketStatus,
  getGapStats,
  findMissingCandles,
  fillMissingCandles,
  checkAndFillGaps,
  fetchAllHistoricalData,
  isUSMarketOpen,
} from "../services/candle.service";
import { CandleInterval } from "../models/candle.model";
import {
  getLiquidationStats,
  getPositionsAtRiskOfLiquidation,
  checkPositionLiquidation,
} from "../services/liquidation.service";

const router = Router();

/**
 * GET /clob/markets
 * Get all active markets
 */
router.get("/markets", async (_req: Request, res: Response) => {
  try {
    const markets = await getActiveMarkets();
    
    // Add current prices and spread info
    const marketsWithPrices = markets.map((market) => {
      const price = getCachedPrice(market.symbol);
      const spread = getSpread(market.symbol);
      
      return {
        symbol: market.symbol,
        name: market.name,
        baseAsset: market.baseAsset,
        quoteAsset: market.quoteAsset,
        oraclePrice: price,
        bestBid: spread.bid,
        bestAsk: spread.ask,
        spread: spread.spread,
        tickSize: market.tickSize,
        lotSize: market.lotSize,
        minOrderSize: market.minOrderSize,
        maxOrderSize: market.maxOrderSize,
        maxLeverage: market.maxLeverage,
        fundingRate: market.fundingRate,
        volume24h: market.volume24h,
        status: market.status,
      };
    });
    
    res.json({ markets: marketsWithPrices });
  } catch (error) {
    console.error("Error fetching markets:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch markets" });
  }
});

/**
 * GET /clob/markets/:symbol
 * Get a specific market
 */
router.get("/markets/:symbol", async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const market = await getMarket(symbol);
    
    if (!market) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Market not found" });
    }
    
    const price = getCachedPrice(market.symbol);
    const spread = getSpread(market.symbol);
    const syntheticOrders = getSyntheticOrderCount(market.symbol);
    
    res.json({
      symbol: market.symbol,
      name: market.name,
      baseAsset: market.baseAsset,
      quoteAsset: market.quoteAsset,
      oraclePrice: price,
      oraclePriceUpdatedAt: market.oraclePriceUpdatedAt,
      bestBid: spread.bid,
      bestAsk: spread.ask,
      spread: spread.spread,
      tickSize: market.tickSize,
      lotSize: market.lotSize,
      minOrderSize: market.minOrderSize,
      maxOrderSize: market.maxOrderSize,
      maxLeverage: market.maxLeverage,
      initialMarginRate: market.initialMarginRate,
      maintenanceMarginRate: market.maintenanceMarginRate,
      fundingRate: market.fundingRate,
      fundingInterval: market.fundingInterval,
      nextFundingTime: market.nextFundingTime,
      volume24h: market.volume24h,
      high24h: market.high24h,
      low24h: market.low24h,
      openInterest: market.openInterest,
      syntheticOrders,
      status: market.status,
    });
  } catch (error) {
    console.error("Error fetching market:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch market" });
  }
});

/**
 * GET /clob/orderbook/:symbol
 * Get order book for a market
 */
router.get("/orderbook/:symbol", async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const depth = parseInt(req.query.depth as string) || 20;
    
    const market = await getMarket(symbol);
    if (!market) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Market not found" });
    }
    
    const orderBook = getOrderBookSnapshot(symbol, depth);
    const oraclePrice = getCachedPrice(symbol);
    
    res.json({
      ...orderBook,
      oraclePrice,
    });
  } catch (error) {
    console.error("Error fetching order book:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch order book" });
  }
});

/**
 * GET /clob/trades/:symbol
 * Get recent trades for a market
 */
router.get("/trades/:symbol", async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    
    const market = await getMarket(symbol);
    if (!market) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Market not found" });
    }
    
    const trades = await getRecentTrades(symbol, limit);
    
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
    console.error("Error fetching trades:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch trades" });
  }
});

// ============ Authenticated Routes ============

/**
 * POST /clob/orders
 * Place a new order
 */
router.post("/orders", authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  try {
    const { marketSymbol, side, type, price, quantity, postOnly, reduceOnly } = req.body;
    
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
    
    const result = await placeOrder({
      marketSymbol,
      userAddress: authReq.auth!.address,
      side,
      type,
      price,
      quantity,
      postOnly,
      reduceOnly,
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
        side: t.side,
      })),
    });
  } catch (error) {
    console.error("Error placing order:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to place order" });
  }
});

/**
 * DELETE /clob/orders/:orderId
 * Cancel an order
 */
router.delete("/orders/:orderId", authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  try {
    const orderId = req.params.orderId as string;
    
    const result = await cancelOrder(orderId, authReq.auth!.address);
    
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
    console.error("Error cancelling order:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to cancel order" });
  }
});

/**
 * GET /clob/orders
 * Get user's open orders
 */
router.get("/orders", authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  try {
    const marketSymbol = req.query.market as string | undefined;
    
    const orders = await getUserOpenOrders(authReq.auth!.address, marketSymbol);
    
    res.json({
      orders: orders.map((o) => ({
        orderId: o.orderId,
        marketSymbol: o.marketSymbol,
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
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch orders" });
  }
});

/**
 * GET /clob/orders/history
 * Get user's order history
 */
router.get("/orders/history", authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  try {
    const marketSymbol = req.query.market as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    
    const orders = await getUserOrderHistory(authReq.auth!.address, marketSymbol, limit, offset);
    
    res.json({
      orders: orders.map((o) => ({
        orderId: o.orderId,
        marketSymbol: o.marketSymbol,
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
    console.error("Error fetching order history:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch order history" });
  }
});

/**
 * GET /clob/trades/history
 * Get user's trade history
 */
router.get("/trades/history", authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  try {
    const marketSymbol = req.query.market as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    
    const trades = await getUserTradeHistory(authReq.auth!.address, marketSymbol, limit, offset);
    
    res.json({
      trades: trades.map((t) => ({
        tradeId: t.tradeId,
        marketSymbol: t.marketSymbol,
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
    console.error("Error fetching trade history:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch trade history" });
  }
});

// ============ Position Routes ============

/**
 * GET /clob/positions
 * Get user's open positions
 */
router.get("/positions", authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  try {
    const positions = await getUserPositions(authReq.auth!.address);
    
    res.json({
      positions: positions.map((p) => {
        const currentPrice = getCachedPrice(p.marketSymbol);
        return {
          positionId: p.positionId,
          marketSymbol: p.marketSymbol,
          side: p.side,
          size: p.size,
          entryPrice: p.entryPrice,
          markPrice: currentPrice,
          margin: p.margin,
          leverage: p.leverage,
          unrealizedPnl: currentPrice ? calculateUnrealizedPnl(p, currentPrice) : p.unrealizedPnl,
          realizedPnl: p.realizedPnl,
          liquidationPrice: p.liquidationPrice,
          status: p.status,
          openedAt: p.openedAt,
        };
      }),
    });
  } catch (error) {
    console.error("Error fetching positions:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch positions" });
  }
});

/**
 * GET /clob/positions/summary
 * Get user's position summary (total PnL, margin, etc.)
 */
router.get("/positions/summary", authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  try {
    const summary = await getPositionSummary(authReq.auth!.address);
    
    res.json({
      totalPositions: summary.totalPositions,
      totalMargin: summary.totalMargin,
      totalUnrealizedPnl: summary.totalUnrealizedPnl,
      totalRealizedPnl: summary.totalRealizedPnl,
      totalEquity: summary.totalMargin + summary.totalUnrealizedPnl,
    });
  } catch (error) {
    console.error("Error fetching position summary:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch position summary" });
  }
});

/**
 * GET /clob/positions/history
 * Get user's closed position history
 * NOTE: Must be before /positions/:marketSymbol to avoid route conflict
 */
router.get("/positions/history", authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  try {
    const marketSymbol = req.query.market as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    
    const positions = await getPositionHistory(authReq.auth!.address, marketSymbol, limit, offset);
    
    res.json({
      positions: positions.map((p) => ({
        positionId: p.positionId,
        marketSymbol: p.marketSymbol,
        side: p.side,
        size: p.size,
        entryPrice: p.entryPrice,
        margin: p.margin,
        realizedPnl: p.realizedPnl,
        totalFeesPaid: p.totalFeesPaid,
        accumulatedFunding: p.accumulatedFunding,
        status: p.status,
        openedAt: p.openedAt,
        closedAt: p.closedAt,
      })),
      pagination: {
        limit,
        offset,
        hasMore: positions.length === limit,
      },
    });
  } catch (error) {
    console.error("Error fetching position history:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch position history" });
  }
});

/**
 * GET /clob/positions/:marketSymbol
 * Get user's position for a specific market
 */
router.get("/positions/:marketSymbol", authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  try {
    const marketSymbol = req.params.marketSymbol as string;
    
    const market = await getMarket(marketSymbol);
    if (!market) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Market not found" });
    }
    
    const position = await getOpenPosition(authReq.auth!.address, marketSymbol);
    
    if (!position) {
      return res.json({ position: null });
    }
    
    const currentPrice = getCachedPrice(marketSymbol);
    
    res.json({
      position: {
        positionId: position.positionId,
        marketSymbol: position.marketSymbol,
        side: position.side,
        size: position.size,
        entryPrice: position.entryPrice,
        markPrice: currentPrice,
        margin: position.margin,
        leverage: position.leverage,
        unrealizedPnl: currentPrice ? calculateUnrealizedPnl(position, currentPrice) : position.unrealizedPnl,
        realizedPnl: position.realizedPnl,
        liquidationPrice: position.liquidationPrice,
        accumulatedFunding: position.accumulatedFunding,
        totalFeesPaid: position.totalFeesPaid,
        status: position.status,
        openedAt: position.openedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching position:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch position" });
  }
});

/**
 * POST /clob/positions/:marketSymbol/close
 * Close a position (market order to close)
 */
router.post("/positions/:marketSymbol/close", authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  try {
    const marketSymbol = req.params.marketSymbol as string;
    const { quantity } = req.body; // Optional: partial close
    
    const position = await getOpenPosition(authReq.auth!.address, marketSymbol);
    
    if (!position) {
      return res.status(404).json({ error: "NOT_FOUND", message: "No open position in this market" });
    }
    
    // Get current price for market close
    const currentPrice = getCachedPrice(marketSymbol);
    if (!currentPrice) {
      return res.status(400).json({ error: "NO_PRICE", message: "No price available for market" });
    }
    
    // Determine close quantity
    const closeQty = quantity && quantity < position.size ? quantity : position.size;
    
    // Place a market order to close
    const closeSide = position.side === "long" ? "sell" : "buy";
    
    const result = await placeOrder({
      marketSymbol,
      userAddress: authReq.auth!.address,
      side: closeSide,
      type: "market",
      quantity: closeQty,
      reduceOnly: true,
    });
    
    if (!result.success) {
      return res.status(400).json({
        error: "CLOSE_FAILED",
        message: result.error,
      });
    }
    
    // Refetch position to get updated state
    const updatedPosition = await getOpenPosition(authReq.auth!.address, marketSymbol);
    
    res.json({
      success: true,
      closedQuantity: closeQty,
      order: result.order ? {
        orderId: result.order.orderId,
        averagePrice: result.order.averagePrice,
        status: result.order.status,
      } : null,
      position: updatedPosition ? {
        positionId: updatedPosition.positionId,
        side: updatedPosition.side,
        size: updatedPosition.size,
        realizedPnl: updatedPosition.realizedPnl,
        status: updatedPosition.status,
      } : null,
    });
  } catch (error) {
    console.error("Error closing position:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to close position" });
  }
});

// ============ Candle Routes ============

/**
 * GET /clob/market-status
 * Get current market status (open/closed, times)
 */
router.get("/market-status", (_req: Request, res: Response) => {
  const status = getMarketStatus();
  res.json(status);
});

/**
 * GET /clob/candles/:symbol
 * Get candle data for a market (public, no auth required)
 * Query params: interval (1m, 5m, 15m, 1h, 4h, 1d), limit (default 1000, max 10000)
 */
router.get("/candles/:symbol", async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const interval = (req.query.interval as CandleInterval) || "1m";
    const limit = Math.min(parseInt(req.query.limit as string) || 1000, 10000);
    
    // Validate interval
    const validIntervals: CandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
    if (!validIntervals.includes(interval)) {
      return res.status(400).json({
        error: "INVALID_INTERVAL",
        message: `Invalid interval. Must be one of: ${validIntervals.join(", ")}`,
      });
    }
    
    const market = await getMarket(symbol);
    if (!market) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Market not found" });
    }
    
    // Get historical candles
    const candles = await getCandles(market.symbol, interval, limit);
    
    // Get current (live) candle
    const currentCandle = getCurrentCandle(market.symbol, interval);
    
    // Check if we have enough data
    const check = await hasEnoughCandles(market.symbol, interval, 50);
    
    res.json({
      symbol: market.symbol,
      interval,
      marketStatus: getMarketStatus(),
      candles: candles.map((c) => ({
        timestamp: c.timestamp.getTime(),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        trades: c.trades,
        isClosed: c.isClosed,
        isMarketOpen: c.isMarketOpen,
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
    console.error("Error fetching candles:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch candles" });
  }
});

/**
 * GET /clob/candles/:symbol/status
 * Check if we have enough candle data for charting
 */
router.get("/candles/:symbol/status", async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    
    const market = await getMarket(symbol);
    if (!market) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Market not found" });
    }
    
    const intervals: CandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
    const status: Record<string, { hasEnough: boolean; count: number; required: number }> = {};
    
    for (const interval of intervals) {
      status[interval] = await hasEnoughCandles(market.symbol, interval, 50);
    }
    
    res.json({
      symbol: market.symbol,
      marketStatus: getMarketStatus(),
      intervals: status,
    });
  } catch (error) {
    console.error("Error checking candle status:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to check candle status" });
  }
});

/**
 * GET /clob/candles/:symbol/gaps
 * Get gap statistics for a market's candle data
 */
router.get("/candles/:symbol/gaps", async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    
    const market = await getMarket(symbol);
    if (!market) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Market not found" });
    }
    
    const stats = await getGapStats(market.symbol);
    
    res.json({
      symbol: stats.symbol,
      intervals: stats.intervals.map((s) => ({
        interval: s.interval,
        totalCandles: s.totalCandles,
        missingCandles: s.missingCandles,
        coveragePercent: s.coveragePercent + "%",
        oldestCandle: s.oldestCandle?.toISOString() || null,
        newestCandle: s.newestCandle?.toISOString() || null,
      })),
    });
  } catch (error) {
    console.error("Error fetching gap stats:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch gap stats" });
  }
});

/**
 * GET /clob/candles/:symbol/gaps/:interval
 * Get detailed gap information for a specific interval
 */
router.get("/candles/:symbol/gaps/:interval", async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const interval = req.params.interval as CandleInterval;
    
    // Validate interval
    const validIntervals: CandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
    if (!validIntervals.includes(interval)) {
      return res.status(400).json({
        error: "INVALID_INTERVAL",
        message: `Invalid interval. Must be one of: ${validIntervals.join(", ")}`,
      });
    }
    
    const market = await getMarket(symbol);
    if (!market) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Market not found" });
    }
    
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const missing = await findMissingCandles(market.symbol, interval);
    
    res.json({
      symbol: market.symbol,
      interval,
      totalMissing: missing.length,
      missingTimestamps: missing.slice(0, limit).map((t) => t.toISOString()),
      truncated: missing.length > limit,
    });
  } catch (error) {
    console.error("Error fetching missing candles:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch missing candles" });
  }
});

/**
 * POST /clob/candles/:symbol/fill-gaps
 * Fill missing candles for a market (creates synthetic data)
 * Query params: interval (optional, if not provided fills all intervals)
 */
router.post("/candles/:symbol/fill-gaps", async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const interval = req.query.interval as CandleInterval | undefined;
    
    const market = await getMarket(symbol);
    if (!market) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Market not found" });
    }
    
    // Validate interval if provided
    if (interval) {
      const validIntervals: CandleInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
      if (!validIntervals.includes(interval)) {
        return res.status(400).json({
          error: "INVALID_INTERVAL",
          message: `Invalid interval. Must be one of: ${validIntervals.join(", ")}`,
        });
      }
      
      // Fill gaps for specific interval
      const missing = await findMissingCandles(market.symbol, interval);
      const filled = await fillMissingCandles(market.symbol, interval, missing);
      
      res.json({
        success: true,
        symbol: market.symbol,
        interval,
        gapsFound: missing.length,
        candlesFilled: filled,
      });
    } else {
      // Fill gaps for all intervals
      const results = await checkAndFillGaps(market.symbol);
      
      const totalMissing = results.reduce((sum, r) => sum + r.missing, 0);
      const totalFilled = results.reduce((sum, r) => sum + r.filled, 0);
      
      res.json({
        success: true,
        symbol: market.symbol,
        totalGapsFound: totalMissing,
        totalCandlesFilled: totalFilled,
        byInterval: results.map((r) => ({
          interval: r.interval,
          gapsFound: r.missing,
          candlesFilled: r.filled,
        })),
      });
    }
  } catch (error) {
    console.error("Error filling candle gaps:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fill candle gaps" });
  }
});

/**
 * POST /clob/candles/:symbol/fetch-historical
 * Fetch real historical data from Finnhub
 * Query params: days (default 365)
 */
router.post("/candles/:symbol/fetch-historical", async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const days = Math.min(parseInt(req.query.days as string) || 365, 365);
    
    const market = await getMarket(symbol);
    if (!market) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Market not found" });
    }
    
    console.log(`📈 Manual historical data fetch triggered for ${market.symbol}`);
    
    // Fetch historical data
    await fetchAllHistoricalData(market.finnhubSymbol, market.symbol, days);
    
    // Get updated stats
    const stats = await getGapStats(market.symbol);
    
    res.json({
      success: true,
      symbol: market.symbol,
      daysFetched: days,
      intervals: stats.intervals.map((s) => ({
        interval: s.interval,
        totalCandles: s.totalCandles,
        missingCandles: s.missingCandles,
        coveragePercent: s.coveragePercent + "%",
      })),
    });
  } catch (error) {
    console.error("Error fetching historical candles:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch historical candles" });
  }
});

/**
 * GET /clob/market-hours
 * Get current US market hours status
 */
router.get("/market-hours", (_req: Request, res: Response) => {
  const now = new Date();
  const isOpen = isUSMarketOpen(now);
  
  res.json({
    timestamp: now.toISOString(),
    usMarket: {
      isOpen,
      hours: "9:30 AM - 4:00 PM ET",
      days: "Monday - Friday",
    },
    perpetualsDex: {
      isOpen: true,
      hours: "24/7",
    },
  });
});

// ============ Liquidation Routes ============

/**
 * GET /clob/liquidation/stats
 * Get liquidation engine statistics (public)
 */
router.get("/liquidation/stats", (_req: Request, res: Response) => {
  const stats = getLiquidationStats();
  res.json({
    totalLiquidations: stats.totalLiquidations,
    totalValueLiquidated: stats.totalValueLiquidated,
    lastLiquidationAt: stats.lastLiquidationAt?.toISOString() || null,
  });
});

/**
 * GET /clob/liquidation/at-risk
 * Get positions at risk of liquidation (public, for market transparency)
 * Query params: threshold (default 5 = positions within 5% of liquidation)
 */
router.get("/liquidation/at-risk", async (req: Request, res: Response) => {
  try {
    const threshold = Math.min(parseFloat(req.query.threshold as string) || 5, 20);
    
    const atRisk = await getPositionsAtRiskOfLiquidation(threshold);
    
    res.json({
      threshold: `${threshold}%`,
      count: atRisk.length,
      positions: atRisk.map((r) => ({
        marketSymbol: r.position.marketSymbol,
        side: r.position.side,
        size: r.position.size,
        entryPrice: r.position.entryPrice,
        currentPrice: r.currentPrice,
        liquidationPrice: r.position.liquidationPrice,
        distanceToLiquidation: r.distanceToLiquidation,
        distancePercent: r.distancePercent.toFixed(2) + "%",
        margin: r.position.margin,
        // Don't expose user address for privacy
      })),
    });
  } catch (error) {
    console.error("Error fetching at-risk positions:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch at-risk positions" });
  }
});

/**
 * GET /clob/positions/:marketSymbol/liquidation-risk
 * Check liquidation risk for user's position in a specific market
 */
router.get("/positions/:marketSymbol/liquidation-risk", authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  
  try {
    const marketSymbol = req.params.marketSymbol as string;
    
    const market = await getMarket(marketSymbol);
    if (!market) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Market not found" });
    }
    
    const position = await getOpenPosition(authReq.auth!.address, marketSymbol);
    
    if (!position) {
      return res.json({ 
        hasPosition: false,
        atRisk: false,
      });
    }
    
    const currentPrice = getCachedPrice(marketSymbol);
    
    if (!currentPrice) {
      return res.json({
        hasPosition: true,
        atRisk: false,
        message: "No price data available",
      });
    }
    
    // Calculate distance to liquidation
    let distanceToLiquidation: number;
    let distancePercent: number;
    
    if (position.side === "long") {
      distanceToLiquidation = currentPrice - position.liquidationPrice;
      distancePercent = (distanceToLiquidation / currentPrice) * 100;
    } else {
      distanceToLiquidation = position.liquidationPrice - currentPrice;
      distancePercent = (distanceToLiquidation / currentPrice) * 100;
    }
    
    const atRisk = distancePercent <= 10; // Within 10% of liquidation
    const critical = distancePercent <= 3;  // Within 3% of liquidation
    
    res.json({
      hasPosition: true,
      positionId: position.positionId,
      side: position.side,
      size: position.size,
      entryPrice: position.entryPrice,
      currentPrice,
      liquidationPrice: position.liquidationPrice,
      distanceToLiquidation,
      distancePercent: distancePercent.toFixed(2) + "%",
      atRisk,
      critical,
      riskLevel: critical ? "critical" : atRisk ? "warning" : "safe",
    });
  } catch (error) {
    console.error("Error checking liquidation risk:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to check liquidation risk" });
  }
});

export default router;
