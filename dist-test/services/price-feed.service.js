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
exports.startPricePolling = startPricePolling;
exports.stopPricePolling = stopPricePolling;
exports.getLastPrice = getLastPrice;
exports.getAllLastPrices = getAllLastPrices;
exports.getPollingSymbols = getPollingSymbols;
exports.managePricePolling = managePricePolling;
exports.startPriceFeedManager = startPriceFeedManager;
exports.stopPriceFeedManager = stopPriceFeedManager;
var finnhub_service_1 = require("./finnhub.service");
var websocket_service_1 = require("./websocket.service");
// Store last known prices
var lastPrices = new Map();
// Active polling intervals
var pollingIntervals = new Map();
// Default polling interval (in ms) - longer to avoid API spam
// Note: Required markets (AAPL, GOOGL, MSFT) are already polled by market.service.ts
var POLLING_INTERVAL = 30000; // 30 seconds
// Markets that are already being polled by market.service.ts
var REQUIRED_MARKET_SYMBOLS = ["AAPL-PERP", "GOOGL-PERP", "MSFT-PERP"];
/**
 * Start polling prices for a symbol
 * Note: Required markets (AAPL-PERP, etc.) are already polled by market.service.ts
 */
function startPricePolling(symbol, intervalMs) {
    if (intervalMs === void 0) { intervalMs = POLLING_INTERVAL; }
    var upperSymbol = symbol.toUpperCase();
    // Skip if this is a required market - already being polled by market.service.ts
    if (REQUIRED_MARKET_SYMBOLS.includes(upperSymbol)) {
        console.log("\uD83D\uDCC8 ".concat(upperSymbol, " already polled by market service, skipping"));
        return;
    }
    // Already polling this symbol
    if (pollingIntervals.has(upperSymbol)) {
        return;
    }
    console.log("\uD83D\uDCC8 Starting price polling for ".concat(upperSymbol));
    // Fetch immediately
    fetchAndBroadcastPrice(upperSymbol);
    // Set up interval
    var interval = setInterval(function () {
        // Check if anyone is still subscribed
        var subscriberCount = (0, websocket_service_1.getSubscriptionCount)("price:".concat(upperSymbol));
        if (subscriberCount === 0) {
            stopPricePolling(upperSymbol);
            return;
        }
        fetchAndBroadcastPrice(upperSymbol);
    }, intervalMs);
    pollingIntervals.set(upperSymbol, interval);
}
/**
 * Stop polling prices for a symbol
 */
function stopPricePolling(symbol) {
    var upperSymbol = symbol.toUpperCase();
    var interval = pollingIntervals.get(upperSymbol);
    if (interval) {
        clearInterval(interval);
        pollingIntervals.delete(upperSymbol);
        console.log("\uD83D\uDCC9 Stopped price polling for ".concat(upperSymbol));
    }
}
/**
 * Fetch price from Finnhub and broadcast to subscribers
 */
function fetchAndBroadcastPrice(symbol) {
    return __awaiter(this, void 0, void 0, function () {
        var quote, priceUpdate, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, (0, finnhub_service_1.getQuote)(symbol)];
                case 1:
                    quote = _a.sent();
                    priceUpdate = {
                        symbol: quote.symbol,
                        price: quote.currentPrice,
                        change: quote.change,
                        changePercent: quote.percentChange,
                        high: quote.highPrice,
                        low: quote.lowPrice,
                        timestamp: quote.timestamp * 1000, // Convert to ms
                    };
                    // Store last price
                    lastPrices.set(symbol, priceUpdate);
                    // Broadcast to subscribers
                    (0, websocket_service_1.broadcastPriceUpdate)(symbol, priceUpdate);
                    return [3 /*break*/, 3];
                case 2:
                    error_1 = _a.sent();
                    console.error("Failed to fetch price for ".concat(symbol, ":"), error_1);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Get last known price for a symbol
 */
function getLastPrice(symbol) {
    return lastPrices.get(symbol.toUpperCase());
}
/**
 * Get all last known prices
 */
function getAllLastPrices() {
    return new Map(lastPrices);
}
/**
 * Check which symbols are being polled
 */
function getPollingSymbols() {
    return Array.from(pollingIntervals.keys());
}
/**
 * Auto-manage polling based on subscriptions
 * Call this periodically to start/stop polling as needed
 */
function managePricePolling() {
    var activeChannels = (0, websocket_service_1.getActiveChannels)();
    var priceChannels = activeChannels.filter(function (c) { return c.startsWith("price:"); });
    // Start polling for new subscriptions
    priceChannels.forEach(function (channel) {
        var symbol = channel.replace("price:", "");
        if (!pollingIntervals.has(symbol)) {
            startPricePolling(symbol);
        }
    });
    // Stop polling for symbols with no subscribers
    pollingIntervals.forEach(function (_, symbol) {
        var subscriberCount = (0, websocket_service_1.getSubscriptionCount)("price:".concat(symbol));
        if (subscriberCount === 0) {
            stopPricePolling(symbol);
        }
    });
}
/**
 * Start the price feed manager (checks subscriptions periodically)
 */
var managerInterval = null;
function startPriceFeedManager(checkIntervalMs) {
    if (checkIntervalMs === void 0) { checkIntervalMs = 10000; }
    if (managerInterval)
        return;
    managerInterval = setInterval(managePricePolling, checkIntervalMs);
    console.log("📊 Price feed manager started");
}
function stopPriceFeedManager() {
    if (managerInterval) {
        clearInterval(managerInterval);
        managerInterval = null;
    }
    // Stop all polling
    pollingIntervals.forEach(function (interval) { return clearInterval(interval); });
    pollingIntervals.clear();
    console.log("📊 Price feed manager stopped");
}
