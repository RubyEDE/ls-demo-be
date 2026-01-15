import express from "express";
import { createServer } from "http";
import cors from "cors";
import { config } from "./config/env";
import { connectDatabase } from "./config/database";
import authRoutes from "./routes/auth.routes";
import faucetRoutes from "./routes/faucet.routes";
import finnhubRoutes from "./routes/finnhub.routes";
import clobRoutes from "./routes/clob.routes";
import { initializeWebSocket, getActiveChannels } from "./services/websocket.service";
import { startPriceFeedManager, getPollingSymbols } from "./services/price-feed.service";
import { initializeMarkets, startRequiredPriceUpdates } from "./services/market.service";
import { startRequiredMarketMakers } from "./services/marketmaker.service";
import { initializeCandles, getMarketStatus } from "./services/candle.service";

const app = express();
const httpServer = createServer(app);

// Initialize WebSocket
const io = initializeWebSocket(httpServer);

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    market: getMarketStatus(),
    websocket: {
      activeChannels: getActiveChannels(),
      pollingSymbols: getPollingSymbols(),
    },
  });
});

// Routes
app.use("/auth", authRoutes);
app.use("/faucet", faucetRoutes);
app.use("/finnhub", finnhubRoutes);
app.use("/clob", clobRoutes);

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
  });
});

// Connect to database and start server
async function start() {
  await connectDatabase();
  
  // Initialize perpetual markets
  await initializeMarkets();
  
  // Start price updates for required markets (AAPL, GOOGL, MSFT)
  await startRequiredPriceUpdates(10000); // Update every 15 seconds
  
  // Start market makers for required markets (AAPL, GOOGL, MSFT)
  // Uses retry logic to wait for price data
  setTimeout(async () => {
    await startRequiredMarketMakers(500); // Update liquidity every 500ms
  }, 3000);
  
  // Initialize candle data (backfill if needed, start generator)
  setTimeout(async () => {
    await initializeCandles();
  }, 5000);
  
  // Start price feed manager for auto-polling
  startPriceFeedManager();
  
  httpServer.listen(config.port, () => {
    console.log(`🚀 EVM Auth Server running on http://localhost:${config.port}`);
    console.log(`📡 WebSocket server running on ws://localhost:${config.port}`);
    console.log(`
Available endpoints:
  Auth:
    GET  /auth/nonce       - Get nonce and SIWE message (requires ?address=0x...)
    POST /auth/verify      - Verify signature and get JWT token
    GET  /auth/me          - Get current user info (requires Bearer token)
  
  Faucet:
    GET  /faucet/balance         - Get user balance
    GET  /faucet/balance/history - Get balance change history
    POST /faucet/request         - Request tokens (once per 24h)
    GET  /faucet/stats           - Get user faucet stats
    GET  /faucet/history         - Get faucet request history
    POST /faucet/lock            - Lock free balance
    POST /faucet/unlock          - Unlock locked balance
    GET  /faucet/global-stats    - Get global faucet stats (public)
  
  Finnhub (Market Data):
    GET  /finnhub/quote/:symbol        - Get stock quote
    GET  /finnhub/quotes?symbols=...   - Get multiple quotes
    GET  /finnhub/candles/:symbol      - Get OHLCV candles (?interval=1m&limit=100)
    GET  /finnhub/profile/:symbol      - Get company profile
    GET  /finnhub/financials/:symbol   - Get basic financials
    GET  /finnhub/news/market          - Get market news
    GET  /finnhub/news/company/:symbol - Get company news
    GET  /finnhub/search?q=...         - Search symbols
    GET  /finnhub/earnings             - Get earnings calendar
  
  CLOB (Perpetuals Trading):
    GET  /clob/markets              - Get all active markets
    GET  /clob/markets/:symbol      - Get market details
    GET  /clob/orderbook/:symbol    - Get order book
    GET  /clob/trades/:symbol       - Get recent trades
    POST /clob/orders               - Place order (auth required)
    DELETE /clob/orders/:orderId    - Cancel order (auth required)
    GET  /clob/orders               - Get open orders (auth required)
    GET  /clob/orders/history       - Get order history (auth required)
    GET  /clob/trades/history       - Get trade history (auth required)
  
  Positions:
    GET  /clob/positions            - Get all open positions (auth required)
    GET  /clob/positions/summary    - Get position summary (auth required)
    GET  /clob/positions/:symbol    - Get position for market (auth required)
    POST /clob/positions/:symbol/close - Close position (auth required)
    GET  /clob/positions/history    - Get closed positions (auth required)
  
  Candles (Price Charts):
    GET  /clob/market-status         - Get market open/closed status
    GET  /clob/candles/:symbol       - Get candle data (?interval=1m&limit=100)
    GET  /clob/candles/:symbol/status - Check if enough candle data exists
  
  WebSocket Events:
    subscribe:price <symbol>     - Subscribe to price updates
    subscribe:orderbook <symbol> - Subscribe to order book
    subscribe:trades <symbol>    - Subscribe to trade feed
    subscribe:candles {symbol, interval} - Subscribe to candle updates
  
  Health:
    GET  /health           - Health check + market status
    `);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
