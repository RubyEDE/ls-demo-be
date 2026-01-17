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
exports.generateSyntheticOrders = generateSyntheticOrders;
exports.updateSyntheticLiquidity = updateSyntheticLiquidity;
exports.startMarketMaker = startMarketMaker;
exports.stopMarketMaker = stopMarketMaker;
exports.startAllMarketMakers = startAllMarketMakers;
exports.startRequiredMarketMakers = startRequiredMarketMakers;
exports.stopAllMarketMakers = stopAllMarketMakers;
exports.getSyntheticOrderCount = getSyntheticOrderCount;
exports.generateSyntheticTrades = generateSyntheticTrades;
exports.startTradeGenerator = startTradeGenerator;
exports.stopTradeGenerator = stopTradeGenerator;
exports.stopAllTradeGenerators = stopAllTradeGenerators;
var uuid_1 = require("uuid");
var order_model_1 = require("../models/order.model");
var trade_model_1 = require("../models/trade.model");
var market_service_1 = require("./market.service");
var orderbook_service_1 = require("./orderbook.service");
var websocket_service_1 = require("./websocket.service");
var candle_service_1 = require("./candle.service");
var DEFAULT_LIQUIDITY_CONFIG = {
    levels: 25, // 25 bids + 25 asks = 50 orders total
    spreadPercent: 0.0005, // 0.05% spread
    levelSpacingPercent: 0.0002, // 0.02% between levels
    baseQuantity: 5,
    quantityMultiplier: 1.2,
    quantityVariance: 0.3,
};
var DEFAULT_TRADE_CONFIG = {
    minTrades: 1,
    maxTrades: 2,
    minQuantity: 0.1,
    maxQuantity: 1.5,
    intervalMs: 500, // Generate trades every 500ms
};
// Store synthetic orders per market
var syntheticOrders = new Map();
// Market maker update intervals
var mmIntervals = new Map();
// Trade generator intervals
var tradeIntervals = new Map();
var priceDrifts = new Map();
// Get or create price drift for a market
function getOrCreatePriceDrift(symbol) {
    if (!priceDrifts.has(symbol)) {
        priceDrifts.set(symbol, {
            drift: 0,
            momentum: 0,
            lastUpdate: Date.now(),
        });
    }
    return priceDrifts.get(symbol);
}
// Update price drift based on trade activity
function updatePriceDrift(symbol, side, quantity) {
    var drift = getOrCreatePriceDrift(symbol);
    // Buy pressure pushes price up, sell pressure pushes down
    var impact = side === "buy" ? 0.00005 : -0.00005;
    var quantityFactor = Math.min(quantity / 2, 1); // Cap impact from large trades
    // Update momentum (with decay)
    drift.momentum = drift.momentum * 0.95 + (side === "buy" ? 0.1 : -0.1) * quantityFactor;
    drift.momentum = Math.max(-1, Math.min(1, drift.momentum)); // Clamp to [-1, 1]
    // Update drift (bounded to prevent runaway prices)
    drift.drift += impact * quantityFactor;
    drift.drift = Math.max(-0.005, Math.min(0.005, drift.drift)); // Max 0.5% drift from oracle
    drift.lastUpdate = Date.now();
}
// Apply random walk to price drift (called periodically)
function applyRandomWalk(symbol) {
    var drift = getOrCreatePriceDrift(symbol);
    // Random walk component
    var randomStep = (Math.random() - 0.5) * 0.0002; // Small random step
    // Mean reversion (slowly pull back to oracle price)
    var reversion = -drift.drift * 0.02;
    // Momentum influence
    var momentumInfluence = drift.momentum * 0.0001;
    drift.drift += randomStep + reversion + momentumInfluence;
    drift.drift = Math.max(-0.005, Math.min(0.005, drift.drift)); // Max 0.5% drift
    // Decay momentum
    drift.momentum *= 0.98;
}
// Get adjusted mid price based on drift
function getAdjustedMidPrice(symbol, oraclePrice) {
    var drift = getOrCreatePriceDrift(symbol);
    return oraclePrice * (1 + drift.drift);
}
/**
 * Generate synthetic orders around a price with dynamic variation
 */
function generateSyntheticOrders(marketSymbol_1, midPrice_1) {
    return __awaiter(this, arguments, void 0, function (marketSymbol, midPrice, config) {
        var market, orders, drift, spreadVariance, halfSpread, momentumSpreadAdjust, adjustedHalfSpread, i, levelVariance, levelSpacing, price, baseQty, variance, quantity, order, i, levelVariance, levelSpacing, price, baseQty, variance, quantity, order;
        if (config === void 0) { config = DEFAULT_LIQUIDITY_CONFIG; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, market_service_1.getMarket)(marketSymbol)];
                case 1:
                    market = _a.sent();
                    if (!market) {
                        throw new Error("Market not found: ".concat(marketSymbol));
                    }
                    orders = [];
                    drift = getOrCreatePriceDrift(marketSymbol);
                    spreadVariance = 1 + (Math.random() - 0.5) * 0.2;
                    halfSpread = midPrice * config.spreadPercent * spreadVariance;
                    momentumSpreadAdjust = 1 + Math.abs(drift.momentum) * 0.3;
                    adjustedHalfSpread = halfSpread * momentumSpreadAdjust;
                    // Generate bid orders (below mid price)
                    for (i = 0; i < config.levels; i++) {
                        levelVariance = (Math.random() - 0.5) * midPrice * 0.0001;
                        levelSpacing = midPrice * config.levelSpacingPercent * (1 + Math.random() * 0.3);
                        price = (0, market_service_1.roundToTickSize)(midPrice - adjustedHalfSpread - (i * levelSpacing) + levelVariance, market.tickSize);
                        baseQty = config.baseQuantity * Math.pow(config.quantityMultiplier, i);
                        variance = 1 + (Math.random() - 0.5) * 2 * config.quantityVariance;
                        quantity = (0, market_service_1.roundToLotSize)(baseQty * variance, market.lotSize);
                        order = new order_model_1.Order({
                            orderId: "SYN-BID-".concat((0, uuid_1.v4)()),
                            marketSymbol: market.symbol,
                            userId: null,
                            userAddress: null,
                            side: "buy",
                            type: "limit",
                            price: price,
                            quantity: quantity,
                            filledQuantity: 0,
                            remainingQuantity: quantity,
                            averagePrice: 0,
                            isSynthetic: true,
                            postOnly: true,
                            reduceOnly: false,
                            status: "open",
                        });
                        orders.push(order);
                    }
                    // Generate ask orders (above mid price)
                    for (i = 0; i < config.levels; i++) {
                        levelVariance = (Math.random() - 0.5) * midPrice * 0.0001;
                        levelSpacing = midPrice * config.levelSpacingPercent * (1 + Math.random() * 0.3);
                        price = (0, market_service_1.roundToTickSize)(midPrice + adjustedHalfSpread + (i * levelSpacing) + levelVariance, market.tickSize);
                        baseQty = config.baseQuantity * Math.pow(config.quantityMultiplier, i);
                        variance = 1 + (Math.random() - 0.5) * 2 * config.quantityVariance;
                        quantity = (0, market_service_1.roundToLotSize)(baseQty * variance, market.lotSize);
                        order = new order_model_1.Order({
                            orderId: "SYN-ASK-".concat((0, uuid_1.v4)()),
                            marketSymbol: market.symbol,
                            userId: null,
                            userAddress: null,
                            side: "sell",
                            type: "limit",
                            price: price,
                            quantity: quantity,
                            filledQuantity: 0,
                            remainingQuantity: quantity,
                            averagePrice: 0,
                            isSynthetic: true,
                            postOnly: true,
                            reduceOnly: false,
                            status: "open",
                        });
                        orders.push(order);
                    }
                    return [2 /*return*/, orders];
            }
        });
    });
}
/**
 * Update synthetic liquidity for a market
 * Preserves user orders while refreshing synthetic liquidity
 */
function updateSyntheticLiquidity(marketSymbol_1) {
    return __awaiter(this, arguments, void 0, function (marketSymbol, config) {
        var symbol, oraclePrice, adjustedMidPrice, orders, _i, orders_1, order, drift;
        if (config === void 0) { config = DEFAULT_LIQUIDITY_CONFIG; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    symbol = marketSymbol.toUpperCase();
                    oraclePrice = (0, market_service_1.getCachedPrice)(symbol);
                    if (!oraclePrice) {
                        console.warn("No price available for ".concat(symbol, ", skipping liquidity update"));
                        return [2 /*return*/];
                    }
                    // Apply random walk to price drift
                    applyRandomWalk(symbol);
                    adjustedMidPrice = getAdjustedMidPrice(symbol, oraclePrice);
                    // Remove ONLY synthetic orders from DB (user orders are preserved)
                    return [4 /*yield*/, order_model_1.Order.deleteMany({
                            marketSymbol: symbol,
                            isSynthetic: true,
                        })];
                case 1:
                    // Remove ONLY synthetic orders from DB (user orders are preserved)
                    _a.sent();
                    return [4 /*yield*/, generateSyntheticOrders(symbol, adjustedMidPrice, config)];
                case 2:
                    orders = _a.sent();
                    _i = 0, orders_1 = orders;
                    _a.label = 3;
                case 3:
                    if (!(_i < orders_1.length)) return [3 /*break*/, 6];
                    order = orders_1[_i];
                    return [4 /*yield*/, order.save()];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6:
                    // Store reference
                    syntheticOrders.set(symbol, orders);
                    // Rebuild the entire order book from DB (includes both user and synthetic orders)
                    return [4 /*yield*/, (0, orderbook_service_1.rebuildOrderBook)(symbol)];
                case 7:
                    // Rebuild the entire order book from DB (includes both user and synthetic orders)
                    _a.sent();
                    // Broadcast updated order book
                    (0, orderbook_service_1.broadcastOrderBook)(symbol);
                    drift = getOrCreatePriceDrift(symbol);
                    console.log("\uD83D\uDCA7 Updated liquidity for ".concat(symbol, ": ").concat(orders.length, " orders @ $").concat(adjustedMidPrice.toFixed(2), " (drift: ").concat((drift.drift * 100).toFixed(3), "%, momentum: ").concat(drift.momentum.toFixed(2), ")"));
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Start market maker for a market
 */
function startMarketMaker(marketSymbol_1) {
    return __awaiter(this, arguments, void 0, function (marketSymbol, intervalMs, config) {
        var symbol, interval;
        var _this = this;
        if (intervalMs === void 0) { intervalMs = 5000; }
        if (config === void 0) { config = DEFAULT_LIQUIDITY_CONFIG; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    symbol = marketSymbol.toUpperCase();
                    if (mmIntervals.has(symbol)) {
                        console.log("Market maker already running for ".concat(symbol));
                        return [2 /*return*/];
                    }
                    console.log("\uD83E\uDD16 Starting market maker for ".concat(symbol));
                    // Initial update
                    return [4 /*yield*/, updateSyntheticLiquidity(symbol, config)];
                case 1:
                    // Initial update
                    _a.sent();
                    interval = setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
                        var error_1;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    _a.trys.push([0, 2, , 3]);
                                    return [4 /*yield*/, updateSyntheticLiquidity(symbol, config)];
                                case 1:
                                    _a.sent();
                                    return [3 /*break*/, 3];
                                case 2:
                                    error_1 = _a.sent();
                                    console.error("Market maker error for ".concat(symbol, ":"), error_1);
                                    return [3 /*break*/, 3];
                                case 3: return [2 /*return*/];
                            }
                        });
                    }); }, intervalMs);
                    mmIntervals.set(symbol, interval);
                    // Also start trade generator
                    return [4 /*yield*/, startTradeGenerator(symbol)];
                case 2:
                    // Also start trade generator
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Stop market maker for a market
 */
function stopMarketMaker(marketSymbol) {
    return __awaiter(this, void 0, void 0, function () {
        var symbol, interval;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    symbol = marketSymbol.toUpperCase();
                    interval = mmIntervals.get(symbol);
                    if (interval) {
                        clearInterval(interval);
                        mmIntervals.delete(symbol);
                    }
                    // Stop trade generator
                    stopTradeGenerator(symbol);
                    // Remove synthetic orders
                    return [4 /*yield*/, order_model_1.Order.deleteMany({
                            marketSymbol: symbol,
                            isSynthetic: true,
                        })];
                case 1:
                    // Remove synthetic orders
                    _a.sent();
                    syntheticOrders.delete(symbol);
                    console.log("\uD83E\uDD16 Stopped market maker for ".concat(symbol));
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Start market makers for all active markets
 */
function startAllMarketMakers() {
    return __awaiter(this, arguments, void 0, function (intervalMs, config) {
        var Market, markets, _i, markets_1, market;
        if (intervalMs === void 0) { intervalMs = 5000; }
        if (config === void 0) { config = DEFAULT_LIQUIDITY_CONFIG; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../models/market.model"); })];
                case 1:
                    Market = (_a.sent()).Market;
                    return [4 /*yield*/, Market.find({ status: "active" })];
                case 2:
                    markets = _a.sent();
                    _i = 0, markets_1 = markets;
                    _a.label = 3;
                case 3:
                    if (!(_i < markets_1.length)) return [3 /*break*/, 6];
                    market = markets_1[_i];
                    return [4 /*yield*/, startMarketMaker(market.symbol, intervalMs, config)];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * Start market makers for required markets with retry logic
 * This ensures the 3 core markets always have liquidity
 */
function startRequiredMarketMakers() {
    return __awaiter(this, arguments, void 0, function (intervalMs, maxRetries, retryDelayMs, config) {
        var REQUIRED_MARKETS, _i, REQUIRED_MARKETS_1, marketData, symbol, retries, started, price;
        if (intervalMs === void 0) { intervalMs = 5000; }
        if (maxRetries === void 0) { maxRetries = 10; }
        if (retryDelayMs === void 0) { retryDelayMs = 2000; }
        if (config === void 0) { config = DEFAULT_LIQUIDITY_CONFIG; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../models/market.model"); })];
                case 1:
                    REQUIRED_MARKETS = (_a.sent()).REQUIRED_MARKETS;
                    console.log("🤖 Starting market makers for required markets...");
                    _i = 0, REQUIRED_MARKETS_1 = REQUIRED_MARKETS;
                    _a.label = 2;
                case 2:
                    if (!(_i < REQUIRED_MARKETS_1.length)) return [3 /*break*/, 10];
                    marketData = REQUIRED_MARKETS_1[_i];
                    symbol = marketData.symbol;
                    retries = 0;
                    started = false;
                    _a.label = 3;
                case 3:
                    if (!(!started && retries < maxRetries)) return [3 /*break*/, 8];
                    price = (0, market_service_1.getCachedPrice)(symbol);
                    if (!price) return [3 /*break*/, 5];
                    return [4 /*yield*/, startMarketMaker(symbol, intervalMs, config)];
                case 4:
                    _a.sent();
                    started = true;
                    console.log("   \u2705 Market maker started for ".concat(symbol, " @ $").concat(price.toFixed(2)));
                    return [3 /*break*/, 7];
                case 5:
                    retries++;
                    console.log("   \u23F3 Waiting for price data for ".concat(symbol, " (attempt ").concat(retries, "/").concat(maxRetries, ")..."));
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, retryDelayMs); })];
                case 6:
                    _a.sent();
                    _a.label = 7;
                case 7: return [3 /*break*/, 3];
                case 8:
                    if (!started) {
                        console.warn("   \u26A0\uFE0F Could not start market maker for ".concat(symbol, " - no price data after ").concat(maxRetries, " retries"));
                    }
                    _a.label = 9;
                case 9:
                    _i++;
                    return [3 /*break*/, 2];
                case 10: return [2 /*return*/];
            }
        });
    });
}
/**
 * Stop all market makers
 */
function stopAllMarketMakers() {
    return __awaiter(this, void 0, void 0, function () {
        var symbols, _i, symbols_1, symbol;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    symbols = Array.from(mmIntervals.keys());
                    _i = 0, symbols_1 = symbols;
                    _a.label = 1;
                case 1:
                    if (!(_i < symbols_1.length)) return [3 /*break*/, 4];
                    symbol = symbols_1[_i];
                    return [4 /*yield*/, stopMarketMaker(symbol)];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4:
                    // Stop any remaining trade generators
                    stopAllTradeGenerators();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Get synthetic order count for a market
 */
function getSyntheticOrderCount(marketSymbol) {
    var _a, _b;
    return (_b = (_a = syntheticOrders.get(marketSymbol.toUpperCase())) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0;
}
// ============ Synthetic Trade Generation ============
/**
 * Generate synthetic trades to simulate market activity
 * Uses best bid/ask from the orderbook for realistic prices
 */
function generateSyntheticTrades(marketSymbol_1) {
    return __awaiter(this, arguments, void 0, function (marketSymbol, config) {
        var symbol, market, bestAsk, bestBid, numTrades, i, side, tradePrice, quantity, trade, err_1;
        if (config === void 0) { config = DEFAULT_TRADE_CONFIG; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    symbol = marketSymbol.toUpperCase();
                    return [4 /*yield*/, (0, market_service_1.getMarket)(symbol)];
                case 1:
                    market = _a.sent();
                    if (!market) {
                        return [2 /*return*/];
                    }
                    bestAsk = (0, orderbook_service_1.getBestAsk)(symbol);
                    bestBid = (0, orderbook_service_1.getBestBid)(symbol);
                    // Need both bid and ask to generate trades
                    if (!bestAsk || !bestBid) {
                        return [2 /*return*/];
                    }
                    numTrades = Math.floor(Math.random() * (config.maxTrades - config.minTrades + 1) + config.minTrades);
                    i = 0;
                    _a.label = 2;
                case 2:
                    if (!(i < numTrades)) return [3 /*break*/, 8];
                    side = Math.random() > 0.5 ? "buy" : "sell";
                    tradePrice = side === "buy" ? bestAsk : bestBid;
                    quantity = (0, market_service_1.roundToLotSize)(Math.random() * (config.maxQuantity - config.minQuantity) + config.minQuantity, market.lotSize);
                    trade = new trade_model_1.Trade({
                        tradeId: "SYN-TRD-".concat((0, uuid_1.v4)()),
                        marketSymbol: symbol,
                        makerOrderId: "SYN-MKR-".concat((0, uuid_1.v4)()),
                        makerAddress: null,
                        makerIsSynthetic: true,
                        takerOrderId: "SYN-TKR-".concat((0, uuid_1.v4)()),
                        takerAddress: null,
                        takerIsSynthetic: true,
                        side: side,
                        price: tradePrice,
                        quantity: quantity,
                        quoteQuantity: tradePrice * quantity,
                        makerFee: 0,
                        takerFee: 0,
                    });
                    return [4 /*yield*/, trade.save()];
                case 3:
                    _a.sent();
                    // Broadcast trade via WebSocket
                    (0, websocket_service_1.broadcastTradeExecuted)(symbol, {
                        id: trade.tradeId,
                        symbol: trade.marketSymbol,
                        price: trade.price,
                        quantity: trade.quantity,
                        side: trade.side,
                        timestamp: Date.now(),
                    });
                    // Update price drift based on this trade (affects future orderbook)
                    updatePriceDrift(symbol, side, quantity);
                    _a.label = 4;
                case 4:
                    _a.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, (0, candle_service_1.updateCandle)(symbol, tradePrice, quantity, true, false)];
                case 5:
                    _a.sent();
                    return [3 /*break*/, 7];
                case 6:
                    err_1 = _a.sent();
                    return [3 /*break*/, 7];
                case 7:
                    i++;
                    return [3 /*break*/, 2];
                case 8: return [2 /*return*/];
            }
        });
    });
}
/**
 * Start synthetic trade generator for a market
 */
function startTradeGenerator(marketSymbol_1) {
    return __awaiter(this, arguments, void 0, function (marketSymbol, config) {
        var symbol, interval;
        var _this = this;
        if (config === void 0) { config = DEFAULT_TRADE_CONFIG; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    symbol = marketSymbol.toUpperCase();
                    if (tradeIntervals.has(symbol)) {
                        return [2 /*return*/]; // Already running
                    }
                    console.log("\uD83D\uDCC8 Starting trade generator for ".concat(symbol));
                    // Generate initial trades
                    return [4 /*yield*/, generateSyntheticTrades(symbol, config)];
                case 1:
                    // Generate initial trades
                    _a.sent();
                    interval = setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
                        var error_2;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    _a.trys.push([0, 2, , 3]);
                                    return [4 /*yield*/, generateSyntheticTrades(symbol, config)];
                                case 1:
                                    _a.sent();
                                    return [3 /*break*/, 3];
                                case 2:
                                    error_2 = _a.sent();
                                    console.error("Trade generator error for ".concat(symbol, ":"), error_2);
                                    return [3 /*break*/, 3];
                                case 3: return [2 /*return*/];
                            }
                        });
                    }); }, config.intervalMs);
                    tradeIntervals.set(symbol, interval);
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Stop synthetic trade generator for a market
 */
function stopTradeGenerator(marketSymbol) {
    var symbol = marketSymbol.toUpperCase();
    var interval = tradeIntervals.get(symbol);
    if (interval) {
        clearInterval(interval);
        tradeIntervals.delete(symbol);
        console.log("\uD83D\uDCC8 Stopped trade generator for ".concat(symbol));
    }
}
/**
 * Stop all trade generators
 */
function stopAllTradeGenerators() {
    var symbols = Array.from(tradeIntervals.keys());
    for (var _i = 0, symbols_2 = symbols; _i < symbols_2.length; _i++) {
        var symbol = symbols_2[_i];
        stopTradeGenerator(symbol);
    }
}
