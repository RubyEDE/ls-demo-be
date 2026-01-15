/**
 * CLOB Real-Time Test
 * 
 * A comprehensive test that demonstrates the CLOB system in action:
 * - WebSocket connection and subscriptions
 * - Real-time orderbook updates from market makers
 * - Price feed updates
 * - Placing orders and watching them fill
 * - Trade execution notifications
 * 
 * Run: npm run test:clob-realtime
 * Prerequisites: Server must be running (npm run dev)
 */

import { io as ioClient, Socket } from "socket.io-client";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

const BASE_URL = "http://localhost:3000";
const WS_URL = "ws://localhost:3000";

const MARKETS = ["AAPL-PERP", "GOOGL-PERP", "MSFT-PERP"];

// Interfaces
interface PriceUpdate {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  timestamp: number;
}

interface OrderBookEntry {
  price: number;
  quantity: number;
  total: number;
}

interface OrderBookSnapshot {
  symbol: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  timestamp: number;
}

interface OrderBookUpdate {
  symbol: string;
  side: "bid" | "ask";
  price: number;
  quantity: number;
  timestamp: number;
}

interface TradeEvent {
  id: string;
  symbol: string;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  timestamp: number;
}

interface OrderUpdate {
  orderId: string;
  symbol: string;
  side: "buy" | "sell";
  type: "limit" | "market";
  price: number;
  quantity: number;
  filledQuantity: number;
  status: string;
  timestamp: number;
}

interface BalanceUpdate {
  free: number;
  locked: number;
  total: number;
  timestamp: number;
}

// Test wallet
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(TEST_PRIVATE_KEY);
const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http(),
});

let authToken: string;

// Stats tracking
const stats = {
  priceUpdates: new Map<string, number>(),
  orderbookSnapshots: new Map<string, number>(),
  orderbookUpdates: new Map<string, number>(),
  trades: new Map<string, number>(),
};

function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

function formatQuantity(qty: number): string {
  return qty.toFixed(4);
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

async function authenticate(): Promise<string> {
  const nonceRes = await fetch(`${BASE_URL}/auth/nonce?address=${account.address}&chainId=1`);
  const { message } = await nonceRes.json();
  const signature = await walletClient.signMessage({ message });
  const verifyRes = await fetch(`${BASE_URL}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  const { token } = await verifyRes.json();
  return token;
}

function createSocket(token?: string): Socket {
  return ioClient(WS_URL, {
    auth: token ? { token } : undefined,
    transports: ["websocket"],
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printSeparator(title: string): void {
  console.log("\n" + "=".repeat(60));
  console.log(`  ${title}`);
  console.log("=".repeat(60) + "\n");
}

function printOrderBook(symbol: string, snapshot: OrderBookSnapshot): void {
  console.log(`\n📖 ${symbol} Order Book (${formatTimestamp(snapshot.timestamp)})`);
  console.log("─".repeat(50));
  
  // Show top 5 asks (reversed for display)
  const topAsks = snapshot.asks.slice(0, 5).reverse();
  console.log("  ASKS:");
  for (const ask of topAsks) {
    const bar = "█".repeat(Math.min(20, Math.floor(ask.quantity)));
    console.log(`    ${formatPrice(ask.price).padStart(10)} | ${formatQuantity(ask.quantity).padStart(8)} | ${bar}`);
  }
  
  // Spread
  if (snapshot.bids.length > 0 && snapshot.asks.length > 0) {
    const spread = snapshot.asks[0].price - snapshot.bids[0].price;
    const spreadPct = (spread / snapshot.asks[0].price) * 100;
    console.log(`  ${"─".repeat(46)}`);
    console.log(`  SPREAD: ${formatPrice(spread)} (${spreadPct.toFixed(4)}%)`);
    console.log(`  ${"─".repeat(46)}`);
  }
  
  // Show top 5 bids
  const topBids = snapshot.bids.slice(0, 5);
  console.log("  BIDS:");
  for (const bid of topBids) {
    const bar = "█".repeat(Math.min(20, Math.floor(bid.quantity)));
    console.log(`    ${formatPrice(bid.price).padStart(10)} | ${formatQuantity(bid.quantity).padStart(8)} | ${bar}`);
  }
}

async function runTest(): Promise<void> {
  console.log("🧪 CLOB Real-Time Test Suite");
  console.log("============================");
  console.log(`Markets: ${MARKETS.join(", ")}`);
  console.log(`Wallet: ${account.address}\n`);
  
  // ============================================================
  // PHASE 1: Authentication
  // ============================================================
  printSeparator("PHASE 1: Authentication");
  
  console.log("🔐 Authenticating...");
  authToken = await authenticate();
  console.log("   ✅ Authenticated successfully\n");
  
  // Check balance
  const balanceRes = await fetch(`${BASE_URL}/faucet/balance`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  const balance = await balanceRes.json();
  console.log(`💰 Balance: ${formatPrice(balance.free)} free, ${formatPrice(balance.locked)} locked`);
  
  // ============================================================
  // PHASE 2: WebSocket Connection
  // ============================================================
  printSeparator("PHASE 2: WebSocket Connection");
  
  console.log("🔌 Connecting to WebSocket...");
  const socket = createSocket(authToken);
  
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Connection timeout")), 5000);
    socket.on("connect", () => {
      clearTimeout(timeout);
      console.log(`   ✅ Connected (socket id: ${socket.id})\n`);
      resolve();
    });
    socket.on("connect_error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
  
  // ============================================================
  // PHASE 3: Subscribe to All Channels
  // ============================================================
  printSeparator("PHASE 3: Channel Subscriptions");
  
  // Set up event handlers
  socket.on("price:update", (data: PriceUpdate) => {
    const count = (stats.priceUpdates.get(data.symbol) || 0) + 1;
    stats.priceUpdates.set(data.symbol, count);
  });
  
  socket.on("orderbook:snapshot", (data: OrderBookSnapshot) => {
    const count = (stats.orderbookSnapshots.get(data.symbol) || 0) + 1;
    stats.orderbookSnapshots.set(data.symbol, count);
  });
  
  socket.on("orderbook:update", (data: OrderBookUpdate) => {
    const count = (stats.orderbookUpdates.get(data.symbol) || 0) + 1;
    stats.orderbookUpdates.set(data.symbol, count);
  });
  
  socket.on("trade:executed", (data: TradeEvent) => {
    const count = (stats.trades.get(data.symbol) || 0) + 1;
    stats.trades.set(data.symbol, count);
    console.log(`   🔥 TRADE: ${data.symbol} ${data.side.toUpperCase()} ${formatQuantity(data.quantity)} @ ${formatPrice(data.price)}`);
  });
  
  socket.on("order:created", (data: OrderUpdate) => {
    console.log(`   📝 ORDER CREATED: ${data.orderId} - ${data.side} ${formatQuantity(data.quantity)} @ ${formatPrice(data.price)}`);
  });
  
  socket.on("order:filled", (data: OrderUpdate) => {
    console.log(`   ✅ ORDER FILLED: ${data.orderId} - ${formatQuantity(data.filledQuantity)} filled @ ${formatPrice(data.price)}`);
  });
  
  socket.on("balance:update", (data: BalanceUpdate) => {
    console.log(`   💰 BALANCE UPDATE: Free: ${formatPrice(data.free)}, Locked: ${formatPrice(data.locked)}`);
  });
  
  // Subscribe to all markets
  for (const market of MARKETS) {
    console.log(`📡 Subscribing to ${market}...`);
    
    // Price updates
    socket.emit("subscribe:price", market.replace("-PERP", ""));
    await sleep(100);
    
    // Orderbook
    socket.emit("subscribe:orderbook", market);
    await sleep(100);
    
    // Trades
    socket.emit("subscribe:trades", market);
    await sleep(100);
  }
  
  console.log("\n   ✅ Subscribed to all channels\n");
  
  // Wait for initial snapshots
  console.log("⏳ Waiting for initial orderbook snapshots...");
  await sleep(2000);
  
  // ============================================================
  // PHASE 4: Display Current Orderbooks
  // ============================================================
  printSeparator("PHASE 4: Current Market State");
  
  for (const market of MARKETS) {
    const res = await fetch(`${BASE_URL}/clob/orderbook/${market}`);
    const orderbook = await res.json() as OrderBookSnapshot;
    printOrderBook(market, orderbook);
    
    // Calculate total liquidity
    const bidLiquidity = orderbook.bids.reduce((sum, b) => sum + b.price * b.quantity, 0);
    const askLiquidity = orderbook.asks.reduce((sum, a) => sum + a.price * a.quantity, 0);
    console.log(`  💧 Liquidity: ${formatPrice(bidLiquidity)} bids | ${formatPrice(askLiquidity)} asks`);
  }
  
  // ============================================================
  // PHASE 5: Watch Real-Time Updates
  // ============================================================
  printSeparator("PHASE 5: Real-Time Market Updates (10 seconds)");
  
  console.log("👀 Watching for updates...\n");
  
  let lastPriceUpdate: PriceUpdate | null = null;
  let lastOrderbookUpdate: OrderBookUpdate | null = null;
  
  const priceHandler = (data: PriceUpdate) => {
    if (!lastPriceUpdate || data.symbol !== lastPriceUpdate.symbol || data.price !== lastPriceUpdate.price) {
      console.log(`   📈 PRICE: ${data.symbol.padEnd(10)} ${formatPrice(data.price)} (${data.changePercent >= 0 ? "+" : ""}${data.changePercent.toFixed(2)}%)`);
      lastPriceUpdate = data;
    }
  };
  
  const orderbookHandler = (data: OrderBookUpdate) => {
    if (!lastOrderbookUpdate || data.symbol !== lastOrderbookUpdate.symbol || data.price !== lastOrderbookUpdate.price) {
      const side = data.side === "bid" ? "🟢" : "🔴";
      console.log(`   ${side} BOOK: ${data.symbol.padEnd(10)} ${data.side.padEnd(3)} ${formatPrice(data.price)} x ${formatQuantity(data.quantity)}`);
      lastOrderbookUpdate = data;
    }
  };
  
  socket.on("price:update", priceHandler);
  socket.on("orderbook:update", orderbookHandler);
  
  // Watch for 10 seconds
  for (let i = 10; i > 0; i--) {
    process.stdout.write(`\r   ⏱️  ${i} seconds remaining...`);
    await sleep(1000);
  }
  console.log("\n");
  
  socket.off("price:update", priceHandler);
  socket.off("orderbook:update", orderbookHandler);
  
  // ============================================================
  // PHASE 6: Place a Market Order
  // ============================================================
  printSeparator("PHASE 6: Execute a Trade");
  
  // Get current AAPL price
  const aaplRes = await fetch(`${BASE_URL}/clob/markets/AAPL-PERP`);
  const aaplMarket = await aaplRes.json();
  const currentPrice = aaplMarket.oraclePrice;
  
  console.log(`📊 Current AAPL-PERP price: ${formatPrice(currentPrice)}`);
  console.log(`   Best Bid: ${formatPrice(aaplMarket.bestBid)}`);
  console.log(`   Best Ask: ${formatPrice(aaplMarket.bestAsk)}\n`);
  
  // Check if we have enough balance
  const marginRequired = currentPrice * 0.1 * 0.1; // 0.1 shares at 10% margin
  console.log(`💸 Margin required for 0.1 shares: ${formatPrice(marginRequired)}`);
  
  if (balance.free < marginRequired) {
    console.log("   ⚠️ Insufficient balance for trade demo\n");
  } else {
    console.log("\n🚀 Placing MARKET BUY order for 0.1 AAPL-PERP...\n");
    
    const orderRes = await fetch(`${BASE_URL}/clob/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        marketSymbol: "AAPL-PERP",
        side: "buy",
        type: "market",
        quantity: 0.1,
      }),
    });
    
    const orderResult = await orderRes.json();
    
    if (orderResult.order) {
      console.log("   ✅ Order Result:");
      console.log(`      Order ID: ${orderResult.order.orderId}`);
      console.log(`      Status: ${orderResult.order.status}`);
      console.log(`      Filled: ${formatQuantity(orderResult.order.filledQuantity)}`);
      console.log(`      Avg Price: ${formatPrice(orderResult.order.averagePrice || 0)}`);
      
      if (orderResult.trades && orderResult.trades.length > 0) {
        console.log(`\n   📊 Trades executed: ${orderResult.trades.length}`);
        for (const trade of orderResult.trades) {
          console.log(`      - ${formatQuantity(trade.quantity)} @ ${formatPrice(trade.price)}`);
        }
      }
    } else {
      console.log("   ❌ Order failed:", orderResult.message || orderResult.error);
    }
  }
  
  // Wait for WebSocket notifications
  await sleep(1000);
  
  // ============================================================
  // PHASE 7: Check Position
  // ============================================================
  printSeparator("PHASE 7: Position Check");
  
  const positionsRes = await fetch(`${BASE_URL}/clob/positions`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  const positions = await positionsRes.json();
  
  if (positions.positions && positions.positions.length > 0) {
    console.log(`📈 Open Positions: ${positions.positions.length}\n`);
    for (const pos of positions.positions) {
      const pnlColor = pos.unrealizedPnl >= 0 ? "🟢" : "🔴";
      console.log(`   ${pos.marketSymbol}`);
      console.log(`      Side: ${pos.side.toUpperCase()}`);
      console.log(`      Size: ${formatQuantity(pos.size)}`);
      console.log(`      Entry: ${formatPrice(pos.entryPrice)}`);
      console.log(`      Mark: ${formatPrice(pos.markPrice || 0)}`);
      console.log(`      ${pnlColor} PnL: ${formatPrice(pos.unrealizedPnl)}`);
      console.log(`      Liquidation: ${formatPrice(pos.liquidationPrice)}`);
      console.log();
    }
  } else {
    console.log("   No open positions\n");
  }
  
  // ============================================================
  // PHASE 8: Statistics Summary
  // ============================================================
  printSeparator("PHASE 8: Session Statistics");
  
  console.log("📊 Events Received During Session:\n");
  
  console.log("   Price Updates:");
  for (const [symbol, count] of stats.priceUpdates) {
    console.log(`      ${symbol}: ${count} updates`);
  }
  
  console.log("\n   Orderbook Snapshots:");
  for (const [symbol, count] of stats.orderbookSnapshots) {
    console.log(`      ${symbol}: ${count} snapshots`);
  }
  
  console.log("\n   Orderbook Updates:");
  for (const [symbol, count] of stats.orderbookUpdates) {
    console.log(`      ${symbol}: ${count} updates`);
  }
  
  console.log("\n   Trades:");
  for (const [symbol, count] of stats.trades) {
    console.log(`      ${symbol}: ${count} trades`);
  }
  
  // ============================================================
  // CLEANUP
  // ============================================================
  printSeparator("Cleanup");
  
  console.log("🔌 Disconnecting...");
  socket.disconnect();
  console.log("   ✅ Disconnected\n");
  
  // Final balance check
  const finalBalanceRes = await fetch(`${BASE_URL}/faucet/balance`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  const finalBalance = await finalBalanceRes.json();
  console.log(`💰 Final Balance: ${formatPrice(finalBalance.free)} free, ${formatPrice(finalBalance.locked)} locked`);
  
  console.log("\n" + "=".repeat(60));
  console.log("  🎉 CLOB Real-Time Test Completed!");
  console.log("=".repeat(60) + "\n");
}

// Run the test
runTest().catch((error) => {
  console.error("\n❌ Test failed:", error.message);
  process.exit(1);
});
