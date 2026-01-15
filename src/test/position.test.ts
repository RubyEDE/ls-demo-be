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

interface Position {
  positionId: string;
  marketSymbol: string;
  side: "long" | "short";
  size: number;
  entryPrice: number;
  markPrice: number | null;
  margin: number;
  leverage: number;
  unrealizedPnl: number;
  realizedPnl: number;
  liquidationPrice: number;
  status: "open" | "closed" | "liquidated";
}

interface PositionSummary {
  totalPositions: number;
  totalMargin: number;
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  totalEquity: number;
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

function getAuthHeaders() {
  return {
    Authorization: `Bearer ${authToken}`,
    "Content-Type": "application/json",
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testPositions(): Promise<void> {
  console.log("🧪 Starting Position Management Test\n");
  
  // Authenticate first
  console.log("1️⃣  Authenticating...");
  authToken = await authenticate();
  console.log(`   ✅ Authenticated as ${account.address}\n`);
  
  // Get balance and ensure we have funds
  console.log("2️⃣  Checking balance...");
  const balanceRes = await fetch(`${BASE_URL}/faucet/balance`, {
    headers: getAuthHeaders(),
  });
  const balanceData = await balanceRes.json() as { free: number; locked: number };
  console.log(`   ✅ Balance: $${balanceData.free} free, $${balanceData.locked} locked\n`);
  
  // Request faucet if needed
  if (balanceData.free < 50) {
    console.log("   📤 Requesting faucet tokens...");
    await fetch(`${BASE_URL}/faucet/request`, {
      method: "POST",
      headers: getAuthHeaders(),
    });
    console.log("   ✅ Faucet requested\n");
  }
  
  // Test 3: Get initial positions (should be empty or have previous positions)
  console.log("3️⃣  Fetching current positions...");
  const positionsRes = await fetch(`${BASE_URL}/clob/positions`, {
    headers: getAuthHeaders(),
  });
  const positionsData = await positionsRes.json() as { positions: Position[] };
  console.log(`   ✅ Current open positions: ${positionsData.positions.length}\n`);
  
  // Test 4: Get position summary
  console.log("4️⃣  Fetching position summary...");
  const summaryRes = await fetch(`${BASE_URL}/clob/positions/summary`, {
    headers: getAuthHeaders(),
  });
  const summary = await summaryRes.json() as PositionSummary;
  console.log(`   ✅ Position Summary:`);
  console.log(`      Total Positions: ${summary.totalPositions}`);
  console.log(`      Total Margin: $${summary.totalMargin.toFixed(2)}`);
  console.log(`      Unrealized PnL: $${summary.totalUnrealizedPnl.toFixed(2)}`);
  console.log(`      Realized PnL: $${summary.totalRealizedPnl.toFixed(2)}`);
  console.log(`      Total Equity: $${summary.totalEquity.toFixed(2)}\n`);
  
  // Test 5: Get markets to find a good price - wait for prices to load
  console.log("5️⃣  Fetching market info for AAPL-PERP...");
  
  // Wait for price updates to arrive
  let oraclePrice: number | null = null;
  let marketData: { oraclePrice: number | null; bestBid: number | null; bestAsk: number | null } = { oraclePrice: null, bestBid: null, bestAsk: null };
  
  for (let i = 0; i < 5; i++) {
    const marketRes = await fetch(`${BASE_URL}/clob/markets/AAPL-PERP`);
    marketData = await marketRes.json() as typeof marketData;
    oraclePrice = marketData.oraclePrice;
    
    if (oraclePrice) break;
    console.log(`   ⏳ Waiting for price data... (attempt ${i + 1}/5)`);
    await sleep(2000);
  }
  
  if (!oraclePrice) {
    console.log("   ⚠️  No oracle price available yet, skipping trading tests\n");
    console.log("🎉 Position Management tests completed (limited - no price data)!\n");
    return;
  }
  
  console.log(`   ✅ Oracle price: $${oraclePrice.toFixed(2)}`);
  console.log(`   ✅ Best bid: $${marketData.bestBid?.toFixed(2) || "N/A"}`);
  console.log(`   ✅ Best ask: $${marketData.bestAsk?.toFixed(2) || "N/A"}\n`);
  
  // Test 6: Place a market buy order to open a long position
  console.log("6️⃣  Opening a LONG position (market buy)...");
  const buyRes = await fetch(`${BASE_URL}/clob/orders`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      marketSymbol: "AAPL-PERP",
      side: "buy",
      type: "market",
      quantity: 0.1,
    }),
  });
  const buyData = await buyRes.json() as { 
    order?: { orderId: string; status: string; averagePrice: number; filledQuantity: number };
    error?: string;
    message?: string;
  };
  
  if (buyData.order) {
    console.log(`   ✅ Order placed:`);
    console.log(`      Order ID: ${buyData.order.orderId}`);
    console.log(`      Status: ${buyData.order.status}`);
    console.log(`      Avg Price: $${buyData.order.averagePrice?.toFixed(2) || "N/A"}`);
    console.log(`      Filled: ${buyData.order.filledQuantity}\n`);
  } else {
    console.log(`   ⚠️  Order failed: ${buyData.error} - ${buyData.message}\n`);
  }
  
  // Wait for position to be created
  await sleep(500);
  
  // Test 7: Check position after opening
  console.log("7️⃣  Checking position after trade...");
  const positionRes = await fetch(`${BASE_URL}/clob/positions/AAPL-PERP`, {
    headers: getAuthHeaders(),
  });
  const positionData = await positionRes.json() as { position: Position | null };
  
  if (positionData.position) {
    const pos = positionData.position;
    console.log(`   ✅ Position found:`);
    console.log(`      Position ID: ${pos.positionId}`);
    console.log(`      Side: ${pos.side.toUpperCase()}`);
    console.log(`      Size: ${pos.size}`);
    console.log(`      Entry Price: $${pos.entryPrice.toFixed(2)}`);
    console.log(`      Mark Price: $${pos.markPrice?.toFixed(2) || "N/A"}`);
    console.log(`      Margin: $${pos.margin.toFixed(2)}`);
    console.log(`      Leverage: ${pos.leverage.toFixed(2)}x`);
    console.log(`      Unrealized PnL: $${pos.unrealizedPnl.toFixed(2)}`);
    console.log(`      Liquidation Price: $${pos.liquidationPrice.toFixed(2)}\n`);
  } else {
    console.log(`   ⚠️  No position found (order may not have filled)\n`);
  }
  
  // Test 8: Get all positions again
  console.log("8️⃣  Fetching all positions...");
  const allPosRes = await fetch(`${BASE_URL}/clob/positions`, {
    headers: getAuthHeaders(),
  });
  const allPosData = await allPosRes.json() as { positions: Position[] };
  console.log(`   ✅ Open positions: ${allPosData.positions.length}`);
  for (const pos of allPosData.positions) {
    console.log(`      - ${pos.marketSymbol}: ${pos.side.toUpperCase()} ${pos.size} @ $${pos.entryPrice.toFixed(2)}`);
    console.log(`        PnL: $${pos.unrealizedPnl.toFixed(2)} | Liq: $${pos.liquidationPrice.toFixed(2)}`);
  }
  console.log();
  
  // Test 9: Close position if we have one
  if (positionData.position && positionData.position.size > 0) {
    console.log("9️⃣  Closing position...");
    const closeRes = await fetch(`${BASE_URL}/clob/positions/AAPL-PERP/close`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({}),
    });
    const closeData = await closeRes.json() as {
      success?: boolean;
      closedQuantity?: number;
      order?: { averagePrice: number };
      position?: { realizedPnl: number; status: string };
      error?: string;
      message?: string;
    };
    
    if (closeData.success) {
      console.log(`   ✅ Position closed:`);
      console.log(`      Closed Quantity: ${closeData.closedQuantity}`);
      console.log(`      Close Price: $${closeData.order?.averagePrice?.toFixed(2) || "N/A"}`);
      console.log(`      Realized PnL: $${closeData.position?.realizedPnl?.toFixed(2) || "N/A"}\n`);
    } else {
      console.log(`   ⚠️  Close failed: ${closeData.error} - ${closeData.message}\n`);
    }
  } else {
    console.log("9️⃣  Skipping close (no position to close)\n");
  }
  
  // Test 10: Check position history
  console.log("🔟 Fetching position history...");
  const historyRes = await fetch(`${BASE_URL}/clob/positions/history?limit=5`, {
    headers: getAuthHeaders(),
  });
  const historyData = await historyRes.json() as { 
    positions: Array<{
      positionId: string;
      marketSymbol: string;
      side: string;
      realizedPnl: number;
      status: string;
    }>;
  };
  console.log(`   ✅ Closed positions: ${historyData.positions.length}`);
  for (const pos of historyData.positions.slice(0, 3)) {
    console.log(`      - ${pos.positionId}: ${pos.side.toUpperCase()} | PnL: $${pos.realizedPnl.toFixed(2)} | ${pos.status}`);
  }
  console.log();
  
  // Test 11: Final position summary
  console.log("1️⃣1️⃣ Final position summary...");
  const finalSummaryRes = await fetch(`${BASE_URL}/clob/positions/summary`, {
    headers: getAuthHeaders(),
  });
  const finalSummary = await finalSummaryRes.json() as PositionSummary;
  console.log(`   ✅ Final Summary:`);
  console.log(`      Open Positions: ${finalSummary.totalPositions}`);
  console.log(`      Total Realized PnL: $${finalSummary.totalRealizedPnl.toFixed(2)}\n`);
  
  console.log("🎉 Position Management tests completed!\n");
}

// Run the test
testPositions().catch((error) => {
  console.error("❌ Test failed:", error);
  process.exit(1);
});
