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
var http_1 = require("http");
var cors_1 = require("cors");
var env_1 = require("./config/env");
var database_1 = require("./config/database");
var auth_routes_1 = require("./routes/auth.routes");
var faucet_routes_1 = require("./routes/faucet.routes");
var finnhub_routes_1 = require("./routes/finnhub.routes");
var clob_routes_1 = require("./routes/clob.routes");
var websocket_service_1 = require("./services/websocket.service");
var price_feed_service_1 = require("./services/price-feed.service");
var market_service_1 = require("./services/market.service");
var marketmaker_service_1 = require("./services/marketmaker.service");
var candle_service_1 = require("./services/candle.service");
var liquidation_service_1 = require("./services/liquidation.service");
var finnhub_service_1 = require("./services/finnhub.service");
var app = (0, express_1.default)();
var httpServer = (0, http_1.createServer)(app);
// Initialize WebSocket
var io = (0, websocket_service_1.initializeWebSocket)(httpServer);
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Health check
app.get("/health", function (_req, res) {
    var _a;
    var liquidationStats = (0, liquidation_service_1.getLiquidationStats)();
    var rateLimitStatus = (0, finnhub_service_1.getRateLimitStatus)();
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        market: (0, candle_service_1.getMarketStatus)(),
        websocket: {
            activeChannels: (0, websocket_service_1.getActiveChannels)(),
            pollingSymbols: (0, price_feed_service_1.getPollingSymbols)(),
        },
        liquidation: {
            engineRunning: (0, liquidation_service_1.isLiquidationEngineRunning)(),
            totalLiquidations: liquidationStats.totalLiquidations,
            totalValueLiquidated: liquidationStats.totalValueLiquidated,
            lastLiquidationAt: ((_a = liquidationStats.lastLiquidationAt) === null || _a === void 0 ? void 0 : _a.toISOString()) || null,
        },
        finnhub: {
            callsInLastMinute: rateLimitStatus.callsInLastMinute,
            maxCallsPerMinute: rateLimitStatus.maxCallsPerMinute,
            canMakeCall: rateLimitStatus.canMakeCall,
        },
    });
});
// Routes
app.use("/auth", auth_routes_1.default);
app.use("/faucet", faucet_routes_1.default);
app.use("/finnhub", finnhub_routes_1.default);
app.use("/clob", clob_routes_1.default);
// Error handler
app.use(function (err, _req, res, _next) {
    console.error("Unhandled error:", err);
    res.status(500).json({
        error: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
    });
});
// Connect to database and start server
function start() {
    return __awaiter(this, void 0, void 0, function () {
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, database_1.connectDatabase)()];
                case 1:
                    _a.sent();
                    // Initialize perpetual markets
                    return [4 /*yield*/, (0, market_service_1.initializeMarkets)()];
                case 2:
                    // Initialize perpetual markets
                    _a.sent();
                    // Start price updates for required markets (AAPL, GOOGL, MSFT)
                    // Finnhub free tier: 60 API calls/minute, so use 30s interval (6 calls/min for 3 markets)
                    return [4 /*yield*/, (0, market_service_1.startRequiredPriceUpdates)(30000)];
                case 3:
                    // Start price updates for required markets (AAPL, GOOGL, MSFT)
                    // Finnhub free tier: 60 API calls/minute, so use 30s interval (6 calls/min for 3 markets)
                    _a.sent(); // Update every 30 seconds
                    // Start market makers for required markets (AAPL, GOOGL, MSFT)
                    // Uses retry logic to wait for price data
                    setTimeout(function () { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, (0, marketmaker_service_1.startRequiredMarketMakers)(500)];
                                case 1:
                                    _a.sent(); // Update liquidity every 500ms
                                    return [2 /*return*/];
                            }
                        });
                    }); }, 3000);
                    // Initialize candle data (backfill if needed, start generator)
                    setTimeout(function () { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0: return [4 /*yield*/, (0, candle_service_1.initializeCandles)()];
                                case 1:
                                    _a.sent();
                                    return [2 /*return*/];
                            }
                        });
                    }); }, 5000);
                    // Start liquidation engine (after market makers so prices are available)
                    setTimeout(function () {
                        (0, liquidation_service_1.startLiquidationEngine)(1000); // Check for liquidations every 1 second
                    }, 5000);
                    // Start price feed manager for auto-polling
                    (0, price_feed_service_1.startPriceFeedManager)();
                    httpServer.listen(env_1.config.port, function () {
                        console.log("\uD83D\uDE80 EVM Auth Server running on http://localhost:".concat(env_1.config.port));
                        console.log("\uD83D\uDCE1 WebSocket server running on ws://localhost:".concat(env_1.config.port));
                        console.log("\nAvailable endpoints:\n  Auth:\n    GET  /auth/nonce       - Get nonce and SIWE message (requires ?address=0x...)\n    POST /auth/verify      - Verify signature and get JWT token\n    GET  /auth/me          - Get current user info (requires Bearer token)\n  \n  Faucet:\n    GET  /faucet/balance         - Get user balance\n    GET  /faucet/balance/history - Get balance change history\n    POST /faucet/request         - Request tokens (once per 24h)\n    GET  /faucet/stats           - Get user faucet stats\n    GET  /faucet/history         - Get faucet request history\n    POST /faucet/lock            - Lock free balance\n    POST /faucet/unlock          - Unlock locked balance\n    GET  /faucet/global-stats    - Get global faucet stats (public)\n  \n  Finnhub (Market Data):\n    GET  /finnhub/quote/:symbol        - Get stock quote\n    GET  /finnhub/quotes?symbols=...   - Get multiple quotes\n    GET  /finnhub/candles/:symbol      - Get OHLCV candles (?interval=1m&limit=100)\n    GET  /finnhub/profile/:symbol      - Get company profile\n    GET  /finnhub/financials/:symbol   - Get basic financials\n    GET  /finnhub/news/market          - Get market news\n    GET  /finnhub/news/company/:symbol - Get company news\n    GET  /finnhub/search?q=...         - Search symbols\n    GET  /finnhub/earnings             - Get earnings calendar\n  \n  CLOB (Perpetuals Trading):\n    GET  /clob/markets              - Get all active markets\n    GET  /clob/markets/:symbol      - Get market details\n    GET  /clob/orderbook/:symbol    - Get order book\n    GET  /clob/trades/:symbol       - Get recent trades\n    POST /clob/orders               - Place order (auth required)\n    DELETE /clob/orders/:orderId    - Cancel order (auth required)\n    GET  /clob/orders               - Get open orders (auth required)\n    GET  /clob/orders/history       - Get order history (auth required)\n    GET  /clob/trades/history       - Get trade history (auth required)\n  \n  Positions:\n    GET  /clob/positions            - Get all open positions (auth required)\n    GET  /clob/positions/summary    - Get position summary (auth required)\n    GET  /clob/positions/:symbol    - Get position for market (auth required)\n    POST /clob/positions/:symbol/close - Close position (auth required)\n    GET  /clob/positions/history    - Get closed positions (auth required)\n  \n  Candles (Price Charts):\n    GET  /clob/market-status         - Get market open/closed status\n    GET  /clob/market-hours          - Get US market hours status\n    GET  /clob/candles/:symbol       - Get candle data (?interval=1m&limit=100)\n    GET  /clob/candles/:symbol/status - Check if enough candle data exists\n    GET  /clob/candles/:symbol/gaps  - Get gap statistics for all intervals\n    GET  /clob/candles/:symbol/gaps/:interval - Get missing timestamps\n    POST /clob/candles/:symbol/fill-gaps - Fill missing candles (?interval=1m)\n    POST /clob/candles/:symbol/fetch-historical - Fetch real Finnhub data (?days=365)\n  \n  Liquidation:\n    GET  /clob/liquidation/stats     - Get liquidation engine statistics\n    GET  /clob/liquidation/at-risk   - Get positions at risk (?threshold=5)\n    GET  /clob/positions/:symbol/liquidation-risk - Check position risk (auth)\n  \n  WebSocket Events:\n    subscribe:price <symbol>     - Subscribe to price updates\n    subscribe:orderbook <symbol> - Subscribe to order book\n    subscribe:trades <symbol>    - Subscribe to trade feed\n    subscribe:candles {symbol, interval} - Subscribe to candle updates\n  \n  Health:\n    GET  /health           - Health check + market status\n    ");
                    });
                    return [2 /*return*/];
            }
        });
    });
}
start().catch(function (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
});
