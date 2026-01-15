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

export default router;
