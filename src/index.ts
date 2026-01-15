import express from "express";
import { createServer } from "http";
import cors from "cors";
import { config } from "./config/env";
import { connectDatabase } from "./config/database";
import authRoutes from "./routes/auth.routes";
import faucetRoutes from "./routes/faucet.routes";
import finnhubRoutes from "./routes/finnhub.routes";
import { initializeWebSocket, getActiveChannels } from "./services/websocket.service";
import { startPriceFeedManager, getPollingSymbols } from "./services/price-feed.service";

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
    GET  /finnhub/profile/:symbol      - Get company profile
    GET  /finnhub/financials/:symbol   - Get basic financials
    GET  /finnhub/news/market          - Get market news
    GET  /finnhub/news/company/:symbol - Get company news
    GET  /finnhub/search?q=...         - Search symbols
    GET  /finnhub/earnings             - Get earnings calendar
  
  WebSocket Events:
    subscribe:price <symbol>     - Subscribe to price updates
    subscribe:orderbook <symbol> - Subscribe to order book
    subscribe:trades <symbol>    - Subscribe to trade feed
  
  Health:
    GET  /health           - Health check + WebSocket stats
    `);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
