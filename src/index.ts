import express from "express";
import { createServer } from "http";
import cors from "cors";
import { config } from "./config/env";
import { connectDatabase } from "./config/database";
import authRoutes from "./routes/auth.routes";
import faucetRoutes from "./routes/faucet.routes";
import clobRoutes from "./routes/clob.routes";
import achievementRoutes from "./routes/achievement.routes";
import referralRoutes from "./routes/referral.routes";
import { initializeWebSocket, getActiveChannels } from "./services/websocket.service";
import { initializeMarkets } from "./services/market.service";
import { initializeCandles, getMarketStatus } from "./services/candle.service";
import { initializeOrderBooks } from "./services/orderbook.service";
import { initializeAchievements } from "./services/achievement.service";
import { startLiquidationEngine } from "./services/liquidation.service";
import { startFundingEngine, getFundingStats } from "./services/funding.service";
import { 
  initLightMarketMaker, 
  startLightMarketMaker, 
  getLiquidityStats,
  isMarketMakerRunning 
} from "./services/light-market-maker.service";
import { startAllSteamPricePolling, getConfiguredItems, getAllCachedPrices } from "./services/steam-oracle.service";

const app = express();
const httpServer = createServer(app);

// Initialize WebSocket
const io = initializeWebSocket(httpServer);

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", async (_req, res) => {
  const fundingStats = getFundingStats();
  const liquidityStats = await getLiquidityStats();
  const steamPrices = getAllCachedPrices();
  const csgoItems = getConfiguredItems();
  
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    market: getMarketStatus(),
    websocket: {
      activeChannels: getActiveChannels(),
    },
    steamOracle: {
      configuredItems: csgoItems.length,
      cachedPrices: steamPrices.size,
      items: csgoItems.map(item => item.symbol),
    },
    funding: {
      isRunning: fundingStats.isRunning,
      totalProcessed: fundingStats.totalFundingProcessed,
      lastFundingAt: fundingStats.lastFundingAt?.toISOString() || null,
    },
    marketMaker: {
      isRunning: liquidityStats.isRunning,
      markets: liquidityStats.markets.length,
    },
  });
});

// Routes
app.use("/auth", authRoutes);
app.use("/faucet", faucetRoutes);
app.use("/clob", clobRoutes);
app.use("/achievements", achievementRoutes);
app.use("/referrals", referralRoutes);

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
  
  // Initialize achievements
  await initializeAchievements();
  
  // Initialize CS:GO perpetual markets
  await initializeMarkets();
  
  // Start Steam price polling for CS:GO items (60s interval to respect rate limits)
  await startAllSteamPricePolling(60000);
  
  // Initialize candle data and start 1-min candle generator
  await initializeCandles();
  
  // Initialize orderbooks with real user orders (no synthetic liquidity)
  await initializeOrderBooks();
  
  // Start liquidation engine (checks every second)
  startLiquidationEngine(1000);
  
  // Start funding rate engine (checks every minute for due funding)
  startFundingEngine(60000);
  
  // Initialize and start the light market maker (after a delay to ensure prices are loaded)
  initLightMarketMaker({
    numAccounts: 500,          // 500 synthetic accounts
    spreadBps: 10,             // 0.1% spread (tight)
    numLevels: 50,             // 50 price levels per side
    levelSpacingBps: 3,        // 0.03% between levels
    baseOrderSize: 0.5,        // 0.5 units base size
    sizeMultiplier: 1.05,      // 5% more at each deeper level
    sizeVariance: 0.3,         // 30% random variance
    ordersPerLevel: 3,         // 3 orders per price level
    refreshIntervalMs: 1000,   // Refresh every 1 second
    enableTradeGeneration: true,
    tradeIntervalMs: 2000,     // Generate trades every 2 seconds
    minTradesPerInterval: 1,
    maxTradesPerInterval: 5,
    minTradeSize: 0.1,
    maxTradeSize: 2.0,
  });
  
  // Start market maker after a short delay to ensure prices are loaded
  setTimeout(async () => {
    await startLightMarketMaker();
  }, 5000);
  
  const csgoItems = getConfiguredItems();
  httpServer.listen(config.port, () => {
    console.log(`🎮 CS:GO Perps DEX running on http://localhost:${config.port}`);
    console.log(`📡 WebSocket server running on ws://localhost:${config.port}`);
    console.log(`📦 Trading ${csgoItems.length} CS:GO items: ${csgoItems.map(i => i.symbol).join(", ")}`);
    console.log(`
Available endpoints:
  Auth:
    GET  /auth/nonce       - Get nonce and SIWE message (requires ?address=0x...)
    POST /auth/verify      - Verify signature and get JWT token
    GET  /auth/me          - Get current user info (requires Bearer token)
  
  Faucet:
    GET  /faucet/balance         - Get user balance
    GET  /faucet/balance/history - Get balance change history
    POST /faucet/request         - Request tokens (once per 24h, body: { referralCode? })
    GET  /faucet/stats           - Get user faucet stats
    GET  /faucet/history         - Get faucet request history
    POST /faucet/lock            - Lock free balance
    POST /faucet/unlock          - Unlock locked balance
    GET  /faucet/global-stats    - Get global faucet stats (public)
  
  Achievements:
    GET  /achievements              - Get all achievements (public)
    GET  /achievements/category/:cat- Get achievements by category
    GET  /achievements/me           - Get user's achievements with progress
    GET  /achievements/me/grouped   - Get achievements grouped by progression
    GET  /achievements/me/stats     - Get user's achievement stats
    GET  /achievements/me/points    - Get user's total points
    GET  /achievements/leaderboard  - Get achievement leaderboard (public)
    GET  /achievements/user/:addr   - Get user's public achievement profile
  
  Referrals:
    GET  /referrals/code            - Get user's referral code (auth required)
    GET  /referrals/validate/:code  - Validate a referral code (public)
    POST /referrals/apply           - Apply referral code (auth required)
    GET  /referrals/stats           - Get user's referral stats (auth required)
    GET  /referrals/list            - Get list of referrals (auth required)
    GET  /referrals/referred-by     - Check who referred you (auth required)
    GET  /referrals/leaderboard     - Get referral leaderboard (public)
    GET  /referrals/global-stats    - Get global referral stats (public)
  
  Steam Oracle (CS:GO Prices):
    Prices are fetched automatically from Steam Community Market
    Add new items in src/config/csgo-markets.config.ts
  
  CLOB (Perpetuals Trading):
    GET  /clob/markets              - Get all active CS:GO markets
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
    GET  /clob/market-status         - Get market status
    GET  /clob/candles/:symbol       - Get candle data (?interval=1m&limit=100)
    GET  /clob/candles/:symbol/status - Check if enough candle data exists
  
  Funding Rate:
    GET  /clob/funding/:symbol       - Get funding rate info for market
    GET  /clob/funding/:symbol/history - Get funding payment history
    GET  /clob/funding/:symbol/estimate - Estimate funding for position (?side=long&size=1)
    GET  /clob/funding-stats         - Get global funding statistics
  
  Market Maker (Admin):
    GET  /clob/market-maker/stats    - Get market maker stats & liquidity
    POST /clob/market-maker/start    - Start the market maker
    POST /clob/market-maker/stop     - Stop the market maker
    POST /clob/market-maker/refresh  - Force refresh liquidity (body: { market? })
    GET  /clob/market-maker/config   - Get market maker config
    PUT  /clob/market-maker/config   - Update market maker config
  
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
