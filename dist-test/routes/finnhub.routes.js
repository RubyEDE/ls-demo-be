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
var express_1 = require("express");
var auth_middleware_1 = require("../middleware/auth.middleware");
var finnhub_service_1 = require("../services/finnhub.service");
var candle_service_1 = require("../services/candle.service");
var market_service_1 = require("../services/market.service");
var router = (0, express_1.Router)();
// Middleware to check if Finnhub is configured
function requireFinnhub(req, res, next) {
    if (!(0, finnhub_service_1.isConfigured)()) {
        res.status(503).json({
            error: "SERVICE_UNAVAILABLE",
            message: "Finnhub API key not configured",
        });
        return;
    }
    next();
}
router.use(requireFinnhub);
/**
 * GET /finnhub/quote/:symbol
 * Get real-time stock quote
 */
router.get("/quote/:symbol", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbol, quote, error_1, message;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                symbol = req.params.symbol;
                return [4 /*yield*/, (0, finnhub_service_1.getQuote)(symbol)];
            case 1:
                quote = _a.sent();
                res.json(quote);
                return [3 /*break*/, 3];
            case 2:
                error_1 = _a.sent();
                message = error_1 instanceof Error ? error_1.message : "Failed to fetch quote";
                res.status(500).json({ error: "FETCH_ERROR", message: message });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /finnhub/profile/:symbol
 * Get company profile
 */
router.get("/profile/:symbol", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbol, profile, error_2, message;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                symbol = req.params.symbol;
                return [4 /*yield*/, (0, finnhub_service_1.getCompanyProfile)(symbol)];
            case 1:
                profile = _a.sent();
                res.json(profile);
                return [3 /*break*/, 3];
            case 2:
                error_2 = _a.sent();
                message = error_2 instanceof Error ? error_2.message : "Failed to fetch profile";
                res.status(500).json({ error: "FETCH_ERROR", message: message });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /finnhub/news/market
 * Get market news
 */
router.get("/news/market", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var category, news, error_3, message;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                category = req.query.category || "general";
                return [4 /*yield*/, (0, finnhub_service_1.getMarketNews)(category)];
            case 1:
                news = _a.sent();
                res.json({ news: news, count: news.length });
                return [3 /*break*/, 3];
            case 2:
                error_3 = _a.sent();
                message = error_3 instanceof Error ? error_3.message : "Failed to fetch news";
                res.status(500).json({ error: "FETCH_ERROR", message: message });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /finnhub/news/company/:symbol
 * Get company-specific news
 */
router.get("/news/company/:symbol", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbol, from, to, news, error_4, message;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                symbol = req.params.symbol;
                from = req.query.from || getDateDaysAgo(7);
                to = req.query.to || getToday();
                return [4 /*yield*/, (0, finnhub_service_1.getCompanyNews)(symbol, from, to)];
            case 1:
                news = _a.sent();
                res.json({ symbol: symbol.toUpperCase(), news: news, count: news.length });
                return [3 /*break*/, 3];
            case 2:
                error_4 = _a.sent();
                message = error_4 instanceof Error ? error_4.message : "Failed to fetch news";
                res.status(500).json({ error: "FETCH_ERROR", message: message });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /finnhub/search
 * Search for symbols
 */
router.get("/search", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var query, results, error_5, message;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                query = req.query.q;
                if (!query) {
                    res.status(400).json({
                        error: "INVALID_REQUEST",
                        message: "Query parameter 'q' is required",
                    });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, finnhub_service_1.searchSymbols)(query)];
            case 1:
                results = _a.sent();
                res.json({ query: query, results: results, count: results.length });
                return [3 /*break*/, 3];
            case 2:
                error_5 = _a.sent();
                message = error_5 instanceof Error ? error_5.message : "Failed to search";
                res.status(500).json({ error: "FETCH_ERROR", message: message });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /finnhub/financials/:symbol
 * Get basic financials for a company
 */
router.get("/financials/:symbol", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbol, metric, financials, error_6, message;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                symbol = req.params.symbol;
                metric = req.query.metric || "all";
                return [4 /*yield*/, (0, finnhub_service_1.getBasicFinancials)(symbol, metric)];
            case 1:
                financials = _a.sent();
                res.json(financials);
                return [3 /*break*/, 3];
            case 2:
                error_6 = _a.sent();
                message = error_6 instanceof Error ? error_6.message : "Failed to fetch financials";
                res.status(500).json({ error: "FETCH_ERROR", message: message });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /finnhub/earnings
 * Get earnings calendar
 */
router.get("/earnings", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var from, to, symbol, earnings, error_7, message;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                from = req.query.from || getToday();
                to = req.query.to || getDateDaysFromNow(7);
                symbol = req.query.symbol;
                return [4 /*yield*/, (0, finnhub_service_1.getEarningsCalendar)(from, to, symbol)];
            case 1:
                earnings = _a.sent();
                res.json({ from: from, to: to, earnings: earnings, count: earnings.length });
                return [3 /*break*/, 3];
            case 2:
                error_7 = _a.sent();
                message = error_7 instanceof Error ? error_7.message : "Failed to fetch earnings";
                res.status(500).json({ error: "FETCH_ERROR", message: message });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /finnhub/quotes
 * Get multiple quotes at once
 */
router.get("/quotes", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbolsParam, symbols, quotes, error_8, message;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                symbolsParam = req.query.symbols;
                if (!symbolsParam) {
                    res.status(400).json({
                        error: "INVALID_REQUEST",
                        message: "Query parameter 'symbols' is required (comma-separated)",
                    });
                    return [2 /*return*/];
                }
                symbols = symbolsParam.split(",").map(function (s) { return s.trim().toUpperCase(); });
                return [4 /*yield*/, Promise.all(symbols.map(function (symbol) { return __awaiter(void 0, void 0, void 0, function () {
                        var _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    _b.trys.push([0, 2, , 3]);
                                    return [4 /*yield*/, (0, finnhub_service_1.getQuote)(symbol)];
                                case 1: return [2 /*return*/, _b.sent()];
                                case 2:
                                    _a = _b.sent();
                                    return [2 /*return*/, { symbol: symbol, error: "Failed to fetch" }];
                                case 3: return [2 /*return*/];
                            }
                        });
                    }); }))];
            case 1:
                quotes = _a.sent();
                res.json({ quotes: quotes, count: quotes.length });
                return [3 /*break*/, 3];
            case 2:
                error_8 = _a.sent();
                message = error_8 instanceof Error ? error_8.message : "Failed to fetch quotes";
                res.status(500).json({ error: "FETCH_ERROR", message: message });
                return [3 /*break*/, 3];
            case 3: return [2 /*return*/];
        }
    });
}); });
/**
 * GET /finnhub/candles/:symbol
 * Get OHLCV candle data for charting
 * Works with both stock symbols (AAPL) and perp symbols (AAPL-PERP)
 *
 * Query params:
 *   - interval: 1m, 5m, 15m, 1h, 4h, 1d (default: 1m)
 *   - limit: number of candles (default: 100, max: 500)
 */
router.get("/candles/:symbol", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var symbol, interval, limit, validIntervals, perpSymbol, market, check, candles, currentCandle, error_9, message;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 6, , 7]);
                symbol = req.params.symbol.toUpperCase();
                interval = req.query.interval || "1m";
                limit = Math.min(parseInt(req.query.limit) || 100, 500);
                validIntervals = ["1m", "5m", "15m", "1h", "4h", "1d"];
                if (!validIntervals.includes(interval)) {
                    res.status(400).json({
                        error: "INVALID_INTERVAL",
                        message: "Invalid interval. Must be one of: ".concat(validIntervals.join(", ")),
                    });
                    return [2 /*return*/];
                }
                perpSymbol = symbol.endsWith("-PERP") ? symbol : "".concat(symbol, "-PERP");
                return [4 /*yield*/, (0, market_service_1.getMarket)(perpSymbol)];
            case 1:
                market = _a.sent();
                if (!market) {
                    res.status(404).json({
                        error: "NOT_FOUND",
                        message: "Market not found: ".concat(perpSymbol),
                    });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, candle_service_1.hasEnoughCandles)(perpSymbol, interval, 50)];
            case 2:
                check = _a.sent();
                if (!!check.hasEnough) return [3 /*break*/, 4];
                return [4 /*yield*/, (0, candle_service_1.backfillCandles)(perpSymbol, interval, 100)];
            case 3:
                _a.sent();
                _a.label = 4;
            case 4: return [4 /*yield*/, (0, candle_service_1.getCandles)(perpSymbol, interval, limit)];
            case 5:
                candles = _a.sent();
                currentCandle = (0, candle_service_1.getCurrentCandle)(perpSymbol, interval);
                // Format response similar to TradingView/standard OHLCV format
                res.json({
                    symbol: perpSymbol,
                    interval: interval,
                    marketStatus: (0, candle_service_1.getMarketStatus)(),
                    // Standard OHLCV arrays for easy charting library integration
                    t: candles.map(function (c) { return Math.floor(c.timestamp.getTime() / 1000); }), // Unix timestamps
                    o: candles.map(function (c) { return c.open; }),
                    h: candles.map(function (c) { return c.high; }),
                    l: candles.map(function (c) { return c.low; }),
                    c: candles.map(function (c) { return c.close; }),
                    v: candles.map(function (c) { return c.volume; }),
                    // Additional metadata
                    candles: candles.map(function (c) { return ({
                        time: c.timestamp.getTime(),
                        open: c.open,
                        high: c.high,
                        low: c.low,
                        close: c.close,
                        volume: c.volume,
                        trades: c.trades,
                        isClosed: c.isClosed,
                        isMarketOpen: c.isMarketOpen,
                    }); }),
                    current: currentCandle ? {
                        time: currentCandle.timestamp.getTime(),
                        open: currentCandle.open,
                        high: currentCandle.high,
                        low: currentCandle.low,
                        close: currentCandle.close,
                        volume: currentCandle.volume,
                        trades: currentCandle.trades,
                    } : null,
                    meta: {
                        count: candles.length,
                        hasEnoughData: check.hasEnough || candles.length >= 50,
                        firstCandle: candles.length > 0 ? candles[0].timestamp.getTime() : null,
                        lastCandle: candles.length > 0 ? candles[candles.length - 1].timestamp.getTime() : null,
                    },
                });
                return [3 /*break*/, 7];
            case 6:
                error_9 = _a.sent();
                message = error_9 instanceof Error ? error_9.message : "Failed to fetch candles";
                res.status(500).json({ error: "FETCH_ERROR", message: message });
                return [3 /*break*/, 7];
            case 7: return [2 /*return*/];
        }
    });
}); });
// Helper functions
function getToday() {
    return new Date().toISOString().split("T")[0];
}
function getDateDaysAgo(days) {
    var date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split("T")[0];
}
function getDateDaysFromNow(days) {
    var date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().split("T")[0];
}
exports.default = router;
