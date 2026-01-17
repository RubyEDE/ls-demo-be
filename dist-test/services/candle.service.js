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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUSMarketOpen = isUSMarketOpen;
exports.isWithinMarketHours = isWithinMarketHours;
exports.isMarketOpen = isMarketOpen;
exports.getMarketStatus = getMarketStatus;
exports.fetchHistoricalCandles = fetchHistoricalCandles;
exports.fetchAllHistoricalData = fetchAllHistoricalData;
exports.updateCandle = updateCandle;
exports.generateSyntheticCandles = generateSyntheticCandles;
exports.getCandles = getCandles;
exports.getCurrentCandle = getCurrentCandle;
exports.hasEnoughCandles = hasEnoughCandles;
exports.backfillCandles = backfillCandles;
exports.findMissingCandles = findMissingCandles;
exports.fillMissingCandles = fillMissingCandles;
exports.checkAndFillGaps = checkAndFillGaps;
exports.scanAndFillAllGaps = scanAndFillAllGaps;
exports.startGapFiller = startGapFiller;
exports.stopGapFiller = stopGapFiller;
exports.getGapStats = getGapStats;
exports.startCandleGenerator = startCandleGenerator;
exports.stopCandleGenerator = stopCandleGenerator;
exports.initializeCandles = initializeCandles;
var candle_model_1 = require("../models/candle.model");
var market_service_1 = require("./market.service");
var websocket_service_1 = require("./websocket.service");
var finnhub_service_1 = require("./finnhub.service");
// Perpetuals DEX - Market is always open 24/7 but we use real data during US market hours
// Synthetic candle variance settings (only used outside market hours)
var SYNTHETIC_MIN_CHANGE = 0.01; // Minimum $0.01 change per tick
var SYNTHETIC_VARIANCE_PERCENT = 0.002; // 0.2% max variance per tick
var SYNTHETIC_MAX_DRIFT = 0.015; // Max 1.5% drift from oracle price
var SYNTHETIC_MEAN_REVERSION = 0.1; // Mean reversion (10% pull back per tick)
// US Stock Market Hours (Eastern Time)
var US_MARKET_OPEN_HOUR = 9;
var US_MARKET_OPEN_MINUTE = 30;
var US_MARKET_CLOSE_HOUR = 16;
var US_MARKET_CLOSE_MINUTE = 0;
var currentCandles = new Map();
// Track last known prices for synthetic generation
var lastKnownPrices = new Map();
// Track historical data fetch status
var historicalDataFetched = new Map();
/**
 * Convert a date to Eastern Time
 */
function toEasternTime(date) {
    // Get the timezone offset for Eastern Time
    // This handles DST automatically
    var etString = date.toLocaleString("en-US", { timeZone: "America/New_York" });
    return new Date(etString);
}
/**
 * Check if US stock market is currently open
 * Market hours: 9:30 AM - 4:00 PM ET, Monday - Friday
 */
function isUSMarketOpen(date) {
    if (date === void 0) { date = new Date(); }
    var et = toEasternTime(date);
    var day = et.getDay();
    var hour = et.getHours();
    var minute = et.getMinutes();
    // Weekend - market closed
    if (day === 0 || day === 6) {
        return false;
    }
    // Before market open
    if (hour < US_MARKET_OPEN_HOUR || (hour === US_MARKET_OPEN_HOUR && minute < US_MARKET_OPEN_MINUTE)) {
        return false;
    }
    // After market close
    if (hour > US_MARKET_CLOSE_HOUR || (hour === US_MARKET_CLOSE_HOUR && minute >= US_MARKET_CLOSE_MINUTE)) {
        return false;
    }
    return true;
}
/**
 * Check if a timestamp falls within US market hours
 */
function isWithinMarketHours(timestamp) {
    return isUSMarketOpen(timestamp);
}
/**
 * Ensure a candle has proper OHLC spread (not flat)
 */
function ensureCandleSpread(candle) {
    var basePrice = candle.open;
    var spread = basePrice * 0.002; // 0.2% spread
    // Ensure high is above open and close
    var maxOC = Math.max(candle.open, candle.close);
    if (candle.high <= maxOC) {
        candle.high = Math.round((maxOC + spread * (0.5 + Math.random() * 0.5)) * 100) / 100;
    }
    // Ensure low is below open and close
    var minOC = Math.min(candle.open, candle.close);
    if (candle.low >= minOC) {
        candle.low = Math.round((minOC - spread * (0.5 + Math.random() * 0.5)) * 100) / 100;
    }
    // Ensure close is different from open
    if (Math.abs(candle.close - candle.open) < 0.01) {
        var direction = Math.random() > 0.5 ? 1 : -1;
        candle.close = Math.round((candle.open + direction * spread * Math.random()) * 100) / 100;
    }
}
// Track last real price update time per symbol
var lastRealPriceUpdate = new Map();
var SYNTHETIC_THRESHOLD_MS = 120000; // 2 minutes without real update = use synthetic
/**
 * Perpetuals DEX is always open 24/7
 */
function isMarketOpen() {
    return true;
}
/**
 * Get market status info - Perpetuals DEX is always open 24/7
 * Also includes US market status for reference
 */
function getMarketStatus() {
    var now = new Date();
    var usOpen = isUSMarketOpen(now);
    return {
        isOpen: true, // Perpetuals DEX always open
        currentTime: now.toISOString(),
        usMarket: {
            isOpen: usOpen,
        },
    };
}
/**
 * Map our candle interval to Finnhub resolution
 */
function intervalToFinnhubResolution(interval) {
    var mapping = {
        "1m": "1",
        "5m": "5",
        "15m": "15",
        "1h": "60",
        "4h": "60", // Finnhub doesn't have 4h, we'll aggregate from hourly
        "1d": "D",
    };
    return mapping[interval];
}
/**
 * Box-Muller transform for normal distribution
 */
function normalRandom() {
    var u = 0, v = 0;
    while (u === 0)
        u = Math.random();
    while (v === 0)
        v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
/**
 * Generate a random number from exponential distribution
 * Used for realistic wick lengths (many short, few long)
 */
function exponentialRandom(lambda) {
    if (lambda === void 0) { lambda = 1; }
    return -Math.log(1 - Math.random()) / lambda;
}
/**
 * Generate realistic candlestick shape based on market patterns
 * Returns body ratio (body / total range) and wick bias (upper vs lower)
 */
function generateCandleShape() {
    var rand = Math.random();
    // Distribution of candlestick patterns (realistic market proportions)
    if (rand < 0.05) {
        // 5% Doji - tiny body, balanced wicks
        return { bodyRatio: 0.02 + Math.random() * 0.05, wickBias: 0.4 + Math.random() * 0.2, pattern: 'doji' };
    }
    else if (rand < 0.10) {
        // 5% Hammer/Hanging man - small body at top, long lower wick
        return { bodyRatio: 0.15 + Math.random() * 0.15, wickBias: 0.1 + Math.random() * 0.15, pattern: 'hammer' };
    }
    else if (rand < 0.15) {
        // 5% Shooting star/Inverted hammer - small body at bottom, long upper wick
        return { bodyRatio: 0.15 + Math.random() * 0.15, wickBias: 0.75 + Math.random() * 0.15, pattern: 'shooting_star' };
    }
    else if (rand < 0.25) {
        // 10% Marubozu - large body, minimal wicks
        return { bodyRatio: 0.85 + Math.random() * 0.12, wickBias: 0.45 + Math.random() * 0.1, pattern: 'marubozu' };
    }
    else if (rand < 0.40) {
        // 15% Spinning top - small body, balanced medium wicks
        return { bodyRatio: 0.2 + Math.random() * 0.2, wickBias: 0.35 + Math.random() * 0.3, pattern: 'spinning_top' };
    }
    else {
        // 60% Normal candle - varied body, slight wick variation
        return { bodyRatio: 0.3 + Math.random() * 0.4, wickBias: 0.3 + Math.random() * 0.4, pattern: 'normal' };
    }
}
/**
 * Generate synthetic daily candles using enhanced Geometric Brownian Motion
 * Creates realistic price history with proper candlestick patterns,
 * trend persistence, volatility clustering, and natural market behavior
 */
function generateSyntheticDailyCandles(marketSymbol_1, currentPrice_1) {
    return __awaiter(this, arguments, void 0, function (marketSymbol, currentPrice, days) {
        var symbol, allDays, now, i, date, existingCandles, existingTimestamps, annualDrift, baseAnnualVolatility, calendarDaysPerYear, dailyDrift, baseDailyVolatility, trendPersistence, meanReversionSpeed, price, currentVolatility, trendMomentum, longTermAverage, priceHistory, closePrices, volatilities, i, date, dayOfWeek, isWeekend, isMonday, isFriday, volMultiplier, volShock, volPersistence, volMeanReversion, randomShock, fatTailMultiplier, deviationFromMean, meanReversionPull, dailyReturn, i, date, close_1, dayVolatility, prevClose, nextClose, isWeekend, gapMultiplier, gapPercent, open_1, avgPrice, baseRange, rangeMultiplier, totalRange, shape, bodySize, isUpDay, actualBody, adjustment, finalBody, remainingRange, upperWickBase, lowerWickBase, upperWickRand, lowerWickRand, upperWick, lowerWick, bodyHigh, bodyLow, high, low, midpoint, weekendRange, candlesToInsert, i, day, isWeekend, volFactor, baseVolume, volume, error_1, err;
        if (days === void 0) { days = 365; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    symbol = marketSymbol.toUpperCase();
                    console.log("   \uD83D\uDD27 Generating ".concat(days, " calendar days of synthetic daily candles..."));
                    allDays = [];
                    now = new Date();
                    now.setUTCHours(0, 0, 0, 0);
                    for (i = days; i >= 1; i--) {
                        date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                        allDays.push(date);
                    }
                    return [4 /*yield*/, candle_model_1.Candle.find({
                            marketSymbol: symbol,
                            interval: "1d",
                        }).select("timestamp")];
                case 1:
                    existingCandles = _a.sent();
                    existingTimestamps = new Set(existingCandles.map(function (c) { return c.timestamp.getTime(); }));
                    annualDrift = 0.06 + Math.random() * 0.08;
                    baseAnnualVolatility = 0.18 + Math.random() * 0.14;
                    calendarDaysPerYear = 365;
                    dailyDrift = annualDrift / calendarDaysPerYear;
                    baseDailyVolatility = baseAnnualVolatility / Math.sqrt(calendarDaysPerYear);
                    trendPersistence = 0.15 + Math.random() * 0.2;
                    meanReversionSpeed = 0.02;
                    price = currentPrice;
                    currentVolatility = baseDailyVolatility;
                    trendMomentum = 0;
                    longTermAverage = currentPrice;
                    priceHistory = [];
                    closePrices = [];
                    volatilities = [];
                    // Generate close prices using enhanced GBM (backwards)
                    for (i = allDays.length - 1; i >= 0; i--) {
                        closePrices.unshift(price);
                        volatilities.unshift(currentVolatility);
                        date = allDays[i];
                        dayOfWeek = date.getUTCDay();
                        isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                        isMonday = dayOfWeek === 1;
                        isFriday = dayOfWeek === 5;
                        volMultiplier = 1.0;
                        if (isWeekend)
                            volMultiplier = 0.25; // Very low weekend volatility
                        if (isMonday)
                            volMultiplier = 1.15; // Slightly higher Monday volatility (weekend news)
                        if (isFriday)
                            volMultiplier = 0.9; // Slightly lower Friday volatility
                        volShock = Math.abs(normalRandom());
                        volPersistence = 0.85;
                        volMeanReversion = 0.15;
                        currentVolatility = volPersistence * currentVolatility +
                            volMeanReversion * baseDailyVolatility +
                            0.1 * baseDailyVolatility * volShock;
                        // Cap volatility at reasonable bounds
                        currentVolatility = Math.max(baseDailyVolatility * 0.3, Math.min(baseDailyVolatility * 3, currentVolatility));
                        randomShock = normalRandom();
                        fatTailMultiplier = Math.random() < 0.05 ? (1.5 + Math.random() * 1.5) : 1;
                        deviationFromMean = (price - longTermAverage) / longTermAverage;
                        meanReversionPull = -meanReversionSpeed * deviationFromMean;
                        dailyReturn = dailyDrift +
                            trendMomentum * trendPersistence +
                            meanReversionPull +
                            currentVolatility * volMultiplier * randomShock * fatTailMultiplier;
                        // Update momentum for next iteration
                        trendMomentum = dailyReturn * 0.5 + trendMomentum * 0.3;
                        // GBM step (going backwards)
                        price = price / (1 + dailyReturn);
                    }
                    // Now generate OHLC for each day with realistic candlestick shapes
                    for (i = 0; i < allDays.length; i++) {
                        date = allDays[i];
                        close_1 = closePrices[i];
                        dayVolatility = volatilities[i];
                        prevClose = i > 0 ? closePrices[i - 1] : close_1 * (1 - dailyDrift);
                        nextClose = i < allDays.length - 1 ? closePrices[i + 1] : close_1;
                        isWeekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
                        gapMultiplier = 1.0;
                        if (date.getUTCDay() === 1)
                            gapMultiplier = 2.0; // Monday gaps
                        gapPercent = normalRandom() * dayVolatility * 0.5 * gapMultiplier;
                        open_1 = prevClose * (1 + gapPercent);
                        avgPrice = (open_1 + close_1) / 2;
                        baseRange = avgPrice * dayVolatility * (isWeekend ? 0.4 : 1.2);
                        rangeMultiplier = 0.6 + exponentialRandom(1.5);
                        totalRange = baseRange * Math.min(rangeMultiplier, 3);
                        shape = generateCandleShape();
                        bodySize = totalRange * shape.bodyRatio;
                        isUpDay = close_1 >= open_1;
                        actualBody = Math.abs(close_1 - open_1);
                        // Adjust open to create the desired body size if needed
                        if (actualBody < bodySize * 0.5) {
                            adjustment = (bodySize - actualBody) * (isUpDay ? -1 : 1);
                            open_1 = open_1 + adjustment * 0.5;
                        }
                        finalBody = Math.abs(close_1 - open_1);
                        remainingRange = Math.max(0, totalRange - finalBody);
                        upperWickBase = remainingRange * shape.wickBias;
                        lowerWickBase = remainingRange * (1 - shape.wickBias);
                        upperWickRand = exponentialRandom(2) * 0.3;
                        lowerWickRand = exponentialRandom(2) * 0.3;
                        upperWick = Math.max(avgPrice * 0.0005, upperWickBase * (0.7 + upperWickRand));
                        lowerWick = Math.max(avgPrice * 0.0005, lowerWickBase * (0.7 + lowerWickRand));
                        bodyHigh = Math.max(open_1, close_1);
                        bodyLow = Math.min(open_1, close_1);
                        high = bodyHigh + upperWick;
                        low = bodyLow - lowerWick;
                        // Ensure OHLC constraints
                        high = Math.max(high, open_1, close_1);
                        low = Math.min(low, open_1, close_1);
                        // Weekend candles should be much tighter
                        if (isWeekend) {
                            midpoint = (open_1 + close_1) / 2;
                            weekendRange = avgPrice * 0.003;
                            high = Math.min(high, midpoint + weekendRange);
                            low = Math.max(low, midpoint - weekendRange);
                        }
                        priceHistory.push({
                            date: date,
                            open: Math.round(open_1 * 100) / 100,
                            high: Math.round(high * 100) / 100,
                            low: Math.round(low * 100) / 100,
                            close: Math.round(close_1 * 100) / 100,
                            volatility: dayVolatility,
                        });
                    }
                    candlesToInsert = [];
                    for (i = 0; i < priceHistory.length; i++) {
                        day = priceHistory[i];
                        // Skip if already exists
                        if (existingTimestamps.has(day.date.getTime()))
                            continue;
                        isWeekend = day.date.getUTCDay() === 0 || day.date.getUTCDay() === 6;
                        volFactor = day.volatility / baseDailyVolatility;
                        baseVolume = isWeekend ? 500000 : 15000000;
                        volume = Math.floor(baseVolume * (0.5 + Math.random() * volFactor));
                        candlesToInsert.push({
                            marketSymbol: symbol,
                            interval: "1d",
                            timestamp: day.date,
                            open: day.open,
                            high: day.high,
                            low: day.low,
                            close: day.close,
                            volume: volume,
                            quoteVolume: 0,
                            trades: 0,
                            isClosed: true,
                            isMarketOpen: true,
                        });
                    }
                    if (!(candlesToInsert.length > 0)) return [3 /*break*/, 5];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, candle_model_1.Candle.insertMany(candlesToInsert, { ordered: false })];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_1 = _a.sent();
                    err = error_1;
                    if (err.code !== 11000)
                        throw error_1;
                    return [3 /*break*/, 5];
                case 5:
                    console.log("   \u2705 Generated ".concat(candlesToInsert.length, " synthetic daily candles"));
                    return [2 /*return*/, candlesToInsert.length];
            }
        });
    });
}
/**
 * Fetch and store historical candles from Finnhub
 * Uses real market data for the past year
 */
function fetchHistoricalCandles(finnhubSymbol_1, marketSymbol_1, interval_1) {
    return __awaiter(this, arguments, void 0, function (finnhubSymbol, marketSymbol, interval, days) {
        var resolution, now, from, historicalData, candlesToInsert, _i, historicalData_1, candle, timestamp, exists, error_2, err, error_3;
        if (days === void 0) { days = 365; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(0, finnhub_service_1.isConfigured)()) {
                        console.warn("Finnhub API key not configured, skipping historical data fetch");
                        return [2 /*return*/, 0];
                    }
                    resolution = intervalToFinnhubResolution(interval);
                    now = Math.floor(Date.now() / 1000);
                    from = now - (days * 24 * 60 * 60);
                    console.log("\uD83D\uDCC8 Fetching ".concat(interval, " historical data for ").concat(marketSymbol, " (").concat(days, " days)..."));
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 13, , 14]);
                    return [4 /*yield*/, (0, finnhub_service_1.getHistoricalCandles)(finnhubSymbol, resolution, from, now)];
                case 2:
                    historicalData = _a.sent();
                    if (historicalData.length === 0) {
                        console.warn("   No historical data returned for ".concat(finnhubSymbol));
                        return [2 /*return*/, 0];
                    }
                    console.log("   Received ".concat(historicalData.length, " candles from Finnhub"));
                    candlesToInsert = [];
                    _i = 0, historicalData_1 = historicalData;
                    _a.label = 3;
                case 3:
                    if (!(_i < historicalData_1.length)) return [3 /*break*/, 6];
                    candle = historicalData_1[_i];
                    timestamp = new Date(candle.timestamp * 1000);
                    return [4 /*yield*/, candle_model_1.Candle.findOne({
                            marketSymbol: marketSymbol.toUpperCase(),
                            interval: interval,
                            timestamp: timestamp,
                        })];
                case 4:
                    exists = _a.sent();
                    if (!exists) {
                        candlesToInsert.push({
                            marketSymbol: marketSymbol.toUpperCase(),
                            interval: interval,
                            timestamp: timestamp,
                            open: candle.open,
                            high: candle.high,
                            low: candle.low,
                            close: candle.close,
                            volume: candle.volume,
                            quoteVolume: candle.volume * candle.close,
                            trades: 0, // Finnhub doesn't provide trade count
                            isClosed: true,
                            isMarketOpen: isWithinMarketHours(timestamp),
                        });
                    }
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 3];
                case 6:
                    if (!(candlesToInsert.length > 0)) return [3 /*break*/, 11];
                    _a.label = 7;
                case 7:
                    _a.trys.push([7, 9, , 10]);
                    return [4 /*yield*/, candle_model_1.Candle.insertMany(candlesToInsert, { ordered: false })];
                case 8:
                    _a.sent();
                    console.log("   \u2705 Stored ".concat(candlesToInsert.length, " new ").concat(interval, " candles for ").concat(marketSymbol));
                    return [3 /*break*/, 10];
                case 9:
                    error_2 = _a.sent();
                    err = error_2;
                    if (err.code === 11000) {
                        console.log("   \u26A0\uFE0F Some candles already existed, stored new ones");
                    }
                    else {
                        throw error_2;
                    }
                    return [3 /*break*/, 10];
                case 10: return [3 /*break*/, 12];
                case 11:
                    console.log("   \u2139\uFE0F All ".concat(interval, " candles already exist for ").concat(marketSymbol));
                    _a.label = 12;
                case 12: return [2 /*return*/, candlesToInsert.length];
                case 13:
                    error_3 = _a.sent();
                    console.error("   \u274C Error fetching historical candles for ".concat(marketSymbol, ":"), error_3);
                    return [2 /*return*/, 0];
                case 14: return [2 /*return*/];
            }
        });
    });
}
/**
 * Fetch all historical data for a market (multiple intervals)
 * Uses delays between calls to avoid rate limiting
 */
function fetchAllHistoricalData(finnhubSymbol_1, marketSymbol_1) {
    return __awaiter(this, arguments, void 0, function (finnhubSymbol, marketSymbol, days) {
        if (days === void 0) { days = 365; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("\uD83D\uDCC8 Fetching historical data for ".concat(marketSymbol, "..."));
                    // Fetch daily candles first (most important, 1 year)
                    return [4 /*yield*/, fetchHistoricalCandles(finnhubSymbol, marketSymbol, "1d", days)];
                case 1:
                    // Fetch daily candles first (most important, 1 year)
                    _a.sent();
                    // Longer delay to respect rate limits (2 seconds between calls)
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 2000); })];
                case 2:
                    // Longer delay to respect rate limits (2 seconds between calls)
                    _a.sent();
                    // Fetch hourly candles (1 year worth)
                    return [4 /*yield*/, fetchHistoricalCandles(finnhubSymbol, marketSymbol, "1h", days)];
                case 3:
                    // Fetch hourly candles (1 year worth)
                    _a.sent();
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 2000); })];
                case 4:
                    _a.sent();
                    // Fetch 15-minute candles (last 30 days - Finnhub limits intraday data)
                    return [4 /*yield*/, fetchHistoricalCandles(finnhubSymbol, marketSymbol, "15m", 30)];
                case 5:
                    // Fetch 15-minute candles (last 30 days - Finnhub limits intraday data)
                    _a.sent();
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 2000); })];
                case 6:
                    _a.sent();
                    // Fetch 5-minute candles (last 7 days)
                    return [4 /*yield*/, fetchHistoricalCandles(finnhubSymbol, marketSymbol, "5m", 7)];
                case 7:
                    // Fetch 5-minute candles (last 7 days)
                    _a.sent();
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 2000); })];
                case 8:
                    _a.sent();
                    // Fetch 1-minute candles (last 2 days)
                    return [4 /*yield*/, fetchHistoricalCandles(finnhubSymbol, marketSymbol, "1m", 2)];
                case 9:
                    // Fetch 1-minute candles (last 2 days)
                    _a.sent();
                    historicalDataFetched.set(marketSymbol, true);
                    console.log("   \u2705 Historical data fetch complete for ".concat(marketSymbol));
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Generate a synthetic price with small variance
 * Always produces a change (never stays flat)
 * Anchored to oracle price - won't drift far from it
 */
function generateSyntheticPrice(oraclePrice, previousClose) {
    var currentPrice = previousClose || oraclePrice;
    // Calculate how far we've drifted from oracle price
    var driftFromOracle = (currentPrice - oraclePrice) / oraclePrice;
    // If we've drifted too far, force price back towards oracle
    if (Math.abs(driftFromOracle) > SYNTHETIC_MAX_DRIFT) {
        // Strong correction - move 50% back towards oracle
        var correction = (oraclePrice - currentPrice) * 0.5;
        var newPrice_1 = currentPrice + correction;
        return Math.round(newPrice_1 * 100) / 100;
    }
    // Random direction - but bias towards oracle if drifted past 1%
    var direction;
    if (Math.abs(driftFromOracle) > 0.01) {
        // Bias direction back towards oracle (60% chance)
        direction = driftFromOracle > 0 ? (Math.random() > 0.4 ? -1 : 1) : (Math.random() > 0.4 ? 1 : -1);
    }
    else {
        direction = Math.random() > 0.5 ? 1 : -1;
    }
    // Random magnitude - small variance
    var percentChange = SYNTHETIC_MIN_CHANGE / currentPrice + Math.random() * SYNTHETIC_VARIANCE_PERCENT;
    // Apply mean reversion towards oracle price
    var meanReversion = -driftFromOracle * SYNTHETIC_MEAN_REVERSION;
    // Calculate new price
    var change = (direction * percentChange) + meanReversion;
    var newPrice = currentPrice * (1 + change);
    // Final check - hard cap at max drift from oracle
    var finalDrift = (newPrice - oraclePrice) / oraclePrice;
    if (Math.abs(finalDrift) > SYNTHETIC_MAX_DRIFT) {
        // Clamp to max drift
        newPrice = oraclePrice * (1 + (finalDrift > 0 ? SYNTHETIC_MAX_DRIFT : -SYNTHETIC_MAX_DRIFT));
    }
    // Ensure minimum change of $0.01
    if (Math.abs(newPrice - currentPrice) < SYNTHETIC_MIN_CHANGE) {
        newPrice = currentPrice + (direction * SYNTHETIC_MIN_CHANGE);
    }
    // Round to 2 decimal places
    return Math.round(newPrice * 100) / 100;
}
/**
 * Generate synthetic OHLC for a candle period
 * Creates realistic candlestick shapes while staying anchored to oracle price
 */
function generateSyntheticOHLC(oraclePrice, previousClose) {
    // Start from previous close, but if it drifted too far, start from oracle
    var startPrice = previousClose || oraclePrice;
    var startDrift = Math.abs((startPrice - oraclePrice) / oraclePrice);
    if (startDrift > SYNTHETIC_MAX_DRIFT) {
        // Previous close drifted too far - reset closer to oracle
        startPrice = oraclePrice * (1 + (startPrice > oraclePrice ? 0.005 : -0.005));
    }
    // Get realistic candle shape
    var shape = generateCandleShape();
    // Base volatility for synthetic candles
    var baseVolatility = oraclePrice * 0.001;
    // Calculate total range based on shape and randomness
    var rangeMultiplier = 0.5 + exponentialRandom(1.2);
    var totalRange = baseVolatility * rangeMultiplier;
    var bodySize = totalRange * shape.bodyRatio;
    // Generate close by simulating small random walk
    var current = startPrice;
    var numTicks = 8 + Math.floor(Math.random() * 8);
    for (var i = 0; i < numTicks; i++) {
        current = generateSyntheticPrice(oraclePrice, current);
    }
    var open = startPrice;
    var close = current;
    // Calculate wicks based on shape
    var actualBody = Math.abs(close - open);
    var remainingRange = Math.max(0, totalRange - actualBody);
    var upperWickSpace = remainingRange * shape.wickBias;
    var lowerWickSpace = remainingRange * (1 - shape.wickBias);
    // Add randomness to wicks
    var upperWick = Math.max(oraclePrice * 0.0001, upperWickSpace * (0.4 + exponentialRandom(1.5)));
    var lowerWick = Math.max(oraclePrice * 0.0001, lowerWickSpace * (0.4 + exponentialRandom(1.5)));
    // Constrain wicks to drift limits
    var maxWick = oraclePrice * SYNTHETIC_MAX_DRIFT * 0.5;
    upperWick = Math.min(upperWick, maxWick);
    lowerWick = Math.min(lowerWick, maxWick);
    var bodyHigh = Math.max(open, close);
    var bodyLow = Math.min(open, close);
    var high = bodyHigh + upperWick;
    var low = bodyLow - lowerWick;
    // Ensure within drift limits
    var maxPrice = oraclePrice * (1 + SYNTHETIC_MAX_DRIFT);
    var minPrice = oraclePrice * (1 - SYNTHETIC_MAX_DRIFT);
    high = Math.min(high, maxPrice);
    low = Math.max(low, minPrice);
    // Ensure minimum visible range
    if (high - low < oraclePrice * 0.0002) {
        high = bodyHigh + oraclePrice * 0.0001;
        low = bodyLow - oraclePrice * 0.0001;
    }
    return {
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
    };
}
/**
 * Generate realistic OHLC for gap filling
 * Creates smooth, realistic candles that transition well between surrounding candles
 * Uses proper candlestick patterns with natural-looking shapes
 */
function generateRealisticOHLC(basePrice, targetPrice, position, // 0 to 1 - where in the gap this candle is
trendBias // -1 to 1 - bias towards bearish/bullish
) {
    if (trendBias === void 0) { trendBias = 0; }
    // Get realistic candle shape
    var shape = generateCandleShape();
    // Base volatility for gap filling (lower than normal)
    var baseVolatility = basePrice * 0.002;
    // Total candle range based on shape
    var totalRange = baseVolatility * (0.3 + exponentialRandom(0.8));
    var bodySize = totalRange * shape.bodyRatio;
    // Determine direction with trend bias and some randomness
    var greenChance = 0.5 + (trendBias * 0.35);
    var isGreen = Math.random() < greenChance;
    // Calculate open price (slight gap from base for realism)
    var gapVariation = normalRandom() * basePrice * 0.0001;
    var open = basePrice + gapVariation;
    // Calculate close based on direction and target
    var close;
    var naturalClose = isGreen ? open + bodySize : open - bodySize;
    if (targetPrice !== null && position > 0.6) {
        // Smoothly transition to target near end of gap
        var targetInfluence = Math.pow((position - 0.6) / 0.4, 2); // Quadratic easing
        close = naturalClose + (targetPrice - naturalClose) * targetInfluence * 0.6;
    }
    else {
        close = naturalClose;
    }
    // Calculate wicks based on shape
    var remainingRange = totalRange - Math.abs(close - open);
    var upperWickSpace = remainingRange * shape.wickBias;
    var lowerWickSpace = remainingRange * (1 - shape.wickBias);
    // Add variation to wicks
    var upperWick = Math.max(basePrice * 0.0001, upperWickSpace * (0.5 + exponentialRandom(1.2)));
    var lowerWick = Math.max(basePrice * 0.0001, lowerWickSpace * (0.5 + exponentialRandom(1.2)));
    var bodyHigh = Math.max(open, close);
    var bodyLow = Math.min(open, close);
    var high = bodyHigh + upperWick;
    var low = bodyLow - lowerWick;
    return {
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
    };
}
/**
 * Determine trend direction from surrounding candles
 * Returns a value from -1 (bearish) to 1 (bullish)
 */
function calculateTrendBias(prevCandle, nextCandle, position) {
    var bias = 0;
    if (prevCandle && nextCandle) {
        // Overall direction from prev close to next open
        var overallDirection = nextCandle.open > prevCandle.close ? 1 : -1;
        var overallChange = Math.abs(nextCandle.open - prevCandle.close) / prevCandle.close;
        // Stronger bias for larger moves, capped at 0.5
        bias = overallDirection * Math.min(overallChange * 10, 0.5);
        // Add some randomness to avoid all candles going the same way
        bias += (Math.random() - 0.5) * 0.4;
    }
    else if (prevCandle) {
        // Continue the trend from previous candle slightly
        var prevTrend = prevCandle.close > prevCandle.open ? 0.2 : -0.2;
        bias = prevTrend + (Math.random() - 0.5) * 0.4;
    }
    else if (nextCandle) {
        // Anticipate the next candle slightly
        var nextTrend = nextCandle.close > nextCandle.open ? 0.2 : -0.2;
        bias = nextTrend + (Math.random() - 0.5) * 0.4;
    }
    // Clamp to [-1, 1]
    return Math.max(-1, Math.min(1, bias));
}
/**
 * Update candle with a new price tick
 * Always adds small variance to create realistic price movement
 * Anchored to oracle price - synthetic movement won't drift far
 */
function updateCandle(marketSymbol_1, price_1) {
    return __awaiter(this, arguments, void 0, function (marketSymbol, price, volume, isTrade, isRealPrice) {
        var symbol, now, oraclePrice, lastPrice, adjustedPrice, microVariance, intervals, _i, intervals_1, interval;
        if (volume === void 0) { volume = 0; }
        if (isTrade === void 0) { isTrade = false; }
        if (isRealPrice === void 0) { isRealPrice = true; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    symbol = marketSymbol.toUpperCase();
                    now = new Date();
                    oraclePrice = (0, market_service_1.getCachedPrice)(symbol) || price;
                    lastPrice = lastKnownPrices.get(symbol);
                    adjustedPrice = price;
                    if (lastPrice) {
                        // If price is exactly the same as last time, generate synthetic movement
                        // Use oracle price as anchor to prevent drift
                        if (Math.abs(price - lastPrice) < 0.01) {
                            adjustedPrice = generateSyntheticPrice(oraclePrice, lastPrice);
                        }
                        else {
                            microVariance = (Math.random() - 0.5) * 0.02;
                            adjustedPrice = Math.round((price + microVariance) * 100) / 100;
                        }
                    }
                    // Store the adjusted price
                    lastKnownPrices.set(symbol, adjustedPrice);
                    // Track real price updates
                    if (isRealPrice) {
                        lastRealPriceUpdate.set(symbol, Date.now());
                    }
                    intervals = ["1m", "5m", "15m", "1h", "4h", "1d"];
                    _i = 0, intervals_1 = intervals;
                    _a.label = 1;
                case 1:
                    if (!(_i < intervals_1.length)) return [3 /*break*/, 4];
                    interval = intervals_1[_i];
                    return [4 /*yield*/, updateCandleForInterval(symbol, interval, adjustedPrice, volume, isTrade, now, true)];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Update candle for a specific interval
 * Generates synthetic price spread to ensure realistic OHLC
 */
function updateCandleForInterval(symbol, interval, price, volume, isTrade, now, marketOpen) {
    return __awaiter(this, void 0, void 0, function () {
        var candleStart, symbolCandles, existing, openPrice, spread, candle, dbCandle, spread, ticks, i, variance, _i, ticks_1, tick, shouldSave;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    candleStart = (0, candle_model_1.getCandleStart)(now, interval);
                    // Get or create in-memory candle map for this symbol
                    if (!currentCandles.has(symbol)) {
                        currentCandles.set(symbol, new Map());
                    }
                    symbolCandles = currentCandles.get(symbol);
                    existing = symbolCandles.get(interval);
                    if (!(existing && existing.timestamp.getTime() !== candleStart.getTime())) return [3 /*break*/, 2];
                    // Ensure closed candle has proper OHLC spread
                    ensureCandleSpread(existing);
                    // Save the previous candle to DB
                    return [4 /*yield*/, saveCandle(symbol, interval, existing, true, marketOpen)];
                case 1:
                    // Save the previous candle to DB
                    _a.sent();
                    // Broadcast the closed candle
                    (0, websocket_service_1.broadcastCandleUpdate)(symbol, {
                        symbol: symbol,
                        interval: interval,
                        timestamp: existing.timestamp.getTime(),
                        open: existing.open,
                        high: existing.high,
                        low: existing.low,
                        close: existing.close,
                        volume: existing.volume,
                        trades: existing.trades,
                        isClosed: true,
                    });
                    openPrice = price;
                    spread = price * 0.001;
                    symbolCandles.set(interval, {
                        open: openPrice,
                        high: Math.round((openPrice + spread * Math.random()) * 100) / 100,
                        low: Math.round((openPrice - spread * Math.random()) * 100) / 100,
                        close: price,
                        volume: 0,
                        trades: 0,
                        timestamp: candleStart,
                    });
                    _a.label = 2;
                case 2:
                    candle = symbolCandles.get(interval);
                    if (!!candle) return [3 /*break*/, 4];
                    return [4 /*yield*/, candle_model_1.Candle.findOne({
                            marketSymbol: symbol,
                            interval: interval,
                            timestamp: candleStart,
                        })];
                case 3:
                    dbCandle = _a.sent();
                    if (dbCandle) {
                        candle = {
                            open: dbCandle.open,
                            high: dbCandle.high,
                            low: dbCandle.low,
                            close: dbCandle.close,
                            volume: dbCandle.volume,
                            trades: dbCandle.trades,
                            timestamp: candleStart,
                        };
                    }
                    else {
                        spread = price * 0.001;
                        candle = {
                            open: price,
                            high: Math.round((price + spread * Math.random()) * 100) / 100,
                            low: Math.round((price - spread * Math.random()) * 100) / 100,
                            close: price,
                            volume: 0,
                            trades: 0,
                            timestamp: candleStart,
                        };
                    }
                    symbolCandles.set(interval, candle);
                    _a.label = 4;
                case 4:
                    ticks = [price];
                    for (i = 0; i < 3; i++) {
                        variance = (Math.random() - 0.5) * price * 0.002;
                        ticks.push(Math.round((price + variance) * 100) / 100);
                    }
                    // Update candle with all ticks
                    for (_i = 0, ticks_1 = ticks; _i < ticks_1.length; _i++) {
                        tick = ticks_1[_i];
                        candle.high = Math.max(candle.high, tick);
                        candle.low = Math.min(candle.low, tick);
                    }
                    candle.close = price;
                    if (isTrade) {
                        candle.volume += volume;
                        candle.trades += 1;
                    }
                    shouldSave = interval === "1m" || Math.random() < 0.1;
                    if (!shouldSave) return [3 /*break*/, 6];
                    return [4 /*yield*/, saveCandle(symbol, interval, candle, false, marketOpen)];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6:
                    // Broadcast update for 1m candles (real-time)
                    if (interval === "1m") {
                        (0, websocket_service_1.broadcastCandleUpdate)(symbol, {
                            symbol: symbol,
                            interval: interval,
                            timestamp: candle.timestamp.getTime(),
                            open: candle.open,
                            high: candle.high,
                            low: candle.low,
                            close: candle.close,
                            volume: candle.volume,
                            trades: candle.trades,
                            isClosed: false,
                        });
                    }
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Save candle to database
 */
function saveCandle(symbol, interval, candle, isClosed, isMarketOpen) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, candle_model_1.Candle.findOneAndUpdate({
                        marketSymbol: symbol,
                        interval: interval,
                        timestamp: candle.timestamp,
                    }, {
                        open: candle.open,
                        high: candle.high,
                        low: candle.low,
                        close: candle.close,
                        volume: candle.volume,
                        trades: candle.trades,
                        isClosed: isClosed,
                        isMarketOpen: isMarketOpen,
                    }, { upsert: true, new: true })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Check if a symbol needs synthetic data (no real updates recently)
 */
function needsSyntheticData(symbol) {
    var lastUpdate = lastRealPriceUpdate.get(symbol);
    if (!lastUpdate)
        return true;
    return Date.now() - lastUpdate > SYNTHETIC_THRESHOLD_MS;
}
/**
 * Generate synthetic candles when not receiving real price data
 * Runs every minute to ensure 24/7 candle coverage
 */
function generateSyntheticCandles() {
    return __awaiter(this, void 0, void 0, function () {
        var REQUIRED_MARKETS, _i, REQUIRED_MARKETS_1, market, symbol, basePrice, lastCandle, previousClose, synthetic;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../models/market.model"); })];
                case 1:
                    REQUIRED_MARKETS = (_a.sent()).REQUIRED_MARKETS;
                    _i = 0, REQUIRED_MARKETS_1 = REQUIRED_MARKETS;
                    _a.label = 2;
                case 2:
                    if (!(_i < REQUIRED_MARKETS_1.length)) return [3 /*break*/, 6];
                    market = REQUIRED_MARKETS_1[_i];
                    symbol = market.symbol;
                    // Skip if we're receiving real price data
                    if (!needsSyntheticData(symbol)) {
                        return [3 /*break*/, 5];
                    }
                    basePrice = (0, market_service_1.getCachedPrice)(symbol) || lastKnownPrices.get(symbol);
                    if (!basePrice)
                        return [3 /*break*/, 5];
                    return [4 /*yield*/, candle_model_1.Candle.findOne({
                            marketSymbol: symbol,
                            interval: "1m",
                        }).sort({ timestamp: -1 })];
                case 3:
                    lastCandle = _a.sent();
                    previousClose = (lastCandle === null || lastCandle === void 0 ? void 0 : lastCandle.close) || basePrice;
                    synthetic = generateSyntheticOHLC(basePrice, previousClose);
                    // Update candles with synthetic price (mark as not real)
                    return [4 /*yield*/, updateCandle(symbol, synthetic.close, 0, false, false)];
                case 4:
                    // Update candles with synthetic price (mark as not real)
                    _a.sent();
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 2];
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * Get candles for a market
 */
function getCandles(marketSymbol_1, interval_1) {
    return __awaiter(this, arguments, void 0, function (marketSymbol, interval, limit, endTime) {
        var now, maxTime, query;
        if (limit === void 0) { limit = 100; }
        return __generator(this, function (_a) {
            now = new Date();
            maxTime = endTime && endTime < now ? endTime : now;
            query = {
                marketSymbol: marketSymbol.toUpperCase(),
                interval: interval,
                timestamp: { $lte: maxTime },
            };
            return [2 /*return*/, candle_model_1.Candle.find(query)
                    .sort({ timestamp: -1 })
                    .limit(limit)
                    .then(function (candles) { return candles.reverse(); })]; // Return in chronological order
        });
    });
}
/**
 * Get current (live) candle
 */
function getCurrentCandle(marketSymbol, interval) {
    var symbolCandles = currentCandles.get(marketSymbol.toUpperCase());
    if (!symbolCandles)
        return null;
    return symbolCandles.get(interval) || null;
}
/**
 * Check if we have enough candles for charting
 */
function hasEnoughCandles(marketSymbol_1, interval_1) {
    return __awaiter(this, arguments, void 0, function (marketSymbol, interval, required) {
        var count;
        if (required === void 0) { required = 50; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, candle_model_1.Candle.countDocuments({
                        marketSymbol: marketSymbol.toUpperCase(),
                        interval: interval,
                    })];
                case 1:
                    count = _a.sent();
                    return [2 /*return*/, {
                            hasEnough: count >= required,
                            count: count,
                            required: required,
                        }];
            }
        });
    });
}
/**
 * Backfill candles to ensure we have enough history
 * Generates synthetic historical candles if needed
 */
function backfillCandles(marketSymbol_1, interval_1) {
    return __awaiter(this, arguments, void 0, function (marketSymbol, interval, count) {
        var symbol, basePrice, oldestCandle, intervalMs, now, startTime, candles, currentPrice, currentTime, targetCount, i, exists, ohlc;
        if (count === void 0) { count = 100; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    symbol = marketSymbol.toUpperCase();
                    basePrice = (0, market_service_1.getCachedPrice)(symbol) || lastKnownPrices.get(symbol);
                    if (!basePrice) {
                        console.warn("No base price available for ".concat(symbol, ", cannot backfill"));
                        return [2 /*return*/, 0];
                    }
                    return [4 /*yield*/, candle_model_1.Candle.findOne({
                            marketSymbol: symbol,
                            interval: interval,
                        }).sort({ timestamp: 1 })];
                case 1:
                    oldestCandle = _a.sent();
                    intervalMs = candle_model_1.INTERVAL_MS[interval];
                    now = new Date();
                    if (oldestCandle) {
                        startTime = new Date(oldestCandle.timestamp.getTime() - intervalMs);
                    }
                    else {
                        // No candles exist, start from (count * interval) ago
                        startTime = new Date(now.getTime() - count * intervalMs);
                    }
                    candles = [];
                    currentPrice = basePrice;
                    currentTime = (0, candle_model_1.getCandleStart)(startTime, interval);
                    targetCount = oldestCandle ? count : count;
                    i = 0;
                    _a.label = 2;
                case 2:
                    if (!(i < targetCount)) return [3 /*break*/, 5];
                    return [4 /*yield*/, candle_model_1.Candle.findOne({
                            marketSymbol: symbol,
                            interval: interval,
                            timestamp: currentTime,
                        })];
                case 3:
                    exists = _a.sent();
                    if (!exists) {
                        ohlc = generateSyntheticOHLC(basePrice, currentPrice);
                        currentPrice = ohlc.close;
                        candles.push({
                            marketSymbol: symbol,
                            interval: interval,
                            timestamp: new Date(currentTime),
                            open: ohlc.open,
                            high: ohlc.high,
                            low: ohlc.low,
                            close: ohlc.close,
                            volume: 0,
                            quoteVolume: 0,
                            trades: 0,
                            isClosed: true,
                            isMarketOpen: true, // Perpetuals DEX is always open
                        });
                    }
                    // Move to previous period
                    currentTime = new Date(currentTime.getTime() - intervalMs);
                    _a.label = 4;
                case 4:
                    i++;
                    return [3 /*break*/, 2];
                case 5:
                    if (!(candles.length > 0)) return [3 /*break*/, 7];
                    return [4 /*yield*/, candle_model_1.Candle.insertMany(candles.reverse(), { ordered: false }).catch(function () {
                            // Ignore duplicate key errors
                        })];
                case 6:
                    _a.sent();
                    _a.label = 7;
                case 7:
                    console.log("\uD83D\uDCCA Backfilled ".concat(candles.length, " ").concat(interval, " candles for ").concat(symbol));
                    return [2 /*return*/, candles.length];
            }
        });
    });
}
// Candle generation interval
var candleGeneratorInterval = null;
// Gap fill interval
var gapFillInterval = null;
/**
 * Find missing candles (gaps) in the data for a market and interval
 * Returns an array of timestamps that should have candles but don't
 */
function findMissingCandles(marketSymbol, interval, startTime, endTime) {
    return __awaiter(this, void 0, void 0, function () {
        var symbol, intervalMs, now, defaultLookback, effectiveStart, effectiveEnd, existingCandles, existingTimestamps, missingTimestamps, currentTime, endTimeMs;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    symbol = marketSymbol.toUpperCase();
                    intervalMs = candle_model_1.INTERVAL_MS[interval];
                    now = new Date();
                    defaultLookback = {
                        "1m": 24 * 60 * 60 * 1000, // 24 hours
                        "5m": 3 * 24 * 60 * 60 * 1000, // 3 days
                        "15m": 7 * 24 * 60 * 60 * 1000, // 7 days
                        "1h": 14 * 24 * 60 * 60 * 1000, // 14 days
                        "4h": 30 * 24 * 60 * 60 * 1000, // 30 days
                        "1d": 90 * 24 * 60 * 60 * 1000, // 90 days
                    };
                    effectiveStart = startTime || new Date(now.getTime() - defaultLookback[interval]);
                    effectiveEnd = endTime || now;
                    return [4 /*yield*/, candle_model_1.Candle.find({
                            marketSymbol: symbol,
                            interval: interval,
                            timestamp: {
                                $gte: effectiveStart,
                                $lte: effectiveEnd,
                            },
                        }).select("timestamp").sort({ timestamp: 1 })];
                case 1:
                    existingCandles = _a.sent();
                    existingTimestamps = new Set(existingCandles.map(function (c) { return c.timestamp.getTime(); }));
                    missingTimestamps = [];
                    currentTime = (0, candle_model_1.getCandleStart)(effectiveStart, interval).getTime();
                    endTimeMs = (0, candle_model_1.getCandleStart)(effectiveEnd, interval).getTime();
                    while (currentTime <= endTimeMs) {
                        if (!existingTimestamps.has(currentTime)) {
                            missingTimestamps.push(new Date(currentTime));
                        }
                        currentTime += intervalMs;
                    }
                    return [2 /*return*/, missingTimestamps];
            }
        });
    });
}
/**
 * Fill missing candles
 * - During market hours: tries to fetch real data from Finnhub
 * - Outside market hours: uses synthetic data with smooth transitions
 */
function fillMissingCandles(marketSymbol, interval, missingTimestamps) {
    return __awaiter(this, void 0, void 0, function () {
        var symbol, intervalMs, timestamps, _a, marketHourTimestamps, offMarketTimestamps, _i, timestamps_1, ts, filledCount, oraclePrice, timestampsToFill, candlesToInsert, gaps, currentGap, i, diff, _b, gaps_1, gap, _c, prevCandle, nextCandle, startPrice, endPrice, trendBias, totalCandles, priceRange, currentPrice, i, timestamp, position, easePosition, targetClose, ohlc, previousCandle, tinyGap, targetDiff, error_4, err;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    symbol = marketSymbol.toUpperCase();
                    intervalMs = candle_model_1.INTERVAL_MS[interval];
                    _a = missingTimestamps;
                    if (_a) return [3 /*break*/, 2];
                    return [4 /*yield*/, findMissingCandles(symbol, interval)];
                case 1:
                    _a = (_d.sent());
                    _d.label = 2;
                case 2:
                    timestamps = _a;
                    if (timestamps.length === 0) {
                        return [2 /*return*/, 0];
                    }
                    // Sort timestamps chronologically
                    timestamps.sort(function (a, b) { return a.getTime() - b.getTime(); });
                    marketHourTimestamps = [];
                    offMarketTimestamps = [];
                    for (_i = 0, timestamps_1 = timestamps; _i < timestamps_1.length; _i++) {
                        ts = timestamps_1[_i];
                        if (isWithinMarketHours(ts)) {
                            marketHourTimestamps.push(ts);
                        }
                        else {
                            offMarketTimestamps.push(ts);
                        }
                    }
                    filledCount = 0;
                    // For market hours gaps - we don't auto-fetch from Finnhub to avoid API spam
                    // Historical data should be fetched on startup or via manual endpoint
                    // All gaps (including market hours) will use synthetic interpolation
                    offMarketTimestamps.push.apply(offMarketTimestamps, marketHourTimestamps);
                    // Sort off-market timestamps again (they might be out of order now)
                    offMarketTimestamps.sort(function (a, b) { return a.getTime() - b.getTime(); });
                    if (offMarketTimestamps.length === 0) {
                        return [2 /*return*/, filledCount];
                    }
                    oraclePrice = (0, market_service_1.getCachedPrice)(symbol) || lastKnownPrices.get(symbol);
                    if (!oraclePrice) {
                        console.warn("No price available for ".concat(symbol, ", cannot fill remaining missing candles"));
                        return [2 /*return*/, filledCount];
                    }
                    timestampsToFill = offMarketTimestamps;
                    candlesToInsert = [];
                    gaps = [];
                    if (timestampsToFill.length === 0) {
                        return [2 /*return*/, filledCount];
                    }
                    currentGap = [timestampsToFill[0]];
                    for (i = 1; i < timestampsToFill.length; i++) {
                        diff = timestampsToFill[i].getTime() - timestampsToFill[i - 1].getTime();
                        if (diff <= intervalMs) {
                            // Consecutive - add to current gap
                            currentGap.push(timestampsToFill[i]);
                        }
                        else {
                            // New gap
                            gaps.push({ start: currentGap[0], timestamps: currentGap });
                            currentGap = [timestampsToFill[i]];
                        }
                    }
                    gaps.push({ start: currentGap[0], timestamps: currentGap });
                    _b = 0, gaps_1 = gaps;
                    _d.label = 3;
                case 3:
                    if (!(_b < gaps_1.length)) return [3 /*break*/, 6];
                    gap = gaps_1[_b];
                    return [4 /*yield*/, Promise.all([
                            candle_model_1.Candle.findOne({
                                marketSymbol: symbol,
                                interval: interval,
                                timestamp: { $lt: gap.start },
                            }).sort({ timestamp: -1 }),
                            candle_model_1.Candle.findOne({
                                marketSymbol: symbol,
                                interval: interval,
                                timestamp: { $gt: gap.timestamps[gap.timestamps.length - 1] },
                            }).sort({ timestamp: 1 }),
                        ])];
                case 4:
                    _c = _d.sent(), prevCandle = _c[0], nextCandle = _c[1];
                    startPrice = (prevCandle === null || prevCandle === void 0 ? void 0 : prevCandle.close) || (nextCandle === null || nextCandle === void 0 ? void 0 : nextCandle.open) || oraclePrice;
                    endPrice = (nextCandle === null || nextCandle === void 0 ? void 0 : nextCandle.open) || (prevCandle === null || prevCandle === void 0 ? void 0 : prevCandle.close) || oraclePrice;
                    trendBias = calculateTrendBias(prevCandle ? { open: prevCandle.open, close: prevCandle.close } : null, nextCandle ? { open: nextCandle.open, close: nextCandle.close } : null, 0.5);
                    totalCandles = gap.timestamps.length;
                    priceRange = endPrice - startPrice;
                    currentPrice = startPrice;
                    for (i = 0; i < gap.timestamps.length; i++) {
                        timestamp = gap.timestamps[i];
                        position = totalCandles > 1 ? i / (totalCandles - 1) : 0.5;
                        easePosition = position < 0.5
                            ? 2 * position * position
                            : 1 - Math.pow(-2 * position + 2, 2) / 2;
                        targetClose = startPrice + priceRange * easePosition;
                        ohlc = generateRealisticOHLC(currentPrice, i === gap.timestamps.length - 1 ? endPrice : targetClose, position, trendBias);
                        // Ensure the candle opens at the previous candle's close (with tiny gap)
                        if (i > 0) {
                            previousCandle = candlesToInsert[candlesToInsert.length - 1];
                            tinyGap = (Math.random() - 0.5) * oraclePrice * 0.0001;
                            ohlc.open = Math.round((previousCandle.close + tinyGap) * 100) / 100;
                            // Adjust high/low if open moved outside them
                            ohlc.high = Math.max(ohlc.high, ohlc.open);
                            ohlc.low = Math.min(ohlc.low, ohlc.open);
                        }
                        // For the last candle in a gap with a next candle, ensure smooth transition
                        if (i === gap.timestamps.length - 1 && nextCandle) {
                            targetDiff = nextCandle.open - ohlc.close;
                            ohlc.close = Math.round((ohlc.close + targetDiff * 0.7) * 100) / 100;
                            // Adjust high/low if close moved outside them
                            ohlc.high = Math.max(ohlc.high, ohlc.close);
                            ohlc.low = Math.min(ohlc.low, ohlc.close);
                        }
                        candlesToInsert.push({
                            marketSymbol: symbol,
                            interval: interval,
                            timestamp: timestamp,
                            open: ohlc.open,
                            high: ohlc.high,
                            low: ohlc.low,
                            close: ohlc.close,
                            volume: 0,
                            quoteVolume: 0,
                            trades: 0,
                            isClosed: true,
                            isMarketOpen: true, // Perpetuals DEX is always open
                        });
                        // Update current price for next candle
                        currentPrice = ohlc.close;
                    }
                    _d.label = 5;
                case 5:
                    _b++;
                    return [3 /*break*/, 3];
                case 6:
                    if (!(candlesToInsert.length > 0)) return [3 /*break*/, 10];
                    _d.label = 7;
                case 7:
                    _d.trys.push([7, 9, , 10]);
                    return [4 /*yield*/, candle_model_1.Candle.insertMany(candlesToInsert, { ordered: false })];
                case 8:
                    _d.sent();
                    return [3 /*break*/, 10];
                case 9:
                    error_4 = _d.sent();
                    err = error_4;
                    if (err.code !== 11000) {
                        throw error_4;
                    }
                    return [3 /*break*/, 10];
                case 10: return [2 /*return*/, filledCount + candlesToInsert.length];
            }
        });
    });
}
/**
 * Check and fill gaps for all intervals of a market
 */
function checkAndFillGaps(marketSymbol) {
    return __awaiter(this, void 0, void 0, function () {
        var intervals, results, _i, intervals_2, interval, missing, filled;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    intervals = ["1m", "5m", "15m", "1h", "4h", "1d"];
                    results = [];
                    _i = 0, intervals_2 = intervals;
                    _a.label = 1;
                case 1:
                    if (!(_i < intervals_2.length)) return [3 /*break*/, 6];
                    interval = intervals_2[_i];
                    return [4 /*yield*/, findMissingCandles(marketSymbol, interval)];
                case 2:
                    missing = _a.sent();
                    filled = 0;
                    if (!(missing.length > 0)) return [3 /*break*/, 4];
                    return [4 /*yield*/, fillMissingCandles(marketSymbol, interval, missing)];
                case 3:
                    filled = _a.sent();
                    _a.label = 4;
                case 4:
                    results.push({ interval: interval, missing: missing.length, filled: filled });
                    _a.label = 5;
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6: return [2 /*return*/, results];
            }
        });
    });
}
/**
 * Scan all markets for gaps and fill them
 */
function scanAndFillAllGaps() {
    return __awaiter(this, void 0, void 0, function () {
        var REQUIRED_MARKETS, _i, REQUIRED_MARKETS_2, market, results, totalMissing, totalFilled, _a, results_1, r;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../models/market.model"); })];
                case 1:
                    REQUIRED_MARKETS = (_b.sent()).REQUIRED_MARKETS;
                    _i = 0, REQUIRED_MARKETS_2 = REQUIRED_MARKETS;
                    _b.label = 2;
                case 2:
                    if (!(_i < REQUIRED_MARKETS_2.length)) return [3 /*break*/, 5];
                    market = REQUIRED_MARKETS_2[_i];
                    return [4 /*yield*/, checkAndFillGaps(market.symbol)];
                case 3:
                    results = _b.sent();
                    totalMissing = results.reduce(function (sum, r) { return sum + r.missing; }, 0);
                    totalFilled = results.reduce(function (sum, r) { return sum + r.filled; }, 0);
                    if (totalFilled > 0) {
                        console.log("\uD83D\uDCCA ".concat(market.symbol, ": Filled ").concat(totalFilled, "/").concat(totalMissing, " missing candles"));
                        for (_a = 0, results_1 = results; _a < results_1.length; _a++) {
                            r = results_1[_a];
                            if (r.filled > 0) {
                                console.log("      ".concat(r.interval, ": ").concat(r.filled, " candles"));
                            }
                        }
                    }
                    _b.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * Start periodic gap detection and filling
 * Runs every 5 minutes to ensure continuous candle coverage
 */
function startGapFiller(intervalMs) {
    if (intervalMs === void 0) { intervalMs = 5 * 60 * 1000; }
    if (gapFillInterval) {
        console.log("⚠️ Gap filler already running");
        return;
    }
    console.log("\uD83D\uDCCA Starting gap filler (checking every ".concat(intervalMs / 1000, "s)"));
    // Run initial scan after a short delay (let other services start)
    setTimeout(function () {
        scanAndFillAllGaps();
    }, 10000);
    // Then run periodically
    gapFillInterval = setInterval(function () {
        scanAndFillAllGaps();
    }, intervalMs);
}
/**
 * Stop the gap filler
 */
function stopGapFiller() {
    if (gapFillInterval) {
        clearInterval(gapFillInterval);
        gapFillInterval = null;
        console.log("📊 Stopped gap filler");
    }
}
/**
 * Get gap statistics for a market
 */
function getGapStats(marketSymbol) {
    return __awaiter(this, void 0, void 0, function () {
        var symbol, intervals, stats, _i, intervals_3, interval, _a, totalCount, missing, oldest, newest, expectedCount, coveragePercent;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    symbol = marketSymbol.toUpperCase();
                    intervals = ["1m", "5m", "15m", "1h", "4h", "1d"];
                    stats = [];
                    _i = 0, intervals_3 = intervals;
                    _b.label = 1;
                case 1:
                    if (!(_i < intervals_3.length)) return [3 /*break*/, 4];
                    interval = intervals_3[_i];
                    return [4 /*yield*/, Promise.all([
                            candle_model_1.Candle.countDocuments({ marketSymbol: symbol, interval: interval }),
                            findMissingCandles(symbol, interval),
                            candle_model_1.Candle.findOne({ marketSymbol: symbol, interval: interval }).sort({ timestamp: 1 }),
                            candle_model_1.Candle.findOne({ marketSymbol: symbol, interval: interval }).sort({ timestamp: -1 }),
                        ])];
                case 2:
                    _a = _b.sent(), totalCount = _a[0], missing = _a[1], oldest = _a[2], newest = _a[3];
                    expectedCount = totalCount + missing.length;
                    coveragePercent = expectedCount > 0
                        ? Math.round((totalCount / expectedCount) * 100 * 100) / 100
                        : 100;
                    stats.push({
                        interval: interval,
                        totalCandles: totalCount,
                        missingCandles: missing.length,
                        coveragePercent: coveragePercent,
                        oldestCandle: (oldest === null || oldest === void 0 ? void 0 : oldest.timestamp) || null,
                        newestCandle: (newest === null || newest === void 0 ? void 0 : newest.timestamp) || null,
                    });
                    _b.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, { symbol: symbol, intervals: stats }];
            }
        });
    });
}
/**
 * Start the candle generator (runs every minute)
 */
function startCandleGenerator() {
    if (candleGeneratorInterval)
        return;
    console.log("📊 Starting candle generator...");
    // Generate immediately
    generateSyntheticCandles();
    // Then every minute
    candleGeneratorInterval = setInterval(function () {
        generateSyntheticCandles();
    }, 60 * 1000);
}
/**
 * Stop the candle generator
 */
function stopCandleGenerator() {
    if (candleGeneratorInterval) {
        clearInterval(candleGeneratorInterval);
        candleGeneratorInterval = null;
        console.log("📊 Stopped candle generator");
    }
}
/**
 * Check if we have sufficient candle data (1 year minimum)
 */
function checkCandleDataSufficiency(marketSymbol) {
    return __awaiter(this, void 0, void 0, function () {
        var symbol, dailyCount, _a, oldest, newest, oldestCandle, newestCandle, coverageDays, hasSufficientData;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    symbol = marketSymbol.toUpperCase();
                    return [4 /*yield*/, candle_model_1.Candle.countDocuments({
                            marketSymbol: symbol,
                            interval: "1d",
                        })];
                case 1:
                    dailyCount = _b.sent();
                    return [4 /*yield*/, Promise.all([
                            candle_model_1.Candle.findOne({ marketSymbol: symbol, interval: "1d" }).sort({ timestamp: 1 }),
                            candle_model_1.Candle.findOne({ marketSymbol: symbol, interval: "1d" }).sort({ timestamp: -1 }),
                        ])];
                case 2:
                    _a = _b.sent(), oldest = _a[0], newest = _a[1];
                    oldestCandle = (oldest === null || oldest === void 0 ? void 0 : oldest.timestamp) || null;
                    newestCandle = (newest === null || newest === void 0 ? void 0 : newest.timestamp) || null;
                    coverageDays = 0;
                    if (oldestCandle && newestCandle) {
                        coverageDays = Math.floor((newestCandle.getTime() - oldestCandle.getTime()) / (24 * 60 * 60 * 1000));
                    }
                    hasSufficientData = dailyCount >= 250 && coverageDays >= 350;
                    return [2 /*return*/, {
                            hasSufficientData: hasSufficientData,
                            dailyCount: dailyCount,
                            oldestCandle: oldestCandle,
                            newestCandle: newestCandle,
                            coverageDays: coverageDays,
                        }];
            }
        });
    });
}
/**
 * Generate intraday volatility profile (U-shaped for market hours)
 * High at open, low midday, high at close
 */
function getIntradayVolatilityMultiplier(minuteInSession, sessionLength) {
    var progress = minuteInSession / sessionLength;
    // U-shaped curve: high at 0 and 1, low at 0.5
    // Use a combination of exponential decay from open and exponential rise to close
    var openingEffect = Math.exp(-progress * 8) * 0.8; // Decay from open
    var closingEffect = Math.exp(-(1 - progress) * 6) * 0.6; // Rise to close
    var midday = 0.4; // Base level
    return midday + openingEffect + closingEffect;
}
/**
 * Generate realistic intraday price path using Ornstein-Uhlenbeck process
 * with trend persistence, volatility clustering, and proper scaling to daily OHLC
 */
function generateIntradayPath(open, close, high, low, numMinutes, isMarketHours) {
    var priceRange = high - low || open * 0.01;
    var avgPrice = (open + close) / 2;
    // Volatility per minute (adjusted for time period)
    var baseVol = isMarketHours
        ? priceRange / Math.sqrt(numMinutes) * 1.2
        : priceRange * 0.05 / Math.sqrt(numMinutes);
    // Trend persistence (momentum)
    var momentum = 0.3;
    var lastReturn = 0;
    // Volatility clustering state
    var currentVol = baseVol;
    var volPersistence = 0.92;
    // Mean reversion strength (pull towards VWAP-like center)
    var meanReversionStrength = isMarketHours ? 0.008 : 0.015;
    // Generate path
    var path = [open];
    var price = open;
    // Pre-calculate target trajectory for smooth OHLC fit
    var openToClose = close - open;
    var targetSlope = openToClose / numMinutes;
    for (var i = 1; i < numMinutes; i++) {
        var progress = i / numMinutes;
        // Intraday volatility profile
        var volMultiplier = isMarketHours ? getIntradayVolatilityMultiplier(i, numMinutes) : 0.3;
        // Update volatility with clustering
        var volShock = Math.abs(normalRandom()) * 0.15;
        currentVol = volPersistence * currentVol + (1 - volPersistence) * baseVol + baseVol * volShock;
        currentVol = Math.max(baseVol * 0.3, Math.min(baseVol * 2.5, currentVol));
        // Random component
        var randomReturn = normalRandom() * currentVol * volMultiplier;
        // Fat tails - occasional larger moves
        var fatTailMultiplier = Math.random() < 0.02 ? (1.5 + Math.random() * 2) : 1;
        // Momentum component
        var momentumReturn = lastReturn * momentum * (isMarketHours ? 1 : 0.5);
        // Calculate target price at this point (for smooth trajectory)
        var targetPrice = open + targetSlope * i;
        // Mean reversion towards target trajectory
        var deviation = price - targetPrice;
        var meanReversionReturn = -deviation * meanReversionStrength;
        // Combine all components
        var totalReturn = randomReturn * fatTailMultiplier + momentumReturn + meanReversionReturn;
        // Update price
        price = price + totalReturn;
        // Keep price within daily bounds (but allow temporary breaches)
        var boundedPrice = Math.max(low * 0.998, Math.min(high * 1.002, price));
        price = boundedPrice;
        path.push(price);
        lastReturn = totalReturn;
    }
    // Smoothly connect to close
    var closeBlendStart = Math.floor(numMinutes * 0.85);
    for (var i = closeBlendStart; i < numMinutes; i++) {
        var blendProgress = (i - closeBlendStart) / (numMinutes - closeBlendStart);
        var eased = blendProgress * blendProgress * (3 - 2 * blendProgress); // Smooth step
        path[i] = path[i] * (1 - eased) + close * eased;
    }
    // Ensure exact open and close
    path[0] = open;
    path[numMinutes - 1] = close;
    // Now scale path to hit high and low at natural points
    // Find current min/max
    var pathMin = path[0], pathMax = path[0];
    var minIdx = 0, maxIdx = 0;
    for (var i = 1; i < path.length; i++) {
        if (path[i] < pathMin) {
            pathMin = path[i];
            minIdx = i;
        }
        if (path[i] > pathMax) {
            pathMax = path[i];
            maxIdx = i;
        }
    }
    // Scale to fit exact high/low while preserving shape
    var pathRange = pathMax - pathMin || 1;
    var targetRange = high - low;
    if (pathRange > 0 && targetRange > 0) {
        var scale = targetRange / pathRange;
        var shift = low - pathMin * scale;
        for (var i = 0; i < path.length; i++) {
            path[i] = path[i] * scale + shift;
        }
    }
    // Ensure exact OHLC
    path[0] = open;
    path[path.length - 1] = close;
    // Re-find min/max after scaling and ensure they match
    var newMin = Infinity, newMax = -Infinity;
    var newMinIdx = 0, newMaxIdx = 0;
    for (var i = 0; i < path.length; i++) {
        if (path[i] < newMin) {
            newMin = path[i];
            newMinIdx = i;
        }
        if (path[i] > newMax) {
            newMax = path[i];
            newMaxIdx = i;
        }
    }
    // Adjust the extreme points to match exact high/low
    path[newMinIdx] = low;
    path[newMaxIdx] = high;
    return path;
}
/**
 * Build 1-minute candles from daily OHLC data
 * Creates synthetic 24-hour data for perpetual futures
 * Uses realistic intraday patterns with proper volatility seasonality
 */
function buildIntradayCandlesFromDaily(marketSymbol, dailyCandle, prevDayClose, nextDayOpen) {
    return __awaiter(this, void 0, void 0, function () {
        var symbol, dayStart, totalMinutes, marketOpenMinute, marketCloseMinute, tradingMinutes, open, high, low, close, priceRange, avgPrice, dayEnd, existingCount, existingCandles, existingTimestamps, preMarketStart, afterHoursEnd, preMarketRange, afterHoursRange, preMarketMinutes, preMarketHigh, preMarketLow, preMarketPath, marketPath, afterHoursMinutes, afterHoursHigh, afterHoursLow, afterHoursPath, fullPath, candlesToInsert, now, localVol, volPersistence, minute, candleTime, isMarketHours, minuteInSession, sessionLength, minuteClose, minuteOpen, shape, bodySize, baseWickSize, volShock, totalWickSpace, upperWick, lowerWick, minWick, maxWick, bodyHigh, bodyLow, candleHigh, candleLow, volume, volProfile, baseVol, error_5, err;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    symbol = marketSymbol.toUpperCase();
                    dayStart = new Date(dailyCandle.timestamp);
                    dayStart.setUTCHours(0, 0, 0, 0);
                    totalMinutes = 1440;
                    marketOpenMinute = 14 * 60 + 30;
                    marketCloseMinute = 21 * 60;
                    tradingMinutes = marketCloseMinute - marketOpenMinute;
                    open = dailyCandle.open, high = dailyCandle.high, low = dailyCandle.low, close = dailyCandle.close;
                    priceRange = high - low || open * 0.01;
                    avgPrice = (high + low) / 2;
                    dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
                    return [4 /*yield*/, candle_model_1.Candle.countDocuments({
                            marketSymbol: symbol,
                            interval: "1m",
                            timestamp: { $gte: dayStart, $lt: dayEnd },
                        })];
                case 1:
                    existingCount = _a.sent();
                    if (existingCount >= 1400) {
                        return [2 /*return*/, 0]; // Already have most candles
                    }
                    return [4 /*yield*/, candle_model_1.Candle.find({
                            marketSymbol: symbol,
                            interval: "1m",
                            timestamp: { $gte: dayStart, $lt: dayEnd },
                        }).select("timestamp")];
                case 2:
                    existingCandles = _a.sent();
                    existingTimestamps = new Set(existingCandles.map(function (c) { return c.timestamp.getTime(); }));
                    preMarketStart = prevDayClose !== null && prevDayClose !== void 0 ? prevDayClose : open;
                    afterHoursEnd = nextDayOpen !== null && nextDayOpen !== void 0 ? nextDayOpen : close;
                    preMarketRange = priceRange * 0.15;
                    afterHoursRange = priceRange * 0.12;
                    preMarketMinutes = marketOpenMinute;
                    preMarketHigh = Math.min(preMarketStart + preMarketRange * 0.6, open + preMarketRange * 0.3);
                    preMarketLow = Math.max(preMarketStart - preMarketRange * 0.4, open - preMarketRange * 0.7);
                    preMarketPath = generateIntradayPath(preMarketStart, open, preMarketHigh, preMarketLow, preMarketMinutes, false // not market hours
                    );
                    marketPath = generateIntradayPath(open, close, high, low, tradingMinutes, true // market hours
                    );
                    afterHoursMinutes = totalMinutes - marketCloseMinute;
                    afterHoursHigh = Math.min(close + afterHoursRange * 0.5, afterHoursEnd + afterHoursRange * 0.3);
                    afterHoursLow = Math.max(close - afterHoursRange * 0.5, afterHoursEnd - afterHoursRange * 0.7);
                    afterHoursPath = generateIntradayPath(close, afterHoursEnd, afterHoursHigh, afterHoursLow, afterHoursMinutes, false // not market hours
                    );
                    fullPath = __spreadArray(__spreadArray(__spreadArray([], preMarketPath, true), marketPath, true), afterHoursPath, true);
                    candlesToInsert = [];
                    now = new Date();
                    localVol = priceRange / Math.sqrt(tradingMinutes);
                    volPersistence = 0.85;
                    for (minute = 0; minute < totalMinutes; minute++) {
                        candleTime = new Date(dayStart.getTime() + minute * 60 * 1000);
                        // Skip future candles
                        if (candleTime > now)
                            continue;
                        if (existingTimestamps.has(candleTime.getTime()))
                            continue;
                        isMarketHours = minute >= marketOpenMinute && minute < marketCloseMinute;
                        minuteInSession = isMarketHours ? minute - marketOpenMinute : minute;
                        sessionLength = isMarketHours ? tradingMinutes : (minute < marketOpenMinute ? preMarketMinutes : afterHoursMinutes);
                        minuteClose = fullPath[minute];
                        minuteOpen = minute === 0 ? preMarketStart : fullPath[minute - 1];
                        shape = generateCandleShape();
                        bodySize = Math.abs(minuteClose - minuteOpen);
                        baseWickSize = isMarketHours
                            ? priceRange * 0.002 * getIntradayVolatilityMultiplier(minuteInSession, sessionLength)
                            : avgPrice * 0.0002;
                        volShock = Math.abs(bodySize / avgPrice);
                        localVol = volPersistence * localVol + (1 - volPersistence) * baseWickSize + baseWickSize * volShock;
                        totalWickSpace = localVol * (1 - shape.bodyRatio) / shape.bodyRatio;
                        upperWick = totalWickSpace * shape.wickBias * (0.5 + exponentialRandom(1.5));
                        lowerWick = totalWickSpace * (1 - shape.wickBias) * (0.5 + exponentialRandom(1.5));
                        minWick = isMarketHours ? 0.005 : 0.002;
                        maxWick = isMarketHours ? priceRange * 0.015 : avgPrice * 0.0008;
                        upperWick = Math.max(minWick, Math.min(maxWick, upperWick));
                        lowerWick = Math.max(minWick, Math.min(maxWick, lowerWick));
                        bodyHigh = Math.max(minuteOpen, minuteClose);
                        bodyLow = Math.min(minuteOpen, minuteClose);
                        candleHigh = bodyHigh + upperWick;
                        candleLow = bodyLow - lowerWick;
                        // Constrain to daily range (with small buffer for realism)
                        candleHigh = Math.min(candleHigh, high * 1.001);
                        candleLow = Math.max(candleLow, low * 0.999);
                        volume = void 0;
                        if (isMarketHours) {
                            volProfile = getIntradayVolatilityMultiplier(minuteInSession, sessionLength);
                            baseVol = (dailyCandle.volume || 1000000) / tradingMinutes;
                            volume = Math.floor(baseVol * volProfile * (0.5 + Math.random() * 1.0));
                        }
                        else {
                            volume = Math.floor(Math.random() * 300 + 50);
                        }
                        candlesToInsert.push({
                            marketSymbol: symbol,
                            interval: "1m",
                            timestamp: candleTime,
                            open: Math.round(minuteOpen * 100) / 100,
                            high: Math.round(candleHigh * 100) / 100,
                            low: Math.round(candleLow * 100) / 100,
                            close: Math.round(minuteClose * 100) / 100,
                            volume: volume,
                            quoteVolume: 0,
                            trades: isMarketHours ? Math.floor(Math.random() * 80) + 15 : Math.floor(Math.random() * 5) + 1,
                            isClosed: true,
                            isMarketOpen: isMarketHours,
                        });
                    }
                    if (!(candlesToInsert.length > 0)) return [3 /*break*/, 6];
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, candle_model_1.Candle.insertMany(candlesToInsert, { ordered: false })];
                case 4:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 5:
                    error_5 = _a.sent();
                    err = error_5;
                    if (err.code !== 11000)
                        throw error_5;
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/, candlesToInsert.length];
            }
        });
    });
}
/**
 * Build off-hours candles between trading days
 * Creates smooth synthetic data for evenings, nights, and weekends
 * Uses realistic patterns with proper volatility clustering
 */
function buildOffHoursCandles(marketSymbol, fromCandle, toCandle) {
    return __awaiter(this, void 0, void 0, function () {
        var symbol, fromDayStart, fromMarketClose, toDayStart, toMarketOpen, totalMinutes, existingCandles, existingTimestamps, startPrice, endPrice, avgPrice, overnightMove, minOvernightRange, overnightRange, offHoursPath, candlesToInsert, localVol, i, candleTime, idx, minuteClose, minuteOpen, shape, bodySize, wickSpace, upperWick, lowerWick, bodyHigh, bodyLow, error_6, err;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    symbol = marketSymbol.toUpperCase();
                    fromDayStart = new Date(fromCandle.timestamp);
                    fromDayStart.setUTCHours(0, 0, 0, 0);
                    fromMarketClose = new Date(fromDayStart);
                    fromMarketClose.setUTCHours(21, 0, 0, 0);
                    toDayStart = new Date(toCandle.timestamp);
                    toDayStart.setUTCHours(0, 0, 0, 0);
                    toMarketOpen = new Date(toDayStart);
                    toMarketOpen.setUTCHours(14, 30, 0, 0);
                    totalMinutes = Math.floor((toMarketOpen.getTime() - fromMarketClose.getTime()) / (60 * 1000));
                    if (totalMinutes <= 0)
                        return [2 /*return*/, 0];
                    return [4 /*yield*/, candle_model_1.Candle.find({
                            marketSymbol: symbol,
                            interval: "1m",
                            timestamp: { $gte: fromMarketClose, $lt: toMarketOpen },
                        }).select("timestamp")];
                case 1:
                    existingCandles = _a.sent();
                    existingTimestamps = new Set(existingCandles.map(function (c) { return c.timestamp.getTime(); }));
                    // If most candles exist, skip
                    if (existingTimestamps.size > totalMinutes * 0.8) {
                        return [2 /*return*/, 0];
                    }
                    startPrice = fromCandle.close;
                    endPrice = toCandle.open;
                    avgPrice = (startPrice + endPrice) / 2;
                    overnightMove = Math.abs(endPrice - startPrice);
                    minOvernightRange = avgPrice * 0.002;
                    overnightRange = Math.max(overnightMove * 1.5, minOvernightRange);
                    offHoursPath = generateIntradayPath(startPrice, endPrice, Math.max(startPrice, endPrice) + overnightRange * 0.3, Math.min(startPrice, endPrice) - overnightRange * 0.3, totalMinutes, false // not market hours
                    );
                    candlesToInsert = [];
                    localVol = avgPrice * 0.0003;
                    for (i = 1; i <= totalMinutes; i++) {
                        candleTime = new Date(fromMarketClose.getTime() + i * 60 * 1000);
                        if (existingTimestamps.has(candleTime.getTime()))
                            continue;
                        if (isWithinMarketHours(candleTime))
                            continue;
                        idx = Math.min(i, totalMinutes - 1);
                        minuteClose = offHoursPath[idx];
                        minuteOpen = i === 1 ? startPrice : offHoursPath[idx - 1];
                        shape = generateCandleShape();
                        bodySize = Math.abs(minuteClose - minuteOpen);
                        // Update local volatility
                        localVol = 0.9 * localVol + 0.1 * bodySize + avgPrice * 0.00005;
                        wickSpace = localVol * (1 - shape.bodyRatio);
                        upperWick = Math.max(avgPrice * 0.00005, wickSpace * shape.wickBias * (0.5 + exponentialRandom(1)));
                        lowerWick = Math.max(avgPrice * 0.00005, wickSpace * (1 - shape.wickBias) * (0.5 + exponentialRandom(1)));
                        bodyHigh = Math.max(minuteOpen, minuteClose);
                        bodyLow = Math.min(minuteOpen, minuteClose);
                        candlesToInsert.push({
                            marketSymbol: symbol,
                            interval: "1m",
                            timestamp: candleTime,
                            open: Math.round(minuteOpen * 100) / 100,
                            high: Math.round((bodyHigh + upperWick) * 100) / 100,
                            low: Math.round((bodyLow - lowerWick) * 100) / 100,
                            close: Math.round(minuteClose * 100) / 100,
                            volume: Math.floor(Math.random() * 200 + 50),
                            quoteVolume: 0,
                            trades: Math.floor(Math.random() * 3) + 1,
                            isClosed: true,
                            isMarketOpen: false,
                        });
                    }
                    if (!(candlesToInsert.length > 0)) return [3 /*break*/, 5];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, candle_model_1.Candle.insertMany(candlesToInsert, { ordered: false })];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    error_6 = _a.sent();
                    err = error_6;
                    if (err.code !== 11000)
                        throw error_6;
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/, candlesToInsert.length];
            }
        });
    });
}
/**
 * Aggregate 1-minute candles into larger intervals
 */
function aggregateCandlesToInterval(marketSymbol, targetInterval) {
    return __awaiter(this, void 0, void 0, function () {
        var symbol, existingCandles, existingTimestamps, minuteCandles, aggregatedCandles, _i, minuteCandles_1, candle, periodStart, key, existing, candlesToInsert, error_7, err;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    symbol = marketSymbol.toUpperCase();
                    return [4 /*yield*/, candle_model_1.Candle.find({
                            marketSymbol: symbol,
                            interval: targetInterval,
                        }).select("timestamp")];
                case 1:
                    existingCandles = _a.sent();
                    existingTimestamps = new Set(existingCandles.map(function (c) { return c.timestamp.getTime(); }));
                    return [4 /*yield*/, candle_model_1.Candle.find({
                            marketSymbol: symbol,
                            interval: "1m",
                        }).sort({ timestamp: 1 })];
                case 2:
                    minuteCandles = _a.sent();
                    if (minuteCandles.length === 0)
                        return [2 /*return*/, 0];
                    aggregatedCandles = new Map();
                    for (_i = 0, minuteCandles_1 = minuteCandles; _i < minuteCandles_1.length; _i++) {
                        candle = minuteCandles_1[_i];
                        periodStart = (0, candle_model_1.getCandleStart)(candle.timestamp, targetInterval);
                        key = periodStart.getTime();
                        // Skip if already exists in DB
                        if (existingTimestamps.has(key))
                            continue;
                        existing = aggregatedCandles.get(key);
                        if (existing) {
                            existing.high = Math.max(existing.high, candle.high);
                            existing.low = Math.min(existing.low, candle.low);
                            existing.close = candle.close;
                            existing.volume += candle.volume;
                            existing.trades += candle.trades;
                            if (candle.isMarketOpen)
                                existing.isMarketOpen = true;
                        }
                        else {
                            aggregatedCandles.set(key, {
                                open: candle.open,
                                high: candle.high,
                                low: candle.low,
                                close: candle.close,
                                volume: candle.volume,
                                trades: candle.trades,
                                timestamp: periodStart,
                                isMarketOpen: candle.isMarketOpen,
                            });
                        }
                    }
                    candlesToInsert = Array.from(aggregatedCandles.values()).map(function (agg) { return ({
                        marketSymbol: symbol,
                        interval: targetInterval,
                        timestamp: agg.timestamp,
                        open: agg.open,
                        high: agg.high,
                        low: agg.low,
                        close: agg.close,
                        volume: agg.volume,
                        quoteVolume: 0,
                        trades: agg.trades,
                        isClosed: true,
                        isMarketOpen: agg.isMarketOpen,
                    }); });
                    if (!(candlesToInsert.length > 0)) return [3 /*break*/, 6];
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, candle_model_1.Candle.insertMany(candlesToInsert, { ordered: false })];
                case 4:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 5:
                    error_7 = _a.sent();
                    err = error_7;
                    if (err.code !== 11000)
                        throw error_7;
                    return [3 /*break*/, 6];
                case 6: return [2 /*return*/, candlesToInsert.length];
            }
        });
    });
}
/**
 * Initialize candles for all required markets
 * Ensures 1 year of candle data exists before starting
 */
function initializeCandles() {
    return __awaiter(this, void 0, void 0, function () {
        var REQUIRED_MARKETS, _i, REQUIRED_MARKETS_3, market, symbol, finnhubSymbol, sufficiency, fetchedFromFinnhub, fetched, newSufficiency, getQuote, currentPrice, quote, e_1, finalSufficiency, dailyCandles, totalMinuteCandles, lastDayEndPrice, i, daily, nextDaily, dayEndPrice, built, intervals, _a, intervals_4, interval, aggregated, finalIntervals, _b, finalIntervals_1, interval, count;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("../models/market.model"); })];
                case 1:
                    REQUIRED_MARKETS = (_c.sent()).REQUIRED_MARKETS;
                    console.log("\n" + "=".repeat(60));
                    console.log("📊 CANDLE DATA INITIALIZATION");
                    console.log("=".repeat(60));
                    // Check if Finnhub is configured for real data
                    if ((0, finnhub_service_1.isConfigured)()) {
                        console.log("✅ Finnhub API configured - will fetch real historical data");
                    }
                    else {
                        console.log("⚠️  Finnhub API not configured - using synthetic data only");
                    }
                    _i = 0, REQUIRED_MARKETS_3 = REQUIRED_MARKETS;
                    _c.label = 2;
                case 2:
                    if (!(_i < REQUIRED_MARKETS_3.length)) return [3 /*break*/, 30];
                    market = REQUIRED_MARKETS_3[_i];
                    symbol = market.symbol;
                    finnhubSymbol = market.finnhubSymbol;
                    console.log("\n".concat("─".repeat(50)));
                    console.log("\uD83D\uDCC8 Processing ".concat(symbol, " (").concat(finnhubSymbol, ")"));
                    console.log("".concat("─".repeat(50)));
                    return [4 /*yield*/, checkCandleDataSufficiency(symbol)];
                case 3:
                    sufficiency = _c.sent();
                    console.log("   Current status:");
                    console.log("     Daily candles: ".concat(sufficiency.dailyCount));
                    console.log("     Coverage: ".concat(sufficiency.coverageDays, " days"));
                    console.log("     Sufficient: ".concat(sufficiency.hasSufficientData ? "✅ Yes" : "❌ No"));
                    if (!!sufficiency.hasSufficientData) return [3 /*break*/, 14];
                    fetchedFromFinnhub = false;
                    if (!(0, finnhub_service_1.isConfigured)()) return [3 /*break*/, 5];
                    console.log("\n   \uD83D\uDCE5 Attempting to fetch daily candles from Finnhub...");
                    return [4 /*yield*/, fetchHistoricalCandles(finnhubSymbol, symbol, "1d", 365)];
                case 4:
                    fetched = _c.sent();
                    fetchedFromFinnhub = fetched > 0;
                    _c.label = 5;
                case 5: return [4 /*yield*/, checkCandleDataSufficiency(symbol)];
                case 6:
                    newSufficiency = _c.sent();
                    if (!!newSufficiency.hasSufficientData) return [3 /*break*/, 13];
                    console.log("\n   \u26A0\uFE0F  Still need more daily candles (have ".concat(newSufficiency.dailyCount, ", need 250+)"));
                    return [4 /*yield*/, Promise.resolve().then(function () { return require("./finnhub.service"); })];
                case 7:
                    getQuote = (_c.sent()).getQuote;
                    currentPrice = 100;
                    _c.label = 8;
                case 8:
                    _c.trys.push([8, 10, , 11]);
                    return [4 /*yield*/, getQuote(finnhubSymbol)];
                case 9:
                    quote = _c.sent();
                    if (quote && quote.currentPrice > 0) {
                        currentPrice = quote.currentPrice;
                    }
                    return [3 /*break*/, 11];
                case 10:
                    e_1 = _c.sent();
                    console.log("   Could not get current price from Finnhub, using default");
                    return [3 /*break*/, 11];
                case 11: 
                // Generate synthetic daily candles for the past year
                return [4 /*yield*/, generateSyntheticDailyCandles(symbol, currentPrice, 365)];
                case 12:
                    // Generate synthetic daily candles for the past year
                    _c.sent();
                    return [3 /*break*/, 14];
                case 13:
                    console.log("     Now have ".concat(newSufficiency.dailyCount, " daily candles"));
                    _c.label = 14;
                case 14: return [4 /*yield*/, checkCandleDataSufficiency(symbol)];
                case 15:
                    finalSufficiency = _c.sent();
                    console.log("   \uD83D\uDCCA Daily candle status: ".concat(finalSufficiency.dailyCount, " candles, ").concat(finalSufficiency.coverageDays, " days coverage"));
                    // Step 3: Build 1-minute candles from daily data
                    console.log("\n   \uD83D\uDD28 Building 1-minute candles from daily data...");
                    return [4 /*yield*/, candle_model_1.Candle.find({
                            marketSymbol: symbol,
                            interval: "1d",
                        }).sort({ timestamp: 1 })];
                case 16:
                    dailyCandles = _c.sent();
                    totalMinuteCandles = 0;
                    lastDayEndPrice = undefined;
                    i = 0;
                    _c.label = 17;
                case 17:
                    if (!(i < dailyCandles.length)) return [3 /*break*/, 20];
                    daily = dailyCandles[i];
                    nextDaily = i < dailyCandles.length - 1 ? dailyCandles[i + 1] : undefined;
                    dayEndPrice = void 0;
                    if (nextDaily) {
                        // Interpolate: midnight is ~17% from market close to next market open
                        dayEndPrice = daily.close + (nextDaily.open - daily.close) * 0.17;
                    }
                    else {
                        // Last day - end slightly off from close
                        dayEndPrice = daily.close;
                    }
                    return [4 /*yield*/, buildIntradayCandlesFromDaily(symbol, daily, lastDayEndPrice, dayEndPrice)];
                case 18:
                    built = _c.sent();
                    totalMinuteCandles += built;
                    // Update for next iteration
                    lastDayEndPrice = dayEndPrice;
                    // Progress update every 50 days
                    if ((i + 1) % 50 === 0 || i === dailyCandles.length - 1) {
                        console.log("     Processed ".concat(i + 1, "/").concat(dailyCandles.length, " days..."));
                    }
                    _c.label = 19;
                case 19:
                    i++;
                    return [3 /*break*/, 17];
                case 20:
                    console.log("     Created ".concat(totalMinuteCandles, " 1-minute candles"));
                    // Step 4: Aggregate to larger intervals
                    console.log("\n   \uD83D\uDCCA Aggregating to larger intervals...");
                    intervals = ["5m", "15m", "1h", "4h"];
                    _a = 0, intervals_4 = intervals;
                    _c.label = 21;
                case 21:
                    if (!(_a < intervals_4.length)) return [3 /*break*/, 24];
                    interval = intervals_4[_a];
                    return [4 /*yield*/, aggregateCandlesToInterval(symbol, interval)];
                case 22:
                    aggregated = _c.sent();
                    console.log("     ".concat(interval, ": ").concat(aggregated, " candles created"));
                    _c.label = 23;
                case 23:
                    _a++;
                    return [3 /*break*/, 21];
                case 24:
                    // Step 5: Final count
                    console.log("\n   \uD83D\uDCCB Final candle counts:");
                    finalIntervals = ["1m", "5m", "15m", "1h", "4h", "1d"];
                    _b = 0, finalIntervals_1 = finalIntervals;
                    _c.label = 25;
                case 25:
                    if (!(_b < finalIntervals_1.length)) return [3 /*break*/, 28];
                    interval = finalIntervals_1[_b];
                    return [4 /*yield*/, candle_model_1.Candle.countDocuments({
                            marketSymbol: symbol,
                            interval: interval,
                        })];
                case 26:
                    count = _c.sent();
                    console.log("     ".concat(interval, ": ").concat(count, " candles"));
                    _c.label = 27;
                case 27:
                    _b++;
                    return [3 /*break*/, 25];
                case 28:
                    historicalDataFetched.set(symbol, true);
                    _c.label = 29;
                case 29:
                    _i++;
                    return [3 /*break*/, 2];
                case 30:
                    // Start the candle generator (creates new candles every minute)
                    startCandleGenerator();
                    // Start the gap filler (checks for and fills gaps every 5 minutes)  
                    startGapFiller(5 * 60 * 1000);
                    console.log("\n".concat("=".repeat(60)));
                    console.log("📊 CANDLE INITIALIZATION COMPLETE");
                    console.log("".concat("=".repeat(60), "\n"));
                    return [2 /*return*/];
            }
        });
    });
}
