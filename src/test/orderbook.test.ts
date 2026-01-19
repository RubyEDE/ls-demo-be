/**
 * Orderbook WebSocket Test
 * 
 * Tests the orderbook functionality end-to-end:
 * - Create a limit order and verify it appears in the orderbook via WebSocket
 * - Receive order:created notification via WebSocket
 * - Cancel the order and receive order:cancelled notification
 * - Verify orderbook update reflects the cancellation
 * 
 * Run: npm run test:orderbook
 * Prerequisites: Server must be running (npm run dev)
 */

import { io as ioClient, Socket } from "socket.io-client";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

const BASE_URL = "http://localhost:3000";
const WS_URL = "ws://localhost:3000";
const TEST_MARKET = "AAPL-PERP";

// Interfaces
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

interface OrderEvent {
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

interface PlaceOrderResponse {
  order?: {
    orderId: string;
    marketSymbol: string;
    side: string;
    type: string;
    price: number;
    quantity: number;
    remainingQuantity: number;
    status: string;
  };
  trades?: unknown[];
  error?: string;
  message?: string;
}

interface CancelOrderResponse {
  success: boolean;
  order?: {
    orderId: string;
    status: string;
  };
  error?: string;
}

// Test wallet (Anvil default)
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(TEST_PRIVATE_KEY);
const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http(),
});

let authToken: string;
let socket: Socket;

// Test results
const testResults: { name: string; passed: boolean; message: string }[] = [];

function log(message: string): void {
  console.log(message);
}

function logSuccess(message: string): void {
  console.log(`   ✅ ${message}`);
}

function logError(message: string): void {
  console.log(`   ❌ ${message}`);
}

function logInfo(message: string): void {
  console.log(`   ℹ️  ${message}`);
}

function recordTest(name: string, passed: boolean, message: string): void {
  testResults.push({ name, passed, message });
  if (passed) {
    logSuccess(message);
  } else {
    logError(message);
  }
}

async function authenticate(): Promise<string> {
  const nonceRes = await fetch(`${BASE_URL}/auth/nonce?address=${account.address}&chainId=1`);
  const { message } = await nonceRes.json() as { message: string };
  const signature = await walletClient.signMessage({ message });
  const verifyRes = await fetch(`${BASE_URL}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  const { token } = await verifyRes.json() as { token: string };
  return token;
}

function createSocket(token: string): Socket {
  return ioClient(WS_URL, {
    auth: { token },
    transports: ["websocket"],
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getOraclePrice(): Promise<number> {
  const res = await fetch(`${BASE_URL}/clob/markets/${TEST_MARKET}`);
  const data = await res.json() as { oraclePrice: number };
  return data.oraclePrice;
}

async function getOrderBook(): Promise<OrderBookSnapshot> {
  const res = await fetch(`${BASE_URL}/clob/orderbook/${TEST_MARKET}`);
  return res.json() as Promise<OrderBookSnapshot>;
}

async function ensureBalance(): Promise<number> {
  // Try to get faucet tokens
  await fetch(`${BASE_URL}/faucet/request`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
  });
  
  // Check balance
  const balRes = await fetch(`${BASE_URL}/faucet/balance`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  const bal = await balRes.json() as { free: number };
  return bal.free;
}

async function placeOrder(side: "buy" | "sell", price: number, quantity: number): Promise<PlaceOrderResponse> {
  const res = await fetch(`${BASE_URL}/clob/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      marketSymbol: TEST_MARKET,
      side,
      type: "limit",
      price,
      quantity,
    }),
  });
  return res.json() as Promise<PlaceOrderResponse>;
}

async function cancelOrder(orderId: string): Promise<CancelOrderResponse> {
  const res = await fetch(`${BASE_URL}/clob/orders/${orderId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${authToken}` },
  });
  return res.json() as Promise<CancelOrderResponse>;
}

// ====================
// TEST CASES
// ====================

async function test1_Setup(): Promise<void> {
  log("\n📋 Test 1: Setup - Authentication and WebSocket Connection");
  log("─".repeat(60));
  
  // Authenticate
  try {
    authToken = await authenticate();
    recordTest("Authentication", true, `Authenticated as ${account.address.slice(0, 10)}...`);
  } catch (error) {
    recordTest("Authentication", false, `Failed to authenticate: ${error}`);
    throw error;
  }
  
  // Ensure we have balance
  const balance = await ensureBalance();
  if (balance > 0) {
    recordTest("Balance Check", true, `Balance: $${balance.toFixed(2)}`);
  } else {
    recordTest("Balance Check", false, "No balance available");
    throw new Error("No balance for testing");
  }
  
  // Connect to WebSocket
  socket = createSocket(authToken);
  
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Connection timeout")), 5000);
    socket.on("connect", () => {
      clearTimeout(timeout);
      recordTest("WebSocket Connection", true, `Connected (socket id: ${socket.id})`);
      resolve();
    });
    socket.on("connect_error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function test2_SubscribeToOrderbook(): Promise<void> {
  log("\n📋 Test 2: Subscribe to Orderbook Channel");
  log("─".repeat(60));
  
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Subscription timeout")), 5000);
    
    socket.once("subscribed", (data: { channel: string; symbol?: string }) => {
      clearTimeout(timeout);
      if (data.channel === "orderbook" && data.symbol === TEST_MARKET) {
        recordTest("Orderbook Subscription", true, `Subscribed to orderbook:${TEST_MARKET}`);
        resolve();
      } else {
        reject(new Error(`Wrong subscription: ${data.channel}:${data.symbol}`));
      }
    });
    
    socket.emit("subscribe:orderbook", TEST_MARKET);
  });
}

async function test3_PlaceOrderAndVerifyWebSocket(): Promise<{ orderId: string; price: number }> {
  log("\n📋 Test 3: Place Limit Order and Verify WebSocket Updates");
  log("─".repeat(60));
  
  const oraclePrice = await getOraclePrice();
  // Place a bid well below market to ensure it doesn't fill
  const bidPrice = Math.round((oraclePrice * 0.90) * 100) / 100;
  const quantity = 0.05;
  
  logInfo(`Oracle Price: $${oraclePrice.toFixed(2)}`);
  logInfo(`Placing BUY order at $${bidPrice.toFixed(2)} x ${quantity}`);
  
  // Set up listeners BEFORE placing order
  let orderCreatedReceived = false;
  let orderbookUpdateReceived = false;
  let receivedOrderEvent: OrderEvent | null = null;
  let receivedOrderbookUpdate: OrderBookUpdate | null = null;
  
  const orderCreatedPromise = new Promise<OrderEvent>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!orderCreatedReceived) {
        reject(new Error("order:created event timeout"));
      }
    }, 5000);
    
    socket.once("order:created", (data: OrderEvent) => {
      clearTimeout(timeout);
      orderCreatedReceived = true;
      receivedOrderEvent = data;
      resolve(data);
    });
  });
  
  const orderbookUpdatePromise = new Promise<OrderBookUpdate>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!orderbookUpdateReceived) {
        reject(new Error("orderbook:update event timeout - order may not appear in orderbook"));
      }
    }, 5000);
    
    const handler = (data: OrderBookUpdate) => {
      // Check if this update is for our price level
      if (data.symbol === TEST_MARKET && 
          data.side === "bid" && 
          Math.abs(data.price - bidPrice) < 0.01) {
        clearTimeout(timeout);
        orderbookUpdateReceived = true;
        receivedOrderbookUpdate = data;
        socket.off("orderbook:update", handler);
        resolve(data);
      }
    };
    
    socket.on("orderbook:update", handler);
  });
  
  // Place the order
  const orderResult = await placeOrder("buy", bidPrice, quantity);
  
  if (!orderResult.order) {
    recordTest("Place Order", false, `Failed to place order: ${orderResult.error || orderResult.message}`);
    throw new Error("Order placement failed");
  }
  
  recordTest("Place Order (HTTP)", true, `Order ${orderResult.order.orderId} placed at $${bidPrice.toFixed(2)}`);
  logInfo(`Order Status: ${orderResult.order.status}`);
  
  // Wait for WebSocket events
  try {
    const [orderEvent, orderbookUpdate] = await Promise.all([
      orderCreatedPromise,
      orderbookUpdatePromise,
    ]);
    
    recordTest("order:created WebSocket Event", true, 
      `Received for order ${orderEvent.orderId}, status: ${orderEvent.status}`);
    
    recordTest("orderbook:update WebSocket Event", true, 
      `Bid update at $${orderbookUpdate.price.toFixed(2)} x ${orderbookUpdate.quantity.toFixed(4)}`);
    
  } catch (error) {
    const err = error as Error;
    if (err.message.includes("order:created")) {
      recordTest("order:created WebSocket Event", false, "Did not receive order:created event");
    }
    if (err.message.includes("orderbook:update")) {
      recordTest("orderbook:update WebSocket Event", false, "Did not receive orderbook:update event");
    }
  }
  
  // Verify order appears in orderbook via HTTP
  const orderbook = await getOrderBook();
  const bidInBook = orderbook.bids.find(b => Math.abs(b.price - bidPrice) < 0.01);
  
  if (bidInBook) {
    recordTest("Order in Orderbook (HTTP)", true, 
      `Found bid at $${bidInBook.price.toFixed(2)} x ${bidInBook.quantity.toFixed(4)}`);
  } else {
    recordTest("Order in Orderbook (HTTP)", false, 
      `Bid not found at $${bidPrice.toFixed(2)} in orderbook`);
  }
  
  return { orderId: orderResult.order.orderId, price: bidPrice };
}

async function test4_CancelOrderAndVerifyWebSocket(orderId: string, orderPrice: number): Promise<void> {
  log("\n📋 Test 4: Cancel Order and Verify WebSocket Updates");
  log("─".repeat(60));
  
  logInfo(`Cancelling order ${orderId}`);
  
  // Set up listeners BEFORE cancelling
  let orderCancelledReceived = false;
  let orderbookUpdateReceived = false;
  
  const orderCancelledPromise = new Promise<OrderEvent>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!orderCancelledReceived) {
        reject(new Error("order:cancelled event timeout"));
      }
    }, 5000);
    
    socket.once("order:cancelled", (data: OrderEvent) => {
      clearTimeout(timeout);
      orderCancelledReceived = true;
      resolve(data);
    });
  });
  
  const orderbookUpdatePromise = new Promise<OrderBookUpdate>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!orderbookUpdateReceived) {
        reject(new Error("orderbook:update event timeout after cancel"));
      }
    }, 5000);
    
    const handler = (data: OrderBookUpdate) => {
      // Check if this update is for our price level (quantity should decrease or be 0)
      if (data.symbol === TEST_MARKET && 
          data.side === "bid" && 
          Math.abs(data.price - orderPrice) < 0.01) {
        clearTimeout(timeout);
        orderbookUpdateReceived = true;
        socket.off("orderbook:update", handler);
        resolve(data);
      }
    };
    
    socket.on("orderbook:update", handler);
  });
  
  // Cancel the order
  const cancelResult = await cancelOrder(orderId);
  
  if (!cancelResult.success) {
    recordTest("Cancel Order (HTTP)", false, `Failed to cancel: ${cancelResult.error}`);
    throw new Error("Order cancellation failed");
  }
  
  recordTest("Cancel Order (HTTP)", true, `Order ${orderId} cancelled, status: ${cancelResult.order?.status}`);
  
  // Wait for WebSocket events
  try {
    const [cancelEvent, orderbookUpdate] = await Promise.all([
      orderCancelledPromise,
      orderbookUpdatePromise,
    ]);
    
    recordTest("order:cancelled WebSocket Event", true, 
      `Received for order ${cancelEvent.orderId}, status: ${cancelEvent.status}`);
    
    recordTest("orderbook:update After Cancel", true, 
      `Bid update at $${orderbookUpdate.price.toFixed(2)} x ${orderbookUpdate.quantity.toFixed(4)}`);
    
  } catch (error) {
    const err = error as Error;
    if (err.message.includes("order:cancelled")) {
      recordTest("order:cancelled WebSocket Event", false, "Did not receive order:cancelled event");
    }
    if (err.message.includes("orderbook:update")) {
      recordTest("orderbook:update After Cancel", false, "Did not receive orderbook:update after cancel");
    }
  }
  
  // Verify order is removed from orderbook or quantity reduced
  const orderbook = await getOrderBook();
  const bidInBook = orderbook.bids.find(b => Math.abs(b.price - orderPrice) < 0.01);
  
  // The bid should either be gone or have reduced quantity
  // (depends on whether other orders exist at that level)
  if (!bidInBook || bidInBook.quantity < 0.05) {
    recordTest("Order Removed from Orderbook", true, 
      bidInBook 
        ? `Bid reduced to ${bidInBook.quantity.toFixed(4)}` 
        : `Bid removed from orderbook`);
  } else {
    logInfo(`Note: Bid still at $${orderPrice.toFixed(2)} x ${bidInBook.quantity.toFixed(4)} (may have other orders at this level)`);
  }
}

async function test5_MultipleOrdersFlow(): Promise<void> {
  log("\n📋 Test 5: Multiple Orders Flow (Ask Side)");
  log("─".repeat(60));
  
  const oraclePrice = await getOraclePrice();
  // Place an ask well above market to ensure it doesn't fill
  const askPrice = Math.round((oraclePrice * 1.10) * 100) / 100;
  const quantity = 0.03;
  
  logInfo(`Placing SELL order at $${askPrice.toFixed(2)} x ${quantity}`);
  
  // Track updates
  let orderbookUpdateCount = 0;
  const orderbookHandler = (data: OrderBookUpdate) => {
    if (data.symbol === TEST_MARKET && data.side === "ask") {
      orderbookUpdateCount++;
    }
  };
  socket.on("orderbook:update", orderbookHandler);
  
  // Place order
  const orderResult = await placeOrder("sell", askPrice, quantity);
  
  if (orderResult.order) {
    recordTest("Place Sell Order", true, `Order ${orderResult.order.orderId} placed`);
    
    // Wait a bit for WebSocket events
    await sleep(500);
    
    // Cancel it
    const cancelResult = await cancelOrder(orderResult.order.orderId);
    if (cancelResult.success) {
      recordTest("Cancel Sell Order", true, `Order cancelled`);
    }
    
    await sleep(500);
    
    if (orderbookUpdateCount >= 2) {
      recordTest("Orderbook Updates Received", true, `Received ${orderbookUpdateCount} ask-side updates`);
    } else {
      recordTest("Orderbook Updates Received", false, `Only received ${orderbookUpdateCount} updates, expected at least 2`);
    }
  } else {
    recordTest("Place Sell Order", false, `Failed: ${orderResult.error || orderResult.message}`);
  }
  
  socket.off("orderbook:update", orderbookHandler);
}

async function runTests(): Promise<void> {
  console.log("═".repeat(60));
  console.log("  🧪 ORDERBOOK WEBSOCKET TEST SUITE");
  console.log("═".repeat(60));
  console.log(`\nMarket: ${TEST_MARKET}`);
  console.log(`Wallet: ${account.address}`);
  
  try {
    // Run tests in sequence
    await test1_Setup();
    await test2_SubscribeToOrderbook();
    const { orderId, price } = await test3_PlaceOrderAndVerifyWebSocket();
    await test4_CancelOrderAndVerifyWebSocket(orderId, price);
    await test5_MultipleOrdersFlow();
    
  } catch (error) {
    console.error("\n💥 Test suite error:", error);
  } finally {
    // Cleanup
    if (socket) {
      socket.disconnect();
    }
    
    // Print summary
    console.log("\n" + "═".repeat(60));
    console.log("  📊 TEST RESULTS SUMMARY");
    console.log("═".repeat(60));
    
    const passed = testResults.filter(t => t.passed).length;
    const failed = testResults.filter(t => !t.passed).length;
    
    console.log(`\n  Total: ${testResults.length} tests`);
    console.log(`  ✅ Passed: ${passed}`);
    console.log(`  ❌ Failed: ${failed}\n`);
    
    if (failed > 0) {
      console.log("  Failed tests:");
      for (const test of testResults.filter(t => !t.passed)) {
        console.log(`     - ${test.name}: ${test.message}`);
      }
    }
    
    console.log("\n" + "═".repeat(60));
    
    if (failed > 0) {
      process.exit(1);
    }
  }
}

// Run the tests
runTests().catch((error) => {
  console.error("\n❌ Test suite failed:", error.message);
  process.exit(1);
});
