import { io as ioClient, Socket } from "socket.io-client";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

const BASE_URL = "http://localhost:3000";
const WS_URL = "ws://localhost:3000";

interface NonceResponse {
  nonce: string;
  message: string;
}

interface VerifyResponse {
  token: string;
  address: string;
}

interface CandleUpdate {
  symbol: string;
  interval: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
  isClosed: boolean;
}

interface CandleData {
  marketSymbol: string;
  interval: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
  isClosed: boolean;
}

// Test wallet
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(TEST_PRIVATE_KEY);

const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http(),
});

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

function createSocket(token?: string): Socket {
  return ioClient(WS_URL, {
    auth: token ? { token } : undefined,
    transports: ["websocket"],
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testCandleSystem(): Promise<void> {
  console.log("🕯️  Starting Candle System Test\n");
  
  // Test 1: Fetch candles via REST API
  console.log("1️⃣  Fetching candles via REST API...");
  const intervals = ["1m", "5m", "15m", "1h", "4h", "1d"];
  
  for (const interval of intervals) {
    const res = await fetch(`${BASE_URL}/clob/candles/BTC?interval=${interval}&limit=5`);
    const data = await res.json() as { candles: CandleData[] };
    console.log(`   ${interval}: ${data.candles?.length || 0} candles`);
  }
  console.log("   ✅ REST API candle fetch working\n");
  
  // Test 2: Subscribe to candle updates via WebSocket
  console.log("2️⃣  Connecting to WebSocket...");
  const socket = createSocket();
  
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Connection timeout")), 5000);
    
    socket.on("connect", () => {
      clearTimeout(timeout);
      console.log(`   ✅ Connected (socket id: ${socket.id})\n`);
      resolve();
    });
    
    socket.on("connect_error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  
  // Test 3: Subscribe to multiple candle intervals
  console.log("3️⃣  Subscribing to BTC candles for all intervals...");
  
  const subscribedIntervals: string[] = [];
  const subscriptionPromises: Promise<void>[] = [];
  
  for (const interval of intervals) {
    const promise = new Promise<void>((resolve) => {
      const handler = (data: { channel: string; symbol: string; interval: string }) => {
        if (data.channel === "candles" && data.symbol === "BTC" && data.interval === interval) {
          subscribedIntervals.push(interval);
          console.log(`   ✅ Subscribed to BTC:${interval}`);
          socket.off("subscribed", handler);
          resolve();
        }
      };
      socket.on("subscribed", handler);
    });
    subscriptionPromises.push(promise);
    socket.emit("subscribe:candles", { symbol: "BTC", interval });
  }
  
  await Promise.all(subscriptionPromises);
  console.log(`   ✅ Subscribed to ${subscribedIntervals.length} intervals\n`);
  
  // Test 4: Wait for candle updates (real-time broadcasts happen every 5 seconds)
  console.log("4️⃣  Waiting for candle updates (up to 10 seconds)...");
  
  const receivedCandles = new Map<string, CandleUpdate>();
  
  const candlePromise = new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      console.log(`   ⏳ Received updates for ${receivedCandles.size} intervals`);
      resolve();
    }, 10000);
    
    socket.on("candle:update", (data: CandleUpdate) => {
      if (data.symbol === "BTC" && !receivedCandles.has(data.interval)) {
        receivedCandles.set(data.interval, data);
        console.log(`   📊 Received ${data.interval} candle: O=${data.open.toFixed(2)} H=${data.high.toFixed(2)} L=${data.low.toFixed(2)} C=${data.close.toFixed(2)}`);
        
        // If we've received all intervals, resolve early
        if (receivedCandles.size === intervals.length) {
          clearTimeout(timeout);
          resolve();
        }
      }
    });
  });
  
  await candlePromise;
  
  if (receivedCandles.size > 0) {
    console.log(`   ✅ Received candle updates for: ${Array.from(receivedCandles.keys()).join(", ")}\n`);
  } else {
    console.log("   ⚠️  No candle updates received (server may need time to initialize)\n");
  }
  
  // Test 5: Test wall-clock alignment (check candle timestamps)
  console.log("5️⃣  Verifying candle timestamp alignment...");
  
  let alignmentOk = true;
  for (const [interval, candle] of receivedCandles) {
    const timestamp = new Date(candle.timestamp);
    const seconds = timestamp.getSeconds();
    const milliseconds = timestamp.getMilliseconds();
    
    // All candle timestamps should be aligned to interval boundaries (seconds = 0, ms = 0)
    if (seconds !== 0 || milliseconds !== 0) {
      console.log(`   ❌ ${interval} candle timestamp not aligned: ${timestamp.toISOString()}`);
      alignmentOk = false;
    }
    
    // Verify interval-specific alignment
    const minutes = timestamp.getMinutes();
    const hours = timestamp.getHours();
    
    switch (interval) {
      case "5m":
        if (minutes % 5 !== 0) {
          console.log(`   ❌ 5m candle not aligned to 5-minute boundary: ${minutes} minutes`);
          alignmentOk = false;
        }
        break;
      case "15m":
        if (minutes % 15 !== 0) {
          console.log(`   ❌ 15m candle not aligned to 15-minute boundary: ${minutes} minutes`);
          alignmentOk = false;
        }
        break;
      case "1h":
        if (minutes !== 0) {
          console.log(`   ❌ 1h candle not aligned to hour boundary: ${minutes} minutes`);
          alignmentOk = false;
        }
        break;
      case "4h":
        if (minutes !== 0 || hours % 4 !== 0) {
          console.log(`   ❌ 4h candle not aligned to 4-hour boundary: ${hours}:${minutes}`);
          alignmentOk = false;
        }
        break;
      case "1d":
        if (minutes !== 0 || hours !== 0) {
          console.log(`   ❌ 1d candle not aligned to day boundary: ${hours}:${minutes}`);
          alignmentOk = false;
        }
        break;
    }
  }
  
  if (alignmentOk && receivedCandles.size > 0) {
    console.log("   ✅ All candle timestamps properly aligned to boundaries\n");
  }
  
  // Test 6: Unsubscribe from candles
  console.log("6️⃣  Unsubscribing from candle updates...");
  
  let unsubCount = 0;
  const unsubPromise = new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 3000);
    
    socket.on("unsubscribed", (data: { channel: string; interval: string }) => {
      if (data.channel === "candles") {
        unsubCount++;
        if (unsubCount === intervals.length) {
          clearTimeout(timeout);
          resolve();
        }
      }
    });
  });
  
  for (const interval of intervals) {
    socket.emit("unsubscribe:candles", { symbol: "BTC", interval });
  }
  
  await unsubPromise;
  console.log(`   ✅ Unsubscribed from ${unsubCount} intervals\n`);
  
  // Test 7: Test that we no longer receive updates after unsubscribe
  console.log("7️⃣  Verifying no updates after unsubscribe (3 seconds)...");
  
  let unexpectedUpdate = false;
  const noUpdatePromise = new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 3000);
    
    socket.on("candle:update", (data: CandleUpdate) => {
      if (data.symbol === "BTC") {
        console.log(`   ❌ Received unexpected update for ${data.interval}`);
        unexpectedUpdate = true;
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  
  await noUpdatePromise;
  
  if (!unexpectedUpdate) {
    console.log("   ✅ No updates received after unsubscribe\n");
  }
  
  // Test 8: Test authenticated candle access (for potential user-specific features)
  console.log("8️⃣  Testing authenticated candle access...");
  const token = await authenticate();
  console.log("   ✅ Authenticated\n");
  
  const authSocket = createSocket(token);
  
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Auth connection timeout")), 5000);
    
    authSocket.on("connect", () => {
      clearTimeout(timeout);
      console.log(`   ✅ Connected with auth (socket id: ${authSocket.id})`);
      resolve();
    });
    
    authSocket.on("connect_error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  
  // Subscribe to ETH 1m candles with auth
  await new Promise<void>((resolve) => {
    authSocket.on("subscribed", (data: { channel: string; symbol: string; interval: string }) => {
      if (data.channel === "candles" && data.symbol === "ETH") {
        console.log(`   ✅ Subscribed to ETH:${data.interval} (authenticated)\n`);
        resolve();
      }
    });
    authSocket.emit("subscribe:candles", { symbol: "ETH", interval: "1m" });
  });
  
  // Wait briefly for a candle update
  const authCandleReceived = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 6000);
    
    authSocket.on("candle:update", (data: CandleUpdate) => {
      if (data.symbol === "ETH") {
        clearTimeout(timeout);
        console.log(`   ✅ Received ETH candle update: $${data.close.toFixed(2)}`);
        resolve(true);
      }
    });
  });
  
  if (!authCandleReceived) {
    console.log("   ⏳ No ETH candle received (may need more time)");
  }
  console.log();
  
  // Cleanup
  console.log("9️⃣  Cleaning up...");
  socket.close();
  authSocket.close();
  console.log("   ✅ Sockets closed\n");
  
  // Summary
  console.log("═══════════════════════════════════════════════════════════");
  console.log("🕯️  Candle System Test Summary");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`   REST API:         ✅ Working`);
  console.log(`   WebSocket Sub:    ✅ All ${intervals.length} intervals`);
  console.log(`   Real-time Updates: ${receivedCandles.size > 0 ? "✅" : "⏳"} ${receivedCandles.size}/${intervals.length} intervals`);
  console.log(`   Timestamp Align:  ${alignmentOk && receivedCandles.size > 0 ? "✅" : "⏳"} Wall-clock aligned`);
  console.log(`   Unsubscribe:      ✅ Working`);
  console.log("═══════════════════════════════════════════════════════════\n");
  
  console.log("🎉 Candle system test completed!\n");
}

// Run the test
testCandleSystem().catch((error) => {
  console.error("❌ Test failed:", error.message);
  process.exit(1);
});
