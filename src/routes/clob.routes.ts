import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { AuthenticatedRequest } from "../types";
import { getActiveMarkets, getMarket, getCachedPrice, getMarketPriceWithFallback } from "../services/market.service";
import { getOrderBookSnapshot, getSpread } from "../services/orderbook.service";
import { getSyntheticOrderCount } from "../services/light-market-maker.service";
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
} from "../services/candle.service";
import { CandleInterval } from "../models/candle.model";

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
      // Use fallback to get price from cache or database
      const price = getMarketPriceWithFallback(market.symbol, market);
      const spread = getSpread(market.symbol);
      
      return {
        symbol: market.symbol,
        name: market.name,
        baseAsset: market.baseAsset,
        quoteAsset: market.quoteAsset,
        oraclePrice: price,
        indexPrice: price, // Index price is the same as oracle price (spot reference)
        bestBid: spread.bid,
        bestAsk: spread.ask,
        spread: spread.spread,
        tickSize: market.tickSize,
        lotSize: market.lotSize,
        minOrderSize: market.minOrderSize,
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
    
    // Use fallback to get price from cache or database
    const price = getMarketPriceWithFallback(market.symbol, market);
    const spread = getSpread(market.symbol);
    const syntheticOrders = await getSyntheticOrderCount(market.symbol);
    
    res.json({
      symbol: market.symbol,
      name: market.name,
      baseAsset: market.baseAsset,
      quoteAsset: market.quoteAsset,
      oraclePrice: price,
      indexPrice: price, // Index price is the same as oracle price (spot reference)
      oraclePriceUpdatedAt: market.oraclePriceUpdatedAt,
      bestBid: spread.bid,
      bestAsk: spread.ask,
      spread: spread.spread,
      tickSize: market.tickSize,
      lotSize: market.lotSize,
      minOrderSize: market.minOrderSize,
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
    const { marketSymbol, side, type, price, quantity, leverage, postOnly, reduceOnly } = req.body;
    
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
      leverage,
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
      // Include realized PnL if the order closed/reduced a position
      realizedPnl: result.realizedPnl,
      newAchievements: result.newAchievements?.map((a) => ({
        id: a.achievement.id,
        name: a.achievement.name,
        description: a.achievement.description,
        icon: a.achievement.icon,
        points: a.achievement.points,
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
    
    // Get market for price fallback
    const market = await getMarket(marketSymbol);
    
    // Get current price for market close (with database fallback)
    const currentPrice = getMarketPriceWithFallback(marketSymbol, market);
    if (!currentPrice) {
      return res.status(400).json({ error: "NO_PRICE", message: "No price available for market" });
    }
    
    // Calculate the close side (opposite of position)
    const closeSide = position.side === "long" ? "sell" : "buy";
    
    // Check for existing pending close orders to prevent duplicate closes
    const existingCloseOrders = await getUserOpenOrders(authReq.auth!.address, marketSymbol);
    const pendingCloseQuantity = existingCloseOrders
      .filter(o => o.side === closeSide && o.reduceOnly)
      .reduce((sum, o) => sum + o.remainingQuantity, 0);
    
    // Calculate available size to close (position size minus pending close orders)
    const availableToClose = position.size - pendingCloseQuantity;
    
    if (availableToClose <= 0) {
      return res.status(400).json({
        error: "CLOSE_PENDING",
        message: "A close order is already pending for this position",
      });
    }
    
    // Determine close quantity (capped by available size)
    let closeQty = quantity && quantity < position.size ? quantity : position.size;
    closeQty = Math.min(closeQty, availableToClose);
    
    if (closeQty <= 0) {
      return res.status(400).json({
        error: "CLOSE_PENDING",
        message: "Cannot close more than available size after pending orders",
      });
    }
    
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
 * Get candle data for a market
 * Query params: interval (1m, 5m, 15m, 1h, 4h, 1d), limit (default 400)
 */
router.get("/candles/:symbol", async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const interval = (req.query.interval as CandleInterval) || "1m";
    const limit = Math.min(parseInt(req.query.limit as string) || 400, 2000);
    
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

// ============ Funding Rate Routes ============

import {
  getFundingRateInfo,
  getFundingHistory,
  getEstimatedFundingPayment,
  getAnnualizedFundingRate,
  getFundingStats,
} from "../services/funding.service";

/**
 * GET /clob/funding/:symbol
 * Get funding rate information for a market
 */
router.get("/funding/:symbol", async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    
    const fundingInfo = await getFundingRateInfo(symbol);
    
    if (!fundingInfo) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Market not found" });
    }
    
    // Calculate annualized rate
    const annualizedRate = getAnnualizedFundingRate(
      fundingInfo.currentFundingRate,
      fundingInfo.fundingInterval
    );
    
    res.json({
      marketSymbol: fundingInfo.marketSymbol,
      fundingRate: fundingInfo.currentFundingRate,
      fundingRatePercent: (fundingInfo.currentFundingRate * 100).toFixed(4) + "%",
      predictedFundingRate: fundingInfo.predictedFundingRate,
      predictedFundingRatePercent: (fundingInfo.predictedFundingRate * 100).toFixed(4) + "%",
      annualizedRate,
      annualizedRatePercent: (annualizedRate * 100).toFixed(2) + "%",
      markPrice: fundingInfo.markPrice,
      indexPrice: fundingInfo.indexPrice,
      premium: fundingInfo.premium,
      premiumPercent: (fundingInfo.premium * 100).toFixed(4) + "%",
      nextFundingTime: fundingInfo.nextFundingTime?.toISOString(),
      fundingIntervalHours: fundingInfo.fundingInterval,
      lastFunding: fundingInfo.lastFunding ? {
        fundingRate: fundingInfo.lastFunding.fundingRate,
        timestamp: fundingInfo.lastFunding.timestamp.toISOString(),
        positionsProcessed: fundingInfo.lastFunding.positionsProcessed,
      } : null,
    });
  } catch (error) {
    console.error("Error fetching funding info:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch funding info" });
  }
});

/**
 * GET /clob/funding/:symbol/history
 * Get funding payment history for a market
 */
router.get("/funding/:symbol/history", async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    
    const market = await getMarket(symbol);
    if (!market) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Market not found" });
    }
    
    const history = getFundingHistory(symbol, limit);
    
    res.json({
      marketSymbol: market.symbol,
      fundingHistory: history.map((h) => ({
        fundingRate: h.fundingRate,
        fundingRatePercent: (h.fundingRate * 100).toFixed(4) + "%",
        timestamp: h.timestamp.toISOString(),
        longPayment: h.longPayment,
        shortPayment: h.shortPayment,
        totalLongSize: h.totalLongSize,
        totalShortSize: h.totalShortSize,
        positionsProcessed: h.positionsProcessed,
      })),
      count: history.length,
    });
  } catch (error) {
    console.error("Error fetching funding history:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch funding history" });
  }
});

/**
 * GET /clob/funding/:symbol/estimate
 * Estimate funding payment for a hypothetical position
 */
router.get("/funding/:symbol/estimate", async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol as string;
    const side = req.query.side as "long" | "short";
    const size = parseFloat(req.query.size as string);
    
    if (!side || !["long", "short"].includes(side)) {
      return res.status(400).json({
        error: "INVALID_REQUEST",
        message: "Side must be 'long' or 'short'",
      });
    }
    
    if (!size || size <= 0) {
      return res.status(400).json({
        error: "INVALID_REQUEST",
        message: "Size must be a positive number",
      });
    }
    
    const market = await getMarket(symbol);
    if (!market) {
      return res.status(404).json({ error: "NOT_FOUND", message: "Market not found" });
    }
    
    const estimate = getEstimatedFundingPayment(symbol, side, size);
    
    res.json({
      marketSymbol: market.symbol,
      side,
      size,
      fundingRate: estimate.fundingRate,
      fundingRatePercent: (estimate.fundingRate * 100).toFixed(4) + "%",
      estimatedPayment: estimate.estimatedPayment,
      paymentDirection: estimate.paymentDirection,
      nextFundingTime: market.nextFundingTime?.toISOString(),
      fundingIntervalHours: market.fundingInterval,
    });
  } catch (error) {
    console.error("Error estimating funding:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to estimate funding" });
  }
});

/**
 * GET /clob/funding/stats
 * Get global funding statistics
 */
router.get("/funding-stats", async (_req: Request, res: Response) => {
  try {
    const stats = getFundingStats();
    
    res.json({
      totalFundingProcessed: stats.totalFundingProcessed,
      totalPaymentsDistributed: stats.totalPaymentsDistributed,
      lastFundingAt: stats.lastFundingAt?.toISOString() || null,
      isEngineRunning: stats.isRunning,
    });
  } catch (error) {
    console.error("Error fetching funding stats:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch funding stats" });
  }
});

// ============ Market Maker Admin Endpoints ============

import { 
  getLiquidityStats, 
  startLightMarketMaker, 
  stopLightMarketMaker, 
  forceRefreshAll,
  forceRefreshMarket,
  updateMarketMakerConfig,
  isMarketMakerRunning,
  getMarketMakerConfig,
} from "../services/light-market-maker.service";

/**
 * GET /clob/market-maker/stats
 * Get market maker statistics and liquidity info
 */
router.get("/market-maker/stats", async (_req: Request, res: Response) => {
  try {
    const stats = await getLiquidityStats();
    res.json(stats);
  } catch (error) {
    console.error("Error fetching market maker stats:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch market maker stats" });
  }
});

/**
 * POST /clob/market-maker/start
 * Start the light market maker
 */
router.post("/market-maker/start", async (_req: Request, res: Response) => {
  try {
    if (isMarketMakerRunning()) {
      return res.json({ success: true, message: "Market maker is already running" });
    }
    
    await startLightMarketMaker();
    res.json({ success: true, message: "Market maker started" });
  } catch (error) {
    console.error("Error starting market maker:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to start market maker" });
  }
});

/**
 * POST /clob/market-maker/stop
 * Stop the light market maker
 */
router.post("/market-maker/stop", async (_req: Request, res: Response) => {
  try {
    if (!isMarketMakerRunning()) {
      return res.json({ success: true, message: "Market maker is not running" });
    }
    
    await stopLightMarketMaker();
    res.json({ success: true, message: "Market maker stopped" });
  } catch (error) {
    console.error("Error stopping market maker:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to stop market maker" });
  }
});

/**
 * POST /clob/market-maker/refresh
 * Force refresh liquidity for all markets or a specific market
 */
router.post("/market-maker/refresh", async (req: Request, res: Response) => {
  try {
    const { market } = req.body as { market?: string };
    
    if (market) {
      await forceRefreshMarket(market);
      res.json({ success: true, message: `Refreshed liquidity for ${market}` });
    } else {
      await forceRefreshAll();
      res.json({ success: true, message: "Refreshed liquidity for all markets" });
    }
  } catch (error) {
    console.error("Error refreshing liquidity:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to refresh liquidity" });
  }
});

/**
 * GET /clob/market-maker/config
 * Get current market maker configuration
 */
router.get("/market-maker/config", (_req: Request, res: Response) => {
  try {
    const config = getMarketMakerConfig();
    res.json(config);
  } catch (error) {
    console.error("Error fetching market maker config:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch config" });
  }
});

/**
 * PUT /clob/market-maker/config
 * Update market maker configuration
 */
router.put("/market-maker/config", async (req: Request, res: Response) => {
  try {
    const newConfig = req.body as {
      spreadBps?: number;
      numLevels?: number;
      levelSpacingBps?: number;
      baseOrderSize?: number;
      sizeMultiplier?: number;
      refreshIntervalMs?: number;
      enabledMarkets?: string[];
    };
    
    updateMarketMakerConfig(newConfig);
    
    // Force refresh to apply new config
    if (isMarketMakerRunning()) {
      await forceRefreshAll();
    }
    
    const updatedConfig = getMarketMakerConfig();
    res.json({ success: true, config: updatedConfig });
  } catch (error) {
    console.error("Error updating market maker config:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update config" });
  }
});

export default router;
