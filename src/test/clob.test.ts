import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

const BASE_URL = "http://localhost:3000";

// Test wallet
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(TEST_PRIVATE_KEY);

const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http(),
});

interface NonceResponse {
  nonce: string;
  message: string;
}

interface VerifyResponse {
  token: string;
  address: string;
}

interface Market {
  symbol: string;
  name: string;
  oraclePrice: number;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
}

interface OrderBook {
  symbol: string;
  bids: Array<{ price: number; quantity: number; total: number }>;
  asks: Array<{ price: number; quantity: number; total: number }>;
  oraclePrice: number;
}

let authToken: string;

async function authenticate(): Promise<string> {
  const nonceResponse = await fetch(
    `${BASE_URL}/auth/nonce?address=${account.address}&chainId=1`
  );
  const { message } = (await nonceResponse.json()) as NonceResponse;
  
  const signature = await walletClient.signMessage({ message });
  
  const verifyResponse = await fetch(`${BASE_URL}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  
  const { token } = (await verifyResponse.json()) as VerifyResponse;
  return token;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testCLOB(): Promise<void> {
  console.log("🧪 Starting CLOB Test\n");
  
  // Authenticate first
  console.log("1️⃣  Authenticating...");
  authToken = await authenticate();
  console.log(`   ✅ Authenticated as ${account.address}\n`);
  
  // Get some balance from faucet first
  console.log("2️⃣  Requesting faucet tokens...");
  const faucetRes = await fetch(`${BASE_URL}/faucet/request`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
  });
  const faucetData = await faucetRes.json() as { balance?: { free: number } };
  if (faucetData.balance) {
    console.log(`   ✅ Balance: $${faucetData.balance.free}\n`);
  } else {
    console.log(`   ⏳ Already claimed today (checking balance...)`);
    const balRes = await fetch(`${BASE_URL}/faucet/balance`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const bal = await balRes.json() as { free: number };
    console.log(`   ✅ Current balance: $${bal.free}\n`);
  }
  
  // Test 3: Get markets
  console.log("3️⃣  Fetching active markets...");
  const marketsRes = await fetch(`${BASE_URL}/clob/markets`);
  const marketsData = await marketsRes.json() as { markets: Market[] };
  
  console.log(`   ✅ Found ${marketsData.markets.length} markets:`);
  for (const market of marketsData.markets) {
    console.log(`      - ${market.symbol}: $${market.oraclePrice?.toFixed(2) || "N/A"}`);
    console.log(`        Bid: $${market.bestBid?.toFixed(2) || "N/A"} | Ask: $${market.bestAsk?.toFixed(2) || "N/A"}`);
  }
  console.log();
  
  // Test 4: Get specific market
  const testMarket = marketsData.markets[0]?.symbol || "SP500-PERP";
  console.log(`4️⃣  Fetching ${testMarket} details...`);
  const marketRes = await fetch(`${BASE_URL}/clob/markets/${testMarket}`);
  const marketData = await marketRes.json();
  
  console.log(`   ✅ ${marketData.name}`);
  console.log(`      Oracle Price: $${marketData.oraclePrice?.toFixed(2)}`);
  console.log(`      Max Leverage: ${marketData.maxLeverage}x`);
  console.log(`      Synthetic Orders: ${marketData.syntheticOrders}\n`);
  
  // Test 5: Get order book
  console.log(`5️⃣  Fetching order book for ${testMarket}...`);
  const orderbookRes = await fetch(`${BASE_URL}/clob/orderbook/${testMarket}?depth=5`);
  const orderbook = await orderbookRes.json() as OrderBook;
  
  console.log(`   ✅ Order book (top 5 levels):`);
  console.log(`      Oracle: $${orderbook.oraclePrice?.toFixed(2)}`);
  console.log(`      Asks:`);
  for (const ask of orderbook.asks.slice(0, 5)) {
    console.log(`        $${ask.price.toFixed(2)} | ${ask.quantity.toFixed(4)} | $${ask.total.toFixed(2)}`);
  }
  console.log(`      Bids:`);
  for (const bid of orderbook.bids.slice(0, 5)) {
    console.log(`        $${bid.price.toFixed(2)} | ${bid.quantity.toFixed(4)} | $${bid.total.toFixed(2)}`);
  }
  console.log();
  
  // Test 6: Get recent trades
  console.log(`6️⃣  Fetching recent trades for ${testMarket}...`);
  const tradesRes = await fetch(`${BASE_URL}/clob/trades/${testMarket}?limit=5`);
  const tradesData = await tradesRes.json() as { trades: Array<{ id: string; price: number; quantity: number; side: string }> };
  
  console.log(`   ✅ Recent trades: ${tradesData.trades.length}`);
  for (const trade of tradesData.trades.slice(0, 3)) {
    console.log(`      ${trade.side.toUpperCase()} ${trade.quantity} @ $${trade.price.toFixed(2)}`);
  }
  console.log();
  
  // Test 7: Place a limit order (if we have balance)
  console.log(`7️⃣  Placing a limit buy order...`);
  const oraclePrice = orderbook.oraclePrice || 500;
  const limitPrice = oraclePrice * 0.95; // 5% below oracle
  
  const orderRes = await fetch(`${BASE_URL}/clob/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      marketSymbol: testMarket,
      side: "buy",
      type: "limit",
      price: limitPrice,
      quantity: 0.01,
    }),
  });
  
  const orderData = await orderRes.json() as { order?: { orderId: string; price: number; quantity: number; status: string }; error?: string; message?: string };
  
  if (orderData.order) {
    console.log(`   ✅ Order placed:`);
    console.log(`      Order ID: ${orderData.order.orderId}`);
    console.log(`      Price: $${orderData.order.price.toFixed(2)}`);
    console.log(`      Quantity: ${orderData.order.quantity}`);
    console.log(`      Status: ${orderData.order.status}\n`);
    
    // Test 8: Get open orders
    console.log(`8️⃣  Fetching open orders...`);
    const openOrdersRes = await fetch(`${BASE_URL}/clob/orders`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const openOrders = await openOrdersRes.json() as { orders: Array<{ orderId: string; status: string }> };
    
    console.log(`   ✅ Open orders: ${openOrders.orders.length}`);
    for (const order of openOrders.orders) {
      console.log(`      ${order.orderId}: ${order.status}`);
    }
    console.log();
    
    // Test 9: Cancel the order
    console.log(`9️⃣  Cancelling order ${orderData.order.orderId}...`);
    const cancelRes = await fetch(`${BASE_URL}/clob/orders/${orderData.order.orderId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const cancelData = await cancelRes.json() as { success: boolean; order?: { status: string } };
    
    if (cancelData.success) {
      console.log(`   ✅ Order cancelled: ${cancelData.order?.status}\n`);
    } else {
      console.log(`   ❌ Failed to cancel\n`);
    }
  } else {
    console.log(`   ⚠️  Could not place order: ${orderData.error} - ${orderData.message}\n`);
  }
  
  // Test 10: Get order history
  console.log(`🔟 Fetching order history...`);
  const historyRes = await fetch(`${BASE_URL}/clob/orders/history?limit=5`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  const history = await historyRes.json() as { orders: Array<{ orderId: string; status: string; createdAt: string }> };
  
  console.log(`   ✅ Order history: ${history.orders.length} orders`);
  for (const order of history.orders.slice(0, 3)) {
    console.log(`      ${order.orderId}: ${order.status} (${new Date(order.createdAt).toLocaleString()})`);
  }
  console.log();
  
  console.log("🎉 CLOB tests completed!\n");
}

// Run the test
testCLOB().catch((error) => {
  console.error("❌ Test failed:", error);
  process.exit(1);
});
