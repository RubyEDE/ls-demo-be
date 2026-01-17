"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var auth_middleware_1 = require("../middleware/auth.middleware");
var market_service_1 = require("../services/market.service");
var orderbook_service_1 = require("../services/orderbook.service");
var marketmaker_service_1 = require("../services/marketmaker.service");
var order_service_1 = require("../services/order.service");
var position_service_1 = require("../services/position.service");
var candle_service_1 = require("../services/candle.service");
var liquidation_service_1 = require("../services/liquidation.service");
var router = (0, express_1.Router)();
/**
 * GET /clob/markets
 * Get all active markets
 */
router.get("/markets", function (_req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var markets, marketsWithPrices, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, (0, market_service_1.getActiveMarkets)()];
            case 1:
                markets = _a.sent();
                marketsWithPrices = markets.map(function (market) {
                    var price = (0, market_service_1.getCachedPrice)(market.symbol);
                    var spread = (0, orderbook_service_1.getSpread)(market.symbol);
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
                return [3 /*break*/, 3];
            case 2:
                error_1 = _a.sent();
                console.error("Error fetching markets:", error_1);
                res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch markets" });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /clob/markets/:symbol
 * Get a specific market
 */
router.get("/markets/:symbol", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbol, market, price, spread, syntheticOrders, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                symbol = req.params.symbol;
                return [4 /*yield*/, (0, market_service_1.getMarket)(symbol)];
            case 1:
                market = _a.sent();
                if (!market) {
                    return [2 /*return*/, res.status(404).json({ error: "NOT_FOUND", message: "Market not found" })];
                }
                price = (0, market_service_1.getCachedPrice)(market.symbol);
                spread = (0, orderbook_service_1.getSpread)(market.symbol);
                syntheticOrders = (0, marketmaker_service_1.getSyntheticOrderCount)(market.symbol);
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
                    syntheticOrders: syntheticOrders,
                    status: market.status,
                });
                return [3 /*break*/, 3];
            case 2:
                error_2 = _a.sent();
                console.error("Error fetching market:", error_2);
                res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch market" });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /clob/orderbook/:symbol
 * Get order book for a market
 */
router.get("/orderbook/:symbol", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbol, depth, market, orderBook, oraclePrice, error_3;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                symbol = req.params.symbol;
                depth = parseInt(req.query.depth) || 20;
                return [4 /*yield*/, (0, market_service_1.getMarket)(symbol)];
            case 1:
                market = _a.sent();
                if (!market) {
                    return [2 /*return*/, res.status(404).json({ error: "NOT_FOUND", message: "Market not found" })];
                }
                orderBook = (0, orderbook_service_1.getOrderBookSnapshot)(symbol, depth);
                oraclePrice = (0, market_service_1.getCachedPrice)(symbol);
                res.json(__assign(__assign({}, orderBook), { oraclePrice: oraclePrice }));
                return [3 /*break*/, 3];
            case 2:
                error_3 = _a.sent();
                console.error("Error fetching order book:", error_3);
                res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch order book" });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /clob/trades/:symbol
 * Get recent trades for a market
 */
router.get("/trades/:symbol", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbol, limit, market, trades, error_4;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                symbol = req.params.symbol;
                limit = Math.min(parseInt(req.query.limit) || 50, 100);
                return [4 /*yield*/, (0, market_service_1.getMarket)(symbol)];
            case 1:
                market = _a.sent();
                if (!market) {
                    return [2 /*return*/, res.status(404).json({ error: "NOT_FOUND", message: "Market not found" })];
                }
                return [4 /*yield*/, (0, order_service_1.getRecentTrades)(symbol, limit)];
            case 2:
                trades = _a.sent();
                res.json({
                    trades: trades.map(function (t) { return ({
                        id: t.tradeId,
                        price: t.price,
                        quantity: t.quantity,
                        side: t.side,
                        timestamp: t.createdAt,
                    }); }),
                });
                return [3 /*break*/, 4];
            case 3:
                error_4 = _a.sent();
                console.error("Error fetching trades:", error_4);
                res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch trades" });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// ============ Authenticated Routes ============
/**
 * POST /clob/orders
 * Place a new order
 */
router.post("/orders", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var authReq, _a, marketSymbol, side, type, price, quantity, postOnly, reduceOnly, result, error_5;
    var _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                authReq = req;
                _c.label = 1;
            case 1:
                _c.trys.push([1, 3, , 4]);
                _a = req.body, marketSymbol = _a.marketSymbol, side = _a.side, type = _a.type, price = _a.price, quantity = _a.quantity, postOnly = _a.postOnly, reduceOnly = _a.reduceOnly;
                // Validate required fields
                if (!marketSymbol || !side || !type || !quantity) {
                    return [2 /*return*/, res.status(400).json({
                            error: "INVALID_REQUEST",
                            message: "Missing required fields: marketSymbol, side, type, quantity",
                        })];
                }
                if (!["buy", "sell"].includes(side)) {
                    return [2 /*return*/, res.status(400).json({
                            error: "INVALID_REQUEST",
                            message: "Side must be 'buy' or 'sell'",
                        })];
                }
                if (!["limit", "market"].includes(type)) {
                    return [2 /*return*/, res.status(400).json({
                            error: "INVALID_REQUEST",
                            message: "Type must be 'limit' or 'market'",
                        })];
                }
                if (type === "limit" && (!price || price <= 0)) {
                    return [2 /*return*/, res.status(400).json({
                            error: "INVALID_REQUEST",
                            message: "Price is required for limit orders",
                        })];
                }
                return [4 /*yield*/, (0, order_service_1.placeOrder)({
                        marketSymbol: marketSymbol,
                        userAddress: authReq.auth.address,
                        side: side,
                        type: type,
                        price: price,
                        quantity: quantity,
                        postOnly: postOnly,
                        reduceOnly: reduceOnly,
                    })];
            case 2:
                result = _c.sent();
                if (!result.success) {
                    return [2 /*return*/, res.status(400).json({
                            error: "ORDER_FAILED",
                            message: result.error,
                        })];
                }
                res.status(201).json({
                    order: {
                        orderId: result.order.orderId,
                        marketSymbol: result.order.marketSymbol,
                        side: result.order.side,
                        type: result.order.type,
                        price: result.order.price,
                        quantity: result.order.quantity,
                        filledQuantity: result.order.filledQuantity,
                        remainingQuantity: result.order.remainingQuantity,
                        averagePrice: result.order.averagePrice,
                        status: result.order.status,
                        createdAt: result.order.createdAt,
                    },
                    trades: (_b = result.trades) === null || _b === void 0 ? void 0 : _b.map(function (t) { return ({
                        tradeId: t.tradeId,
                        price: t.price,
                        quantity: t.quantity,
                        side: t.side,
                    }); }),
                });
                return [3 /*break*/, 4];
            case 3:
                error_5 = _c.sent();
                console.error("Error placing order:", error_5);
                res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to place order" });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * DELETE /clob/orders/:orderId
 * Cancel an order
 */
router.delete("/orders/:orderId", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var authReq, orderId, result, error_6;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                authReq = req;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                orderId = req.params.orderId;
                return [4 /*yield*/, (0, order_service_1.cancelOrder)(orderId, authReq.auth.address)];
            case 2:
                result = _a.sent();
                if (!result.success) {
                    return [2 /*return*/, res.status(400).json({
                            error: "CANCEL_FAILED",
                            message: result.error,
                        })];
                }
                res.json({
                    success: true,
                    order: {
                        orderId: result.order.orderId,
                        status: result.order.status,
                        cancelledAt: result.order.cancelledAt,
                    },
                });
                return [3 /*break*/, 4];
            case 3:
                error_6 = _a.sent();
                console.error("Error cancelling order:", error_6);
                res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to cancel order" });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /clob/orders
 * Get user's open orders
 */
router.get("/orders", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var authReq, marketSymbol, orders, error_7;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                authReq = req;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                marketSymbol = req.query.market;
                return [4 /*yield*/, (0, order_service_1.getUserOpenOrders)(authReq.auth.address, marketSymbol)];
            case 2:
                orders = _a.sent();
                res.json({
                    orders: orders.map(function (o) { return ({
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
                    }); }),
                });
                return [3 /*break*/, 4];
            case 3:
                error_7 = _a.sent();
                console.error("Error fetching orders:", error_7);
                res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch orders" });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /clob/orders/history
 * Get user's order history
 */
router.get("/orders/history", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var authReq, marketSymbol, limit, offset, orders, error_8;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                authReq = req;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                marketSymbol = req.query.market;
                limit = Math.min(parseInt(req.query.limit) || 50, 100);
                offset = parseInt(req.query.offset) || 0;
                return [4 /*yield*/, (0, order_service_1.getUserOrderHistory)(authReq.auth.address, marketSymbol, limit, offset)];
            case 2:
                orders = _a.sent();
                res.json({
                    orders: orders.map(function (o) { return ({
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
                    }); }),
                    pagination: {
                        limit: limit,
                        offset: offset,
                        hasMore: orders.length === limit,
                    },
                });
                return [3 /*break*/, 4];
            case 3:
                error_8 = _a.sent();
                console.error("Error fetching order history:", error_8);
                res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch order history" });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /clob/trades/history
 * Get user's trade history
 */
router.get("/trades/history", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var authReq, marketSymbol, limit, offset, trades, error_9;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                authReq = req;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                marketSymbol = req.query.market;
                limit = Math.min(parseInt(req.query.limit) || 50, 100);
                offset = parseInt(req.query.offset) || 0;
                return [4 /*yield*/, (0, order_service_1.getUserTradeHistory)(authReq.auth.address, marketSymbol, limit, offset)];
            case 2:
                trades = _a.sent();
                res.json({
                    trades: trades.map(function (t) { return ({
                        tradeId: t.tradeId,
                        marketSymbol: t.marketSymbol,
                        side: t.side,
                        price: t.price,
                        quantity: t.quantity,
                        quoteQuantity: t.quoteQuantity,
                        fee: t.takerAddress === authReq.auth.address.toLowerCase() ? t.takerFee : t.makerFee,
                        isMaker: t.makerAddress === authReq.auth.address.toLowerCase(),
                        timestamp: t.createdAt,
                    }); }),
                    pagination: {
                        limit: limit,
                        offset: offset,
                        hasMore: trades.length === limit,
                    },
                });
                return [3 /*break*/, 4];
            case 3:
                error_9 = _a.sent();
                console.error("Error fetching trade history:", error_9);
                res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch trade history" });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
// ============ Position Routes ============
/**
 * GET /clob/positions
 * Get user's open positions
 */
router.get("/positions", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var authReq, positions, error_10;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                authReq = req;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, (0, position_service_1.getUserPositions)(authReq.auth.address)];
            case 2:
                positions = _a.sent();
                res.json({
                    positions: positions.map(function (p) {
                        var currentPrice = (0, market_service_1.getCachedPrice)(p.marketSymbol);
                        return {
                            positionId: p.positionId,
                            marketSymbol: p.marketSymbol,
                            side: p.side,
                            size: p.size,
                            entryPrice: p.entryPrice,
                            markPrice: currentPrice,
                            margin: p.margin,
                            leverage: p.leverage,
                            unrealizedPnl: currentPrice ? (0, position_service_1.calculateUnrealizedPnl)(p, currentPrice) : p.unrealizedPnl,
                            realizedPnl: p.realizedPnl,
                            liquidationPrice: p.liquidationPrice,
                            status: p.status,
                            openedAt: p.openedAt,
                        };
                    }),
                });
                return [3 /*break*/, 4];
            case 3:
                error_10 = _a.sent();
                console.error("Error fetching positions:", error_10);
                res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch positions" });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /clob/positions/summary
 * Get user's position summary (total PnL, margin, etc.)
 */
router.get("/positions/summary", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var authReq, summary, error_11;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                authReq = req;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, (0, position_service_1.getPositionSummary)(authReq.auth.address)];
            case 2:
                summary = _a.sent();
                res.json({
                    totalPositions: summary.totalPositions,
                    totalMargin: summary.totalMargin,
                    totalUnrealizedPnl: summary.totalUnrealizedPnl,
                    totalRealizedPnl: summary.totalRealizedPnl,
                    totalEquity: summary.totalMargin + summary.totalUnrealizedPnl,
                });
                return [3 /*break*/, 4];
            case 3:
                error_11 = _a.sent();
                console.error("Error fetching position summary:", error_11);
                res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch position summary" });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /clob/positions/history
 * Get user's closed position history
 * NOTE: Must be before /positions/:marketSymbol to avoid route conflict
 */
router.get("/positions/history", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var authReq, marketSymbol, limit, offset, positions, error_12;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                authReq = req;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                marketSymbol = req.query.market;
                limit = Math.min(parseInt(req.query.limit) || 50, 100);
                offset = parseInt(req.query.offset) || 0;
                return [4 /*yield*/, (0, position_service_1.getPositionHistory)(authReq.auth.address, marketSymbol, limit, offset)];
            case 2:
                positions = _a.sent();
                res.json({
                    positions: positions.map(function (p) { return ({
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
                    }); }),
                    pagination: {
                        limit: limit,
                        offset: offset,
                        hasMore: positions.length === limit,
                    },
                });
                return [3 /*break*/, 4];
            case 3:
                error_12 = _a.sent();
                console.error("Error fetching position history:", error_12);
                res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch position history" });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /clob/positions/:marketSymbol
 * Get user's position for a specific market
 */
router.get("/positions/:marketSymbol", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var authReq, marketSymbol, market, position, currentPrice, error_13;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                authReq = req;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 4, , 5]);
                marketSymbol = req.params.marketSymbol;
                return [4 /*yield*/, (0, market_service_1.getMarket)(marketSymbol)];
            case 2:
                market = _a.sent();
                if (!market) {
                    return [2 /*return*/, res.status(404).json({ error: "NOT_FOUND", message: "Market not found" })];
                }
                return [4 /*yield*/, (0, position_service_1.getOpenPosition)(authReq.auth.address, marketSymbol)];
            case 3:
                position = _a.sent();
                if (!position) {
                    return [2 /*return*/, res.json({ position: null })];
                }
                currentPrice = (0, market_service_1.getCachedPrice)(marketSymbol);
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
                        unrealizedPnl: currentPrice ? (0, position_service_1.calculateUnrealizedPnl)(position, currentPrice) : position.unrealizedPnl,
                        realizedPnl: position.realizedPnl,
                        liquidationPrice: position.liquidationPrice,
                        accumulatedFunding: position.accumulatedFunding,
                        totalFeesPaid: position.totalFeesPaid,
                        status: position.status,
                        openedAt: position.openedAt,
                    },
                });
                return [3 /*break*/, 5];
            case 4:
                error_13 = _a.sent();
                console.error("Error fetching position:", error_13);
                res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch position" });
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
/**
 * POST /clob/positions/:marketSymbol/close
 * Close a position (market order to close)
 */
router.post("/positions/:marketSymbol/close", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var authReq, marketSymbol, quantity, position, currentPrice, closeQty, closeSide, result, updatedPosition, error_14;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                authReq = req;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 5, , 6]);
                marketSymbol = req.params.marketSymbol;
                quantity = req.body.quantity;
                return [4 /*yield*/, (0, position_service_1.getOpenPosition)(authReq.auth.address, marketSymbol)];
            case 2:
                position = _a.sent();
                if (!position) {
                    return [2 /*return*/, res.status(404).json({ error: "NOT_FOUND", message: "No open position in this market" })];
                }
                currentPrice = (0, market_service_1.getCachedPrice)(marketSymbol);
                if (!currentPrice) {
                    return [2 /*return*/, res.status(400).json({ error: "NO_PRICE", message: "No price available for market" })];
                }
                closeQty = quantity && quantity < position.size ? quantity : position.size;
                closeSide = position.side === "long" ? "sell" : "buy";
                return [4 /*yield*/, (0, order_service_1.placeOrder)({
                        marketSymbol: marketSymbol,
                        userAddress: authReq.auth.address,
                        side: closeSide,
                        type: "market",
                        quantity: closeQty,
                        reduceOnly: true,
                    })];
            case 3:
                result = _a.sent();
                if (!result.success) {
                    return [2 /*return*/, res.status(400).json({
                            error: "CLOSE_FAILED",
                            message: result.error,
                        })];
                }
                return [4 /*yield*/, (0, position_service_1.getOpenPosition)(authReq.auth.address, marketSymbol)];
            case 4:
                updatedPosition = _a.sent();
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
                return [3 /*break*/, 6];
            case 5:
                error_14 = _a.sent();
                console.error("Error closing position:", error_14);
                res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to close position" });
                return [3 /*break*/, 6];
            case 6: return [2 /*return*/];
        }
    });
}); });
// ============ Candle Routes ============
/**
 * GET /clob/market-status
 * Get current market status (open/closed, times)
 */
router.get("/market-status", function (_req, res) {
    var status = (0, candle_service_1.getMarketStatus)();
    res.json(status);
});
/**
 * GET /clob/candles/:symbol
 * Get candle data for a market (public, no auth required)
 * Query params: interval (1m, 5m, 15m, 1h, 4h, 1d), limit (default 1000, max 10000)
 */
router.get("/candles/:symbol", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbol, interval, limit, validIntervals, market, candles, currentCandle, check, error_15;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 4, , 5]);
                symbol = req.params.symbol;
                interval = req.query.interval || "1m";
                limit = Math.min(parseInt(req.query.limit) || 1000, 10000);
                validIntervals = ["1m", "5m", "15m", "1h", "4h", "1d"];
                if (!validIntervals.includes(interval)) {
                    return [2 /*return*/, res.status(400).json({
                            error: "INVALID_INTERVAL",
                            message: "Invalid interval. Must be one of: ".concat(validIntervals.join(", ")),
                        })];
                }
                return [4 /*yield*/, (0, market_service_1.getMarket)(symbol)];
            case 1:
                market = _a.sent();
                if (!market) {
                    return [2 /*return*/, res.status(404).json({ error: "NOT_FOUND", message: "Market not found" })];
                }
                return [4 /*yield*/, (0, candle_service_1.getCandles)(market.symbol, interval, limit)];
            case 2:
                candles = _a.sent();
                currentCandle = (0, candle_service_1.getCurrentCandle)(market.symbol, interval);
                return [4 /*yield*/, (0, candle_service_1.hasEnoughCandles)(market.symbol, interval, 50)];
            case 3:
                check = _a.sent();
                res.json({
                    symbol: market.symbol,
                    interval: interval,
                    marketStatus: (0, candle_service_1.getMarketStatus)(),
                    candles: candles.map(function (c) { return ({
                        timestamp: c.timestamp.getTime(),
                        open: c.open,
                        high: c.high,
                        low: c.low,
                        close: c.close,
                        volume: c.volume,
                        trades: c.trades,
                        isClosed: c.isClosed,
                        isMarketOpen: c.isMarketOpen,
                    }); }),
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
                return [3 /*break*/, 5];
            case 4:
                error_15 = _a.sent();
                console.error("Error fetching candles:", error_15);
                res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch candles" });
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /clob/candles/:symbol/status
 * Check if we have enough candle data for charting
 */
router.get("/candles/:symbol/status", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbol, market, intervals, status_1, _i, intervals_1, interval, _a, _b, error_16;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _c.trys.push([0, 6, , 7]);
                symbol = req.params.symbol;
                return [4 /*yield*/, (0, market_service_1.getMarket)(symbol)];
            case 1:
                market = _c.sent();
                if (!market) {
                    return [2 /*return*/, res.status(404).json({ error: "NOT_FOUND", message: "Market not found" })];
                }
                intervals = ["1m", "5m", "15m", "1h", "4h", "1d"];
                status_1 = {};
                _i = 0, intervals_1 = intervals;
                _c.label = 2;
            case 2:
                if (!(_i < intervals_1.length)) return [3 /*break*/, 5];
                interval = intervals_1[_i];
                _a = status_1;
                _b = interval;
                return [4 /*yield*/, (0, candle_service_1.hasEnoughCandles)(market.symbol, interval, 50)];
            case 3:
                _a[_b] = _c.sent();
                _c.label = 4;
            case 4:
                _i++;
                return [3 /*break*/, 2];
            case 5:
                res.json({
                    symbol: market.symbol,
                    marketStatus: (0, candle_service_1.getMarketStatus)(),
                    intervals: status_1,
                });
                return [3 /*break*/, 7];
            case 6:
                error_16 = _c.sent();
                console.error("Error checking candle status:", error_16);
                res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to check candle status" });
                return [3 /*break*/, 7];
            case 7: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /clob/candles/:symbol/gaps
 * Get gap statistics for a market's candle data
 */
router.get("/candles/:symbol/gaps", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbol, market, stats, error_17;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                symbol = req.params.symbol;
                return [4 /*yield*/, (0, market_service_1.getMarket)(symbol)];
            case 1:
                market = _a.sent();
                if (!market) {
                    return [2 /*return*/, res.status(404).json({ error: "NOT_FOUND", message: "Market not found" })];
                }
                return [4 /*yield*/, (0, candle_service_1.getGapStats)(market.symbol)];
            case 2:
                stats = _a.sent();
                res.json({
                    symbol: stats.symbol,
                    intervals: stats.intervals.map(function (s) {
                        var _a, _b;
                        return ({
                            interval: s.interval,
                            totalCandles: s.totalCandles,
                            missingCandles: s.missingCandles,
                            coveragePercent: s.coveragePercent + "%",
                            oldestCandle: ((_a = s.oldestCandle) === null || _a === void 0 ? void 0 : _a.toISOString()) || null,
                            newestCandle: ((_b = s.newestCandle) === null || _b === void 0 ? void 0 : _b.toISOString()) || null,
                        });
                    }),
                });
                return [3 /*break*/, 4];
            case 3:
                error_17 = _a.sent();
                console.error("Error fetching gap stats:", error_17);
                res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch gap stats" });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /clob/candles/:symbol/gaps/:interval
 * Get detailed gap information for a specific interval
 */
router.get("/candles/:symbol/gaps/:interval", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbol, interval, validIntervals, market, limit, missing, error_18;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 3, , 4]);
                symbol = req.params.symbol;
                interval = req.params.interval;
                validIntervals = ["1m", "5m", "15m", "1h", "4h", "1d"];
                if (!validIntervals.includes(interval)) {
                    return [2 /*return*/, res.status(400).json({
                            error: "INVALID_INTERVAL",
                            message: "Invalid interval. Must be one of: ".concat(validIntervals.join(", ")),
                        })];
                }
                return [4 /*yield*/, (0, market_service_1.getMarket)(symbol)];
            case 1:
                market = _a.sent();
                if (!market) {
                    return [2 /*return*/, res.status(404).json({ error: "NOT_FOUND", message: "Market not found" })];
                }
                limit = Math.min(parseInt(req.query.limit) || 100, 500);
                return [4 /*yield*/, (0, candle_service_1.findMissingCandles)(market.symbol, interval)];
            case 2:
                missing = _a.sent();
                res.json({
                    symbol: market.symbol,
                    interval: interval,
                    totalMissing: missing.length,
                    missingTimestamps: missing.slice(0, limit).map(function (t) { return t.toISOString(); }),
                    truncated: missing.length > limit,
                });
                return [3 /*break*/, 4];
            case 3:
                error_18 = _a.sent();
                console.error("Error fetching missing candles:", error_18);
                res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch missing candles" });
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
/**
 * POST /clob/candles/:symbol/fill-gaps
 * Fill missing candles for a market (creates synthetic data)
 * Query params: interval (optional, if not provided fills all intervals)
 */
router.post("/candles/:symbol/fill-gaps", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbol, interval, market, validIntervals, missing, filled, results, totalMissing, totalFilled, error_19;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 7, , 8]);
                symbol = req.params.symbol;
                interval = req.query.interval;
                return [4 /*yield*/, (0, market_service_1.getMarket)(symbol)];
            case 1:
                market = _a.sent();
                if (!market) {
                    return [2 /*return*/, res.status(404).json({ error: "NOT_FOUND", message: "Market not found" })];
                }
                if (!interval) return [3 /*break*/, 4];
                validIntervals = ["1m", "5m", "15m", "1h", "4h", "1d"];
                if (!validIntervals.includes(interval)) {
                    return [2 /*return*/, res.status(400).json({
                            error: "INVALID_INTERVAL",
                            message: "Invalid interval. Must be one of: ".concat(validIntervals.join(", ")),
                        })];
                }
                return [4 /*yield*/, (0, candle_service_1.findMissingCandles)(market.symbol, interval)];
            case 2:
                missing = _a.sent();
                return [4 /*yield*/, (0, candle_service_1.fillMissingCandles)(market.symbol, interval, missing)];
            case 3:
                filled = _a.sent();
                res.json({
                    success: true,
                    symbol: market.symbol,
                    interval: interval,
                    gapsFound: missing.length,
                    candlesFilled: filled,
                });
                return [3 /*break*/, 6];
            case 4: return [4 /*yield*/, (0, candle_service_1.checkAndFillGaps)(market.symbol)];
            case 5:
                results = _a.sent();
                totalMissing = results.reduce(function (sum, r) { return sum + r.missing; }, 0);
                totalFilled = results.reduce(function (sum, r) { return sum + r.filled; }, 0);
                res.json({
                    success: true,
                    symbol: market.symbol,
                    totalGapsFound: totalMissing,
                    totalCandlesFilled: totalFilled,
                    byInterval: results.map(function (r) { return ({
                        interval: r.interval,
                        gapsFound: r.missing,
                        candlesFilled: r.filled,
                    }); }),
                });
                _a.label = 6;
            case 6: return [3 /*break*/, 8];
            case 7:
                error_19 = _a.sent();
                console.error("Error filling candle gaps:", error_19);
                res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fill candle gaps" });
                return [3 /*break*/, 8];
            case 8: return [2 /*return*/];
        }
    });
}); });
/**
 * POST /clob/candles/:symbol/fetch-historical
 * Fetch real historical data from Finnhub
 * Query params: days (default 365)
 */
router.post("/candles/:symbol/fetch-historical", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbol, days, market, stats, error_20;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 4, , 5]);
                symbol = req.params.symbol;
                days = Math.min(parseInt(req.query.days) || 365, 365);
                return [4 /*yield*/, (0, market_service_1.getMarket)(symbol)];
            case 1:
                market = _a.sent();
                if (!market) {
                    return [2 /*return*/, res.status(404).json({ error: "NOT_FOUND", message: "Market not found" })];
                }
                console.log("\uD83D\uDCC8 Manual historical data fetch triggered for ".concat(market.symbol));
                // Fetch historical data
                return [4 /*yield*/, (0, candle_service_1.fetchAllHistoricalData)(market.finnhubSymbol, market.symbol, days)];
            case 2:
                // Fetch historical data
                _a.sent();
                return [4 /*yield*/, (0, candle_service_1.getGapStats)(market.symbol)];
            case 3:
                stats = _a.sent();
                res.json({
                    success: true,
                    symbol: market.symbol,
                    daysFetched: days,
                    intervals: stats.intervals.map(function (s) { return ({
                        interval: s.interval,
                        totalCandles: s.totalCandles,
                        missingCandles: s.missingCandles,
                        coveragePercent: s.coveragePercent + "%",
                    }); }),
                });
                return [3 /*break*/, 5];
            case 4:
                error_20 = _a.sent();
                console.error("Error fetching historical candles:", error_20);
                res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch historical candles" });
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /clob/market-hours
 * Get current US market hours status
 */
router.get("/market-hours", function (_req, res) {
    var now = new Date();
    var isOpen = (0, candle_service_1.isUSMarketOpen)(now);
    res.json({
        timestamp: now.toISOString(),
        usMarket: {
            isOpen: isOpen,
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
router.get("/liquidation/stats", function (_req, res) {
    var _a;
    var stats = (0, liquidation_service_1.getLiquidationStats)();
    res.json({
        totalLiquidations: stats.totalLiquidations,
        totalValueLiquidated: stats.totalValueLiquidated,
        lastLiquidationAt: ((_a = stats.lastLiquidationAt) === null || _a === void 0 ? void 0 : _a.toISOString()) || null,
    });
});
/**
 * GET /clob/liquidation/at-risk
 * Get positions at risk of liquidation (public, for market transparency)
 * Query params: threshold (default 5 = positions within 5% of liquidation)
 */
router.get("/liquidation/at-risk", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var threshold, atRisk, error_21;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                threshold = Math.min(parseFloat(req.query.threshold) || 5, 20);
                return [4 /*yield*/, (0, liquidation_service_1.getPositionsAtRiskOfLiquidation)(threshold)];
            case 1:
                atRisk = _a.sent();
                res.json({
                    threshold: "".concat(threshold, "%"),
                    count: atRisk.length,
                    positions: atRisk.map(function (r) { return ({
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
                    }); }),
                });
                return [3 /*break*/, 3];
            case 2:
                error_21 = _a.sent();
                console.error("Error fetching at-risk positions:", error_21);
                res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch at-risk positions" });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /clob/positions/:marketSymbol/liquidation-risk
 * Check liquidation risk for user's position in a specific market
 */
router.get("/positions/:marketSymbol/liquidation-risk", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var authReq, marketSymbol, market, position, currentPrice, distanceToLiquidation, distancePercent, atRisk, critical, error_22;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                authReq = req;
                _a.label = 1;
            case 1:
                _a.trys.push([1, 4, , 5]);
                marketSymbol = req.params.marketSymbol;
                return [4 /*yield*/, (0, market_service_1.getMarket)(marketSymbol)];
            case 2:
                market = _a.sent();
                if (!market) {
                    return [2 /*return*/, res.status(404).json({ error: "NOT_FOUND", message: "Market not found" })];
                }
                return [4 /*yield*/, (0, position_service_1.getOpenPosition)(authReq.auth.address, marketSymbol)];
            case 3:
                position = _a.sent();
                if (!position) {
                    return [2 /*return*/, res.json({
                            hasPosition: false,
                            atRisk: false,
                        })];
                }
                currentPrice = (0, market_service_1.getCachedPrice)(marketSymbol);
                if (!currentPrice) {
                    return [2 /*return*/, res.json({
                            hasPosition: true,
                            atRisk: false,
                            message: "No price data available",
                        })];
                }
                distanceToLiquidation = void 0;
                distancePercent = void 0;
                if (position.side === "long") {
                    distanceToLiquidation = currentPrice - position.liquidationPrice;
                    distancePercent = (distanceToLiquidation / currentPrice) * 100;
                }
                else {
                    distanceToLiquidation = position.liquidationPrice - currentPrice;
                    distancePercent = (distanceToLiquidation / currentPrice) * 100;
                }
                atRisk = distancePercent <= 10;
                critical = distancePercent <= 3;
                res.json({
                    hasPosition: true,
                    positionId: position.positionId,
                    side: position.side,
                    size: position.size,
                    entryPrice: position.entryPrice,
                    currentPrice: currentPrice,
                    liquidationPrice: position.liquidationPrice,
                    distanceToLiquidation: distanceToLiquidation,
                    distancePercent: distancePercent.toFixed(2) + "%",
                    atRisk: atRisk,
                    critical: critical,
                    riskLevel: critical ? "critical" : atRisk ? "warning" : "safe",
                });
                return [3 /*break*/, 5];
            case 4:
                error_22 = _a.sent();
                console.error("Error checking liquidation risk:", error_22);
                res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to check liquidation risk" });
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/];
        }
    });
}); });
exports.default = router;
