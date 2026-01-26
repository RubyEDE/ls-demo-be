/**
 * Spot Exchange Tests
 * 
 * Tests spot trading functionality:
 * - Spot balances (credit, view)
 * - Limit orders (buy/sell)
 * - Market orders (buy/sell)
 * - Order matching
 * - Order cancellation
 * - Trade history
 * 
 * Run: npx ts-node src/test/spot.test.ts
 * Prerequisites: Server must be running (npm run dev)
 */

import { createWalletClient, http, WalletClient } from "viem";
import { privateKeyToAccount, PrivateKeyAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

const BASE_URL = "http://localhost:3000";
const TEST_MARKET = "UMBREON-VMAX-SPOT";
const BASE_ASSET = "UMBREON-VMAX";
const QUOTE_ASSET = "USD";

// Test wallets (Anvil defaults) - using two for maker/taker testing
const WALLET_1_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const WALLET_2_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;

const account1 = privateKeyToAccount(WALLET_1_KEY);
const account2 = privateKeyToAccount(WALLET_2_KEY);

const walletClient1 = createWalletClient({
  account: account1,
  chain: mainnet,
  transport: http(),
});

const walletClient2 = createWalletClient({
  account: account2,
  chain: mainnet,
  transport: http(),
});

// Interfaces
interface SpotBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

interface SpotOrder {
  orderId: string;
  marketSymbol: string;
  baseAsset: string;
  quoteAsset: string;
  side: "buy" | "sell";
  type: "limit" | "market";
  price: number;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  averagePrice: number;
  status: string;
}

interface SpotTrade {
  tradeId: string;
  price: number;
  quantity: number;
  quoteQuantity: number;
  side: string;
}

interface PlaceOrderResponse {
  order?: SpotOrder;
  trades?: SpotTrade[];
  error?: string;
  message?: string;
}

// Test state
let token1: string;
let token2: string;
const testResults: { name: string; passed: boolean; message: string }[] = [];

// Helpers
function log(msg: string): void {
  console.log(msg);
}

function logSuccess(msg: string): void {
  console.log(`   ✅ ${msg}`);
}

function logError(msg: string): void {
  console.log(`   ❌ ${msg}`);
}

function recordTest(name: string, passed: boolean, message: string): void {
  testResults.push({ name, passed, message });
  if (passed) {
    logSuccess(message);
  } else {
    logError(message);
  }
}

async function authenticate(
  account: PrivateKeyAccount,
  walletClient: WalletClient
): Promise<string> {
  const nonceRes = await fetch(`${BASE_URL}/auth/nonce?address=${account.address}&chainId=1`);
  const { message } = await nonceRes.json() as { message: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signature = await (walletClient as any).signMessage({ message });
  const verifyRes = await fetch(`${BASE_URL}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  const { token } = await verifyRes.json() as { token: string };
  return token;
}

async function getSpotBalance(token: string, asset: string): Promise<SpotBalance> {
  const res = await fetch(`${BASE_URL}/spot/balances/${asset}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json() as Promise<SpotBalance>;
}

async function getAllSpotBalances(token: string): Promise<{ balances: SpotBalance[] }> {
  const res = await fetch(`${BASE_URL}/spot/balances`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json() as Promise<{ balances: SpotBalance[] }>;
}

async function placeSpotOrder(
  token: string,
  params: {
    marketSymbol: string;
    side: "buy" | "sell";
    type: "limit" | "market";
    price?: number;
    quantity: number;
    postOnly?: boolean;
  }
): Promise<PlaceOrderResponse> {
  const res = await fetch(`${BASE_URL}/spot/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  return res.json() as Promise<PlaceOrderResponse>;
}

async function cancelSpotOrder(token: string, orderId: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${BASE_URL}/spot/orders/${orderId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json() as Promise<{ success: boolean; error?: string }>;
}

async function getOpenOrders(token: string): Promise<{ orders: SpotOrder[] }> {
  const res = await fetch(`${BASE_URL}/spot/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json() as Promise<{ orders: SpotOrder[] }>;
}

async function getOrderBook(symbol: string): Promise<{
  bids: Array<{ price: number; quantity: number }>;
  asks: Array<{ price: number; quantity: number }>;
}> {
  const res = await fetch(`${BASE_URL}/spot/orderbook/${symbol}`);
  return res.json();
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestSpotFaucet(token: string, asset: string, amount: number): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/spot/faucet`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ asset, amount }),
    });
    const data = await res.json() as { success?: boolean; error?: string };
    return data.success === true;
  } catch {
    return false;
  }
}

async function seedTestBalances(): Promise<void> {
  // Seed balances via the spot faucet endpoint
  const tokens = [token1, token2];
  
  for (const token of tokens) {
    // Seed USD balance (quote asset)
    const usdSuccess = await requestSpotFaucet(token, QUOTE_ASSET, 10000);
    if (!usdSuccess) {
      log(`   ⚠️  Could not seed USD balance`);
    }
    
    // Seed base asset balance
    const baseSuccess = await requestSpotFaucet(token, BASE_ASSET, 100);
    if (!baseSuccess) {
      log(`   ⚠️  Could not seed ${BASE_ASSET} balance`);
    }
  }
  
  log("   ✅ Test balances seeded via faucet");
}

// ============ Tests ============

async function testSpotMarkets(): Promise<void> {
  log("\n1️⃣  Testing Spot Markets...");
  
  const res = await fetch(`${BASE_URL}/spot/markets`);
  const data = await res.json() as { markets: Array<{ symbol: string; baseAsset: string; quoteAsset: string }> };
  
  const hasMarkets = data.markets && data.markets.length > 0;
  recordTest("spot-markets-list", hasMarkets, `Found ${data.markets?.length || 0} spot markets`);
  
  // Check specific market
  const market = data.markets?.find(m => m.symbol === TEST_MARKET);
  recordTest("spot-market-exists", !!market, market ? `${TEST_MARKET} exists` : `${TEST_MARKET} not found`);
  
  if (market) {
    recordTest("spot-market-assets", 
      market.baseAsset === BASE_ASSET && market.quoteAsset === QUOTE_ASSET,
      `Base: ${market.baseAsset}, Quote: ${market.quoteAsset}`
    );
  }
}

async function testSpotBalances(): Promise<void> {
  log("\n2️⃣  Testing Spot Balances...");
  
  // Get USD balance
  const usdBalance = await getSpotBalance(token1, QUOTE_ASSET);
  recordTest("spot-balance-usd", usdBalance.asset === QUOTE_ASSET, `USD balance: ${usdBalance.free} free, ${usdBalance.locked} locked`);
  
  // Get base asset balance
  const baseBalance = await getSpotBalance(token1, BASE_ASSET);
  recordTest("spot-balance-base", baseBalance.asset === BASE_ASSET, `${BASE_ASSET} balance: ${baseBalance.free} free`);
  
  // Get all balances
  const allBalances = await getAllSpotBalances(token1);
  recordTest("spot-balance-all", Array.isArray(allBalances.balances), `Found ${allBalances.balances.length} balance entries`);
}

async function testLimitBuyOrder(): Promise<void> {
  log("\n3️⃣  Testing Limit Buy Order...");
  
  const price = 3300.00; // Price per item (below market)
  const quantity = 2;
  
  // Check initial USD balance
  const initialBalance = await getSpotBalance(token1, QUOTE_ASSET);
  log(`   Initial USD: ${initialBalance.free} free, ${initialBalance.locked} locked`);
  
  // Place limit buy order
  const result = await placeSpotOrder(token1, {
    marketSymbol: TEST_MARKET,
    side: "buy",
    type: "limit",
    price,
    quantity,
  });
  
  if (result.error) {
    recordTest("limit-buy-place", false, `Failed: ${result.message || result.error}`);
    return;
  }
  
  recordTest("limit-buy-place", !!result.order, `Order placed: ${result.order?.orderId}`);
  recordTest("limit-buy-status", result.order?.status === "open" || result.order?.status === "filled", `Status: ${result.order?.status}`);
  
  // Check balance was locked
  const afterBalance = await getSpotBalance(token1, QUOTE_ASSET);
  const expectedLocked = price * quantity;
  
  if (result.order?.status === "open") {
    recordTest("limit-buy-locked", 
      afterBalance.locked >= expectedLocked - 0.01,
      `USD locked: ${afterBalance.locked} (expected ~${expectedLocked})`
    );
    
    // Cancel to clean up
    if (result.order) {
      const cancelResult = await cancelSpotOrder(token1, result.order.orderId);
      recordTest("limit-buy-cancel", cancelResult.success, `Order cancelled`);
    }
  } else {
    recordTest("limit-buy-filled", result.order?.filledQuantity === quantity, `Order filled immediately`);
  }
}

async function testLimitSellOrder(): Promise<void> {
  log("\n4️⃣  Testing Limit Sell Order...");
  
  const price = 3500.00; // Price per item (above market)
  const quantity = 1;
  
  // Check initial base asset balance
  const initialBalance = await getSpotBalance(token1, BASE_ASSET);
  log(`   Initial ${BASE_ASSET}: ${initialBalance.free} free, ${initialBalance.locked} locked`);
  
  if (initialBalance.free < quantity) {
    recordTest("limit-sell-balance", false, `Insufficient ${BASE_ASSET} balance: ${initialBalance.free}`);
    return;
  }
  
  // Place limit sell order
  const result = await placeSpotOrder(token1, {
    marketSymbol: TEST_MARKET,
    side: "sell",
    type: "limit",
    price,
    quantity,
  });
  
  if (result.error) {
    recordTest("limit-sell-place", false, `Failed: ${result.message || result.error}`);
    return;
  }
  
  recordTest("limit-sell-place", !!result.order, `Order placed: ${result.order?.orderId}`);
  recordTest("limit-sell-status", result.order?.status === "open" || result.order?.status === "filled", `Status: ${result.order?.status}`);
  
  // Check base asset was locked
  const afterBalance = await getSpotBalance(token1, BASE_ASSET);
  
  if (result.order?.status === "open") {
    recordTest("limit-sell-locked",
      afterBalance.locked >= quantity,
      `${BASE_ASSET} locked: ${afterBalance.locked}`
    );
    
    // Cancel to clean up
    if (result.order) {
      const cancelResult = await cancelSpotOrder(token1, result.order.orderId);
      recordTest("limit-sell-cancel", cancelResult.success, `Order cancelled`);
    }
  }
}

async function testOrderMatching(): Promise<void> {
  log("\n5️⃣  Testing Order Matching (Maker/Taker)...");
  
  const price = 3400.00; // Match at market price
  const quantity = 1;
  
  // User 1 places a limit sell (maker)
  log("   User 1 placing limit sell...");
  const sellResult = await placeSpotOrder(token1, {
    marketSymbol: TEST_MARKET,
    side: "sell",
    type: "limit",
    price,
    quantity,
  });
  
  if (sellResult.error) {
    recordTest("match-maker-order", false, `Maker order failed: ${sellResult.message}`);
    return;
  }
  
  recordTest("match-maker-order", !!sellResult.order, `Maker order: ${sellResult.order?.orderId} @ $${price}`);
  
  // Check orderbook has the ask
  await sleep(100);
  const bookBefore = await getOrderBook(TEST_MARKET);
  const hasAsk = bookBefore.asks.some(a => Math.abs(a.price - price) < 0.01);
  recordTest("match-orderbook-ask", hasAsk, `Ask visible in orderbook`);
  
  // User 2 places a limit buy at same price (taker - should match)
  log("   User 2 placing limit buy to match...");
  const buyResult = await placeSpotOrder(token2, {
    marketSymbol: TEST_MARKET,
    side: "buy",
    type: "limit",
    price,
    quantity,
  });
  
  if (buyResult.error) {
    recordTest("match-taker-order", false, `Taker order failed: ${buyResult.message}`);
    // Clean up maker order
    if (sellResult.order) {
      await cancelSpotOrder(token1, sellResult.order.orderId);
    }
    return;
  }
  
  recordTest("match-taker-order", !!buyResult.order, `Taker order: ${buyResult.order?.orderId}`);
  
  // Check if orders matched
  const tradesExecuted = !!(buyResult.trades && buyResult.trades.length > 0);
  recordTest("match-trade-executed", tradesExecuted, `Trades: ${buyResult.trades?.length || 0}`);
  
  if (tradesExecuted && buyResult.trades) {
    const trade = buyResult.trades[0];
    recordTest("match-trade-price", Math.abs(trade.price - price) < 0.01, `Trade price: $${trade.price}`);
    recordTest("match-trade-quantity", trade.quantity === quantity, `Trade quantity: ${trade.quantity}`);
  }
  
  // Both orders should be filled
  recordTest("match-taker-filled", buyResult.order?.status === "filled", `Taker status: ${buyResult.order?.status}`);
  
  // Check balances changed correctly
  // User 1 (seller) should have received USD
  const seller1UsdAfter = await getSpotBalance(token1, QUOTE_ASSET);
  log(`   Seller USD after: ${seller1UsdAfter.free}`);
  
  // User 2 (buyer) should have received base asset
  const buyer2BaseAfter = await getSpotBalance(token2, BASE_ASSET);
  log(`   Buyer ${BASE_ASSET} after: ${buyer2BaseAfter.free}`);
}

async function testMarketOrder(): Promise<void> {
  log("\n6️⃣  Testing Market Order...");
  
  const limitPrice = 3395.00; // Slightly below best ask
  const quantity = 1;
  
  // First, create some liquidity with a limit order
  log("   Creating liquidity with limit sell...");
  const limitResult = await placeSpotOrder(token1, {
    marketSymbol: TEST_MARKET,
    side: "sell",
    type: "limit",
    price: limitPrice,
    quantity,
  });
  
  if (limitResult.error) {
    recordTest("market-liquidity", false, `Could not create liquidity: ${limitResult.message}`);
    return;
  }
  
  recordTest("market-liquidity", !!limitResult.order, `Liquidity created @ $${limitPrice}`);
  
  // Now place a market buy order
  log("   Placing market buy order...");
  const marketResult = await placeSpotOrder(token2, {
    marketSymbol: TEST_MARKET,
    side: "buy",
    type: "market",
    quantity,
  });
  
  if (marketResult.error) {
    recordTest("market-order-place", false, `Market order failed: ${marketResult.message}`);
    // Clean up
    if (limitResult.order) {
      await cancelSpotOrder(token1, limitResult.order.orderId);
    }
    return;
  }
  
  recordTest("market-order-place", !!marketResult.order, `Market order: ${marketResult.order?.orderId}`);
  recordTest("market-order-filled", marketResult.order?.status === "filled", `Status: ${marketResult.order?.status}`);
  
  if (marketResult.trades && marketResult.trades.length > 0) {
    const trade = marketResult.trades[0];
    recordTest("market-trade-executed", true, `Executed @ $${trade.price} for ${trade.quantity} units`);
  }
}

async function testOrderCancellation(): Promise<void> {
  log("\n7️⃣  Testing Order Cancellation...");
  
  // Place an order
  const result = await placeSpotOrder(token1, {
    marketSymbol: TEST_MARKET,
    side: "buy",
    type: "limit",
    price: 3000.00, // Low price so it won't match
    quantity: 1,
  });
  
  if (result.error || !result.order) {
    recordTest("cancel-order-create", false, `Could not create order: ${result.message}`);
    return;
  }
  
  recordTest("cancel-order-create", true, `Order created: ${result.order.orderId}`);
  
  // Get balance after order (USD should be locked)
  const balanceAfterOrder = await getSpotBalance(token1, QUOTE_ASSET);
  log(`   USD locked after order: ${balanceAfterOrder.locked}`);
  
  // Cancel the order
  const cancelResult = await cancelSpotOrder(token1, result.order.orderId);
  recordTest("cancel-order-success", cancelResult.success, `Order cancelled`);
  
  // Check balance was unlocked
  const balanceAfterCancel = await getSpotBalance(token1, QUOTE_ASSET);
  recordTest("cancel-balance-unlocked", 
    balanceAfterCancel.locked < balanceAfterOrder.locked,
    `USD locked after cancel: ${balanceAfterCancel.locked}`
  );
  
  // Try to cancel again (should fail)
  const cancelAgain = await cancelSpotOrder(token1, result.order.orderId);
  recordTest("cancel-twice-fails", !cancelAgain.success || !!cancelAgain.error, `Second cancel correctly rejected`);
}

async function testOpenOrders(): Promise<void> {
  log("\n8️⃣  Testing Open Orders Query...");
  
  // Place a few orders
  const orders: string[] = [];
  
  for (let i = 0; i < 3; i++) {
    const result = await placeSpotOrder(token1, {
      marketSymbol: TEST_MARKET,
      side: "buy",
      type: "limit",
      price: 3100.00 + i, // Different prices (below market)
      quantity: 1,
    });
    if (result.order) {
      orders.push(result.order.orderId);
    }
  }
  
  recordTest("open-orders-create", orders.length === 3, `Created ${orders.length} orders`);
  
  // Get open orders
  const openOrders = await getOpenOrders(token1);
  const ourOrders = openOrders.orders.filter(o => orders.includes(o.orderId));
  
  recordTest("open-orders-query", ourOrders.length === 3, `Found ${ourOrders.length} of our orders`);
  
  // Clean up - cancel all
  for (const orderId of orders) {
    await cancelSpotOrder(token1, orderId);
  }
  
  // Verify they're gone
  const afterCancel = await getOpenOrders(token1);
  const remainingOrders = afterCancel.orders.filter(o => orders.includes(o.orderId));
  recordTest("open-orders-after-cancel", remainingOrders.length === 0, `All orders cancelled`);
}

async function testTradeHistory(): Promise<void> {
  log("\n9️⃣  Testing Trade History...");
  
  // Get trade history
  const res = await fetch(`${BASE_URL}/spot/trades/history`, {
    headers: { Authorization: `Bearer ${token1}` },
  });
  const data = await res.json() as { trades: Array<{ tradeId: string; price: number; quantity: number }> };
  
  recordTest("trade-history-query", Array.isArray(data.trades), `Found ${data.trades?.length || 0} trades in history`);
  
  if (data.trades && data.trades.length > 0) {
    const trade = data.trades[0];
    recordTest("trade-history-fields", 
      !!trade.tradeId && !!trade.price && !!trade.quantity,
      `Latest trade: ${trade.quantity} @ $${trade.price}`
    );
  }
}

async function testRecentTrades(): Promise<void> {
  log("\n🔟  Testing Recent Market Trades...");
  
  const res = await fetch(`${BASE_URL}/spot/trades/${TEST_MARKET}?limit=10`);
  const data = await res.json() as { trades: Array<{ id: string; price: number; quantity: number; side: string }> };
  
  recordTest("recent-trades-query", Array.isArray(data.trades), `Found ${data.trades?.length || 0} recent trades`);
}

// ============ Main ============

async function runTests(): Promise<void> {
  log("🧪 Spot Exchange Test Suite\n");
  log("=".repeat(50));
  
  try {
    // Authenticate both test users
    log("\n🔐 Authenticating test accounts...");
    token1 = await authenticate(account1, walletClient1);
    logSuccess(`Account 1: ${account1.address.slice(0, 10)}...`);
    
    token2 = await authenticate(account2, walletClient2);
    logSuccess(`Account 2: ${account2.address.slice(0, 10)}...`);
    
    // Seed test balances
    log("\n💰 Seeding test balances...");
    await seedTestBalances();
    
    // Run tests
    await testSpotMarkets();
    await testSpotBalances();
    await testLimitBuyOrder();
    await testLimitSellOrder();
    await testOrderMatching();
    await testMarketOrder();
    await testOrderCancellation();
    await testOpenOrders();
    await testTradeHistory();
    await testRecentTrades();
    
    // Summary
    log("\n" + "=".repeat(50));
    log("📊 Test Results Summary\n");
    
    const passed = testResults.filter(t => t.passed).length;
    const failed = testResults.filter(t => !t.passed).length;
    
    log(`   ✅ Passed: ${passed}`);
    log(`   ❌ Failed: ${failed}`);
    log(`   📝 Total:  ${testResults.length}`);
    
    if (failed > 0) {
      log("\n   Failed tests:");
      for (const test of testResults.filter(t => !t.passed)) {
        log(`      - ${test.name}: ${test.message}`);
      }
    }
    
    log("\n" + "=".repeat(50));
    
    // Exit with appropriate code
    process.exit(failed > 0 ? 1 : 0);
    
  } catch (error) {
    log(`\n❌ Test suite error: ${error}`);
    process.exit(1);
  }
}

// Run
runTests();
