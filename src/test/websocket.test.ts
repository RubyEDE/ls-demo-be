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

interface PriceUpdate {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  timestamp: number;
}

// Generate a test wallet
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

async function testWebSocketConnection(): Promise<void> {
  console.log("🧪 Starting WebSocket Test\n");
  
  // Test 1: Unauthenticated connection
  console.log("1️⃣  Testing unauthenticated connection...");
  const unauthSocket = createSocket();
  
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Connection timeout")), 5000);
    
    unauthSocket.on("connect", () => {
      clearTimeout(timeout);
      console.log(`   ✅ Connected without auth (socket id: ${unauthSocket.id})\n`);
      resolve();
    });
    
    unauthSocket.on("connect_error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  
  // Test 2: Subscribe to price updates (unauthenticated)
  console.log("2️⃣  Subscribing to AAPL price updates...");
  
  await new Promise<void>((resolve) => {
    unauthSocket.on("subscribed", (data) => {
      console.log(`   ✅ Subscribed to ${data.channel}:${data.symbol}\n`);
      resolve();
    });
    
    unauthSocket.emit("subscribe:price", "AAPL");
  });
  
  // Test 3: Wait for price update
  console.log("3️⃣  Waiting for price update (up to 10 seconds)...");
  
  const priceReceived = await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      console.log("   ⏳ No price update received (polling may not have started yet)\n");
      resolve(false);
    }, 10000);
    
    unauthSocket.on("price:update", (data: PriceUpdate) => {
      clearTimeout(timeout);
      console.log(`   ✅ Price update received:`);
      console.log(`      Symbol: ${data.symbol}`);
      console.log(`      Price: $${data.price}`);
      console.log(`      Change: ${data.change >= 0 ? '+' : ''}${data.change} (${data.changePercent}%)`);
      console.log(`      Range: $${data.low} - $${data.high}\n`);
      resolve(true);
    });
  });
  
  // Test 4: Unsubscribe
  console.log("4️⃣  Unsubscribing from price updates...");
  
  await new Promise<void>((resolve) => {
    unauthSocket.on("unsubscribed", (data) => {
      console.log(`   ✅ Unsubscribed from ${data.channel}:${data.symbol}\n`);
      resolve();
    });
    
    unauthSocket.emit("unsubscribe:price", "AAPL");
  });
  
  // Clean up unauthenticated socket
  unauthSocket.close();
  
  // Test 5: Authenticated connection
  console.log("5️⃣  Testing authenticated connection...");
  const token = await authenticate();
  console.log("   ✅ Got auth token\n");
  
  const authSocket = createSocket(token);
  
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Connection timeout")), 5000);
    
    authSocket.on("connect", () => {
      clearTimeout(timeout);
      console.log(`   ✅ Connected with auth (socket id: ${authSocket.id})\n`);
      resolve();
    });
    
    authSocket.on("connect_error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
  
  // Test 6: Subscribe to multiple channels
  console.log("6️⃣  Subscribing to multiple channels (TSLA price, orderbook, trades)...");
  
  let subscribeCount = 0;
  await new Promise<void>((resolve) => {
    authSocket.on("subscribed", (data) => {
      subscribeCount++;
      console.log(`   ✅ Subscribed to ${data.channel}:${data.symbol}`);
      if (subscribeCount === 3) {
        console.log();
        resolve();
      }
    });
    
    authSocket.emit("subscribe:price", "TSLA");
    authSocket.emit("subscribe:orderbook", "TSLA");
    authSocket.emit("subscribe:trades", "TSLA");
  });
  
  // Test 7: Check health endpoint for WebSocket stats
  console.log("7️⃣  Checking health endpoint for WebSocket stats...");
  const healthResponse = await fetch(`${BASE_URL}/health`);
  const health = await healthResponse.json() as { 
    status: string; 
    websocket: { activeChannels: string[]; pollingSymbols: string[] } 
  };
  
  console.log(`   ✅ Health check:`);
  console.log(`      Status: ${health.status}`);
  console.log(`      Active channels: ${health.websocket.activeChannels.join(", ") || "none"}`);
  console.log(`      Polling symbols: ${health.websocket.pollingSymbols.join(", ") || "none"}\n`);
  
  // Clean up
  console.log("8️⃣  Cleaning up connections...");
  authSocket.close();
  console.log("   ✅ Connections closed\n");
  
  console.log("🎉 WebSocket tests completed!\n");
}

// Run the test
testWebSocketConnection().catch((error) => {
  console.error("❌ Test failed:", error.message);
  process.exit(1);
});
