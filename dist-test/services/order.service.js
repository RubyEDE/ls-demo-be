"use strict";
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
exports.placeOrder = placeOrder;
exports.cancelOrder = cancelOrder;
exports.getUserOpenOrders = getUserOpenOrders;
exports.getUserOrderHistory = getUserOrderHistory;
exports.getUserTradeHistory = getUserTradeHistory;
exports.getRecentTrades = getRecentTrades;
var uuid_1 = require("uuid");
var order_model_1 = require("../models/order.model");
var trade_model_1 = require("../models/trade.model");
var market_service_1 = require("./market.service");
var orderbook_service_1 = require("./orderbook.service");
var websocket_service_1 = require("./websocket.service");
var balance_service_1 = require("./balance.service");
var position_service_1 = require("./position.service");
/**
 * Place a new order
 */
function placeOrder(params) {
    return __awaiter(this, void 0, void 0, function () {
        var marketSymbol, userAddress, side, type, price, quantity, _a, postOnly, _b, reduceOnly, market, roundedQuantity, orderPrice, oraclePrice, notionalValue, requiredMargin, lockResult, balance, available, order, _c, trades, remainingOrder;
        var _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    marketSymbol = params.marketSymbol, userAddress = params.userAddress, side = params.side, type = params.type, price = params.price, quantity = params.quantity, _a = params.postOnly, postOnly = _a === void 0 ? false : _a, _b = params.reduceOnly, reduceOnly = _b === void 0 ? false : _b;
                    return [4 /*yield*/, (0, market_service_1.getMarket)(marketSymbol)];
                case 1:
                    market = _e.sent();
                    if (!market) {
                        return [2 /*return*/, { success: false, error: "Market not found" }];
                    }
                    if (market.status !== "active") {
                        return [2 /*return*/, { success: false, error: "Market is not active" }];
                    }
                    // Validate quantity
                    if (quantity < market.minOrderSize) {
                        return [2 /*return*/, { success: false, error: "Minimum order size is ".concat(market.minOrderSize) }];
                    }
                    if (quantity > market.maxOrderSize) {
                        return [2 /*return*/, { success: false, error: "Maximum order size is ".concat(market.maxOrderSize) }];
                    }
                    roundedQuantity = (0, market_service_1.roundToLotSize)(quantity, market.lotSize);
                    if (type === "market") {
                        oraclePrice = (0, market_service_1.getCachedPrice)(marketSymbol);
                        if (!oraclePrice) {
                            return [2 /*return*/, { success: false, error: "No price available" }];
                        }
                        // Use a price far from market to ensure fill
                        orderPrice = side === "buy" ? oraclePrice * 1.1 : oraclePrice * 0.9;
                    }
                    else {
                        if (!price || price <= 0) {
                            return [2 /*return*/, { success: false, error: "Price is required for limit orders" }];
                        }
                        orderPrice = (0, market_service_1.roundToTickSize)(price, market.tickSize);
                    }
                    notionalValue = orderPrice * roundedQuantity;
                    requiredMargin = notionalValue * market.initialMarginRate;
                    return [4 /*yield*/, (0, balance_service_1.lockBalanceByAddress)(userAddress, requiredMargin, "Order margin for ".concat(marketSymbol), "ORDER-".concat((0, uuid_1.v4)()))];
                case 2:
                    lockResult = _e.sent();
                    if (!!lockResult.success) return [3 /*break*/, 4];
                    return [4 /*yield*/, (0, balance_service_1.getBalanceByAddress)(userAddress)];
                case 3:
                    balance = _e.sent();
                    available = (_d = balance === null || balance === void 0 ? void 0 : balance.free) !== null && _d !== void 0 ? _d : 0;
                    return [2 /*return*/, {
                            success: false,
                            error: "Insufficient balance. Required: $".concat(requiredMargin.toFixed(2), ", Available: $").concat(available.toFixed(2))
                        }];
                case 4:
                    order = new order_model_1.Order({
                        orderId: "ORD-".concat((0, uuid_1.v4)()),
                        marketSymbol: market.symbol,
                        userId: null, // We use address for now
                        userAddress: userAddress.toLowerCase(),
                        side: side,
                        type: type,
                        price: orderPrice,
                        quantity: roundedQuantity,
                        filledQuantity: 0,
                        remainingQuantity: roundedQuantity,
                        averagePrice: 0,
                        isSynthetic: false,
                        postOnly: postOnly,
                        reduceOnly: reduceOnly,
                        status: "pending",
                    });
                    return [4 /*yield*/, matchOrder(order)];
                case 5:
                    _c = _e.sent(), trades = _c.trades, remainingOrder = _c.remainingOrder;
                    if (!(postOnly && trades.length > 0)) return [3 /*break*/, 7];
                    // Unlock the margin
                    return [4 /*yield*/, (0, balance_service_1.unlockBalanceByAddress)(userAddress, requiredMargin, "Post-only order would have matched")];
                case 6:
                    // Unlock the margin
                    _e.sent();
                    return [2 /*return*/, { success: false, error: "Post-only order would have matched immediately" }];
                case 7:
                    // Update order status
                    if (remainingOrder.remainingQuantity === 0) {
                        remainingOrder.status = "filled";
                        remainingOrder.filledAt = new Date();
                    }
                    else if (remainingOrder.filledQuantity > 0) {
                        remainingOrder.status = "partial";
                    }
                    else {
                        remainingOrder.status = "open";
                    }
                    // Save order
                    return [4 /*yield*/, remainingOrder.save()];
                case 8:
                    // Save order
                    _e.sent();
                    // Add remaining quantity to order book if limit order
                    if (type === "limit" && remainingOrder.remainingQuantity > 0) {
                        (0, orderbook_service_1.addToOrderBook)(remainingOrder);
                    }
                    // Notify user
                    (0, websocket_service_1.sendOrderUpdate)(userAddress, "order:created", {
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
                        (0, websocket_service_1.sendOrderUpdate)(userAddress, "order:filled", {
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
                    return [2 /*return*/, {
                            success: true,
                            order: remainingOrder,
                            trades: trades,
                        }];
            }
        });
    });
}
/**
 * Match an order against the book
 */
function matchOrder(order) {
    return __awaiter(this, void 0, void 0, function () {
        var trades, book, oppositeSide, sortedPrices, filledQuantity, totalCost, _i, sortedPrices_1, price, ordersAtPrice, _a, ordersAtPrice_1, makerOrder, fillQty, trade, market, fillMargin;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    trades = [];
                    book = (0, orderbook_service_1.getOrCreateOrderBook)(order.marketSymbol);
                    oppositeSide = order.side === "buy" ? book.asks : book.bids;
                    sortedPrices = Array.from(oppositeSide.keys()).sort(function (a, b) {
                        return order.side === "buy" ? a - b : b - a;
                    });
                    filledQuantity = 0;
                    totalCost = 0;
                    _i = 0, sortedPrices_1 = sortedPrices;
                    _b.label = 1;
                case 1:
                    if (!(_i < sortedPrices_1.length)) return [3 /*break*/, 12];
                    price = sortedPrices_1[_i];
                    // Check if price is acceptable
                    if (order.side === "buy" && price > order.price)
                        return [3 /*break*/, 12];
                    if (order.side === "sell" && price < order.price)
                        return [3 /*break*/, 12];
                    return [4 /*yield*/, order_model_1.Order.find({
                            marketSymbol: order.marketSymbol,
                            side: order.side === "buy" ? "sell" : "buy",
                            price: price,
                            status: { $in: ["open", "partial"] },
                        }).sort({ createdAt: 1 })];
                case 2:
                    ordersAtPrice = _b.sent();
                    _a = 0, ordersAtPrice_1 = ordersAtPrice;
                    _b.label = 3;
                case 3:
                    if (!(_a < ordersAtPrice_1.length)) return [3 /*break*/, 10];
                    makerOrder = ordersAtPrice_1[_a];
                    if (order.remainingQuantity <= 0)
                        return [3 /*break*/, 10];
                    fillQty = Math.min(order.remainingQuantity, makerOrder.remainingQuantity);
                    trade = new trade_model_1.Trade({
                        tradeId: "TRD-".concat((0, uuid_1.v4)()),
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
                    return [4 /*yield*/, trade.save()];
                case 4:
                    _b.sent();
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
                    }
                    else {
                        makerOrder.status = "partial";
                    }
                    // Update maker's average price
                    if (makerOrder.filledQuantity > 0) {
                        makerOrder.averagePrice =
                            (makerOrder.averagePrice * (makerOrder.filledQuantity - fillQty) + makerOrder.price * fillQty) /
                                makerOrder.filledQuantity;
                    }
                    return [4 /*yield*/, makerOrder.save()];
                case 5:
                    _b.sent();
                    // Remove from order book
                    (0, orderbook_service_1.removeFromOrderBook)(order.marketSymbol, makerOrder.side, makerOrder.price, fillQty);
                    // Broadcast trade
                    (0, websocket_service_1.broadcastTradeExecuted)(order.marketSymbol, {
                        id: trade.tradeId,
                        symbol: trade.marketSymbol,
                        price: trade.price,
                        quantity: trade.quantity,
                        side: trade.side,
                        timestamp: Date.now(),
                    });
                    if (!(order.userAddress && !order.isSynthetic)) return [3 /*break*/, 8];
                    return [4 /*yield*/, (0, market_service_1.getMarket)(order.marketSymbol)];
                case 6:
                    market = _b.sent();
                    if (!market) return [3 /*break*/, 8];
                    fillMargin = makerOrder.price * fillQty * market.initialMarginRate;
                    return [4 /*yield*/, (0, position_service_1.handleTradeExecution)(order.userAddress, order.marketSymbol, order.side, fillQty, makerOrder.price, fillMargin)];
                case 7:
                    _b.sent();
                    _b.label = 8;
                case 8:
                    // Notify maker if not synthetic
                    if (makerOrder.userAddress && !makerOrder.isSynthetic) {
                        (0, websocket_service_1.sendOrderUpdate)(makerOrder.userAddress, "order:filled", {
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
                    _b.label = 9;
                case 9:
                    _a++;
                    return [3 /*break*/, 3];
                case 10:
                    if (order.remainingQuantity <= 0)
                        return [3 /*break*/, 12];
                    _b.label = 11;
                case 11:
                    _i++;
                    return [3 /*break*/, 1];
                case 12:
                    // Update taker's average price
                    if (filledQuantity > 0) {
                        order.averagePrice = totalCost / filledQuantity;
                    }
                    return [2 /*return*/, { trades: trades, remainingOrder: order }];
            }
        });
    });
}
/**
 * Cancel an order
 */
function cancelOrder(orderId, userAddress) {
    return __awaiter(this, void 0, void 0, function () {
        var order, market, unlockedMargin;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, order_model_1.Order.findOne({
                        orderId: orderId,
                        userAddress: userAddress.toLowerCase(),
                    })];
                case 1:
                    order = _a.sent();
                    if (!order) {
                        return [2 /*return*/, { success: false, error: "Order not found" }];
                    }
                    if (order.status === "filled" || order.status === "cancelled") {
                        return [2 /*return*/, { success: false, error: "Order cannot be cancelled" }];
                    }
                    // Remove from order book
                    if (order.remainingQuantity > 0) {
                        (0, orderbook_service_1.removeFromOrderBook)(order.marketSymbol, order.side, order.price, order.remainingQuantity);
                    }
                    // Update order status
                    order.status = "cancelled";
                    order.cancelledAt = new Date();
                    return [4 /*yield*/, order.save()];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, (0, market_service_1.getMarket)(order.marketSymbol)];
                case 3:
                    market = _a.sent();
                    if (!market) return [3 /*break*/, 5];
                    unlockedMargin = order.price * order.remainingQuantity * market.initialMarginRate;
                    return [4 /*yield*/, (0, balance_service_1.unlockBalanceByAddress)(userAddress, unlockedMargin, "Cancelled order ".concat(orderId))];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5:
                    // Notify user
                    (0, websocket_service_1.sendOrderUpdate)(userAddress, "order:cancelled", {
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
                    return [2 /*return*/, { success: true, order: order }];
            }
        });
    });
}
/**
 * Get user's open orders
 */
function getUserOpenOrders(userAddress, marketSymbol) {
    return __awaiter(this, void 0, void 0, function () {
        var query;
        return __generator(this, function (_a) {
            query = {
                userAddress: userAddress.toLowerCase(),
                status: { $in: ["open", "partial", "pending"] },
                isSynthetic: false,
            };
            if (marketSymbol) {
                query.marketSymbol = marketSymbol.toUpperCase();
            }
            return [2 /*return*/, order_model_1.Order.find(query).sort({ createdAt: -1 })];
        });
    });
}
/**
 * Get user's order history
 */
function getUserOrderHistory(userAddress_1, marketSymbol_1) {
    return __awaiter(this, arguments, void 0, function (userAddress, marketSymbol, limit, offset) {
        var query;
        if (limit === void 0) { limit = 50; }
        if (offset === void 0) { offset = 0; }
        return __generator(this, function (_a) {
            query = {
                userAddress: userAddress.toLowerCase(),
                isSynthetic: false,
            };
            if (marketSymbol) {
                query.marketSymbol = marketSymbol.toUpperCase();
            }
            return [2 /*return*/, order_model_1.Order.find(query)
                    .sort({ createdAt: -1 })
                    .skip(offset)
                    .limit(limit)];
        });
    });
}
/**
 * Get user's trade history
 */
function getUserTradeHistory(userAddress_1, marketSymbol_1) {
    return __awaiter(this, arguments, void 0, function (userAddress, marketSymbol, limit, offset) {
        var address, query;
        if (limit === void 0) { limit = 50; }
        if (offset === void 0) { offset = 0; }
        return __generator(this, function (_a) {
            address = userAddress.toLowerCase();
            query = {
                $or: [
                    { makerAddress: address, makerIsSynthetic: false },
                    { takerAddress: address, takerIsSynthetic: false },
                ],
            };
            if (marketSymbol) {
                query.marketSymbol = marketSymbol.toUpperCase();
            }
            return [2 /*return*/, trade_model_1.Trade.find(query)
                    .sort({ createdAt: -1 })
                    .skip(offset)
                    .limit(limit)];
        });
    });
}
/**
 * Get recent trades for a market
 */
function getRecentTrades(marketSymbol_1) {
    return __awaiter(this, arguments, void 0, function (marketSymbol, limit) {
        if (limit === void 0) { limit = 50; }
        return __generator(this, function (_a) {
            return [2 /*return*/, trade_model_1.Trade.find({ marketSymbol: marketSymbol.toUpperCase() })
                    .sort({ createdAt: -1 })
                    .limit(limit)];
        });
    });
}
