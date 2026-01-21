/**
 * Market Maker Test
 * 
 * Tests that the CS:GO markets have:
 * - Active markets with price data
 * - Synthetic orderbook liquidity
 * - Proper bid/ask spreads
 * 
 * Run: npm run test:marketmaker
 * Prerequisites: Server must be running (npm run dev)
 */

export {};

const BASE_URL = "http://localhost:3000";

const REQUIRED_MARKETS = ["WEAPON-CASE-3-PERP", "AK47-REDLINE-PERP", "GLOVE-CASE-PERP"];

interface Market {
  symbol: string;
  name: string;
  baseAsset: string;
  quoteAsset: string;
  oraclePrice: number;
  status: string;
  maxLeverage: number;
  tickSize: number;
  lotSize: number;
}

interface OrderBookLevel {
  price: number;
  quantity: number;
  orders: number;
}

interface OrderBook {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

interface MarketsResponse {
  markets: Market[];
}

interface OrderBookResponse {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getMarkets(): Promise<Market[]> {
  const res = await fetch(`${BASE_URL}/clob/markets`);
  const data = (await res.json()) as MarketsResponse;
  return data.markets;
}

async function getMarket(symbol: string): Promise<Market | null> {
  const res = await fetch(`${BASE_URL}/clob/markets/${symbol}`);
  if (!res.ok) return null;
  const data = await res.json();
  // The endpoint returns market data directly, not wrapped in { market: ... }
  return data as Market;
}

async function getOrderBook(symbol: string): Promise<OrderBook | null> {
  const res = await fetch(`${BASE_URL}/clob/orderbook/${symbol}`);
  if (!res.ok) return null;
  return (await res.json()) as OrderBookResponse;
}

async function waitForMarkets(maxRetries: number = 15, delayMs: number = 2000): Promise<boolean> {
  console.log("\n⏳ Waiting for markets to be ready...");
  
  for (let i = 0; i < maxRetries; i++) {
    const markets = await getMarkets();
    const requiredFound = REQUIRED_MARKETS.filter(
      (symbol) => markets.some((m) => m.symbol === symbol)
    );
    
    if (requiredFound.length === REQUIRED_MARKETS.length) {
      console.log(`   ✅ All ${REQUIRED_MARKETS.length} required markets found`);
      return true;
    }
    
    console.log(`   Attempt ${i + 1}/${maxRetries}: Found ${requiredFound.length}/${REQUIRED_MARKETS.length} markets`);
    await sleep(delayMs);
  }
  
  return false;
}

async function waitForOrderBook(symbol: string, maxRetries: number = 10, delayMs: number = 2000): Promise<OrderBook | null> {
  for (let i = 0; i < maxRetries; i++) {
    const orderbook = await getOrderBook(symbol);
    
    if (orderbook && orderbook.bids.length > 0 && orderbook.asks.length > 0) {
      return orderbook;
    }
    
    console.log(`   ⏳ Waiting for ${symbol} orderbook... (attempt ${i + 1}/${maxRetries})`);
    await sleep(delayMs);
  }
  
  return null;
}

async function testMarketExists(symbol: string): Promise<boolean> {
  console.log(`\n📊 Testing market: ${symbol}`);
  
  const market = await getMarket(symbol);
  
  if (!market) {
    console.log(`   ❌ Market not found`);
    return false;
  }
  
  console.log(`   ✅ Market exists: ${market.name}`);
  console.log(`   📈 Oracle price: $${market.oraclePrice.toFixed(2)}`);
  console.log(`   ⚡ Max leverage: ${market.maxLeverage}x`);
  console.log(`   📏 Tick size: ${market.tickSize}, Lot size: ${market.lotSize}`);
  console.log(`   🟢 Status: ${market.status}`);
  
  if (market.oraclePrice <= 0) {
    console.log(`   ⚠️ Warning: No price data yet`);
  }
  
  return true;
}

async function testOrderBook(symbol: string): Promise<boolean> {
  console.log(`\n📖 Testing orderbook: ${symbol}`);
  
  const orderbook = await waitForOrderBook(symbol);
  
  if (!orderbook) {
    console.log(`   ❌ Orderbook empty or not found`);
    return false;
  }
  
  const bidCount = orderbook.bids.length;
  const askCount = orderbook.asks.length;
  
  console.log(`   ✅ Orderbook has ${bidCount} bid levels, ${askCount} ask levels`);
  
  if (bidCount === 0 || askCount === 0) {
    console.log(`   ❌ Missing bid or ask levels`);
    return false;
  }
  
  // Get best bid and ask
  const bestBid = orderbook.bids[0];
  const bestAsk = orderbook.asks[0];
  
  console.log(`   💰 Best bid: $${bestBid.price.toFixed(2)} x ${bestBid.quantity.toFixed(4)}`);
  console.log(`   💰 Best ask: $${bestAsk.price.toFixed(2)} x ${bestAsk.quantity.toFixed(4)}`);
  
  // Calculate spread
  const spread = bestAsk.price - bestBid.price;
  const midPrice = (bestBid.price + bestAsk.price) / 2;
  const spreadPercent = (spread / midPrice) * 100;
  
  console.log(`   📊 Spread: $${spread.toFixed(4)} (${spreadPercent.toFixed(4)}%)`);
  
  // Check spread is reasonable (less than 1%)
  if (spreadPercent > 1) {
    console.log(`   ⚠️ Warning: Spread is unusually wide`);
  }
  
  // Calculate total liquidity
  const totalBidLiquidity = orderbook.bids.reduce((sum, level) => sum + level.price * level.quantity, 0);
  const totalAskLiquidity = orderbook.asks.reduce((sum, level) => sum + level.price * level.quantity, 0);
  
  console.log(`   📊 Total bid liquidity: $${totalBidLiquidity.toFixed(2)}`);
  console.log(`   📊 Total ask liquidity: $${totalAskLiquidity.toFixed(2)}`);
  
  // Show depth at different levels
  console.log(`   📊 Depth breakdown:`);
  
  const levels = [1, 5, 10, 15];
  for (const level of levels) {
    if (level <= bidCount && level <= askCount) {
      const bidDepth = orderbook.bids.slice(0, level).reduce((sum, l) => sum + l.quantity, 0);
      const askDepth = orderbook.asks.slice(0, level).reduce((sum, l) => sum + l.quantity, 0);
      console.log(`      Level ${level}: ${bidDepth.toFixed(2)} bids / ${askDepth.toFixed(2)} asks`);
    }
  }
  
  return true;
}

async function testMarketMaking(): Promise<void> {
  console.log("🤖 Market Maker Test Suite");
  console.log("==========================");
  console.log(`Testing ${REQUIRED_MARKETS.length} required markets: ${REQUIRED_MARKETS.join(", ")}`);
  
  // Wait for markets to be ready
  const marketsReady = await waitForMarkets();
  if (!marketsReady) {
    console.log("\n❌ FAILED: Required markets not found after timeout");
    console.log("   Make sure the server is running (npm run dev)");
    process.exit(1);
  }
  
  // Test each market
  let allPassed = true;
  const results: { symbol: string; market: boolean; orderbook: boolean }[] = [];
  
  for (const symbol of REQUIRED_MARKETS) {
    const marketOk = await testMarketExists(symbol);
    const orderbookOk = await testOrderBook(symbol);
    
    results.push({ symbol, market: marketOk, orderbook: orderbookOk });
    
    if (!marketOk || !orderbookOk) {
      allPassed = false;
    }
  }
  
  // Summary
  console.log("\n========================================");
  console.log("📋 Test Summary");
  console.log("========================================");
  
  for (const result of results) {
    const marketStatus = result.market ? "✅" : "❌";
    const orderbookStatus = result.orderbook ? "✅" : "❌";
    console.log(`${result.symbol}: Market ${marketStatus} | Orderbook ${orderbookStatus}`);
  }
  
  console.log("========================================");
  
  if (allPassed) {
    console.log("✅ All market maker tests passed!");
  } else {
    console.log("❌ Some tests failed!");
    process.exit(1);
  }
}

// Run the test
testMarketMaking().catch((error) => {
  console.error("Test error:", error);
  process.exit(1);
});
