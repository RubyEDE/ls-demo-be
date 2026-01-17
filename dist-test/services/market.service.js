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
exports.initializeMarkets = initializeMarkets;
exports.getActiveMarkets = getActiveMarkets;
exports.getMarket = getMarket;
exports.updateOraclePrice = updateOraclePrice;
exports.getCachedPrice = getCachedPrice;
exports.fetchAndUpdatePrice = fetchAndUpdatePrice;
exports.startPriceUpdates = startPriceUpdates;
exports.stopPriceUpdates = stopPriceUpdates;
exports.startAllPriceUpdates = startAllPriceUpdates;
exports.startRequiredPriceUpdates = startRequiredPriceUpdates;
exports.stopAllPriceUpdates = stopAllPriceUpdates;
exports.roundToTickSize = roundToTickSize;
exports.roundToLotSize = roundToLotSize;
var market_model_1 = require("../models/market.model");
var finnhub_service_1 = require("./finnhub.service");
var websocket_service_1 = require("./websocket.service");
var candle_service_1 = require("./candle.service");
// In-memory cache of market prices
var priceCache = new Map();
/**
 * Initialize markets - ensure required markets always exist
 * Uses upsert to create missing markets without affecting existing ones
 */
function initializeMarkets() {
    return __awaiter(this, void 0, void 0, function () {
        var _i, REQUIRED_MARKETS_1, marketData, existing, market, activeMarkets;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("🏪 Ensuring required markets exist...");
                    _i = 0, REQUIRED_MARKETS_1 = market_model_1.REQUIRED_MARKETS;
                    _a.label = 1;
                case 1:
                    if (!(_i < REQUIRED_MARKETS_1.length)) return [3 /*break*/, 6];
                    marketData = REQUIRED_MARKETS_1[_i];
                    return [4 /*yield*/, market_model_1.Market.findOne({ symbol: marketData.symbol })];
                case 2:
                    existing = _a.sent();
                    if (!!existing) return [3 /*break*/, 4];
                    market = new market_model_1.Market(marketData);
                    return [4 /*yield*/, market.save()];
                case 3:
                    _a.sent();
                    console.log("   \u2705 Created market: ".concat(market.symbol));
                    return [3 /*break*/, 5];
                case 4:
                    console.log("   \u2713 Market exists: ".concat(existing.symbol));
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6: return [4 /*yield*/, market_model_1.Market.find({ status: "active" })];
                case 7:
                    activeMarkets = _a.sent();
                    console.log("\uD83C\uDFEA ".concat(activeMarkets.length, " active markets ready: ").concat(activeMarkets.map(function (m) { return m.symbol; }).join(", ")));
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Get all active markets
 */
function getActiveMarkets() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, market_model_1.Market.find({ status: "active" }).sort({ symbol: 1 })];
        });
    });
}
/**
 * Get a market by symbol
 */
function getMarket(symbol) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, market_model_1.Market.findOne({ symbol: symbol.toUpperCase() })];
        });
    });
}
/**
 * Update oracle price for a market
 */
function updateOraclePrice(symbol, price) {
    return __awaiter(this, void 0, void 0, function () {
        var market;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, market_model_1.Market.findOneAndUpdate({ symbol: symbol.toUpperCase() }, {
                        oraclePrice: price,
                        oraclePriceUpdatedAt: new Date(),
                    }, { new: true })];
                case 1:
                    market = _a.sent();
                    if (market) {
                        priceCache.set(symbol.toUpperCase(), { price: price, updatedAt: new Date() });
                    }
                    return [2 /*return*/, market];
            }
        });
    });
}
/**
 * Get cached oracle price
 */
function getCachedPrice(symbol) {
    var _a;
    var cached = priceCache.get(symbol.toUpperCase());
    return (_a = cached === null || cached === void 0 ? void 0 : cached.price) !== null && _a !== void 0 ? _a : null;
}
/**
 * Fetch and update price from Finnhub
 */
function fetchAndUpdatePrice(marketSymbol) {
    return __awaiter(this, void 0, void 0, function () {
        var market, quote, price, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getMarket(marketSymbol)];
                case 1:
                    market = _a.sent();
                    if (!market)
                        return [2 /*return*/, null];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 6, , 7]);
                    return [4 /*yield*/, (0, finnhub_service_1.getQuote)(market.finnhubSymbol)];
                case 3:
                    quote = _a.sent();
                    price = quote.currentPrice;
                    return [4 /*yield*/, updateOraclePrice(marketSymbol, price)];
                case 4:
                    _a.sent();
                    // Update candle data with new price
                    return [4 /*yield*/, (0, candle_service_1.updateCandle)(marketSymbol, price, 0, false)];
                case 5:
                    // Update candle data with new price
                    _a.sent();
                    // Broadcast price update via WebSocket
                    (0, websocket_service_1.broadcastPriceUpdate)(marketSymbol, {
                        symbol: marketSymbol,
                        price: price,
                        change: quote.change,
                        changePercent: quote.percentChange,
                        high: quote.highPrice,
                        low: quote.lowPrice,
                        timestamp: Date.now(),
                    });
                    return [2 /*return*/, price];
                case 6:
                    error_1 = _a.sent();
                    console.error("Failed to fetch price for ".concat(marketSymbol, ":"), error_1);
                    return [2 /*return*/, null];
                case 7: return [2 /*return*/];
            }
        });
    });
}
// Price update intervals per market
var priceUpdateIntervals = new Map();
/**
 * Start continuous price updates for a market
 */
function startPriceUpdates(marketSymbol, intervalMs) {
    if (intervalMs === void 0) { intervalMs = 15000; }
    if (priceUpdateIntervals.has(marketSymbol))
        return;
    console.log("\uD83D\uDCC8 Starting price updates for ".concat(marketSymbol));
    // Fetch immediately
    fetchAndUpdatePrice(marketSymbol);
    // Set up interval
    var interval = setInterval(function () {
        fetchAndUpdatePrice(marketSymbol);
    }, intervalMs);
    priceUpdateIntervals.set(marketSymbol, interval);
}
/**
 * Stop price updates for a market
 */
function stopPriceUpdates(marketSymbol) {
    var interval = priceUpdateIntervals.get(marketSymbol);
    if (interval) {
        clearInterval(interval);
        priceUpdateIntervals.delete(marketSymbol);
        console.log("\uD83D\uDCC9 Stopped price updates for ".concat(marketSymbol));
    }
}
/**
 * Start price updates for all active markets
 */
function startAllPriceUpdates() {
    return __awaiter(this, arguments, void 0, function (intervalMs) {
        var markets, _i, markets_1, market;
        if (intervalMs === void 0) { intervalMs = 15000; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getActiveMarkets()];
                case 1:
                    markets = _a.sent();
                    for (_i = 0, markets_1 = markets; _i < markets_1.length; _i++) {
                        market = markets_1[_i];
                        startPriceUpdates(market.symbol, intervalMs);
                    }
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Start price updates for required markets specifically
 * Ensures AAPL, GOOGL, MSFT always have price data
 */
function startRequiredPriceUpdates() {
    return __awaiter(this, arguments, void 0, function (intervalMs) {
        var _i, REQUIRED_MARKETS_2, marketData;
        if (intervalMs === void 0) { intervalMs = 15000; }
        return __generator(this, function (_a) {
            console.log("📈 Starting price updates for required markets...");
            for (_i = 0, REQUIRED_MARKETS_2 = market_model_1.REQUIRED_MARKETS; _i < REQUIRED_MARKETS_2.length; _i++) {
                marketData = REQUIRED_MARKETS_2[_i];
                startPriceUpdates(marketData.symbol, intervalMs);
            }
            return [2 /*return*/];
        });
    });
}
/**
 * Stop all price updates
 */
function stopAllPriceUpdates() {
    priceUpdateIntervals.forEach(function (_, symbol) {
        stopPriceUpdates(symbol);
    });
}
/**
 * Round price to market tick size
 */
function roundToTickSize(price, tickSize) {
    return Math.round(price / tickSize) * tickSize;
}
/**
 * Round quantity to market lot size
 */
function roundToLotSize(quantity, lotSize) {
    return Math.round(quantity / lotSize) * lotSize;
}
