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
exports.getRateLimitStatus = getRateLimitStatus;
exports.getQuote = getQuote;
exports.getCompanyProfile = getCompanyProfile;
exports.getMarketNews = getMarketNews;
exports.getCompanyNews = getCompanyNews;
exports.searchSymbols = searchSymbols;
exports.getBasicFinancials = getBasicFinancials;
exports.getEarningsCalendar = getEarningsCalendar;
exports.getHistoricalCandles = getHistoricalCandles;
exports.getHistoricalCandlesDays = getHistoricalCandlesDays;
exports.getYearlyCandles = getYearlyCandles;
exports.isConfigured = isConfigured;
var env_1 = require("../config/env");
var FINNHUB_BASE_URL = "https://finnhub.io/api/v1";
// Rate limiting - Finnhub free tier allows 60 calls/minute
var RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
var MAX_CALLS_PER_WINDOW = 50; // Leave some headroom
var MIN_CALL_INTERVAL_MS = 1200; // Minimum 1.2 seconds between calls
// Track API calls for rate limiting
var callTimestamps = [];
var lastCallTime = 0;
/**
 * Wait if needed to respect rate limits
 */
function waitForRateLimit() {
    return __awaiter(this, void 0, void 0, function () {
        var now, oldestCall, waitTime_1, timeSinceLastCall;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    now = Date.now();
                    // Clean up old timestamps
                    callTimestamps = callTimestamps.filter(function (t) { return now - t < RATE_LIMIT_WINDOW_MS; });
                    if (!(callTimestamps.length >= MAX_CALLS_PER_WINDOW)) return [3 /*break*/, 2];
                    oldestCall = callTimestamps[0];
                    waitTime_1 = RATE_LIMIT_WINDOW_MS - (now - oldestCall) + 100;
                    if (!(waitTime_1 > 0)) return [3 /*break*/, 2];
                    console.log("\u23F3 Rate limit reached, waiting ".concat(Math.round(waitTime_1 / 1000), "s..."));
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, waitTime_1); })];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2:
                    timeSinceLastCall = now - lastCallTime;
                    if (!(timeSinceLastCall < MIN_CALL_INTERVAL_MS)) return [3 /*break*/, 4];
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, MIN_CALL_INTERVAL_MS - timeSinceLastCall); })];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Record an API call for rate limiting
 */
function recordApiCall() {
    var now = Date.now();
    callTimestamps.push(now);
    lastCallTime = now;
}
/**
 * Get current rate limit status
 */
function getRateLimitStatus() {
    var now = Date.now();
    callTimestamps = callTimestamps.filter(function (t) { return now - t < RATE_LIMIT_WINDOW_MS; });
    return {
        callsInLastMinute: callTimestamps.length,
        maxCallsPerMinute: MAX_CALLS_PER_WINDOW,
        canMakeCall: callTimestamps.length < MAX_CALLS_PER_WINDOW,
    };
}
/**
 * Make authenticated request to Finnhub API
 * Includes rate limiting to avoid hitting API limits
 */
function finnhubFetch(endpoint_1) {
    return __awaiter(this, arguments, void 0, function (endpoint, params) {
        var url, _i, _a, _b, key, value, response, retryResponse;
        if (params === void 0) { params = {}; }
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: 
                // Wait for rate limit if needed
                return [4 /*yield*/, waitForRateLimit()];
                case 1:
                    // Wait for rate limit if needed
                    _c.sent();
                    url = new URL("".concat(FINNHUB_BASE_URL).concat(endpoint));
                    url.searchParams.set("token", env_1.config.finnhubApiKey);
                    for (_i = 0, _a = Object.entries(params); _i < _a.length; _i++) {
                        _b = _a[_i], key = _b[0], value = _b[1];
                        url.searchParams.set(key, value);
                    }
                    // Record this call for rate limiting
                    recordApiCall();
                    return [4 /*yield*/, fetch(url.toString())];
                case 2:
                    response = _c.sent();
                    if (!!response.ok) return [3 /*break*/, 6];
                    if (!(response.status === 429)) return [3 /*break*/, 5];
                    console.warn("⚠️ Finnhub rate limit hit, waiting 60 seconds...");
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 60000); })];
                case 3:
                    _c.sent();
                    return [4 /*yield*/, fetch(url.toString())];
                case 4:
                    retryResponse = _c.sent();
                    if (!retryResponse.ok) {
                        throw new Error("Finnhub API error: ".concat(retryResponse.status, " ").concat(retryResponse.statusText));
                    }
                    return [2 /*return*/, retryResponse.json()];
                case 5: throw new Error("Finnhub API error: ".concat(response.status, " ").concat(response.statusText));
                case 6: return [2 /*return*/, response.json()];
            }
        });
    });
}
/**
 * Get real-time quote for a stock
 */
function getQuote(symbol) {
    return __awaiter(this, void 0, void 0, function () {
        var data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    return [4 /*yield*/, finnhubFetch("/quote", { symbol: symbol.toUpperCase() })];
                case 1:
                    data = _a.sent();
                    return [2 /*return*/, {
                            symbol: symbol.toUpperCase(),
                            currentPrice: data.c || 0,
                            change: data.d || 0,
                            percentChange: data.dp || 0,
                            highPrice: data.h || 0,
                            lowPrice: data.l || 0,
                            openPrice: data.o || 0,
                            previousClose: data.pc || 0,
                            timestamp: data.t || Math.floor(Date.now() / 1000),
                        }];
            }
        });
    });
}
/**
 * Get company profile
 */
function getCompanyProfile(symbol) {
    return __awaiter(this, void 0, void 0, function () {
        var data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    return [4 /*yield*/, finnhubFetch("/stock/profile2", { symbol: symbol.toUpperCase() })];
                case 1:
                    data = _a.sent();
                    return [2 /*return*/, {
                            symbol: symbol.toUpperCase(),
                            name: data.name || "",
                            country: data.country || "",
                            currency: data.currency || "",
                            exchange: data.exchange || "",
                            industry: data.finnhubIndustry || "",
                            logo: data.logo || "",
                            marketCapitalization: data.marketCapitalization || 0,
                            weburl: data.weburl || "",
                            phone: data.phone || "",
                        }];
            }
        });
    });
}
/**
 * Get market news
 */
function getMarketNews() {
    return __awaiter(this, arguments, void 0, function (category) {
        var data;
        if (category === void 0) { category = "general"; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    return [4 /*yield*/, finnhubFetch("/news", { category: category })];
                case 1:
                    data = _a.sent();
                    return [2 /*return*/, (data || []).map(function (item) { return ({
                            id: item.id || 0,
                            category: item.category || "",
                            datetime: item.datetime || 0,
                            headline: item.headline || "",
                            image: item.image || "",
                            related: item.related || "",
                            source: item.source || "",
                            summary: item.summary || "",
                            url: item.url || "",
                        }); })];
            }
        });
    });
}
/**
 * Get company news
 */
function getCompanyNews(symbol, from, to) {
    return __awaiter(this, void 0, void 0, function () {
        var data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    return [4 /*yield*/, finnhubFetch("/company-news", {
                            symbol: symbol.toUpperCase(),
                            from: from,
                            to: to,
                        })];
                case 1:
                    data = _a.sent();
                    return [2 /*return*/, (data || []).map(function (item) { return ({
                            id: item.id || 0,
                            category: item.category || "",
                            datetime: item.datetime || 0,
                            headline: item.headline || "",
                            image: item.image || "",
                            related: item.related || "",
                            source: item.source || "",
                            summary: item.summary || "",
                            url: item.url || "",
                        }); })];
            }
        });
    });
}
/**
 * Search for symbols
 */
function searchSymbols(query) {
    return __awaiter(this, void 0, void 0, function () {
        var data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    return [4 /*yield*/, finnhubFetch("/search", { q: query })];
                case 1:
                    data = _a.sent();
                    return [2 /*return*/, (data.result || []).map(function (item) { return ({
                            description: item.description || "",
                            displaySymbol: item.displaySymbol || "",
                            symbol: item.symbol || "",
                            type: item.type || "",
                        }); })];
            }
        });
    });
}
/**
 * Get basic financials
 */
function getBasicFinancials(symbol_1) {
    return __awaiter(this, arguments, void 0, function (symbol, metric) {
        var data;
        if (metric === void 0) { metric = "all"; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    return [4 /*yield*/, finnhubFetch("/stock/metric", {
                            symbol: symbol.toUpperCase(),
                            metric: metric,
                        })];
                case 1:
                    data = _a.sent();
                    return [2 /*return*/, {
                            symbol: data.symbol || symbol.toUpperCase(),
                            metric: data.metric || {},
                            series: data.series || {},
                        }];
            }
        });
    });
}
/**
 * Get earnings calendar
 */
function getEarningsCalendar(from, to, symbol) {
    return __awaiter(this, void 0, void 0, function () {
        var params, data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    params = { from: from, to: to };
                    if (symbol) {
                        params.symbol = symbol.toUpperCase();
                    }
                    return [4 /*yield*/, finnhubFetch("/calendar/earnings", params)];
                case 1:
                    data = _a.sent();
                    return [2 /*return*/, (data.earningsCalendar || []).map(function (item) { return ({
                            date: item.date || "",
                            symbol: item.symbol || "",
                            hour: item.hour || "",
                            epsEstimate: item.epsEstimate || 0,
                            epsActual: item.epsActual || 0,
                        }); })];
            }
        });
    });
}
/**
 * Get historical stock candles
 * @param symbol Stock symbol (e.g., "AAPL")
 * @param resolution Candle resolution (1, 5, 15, 30, 60 minutes, or D, W, M)
 * @param from Start time (Unix timestamp in seconds)
 * @param to End time (Unix timestamp in seconds)
 */
function getHistoricalCandles(symbol, resolution, from, to) {
    return __awaiter(this, void 0, void 0, function () {
        var data, candles, i;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    return [4 /*yield*/, finnhubFetch("/stock/candle", {
                            symbol: symbol.toUpperCase(),
                            resolution: resolution,
                            from: from.toString(),
                            to: to.toString(),
                        })];
                case 1:
                    data = _a.sent();
                    // Check if we got data
                    if (data.s !== "ok" || !data.t || data.t.length === 0) {
                        return [2 /*return*/, []];
                    }
                    candles = [];
                    for (i = 0; i < data.t.length; i++) {
                        candles.push({
                            timestamp: data.t[i],
                            open: data.o[i],
                            high: data.h[i],
                            low: data.l[i],
                            close: data.c[i],
                            volume: data.v[i],
                        });
                    }
                    return [2 /*return*/, candles];
            }
        });
    });
}
/**
 * Get historical candles for the past N days
 * Convenience wrapper around getHistoricalCandles
 */
function getHistoricalCandlesDays(symbol, resolution, days) {
    return __awaiter(this, void 0, void 0, function () {
        var now, from;
        return __generator(this, function (_a) {
            now = Math.floor(Date.now() / 1000);
            from = now - (days * 24 * 60 * 60);
            return [2 /*return*/, getHistoricalCandles(symbol, resolution, from, now)];
        });
    });
}
/**
 * Get historical candles for the past year
 */
function getYearlyCandles(symbol_1) {
    return __awaiter(this, arguments, void 0, function (symbol, resolution) {
        if (resolution === void 0) { resolution = "D"; }
        return __generator(this, function (_a) {
            return [2 /*return*/, getHistoricalCandlesDays(symbol, resolution, 365)];
        });
    });
}
/**
 * Check if Finnhub is configured
 */
function isConfigured() {
    return Boolean(env_1.config.finnhubApiKey);
}
