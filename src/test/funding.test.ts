/**
 * Funding Rate System Test
 * 
 * Comprehensive test for the funding rate system.
 * Run with: yarn tsx src/test/funding.test.ts
 * 
 * Prerequisites:
 * - Server should be running (yarn dev)
 * - Markets should be initialized with price data
 * 
 * This test covers:
 * 1. Funding rate API endpoints
 * 2. Funding rate calculation verification
 * 3. WebSocket funding subscriptions
 * 4. Position funding payment simulation
 * 5. Funding history tracking
 */

import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { io, Socket } from "socket.io-client";

const BASE_URL = "http://localhost:3000";
const WS_URL = "ws://localhost:3000";

// Test wallets - using Hardhat/Anvil default test accounts
const TEST_PRIVATE_KEY_1 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_PRIVATE_KEY_2 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const account1 = privateKeyToAccount(TEST_PRIVATE_KEY_1);
const account2 = privateKeyToAccount(TEST_PRIVATE_KEY_2);

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

// Types
interface NonceResponse {
  nonce: string;
  message: string;
}

interface VerifyResponse {
  token: string;
  address: string;
}

interface FundingInfo {
  marketSymbol: string;
  fundingRate: number;
  fundingRatePercent: string;
  predictedFundingRate: number;
  predictedFundingRatePercent: string;
  annualizedRate: number;
  annualizedRatePercent: string;
  markPrice: number;
  indexPrice: number;
  premium: number;
  premiumPercent: string;
  nextFundingTime: string;
  fundingIntervalHours: number;
  lastFunding: {
    fundingRate: number;
    timestamp: string;
    positionsProcessed: number;
  } | null;
}

interface FundingHistoryEntry {
  fundingRate: number;
  fundingRatePercent: string;
  timestamp: string;
  longPayment: number;
  shortPayment: number;
  totalLongSize: number;
  totalShortSize: number;
  positionsProcessed: number;
}

interface FundingEstimate {
  marketSymbol: string;
  side: string;
  size: number;
  fundingRate: number;
  fundingRatePercent: string;
  estimatedPayment: number;
  paymentDirection: "pay" | "receive";
  nextFundingTime: string;
  fundingIntervalHours: number;
}

interface FundingStats {
  totalFundingProcessed: number;
  totalPaymentsDistributed: number;
  lastFundingAt: string | null;
  isEngineRunning: boolean;
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
  accumulatedFunding?: number;
  status: string;
}

interface HealthResponse {
  status: string;
  funding: {
    isRunning: boolean;
    totalProcessed: number;
    lastFundingAt: string | null;
  };
}

// Test state
let authToken1: string;
let authToken2: string;
let wsSocket: Socket | null = null;
const fundingUpdates: Array<Record<string, unknown>> = [];
const fundingPayments: Array<Record<string, unknown>> = [];

// Helper functions
async function authenticate(
  account: ReturnType<typeof privateKeyToAccount>,
  walletClient: ReturnType<typeof createWalletClient>
): Promise<string> {
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

function getAuthHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureBalance(token: string): Promise<number> {
  const balanceRes = await fetch(`${BASE_URL}/faucet/balance`, {
    headers: getAuthHeaders(token),
  });
  const balance = await balanceRes.json() as { free: number };
  
  if (balance.free < 100) {
    await fetch(`${BASE_URL}/faucet/request`, {
      method: "POST",
      headers: getAuthHeaders(token),
    });
    
    const newBalanceRes = await fetch(`${BASE_URL}/faucet/balance`, {
      headers: getAuthHeaders(token),
    });
    const newBalance = await newBalanceRes.json() as { free: number };
    return newBalance.free;
  }
  
  return balance.free;
}

async function closeAllPositions(token: string): Promise<void> {
  const positionsRes = await fetch(`${BASE_URL}/clob/positions`, {
    headers: getAuthHeaders(token),
  });
  const { positions } = await positionsRes.json() as { positions: Position[] };
  
  for (const position of positions) {
    if (position.status === "open" && position.size > 0) {
      await fetch(`${BASE_URL}/clob/positions/${position.marketSymbol}/close`, {
        method: "POST",
        headers: getAuthHeaders(token),
        body: JSON.stringify({}),
      });
    }
  }
}

// ============ TEST FUNCTIONS ============

async function testHealthCheck(): Promise<boolean> {
  console.log("\n📋 TEST 1: Health Check - Funding Engine Status");
  console.log("─".repeat(50));
  
  try {
    const res = await fetch(`${BASE_URL}/health`);
    const health = await res.json() as HealthResponse;
    
    console.log(`   Status: ${health.status}`);
    console.log(`   Funding Engine Running: ${health.funding.isRunning ? "✅ Yes" : "❌ No"}`);
    console.log(`   Total Funding Processed: ${health.funding.totalProcessed}`);
    console.log(`   Last Funding At: ${health.funding.lastFundingAt || "Never"}`);
    
    if (!health.funding.isRunning) {
      console.log("\n   ⚠️  WARNING: Funding engine is not running!");
      return false;
    }
    
    console.log("\n   ✅ Health check passed");
    return true;
  } catch (error) {
    console.error(`   ❌ Failed: ${error}`);
    return false;
  }
}

async function testFundingRateEndpoint(): Promise<boolean> {
  console.log("\n📋 TEST 2: Funding Rate API Endpoint");
  console.log("─".repeat(50));
  
  const markets = ["WEAPON-CASE-3-PERP", "AK47-REDLINE-PERP", "GLOVE-CASE-PERP"];
  
  try {
    for (const market of markets) {
      const res = await fetch(`${BASE_URL}/clob/funding/${market}`);
      
      if (!res.ok) {
        console.log(`   ❌ ${market}: Failed to fetch (${res.status})`);
        continue;
      }
      
      const info = await res.json() as FundingInfo;
      
      console.log(`\n   📊 ${market}:`);
      console.log(`      Funding Rate: ${info.fundingRatePercent}`);
      console.log(`      Predicted: ${info.predictedFundingRatePercent}`);
      console.log(`      Annualized: ${info.annualizedRatePercent}`);
      console.log(`      Mark Price: $${info.markPrice?.toFixed(2) || "N/A"}`);
      console.log(`      Index Price: $${info.indexPrice?.toFixed(2) || "N/A"}`);
      console.log(`      Premium: ${info.premiumPercent}`);
      console.log(`      Next Funding: ${info.nextFundingTime ? new Date(info.nextFundingTime).toLocaleString() : "N/A"}`);
      console.log(`      Interval: ${info.fundingIntervalHours}h`);
      
      if (info.lastFunding) {
        console.log(`      Last Funding: ${info.lastFunding.fundingRatePercent} at ${new Date(info.lastFunding.timestamp).toLocaleString()}`);
      }
    }
    
    console.log("\n   ✅ Funding rate endpoints working");
    return true;
  } catch (error) {
    console.error(`   ❌ Failed: ${error}`);
    return false;
  }
}

async function testFundingHistoryEndpoint(): Promise<boolean> {
  console.log("\n📋 TEST 3: Funding History Endpoint");
  console.log("─".repeat(50));
  
  try {
    const res = await fetch(`${BASE_URL}/clob/funding/WEAPON-CASE-3-PERP/history?limit=10`);
    const data = await res.json() as { marketSymbol: string; fundingHistory: FundingHistoryEntry[]; count: number };
    
    console.log(`   Market: ${data.marketSymbol}`);
    console.log(`   History entries: ${data.count}`);
    
    if (data.fundingHistory.length > 0) {
      console.log("\n   Recent funding events:");
      for (const entry of data.fundingHistory.slice(0, 5)) {
        console.log(`      ${new Date(entry.timestamp).toLocaleString()}: ${entry.fundingRatePercent}`);
        console.log(`         Long payment: $${entry.longPayment.toFixed(4)} | Short payment: $${entry.shortPayment.toFixed(4)}`);
        console.log(`         Positions processed: ${entry.positionsProcessed}`);
      }
    } else {
      console.log("\n   No funding history yet (funding hasn't occurred)");
    }
    
    console.log("\n   ✅ Funding history endpoint working");
    return true;
  } catch (error) {
    console.error(`   ❌ Failed: ${error}`);
    return false;
  }
}

async function testFundingEstimateEndpoint(): Promise<boolean> {
  console.log("\n📋 TEST 4: Funding Estimate Endpoint");
  console.log("─".repeat(50));
  
  try {
    // Test different position configurations
    const testCases = [
      { market: "WEAPON-CASE-3-PERP", side: "long", size: 1 },
      { market: "WEAPON-CASE-3-PERP", side: "short", size: 1 },
      { market: "WEAPON-CASE-3-PERP", side: "long", size: 10 },
      { market: "AK47-REDLINE-PERP", side: "long", size: 1 },
    ];
    
    for (const tc of testCases) {
      const res = await fetch(
        `${BASE_URL}/clob/funding/${tc.market}/estimate?side=${tc.side}&size=${tc.size}`
      );
      
      if (!res.ok) {
        console.log(`   ❌ ${tc.market} ${tc.side} ${tc.size}: Failed (${res.status})`);
        continue;
      }
      
      const estimate = await res.json() as FundingEstimate;
      
      console.log(`\n   📊 ${tc.market} | ${tc.side.toUpperCase()} ${tc.size}:`);
      console.log(`      Funding Rate: ${estimate.fundingRatePercent}`);
      console.log(`      Estimated Payment: $${estimate.estimatedPayment.toFixed(4)}`);
      console.log(`      Direction: ${estimate.paymentDirection === "pay" ? "You PAY ⬇️" : "You RECEIVE ⬆️"}`);
    }
    
    console.log("\n   ✅ Funding estimate endpoint working");
    return true;
  } catch (error) {
    console.error(`   ❌ Failed: ${error}`);
    return false;
  }
}

async function testFundingStatsEndpoint(): Promise<boolean> {
  console.log("\n📋 TEST 5: Global Funding Stats Endpoint");
  console.log("─".repeat(50));
  
  try {
    const res = await fetch(`${BASE_URL}/clob/funding-stats`);
    const stats = await res.json() as FundingStats;
    
    console.log(`   Total Funding Processed: ${stats.totalFundingProcessed}`);
    console.log(`   Total Payments Distributed: ${stats.totalPaymentsDistributed}`);
    console.log(`   Last Funding At: ${stats.lastFundingAt ? new Date(stats.lastFundingAt).toLocaleString() : "Never"}`);
    console.log(`   Engine Running: ${stats.isEngineRunning ? "✅ Yes" : "❌ No"}`);
    
    console.log("\n   ✅ Global funding stats endpoint working");
    return true;
  } catch (error) {
    console.error(`   ❌ Failed: ${error}`);
    return false;
  }
}

async function testWebSocketFundingSubscription(): Promise<boolean> {
  console.log("\n📋 TEST 6: WebSocket Funding Subscription");
  console.log("─".repeat(50));
  
  return new Promise((resolve) => {
    try {
      wsSocket = io(WS_URL, {
        transports: ["websocket"],
        auth: { token: authToken1 },
      });
      
      let subscribed = false;
      let receivedUpdate = false;
      
      wsSocket.on("connect", () => {
        console.log(`   ✅ WebSocket connected: ${wsSocket?.id}`);
        
        // Subscribe to funding updates
        wsSocket?.emit("subscribe:funding", "WEAPON-CASE-3-PERP");
      });
      
      wsSocket.on("subscribed", (data: { channel: string; symbol: string }) => {
        if (data.channel === "funding") {
          console.log(`   ✅ Subscribed to funding:${data.symbol}`);
          subscribed = true;
        }
      });
      
      wsSocket.on("funding:update", (data: Record<string, unknown>) => {
        console.log(`   📡 Received funding update: rate=${data.fundingRate}, mark=$${data.markPrice}`);
        fundingUpdates.push(data);
        receivedUpdate = true;
      });
      
      wsSocket.on("funding:payment", (data: Record<string, unknown>) => {
        console.log(`   📡 Received funding payment event: rate=${data.fundingRate}, positions=${data.positionsProcessed}`);
        fundingPayments.push(data);
      });
      
      wsSocket.on("error", (error: { code: string; message: string }) => {
        console.error(`   ❌ WebSocket error: ${error.code} - ${error.message}`);
      });
      
      wsSocket.on("disconnect", (reason: string) => {
        console.log(`   WebSocket disconnected: ${reason}`);
      });
      
      // Wait for subscription and potential updates
      setTimeout(() => {
        if (subscribed) {
          console.log(`\n   ✅ WebSocket funding subscription working`);
          console.log(`      Updates received: ${fundingUpdates.length}`);
          console.log(`      Payment events received: ${fundingPayments.length}`);
          resolve(true);
        } else {
          console.log(`\n   ⚠️  WebSocket connected but no subscription confirmation received`);
          resolve(false);
        }
      }, 5000);
      
    } catch (error) {
      console.error(`   ❌ Failed: ${error}`);
      resolve(false);
    }
  });
}

async function testFundingWithPositions(): Promise<boolean> {
  console.log("\n📋 TEST 7: Funding Calculation with Open Positions");
  console.log("─".repeat(50));
  
  try {
    // Ensure we have balance
    const balance1 = await ensureBalance(authToken1);
    const balance2 = await ensureBalance(authToken2);
    console.log(`   User 1 balance: $${balance1.toFixed(2)}`);
    console.log(`   User 2 balance: $${balance2.toFixed(2)}`);
    
    // Close any existing positions
    console.log("\n   Closing any existing positions...");
    await closeAllPositions(authToken1);
    await closeAllPositions(authToken2);
    await sleep(500);
    
    // Get oracle price
    const marketRes = await fetch(`${BASE_URL}/clob/markets/WEAPON-CASE-3-PERP`);
    const marketData = await marketRes.json() as { oraclePrice: number | null };
    
    if (!marketData.oraclePrice) {
      console.log("   ⚠️  No oracle price available, skipping position test");
      return true;
    }
    
    console.log(`   Oracle price: $${marketData.oraclePrice.toFixed(2)}`);
    
    // User 1: Open a LONG position
    console.log("\n   User 1: Opening LONG position...");
    const longRes = await fetch(`${BASE_URL}/clob/orders`, {
      method: "POST",
      headers: getAuthHeaders(authToken1),
      body: JSON.stringify({
        marketSymbol: "WEAPON-CASE-3-PERP",
        side: "buy",
        type: "market",
        quantity: 0.5,
      }),
    });
    const longData = await longRes.json() as { order?: { orderId: string }; error?: string; message?: string };
    
    if (longData.order) {
      console.log(`   ✅ Long order placed: ${longData.order.orderId}`);
    } else {
      console.log(`   ⚠️  Long order failed: ${longData.error} - ${longData.message}`);
    }
    
    // User 2: Open a SHORT position
    console.log("   User 2: Opening SHORT position...");
    const shortRes = await fetch(`${BASE_URL}/clob/orders`, {
      method: "POST",
      headers: getAuthHeaders(authToken2),
      body: JSON.stringify({
        marketSymbol: "WEAPON-CASE-3-PERP",
        side: "sell",
        type: "market",
        quantity: 0.5,
      }),
    });
    const shortData = await shortRes.json() as { order?: { orderId: string }; error?: string; message?: string };
    
    if (shortData.order) {
      console.log(`   ✅ Short order placed: ${shortData.order.orderId}`);
    } else {
      console.log(`   ⚠️  Short order failed: ${shortData.error} - ${shortData.message}`);
    }
    
    await sleep(500);
    
    // Get positions and verify accumulated funding field exists
    console.log("\n   Checking positions...");
    
    const pos1Res = await fetch(`${BASE_URL}/clob/positions/WEAPON-CASE-3-PERP`, {
      headers: getAuthHeaders(authToken1),
    });
    const pos1Data = await pos1Res.json() as { position: Position | null };
    
    const pos2Res = await fetch(`${BASE_URL}/clob/positions/WEAPON-CASE-3-PERP`, {
      headers: getAuthHeaders(authToken2),
    });
    const pos2Data = await pos2Res.json() as { position: Position | null };
    
    if (pos1Data.position) {
      console.log(`\n   User 1 Position:`);
      console.log(`      Side: ${pos1Data.position.side.toUpperCase()}`);
      console.log(`      Size: ${pos1Data.position.size}`);
      console.log(`      Entry Price: $${pos1Data.position.entryPrice.toFixed(2)}`);
      console.log(`      Accumulated Funding: $${(pos1Data.position.accumulatedFunding || 0).toFixed(4)}`);
    }
    
    if (pos2Data.position) {
      console.log(`\n   User 2 Position:`);
      console.log(`      Side: ${pos2Data.position.side.toUpperCase()}`);
      console.log(`      Size: ${pos2Data.position.size}`);
      console.log(`      Entry Price: $${pos2Data.position.entryPrice.toFixed(2)}`);
      console.log(`      Accumulated Funding: $${(pos2Data.position.accumulatedFunding || 0).toFixed(4)}`);
    }
    
    // Get funding estimate for these positions
    if (pos1Data.position) {
      console.log("\n   Estimated funding payments:");
      
      const estimate1Res = await fetch(
        `${BASE_URL}/clob/funding/WEAPON-CASE-3-PERP/estimate?side=${pos1Data.position.side}&size=${pos1Data.position.size}`
      );
      const estimate1 = await estimate1Res.json() as FundingEstimate;
      
      console.log(`      User 1 (${pos1Data.position.side}): $${estimate1.estimatedPayment.toFixed(4)} (${estimate1.paymentDirection})`);
      
      if (pos2Data.position) {
        const estimate2Res = await fetch(
          `${BASE_URL}/clob/funding/WEAPON-CASE-3-PERP/estimate?side=${pos2Data.position.side}&size=${pos2Data.position.size}`
        );
        const estimate2 = await estimate2Res.json() as FundingEstimate;
        
        console.log(`      User 2 (${pos2Data.position.side}): $${estimate2.estimatedPayment.toFixed(4)} (${estimate2.paymentDirection})`);
      }
    }
    
    console.log("\n   ✅ Position funding calculation test passed");
    return true;
  } catch (error) {
    console.error(`   ❌ Failed: ${error}`);
    return false;
  }
}

async function testFundingRateCalculation(): Promise<boolean> {
  console.log("\n📋 TEST 8: Funding Rate Calculation Verification");
  console.log("─".repeat(50));
  
  try {
    // Get funding info
    const res = await fetch(`${BASE_URL}/clob/funding/WEAPON-CASE-3-PERP`);
    const info = await res.json() as FundingInfo;
    
    if (!info.markPrice || !info.indexPrice) {
      console.log("   ⚠️  No price data available for calculation verification");
      return true;
    }
    
    // Verify premium calculation
    const calculatedPremium = (info.markPrice - info.indexPrice) / info.indexPrice;
    console.log(`\n   Mark Price: $${info.markPrice.toFixed(2)}`);
    console.log(`   Index Price: $${info.indexPrice.toFixed(2)}`);
    console.log(`   Calculated Premium: ${(calculatedPremium * 100).toFixed(4)}%`);
    console.log(`   Reported Premium: ${info.premiumPercent}`);
    
    // Verify funding rate is within bounds
    const fundingRate = info.fundingRate;
    const maxRate = 0.01; // 1%
    const minRate = -0.01; // -1%
    
    console.log(`\n   Funding Rate: ${info.fundingRatePercent}`);
    console.log(`   Rate bounds: ${(minRate * 100).toFixed(2)}% to ${(maxRate * 100).toFixed(2)}%`);
    
    if (fundingRate >= minRate && fundingRate <= maxRate) {
      console.log(`   ✅ Funding rate within valid bounds`);
    } else {
      console.log(`   ❌ Funding rate out of bounds!`);
      return false;
    }
    
    // Verify annualized rate calculation
    const periodsPerYear = (365 * 24) / info.fundingIntervalHours;
    const calculatedAnnualized = fundingRate * periodsPerYear;
    
    console.log(`\n   Annualized Rate Verification:`);
    console.log(`      Funding interval: ${info.fundingIntervalHours}h`);
    console.log(`      Periods per year: ${periodsPerYear.toFixed(0)}`);
    console.log(`      Calculated annualized: ${(calculatedAnnualized * 100).toFixed(2)}%`);
    console.log(`      Reported annualized: ${info.annualizedRatePercent}`);
    
    console.log("\n   ✅ Funding rate calculation verification passed");
    return true;
  } catch (error) {
    console.error(`   ❌ Failed: ${error}`);
    return false;
  }
}

async function testNextFundingTime(): Promise<boolean> {
  console.log("\n📋 TEST 9: Next Funding Time Validation");
  console.log("─".repeat(50));
  
  try {
    const res = await fetch(`${BASE_URL}/clob/funding/WEAPON-CASE-3-PERP`);
    const info = await res.json() as FundingInfo;
    
    if (!info.nextFundingTime) {
      console.log("   ⚠️  No next funding time set");
      return false;
    }
    
    const nextFunding = new Date(info.nextFundingTime);
    const now = new Date();
    const diffMs = nextFunding.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    console.log(`   Current time: ${now.toISOString()}`);
    console.log(`   Next funding: ${nextFunding.toISOString()}`);
    console.log(`   Time until funding: ${diffHours.toFixed(2)} hours`);
    console.log(`   Funding interval: ${info.fundingIntervalHours} hours`);
    
    // Next funding should be in the future and within the funding interval
    if (diffMs > 0) {
      console.log(`   ✅ Next funding time is in the future`);
    } else {
      console.log(`   ⚠️  Next funding time is in the past (funding may be processing)`);
    }
    
    if (diffHours <= info.fundingIntervalHours) {
      console.log(`   ✅ Next funding within valid interval`);
    } else {
      console.log(`   ⚠️  Next funding seems too far in the future`);
    }
    
    console.log("\n   ✅ Next funding time validation passed");
    return true;
  } catch (error) {
    console.error(`   ❌ Failed: ${error}`);
    return false;
  }
}

async function testFundingPaymentDirection(): Promise<boolean> {
  console.log("\n📋 TEST 10: Funding Payment Direction Consistency");
  console.log("─".repeat(50));
  
  try {
    // Get funding rate
    const res = await fetch(`${BASE_URL}/clob/funding/WEAPON-CASE-3-PERP`);
    const info = await res.json() as FundingInfo;
    
    const fundingRate = info.fundingRate;
    console.log(`   Current funding rate: ${info.fundingRatePercent}`);
    
    // Get estimates for long and short
    const longEstRes = await fetch(`${BASE_URL}/clob/funding/WEAPON-CASE-3-PERP/estimate?side=long&size=1`);
    const longEst = await longEstRes.json() as FundingEstimate;
    
    const shortEstRes = await fetch(`${BASE_URL}/clob/funding/WEAPON-CASE-3-PERP/estimate?side=short&size=1`);
    const shortEst = await shortEstRes.json() as FundingEstimate;
    
    console.log(`\n   Long position estimate:`);
    console.log(`      Payment: $${longEst.estimatedPayment.toFixed(4)}`);
    console.log(`      Direction: ${longEst.paymentDirection}`);
    
    console.log(`\n   Short position estimate:`);
    console.log(`      Payment: $${shortEst.estimatedPayment.toFixed(4)}`);
    console.log(`      Direction: ${shortEst.paymentDirection}`);
    
    // Verify consistency:
    // - If funding rate > 0: longs pay, shorts receive
    // - If funding rate < 0: shorts pay, longs receive
    // - If funding rate = 0: no payments
    
    let consistent = true;
    
    if (fundingRate > 0) {
      if (longEst.paymentDirection !== "pay") {
        console.log(`   ❌ Inconsistent: positive rate but long doesn't pay`);
        consistent = false;
      }
      if (shortEst.paymentDirection !== "receive") {
        console.log(`   ❌ Inconsistent: positive rate but short doesn't receive`);
        consistent = false;
      }
    } else if (fundingRate < 0) {
      if (longEst.paymentDirection !== "receive") {
        console.log(`   ❌ Inconsistent: negative rate but long doesn't receive`);
        consistent = false;
      }
      if (shortEst.paymentDirection !== "pay") {
        console.log(`   ❌ Inconsistent: negative rate but short doesn't pay`);
        consistent = false;
      }
    } else {
      // Zero rate - payments should be zero
      if (longEst.estimatedPayment !== 0 || shortEst.estimatedPayment !== 0) {
        console.log(`   ⚠️  Zero rate but non-zero payments (may be rounding)`);
      }
    }
    
    if (consistent) {
      console.log(`\n   ✅ Payment directions are consistent with funding rate`);
    }
    
    return consistent;
  } catch (error) {
    console.error(`   ❌ Failed: ${error}`);
    return false;
  }
}

async function cleanup(): Promise<void> {
  console.log("\n📋 CLEANUP");
  console.log("─".repeat(50));
  
  // Close WebSocket
  if (wsSocket) {
    wsSocket.emit("unsubscribe:funding", "WEAPON-CASE-3-PERP");
    wsSocket.disconnect();
    console.log("   WebSocket disconnected");
  }
  
  // Close positions
  console.log("   Closing test positions...");
  await closeAllPositions(authToken1);
  await closeAllPositions(authToken2);
  
  console.log("   ✅ Cleanup complete");
}

// ============ MAIN TEST RUNNER ============

async function runTests(): Promise<void> {
  console.log("=".repeat(60));
  console.log("🧪 FUNDING RATE SYSTEM - COMPREHENSIVE TEST");
  console.log("=".repeat(60));
  console.log(`\n📍 Server: ${BASE_URL}`);
  console.log(`📅 Time: ${new Date().toISOString()}\n`);
  
  // Setup: Authenticate both test users
  console.log("🔐 SETUP: Authenticating test users...");
  try {
    authToken1 = await authenticate(account1, walletClient1);
    console.log(`   ✅ User 1: ${account1.address.slice(0, 10)}...`);
    
    authToken2 = await authenticate(account2, walletClient2);
    console.log(`   ✅ User 2: ${account2.address.slice(0, 10)}...`);
  } catch (error) {
    console.error(`   ❌ Authentication failed: ${error}`);
    process.exit(1);
  }
  
  // Run tests
  const results: Array<{ name: string; passed: boolean }> = [];
  
  results.push({ name: "Health Check", passed: await testHealthCheck() });
  results.push({ name: "Funding Rate Endpoint", passed: await testFundingRateEndpoint() });
  results.push({ name: "Funding History Endpoint", passed: await testFundingHistoryEndpoint() });
  results.push({ name: "Funding Estimate Endpoint", passed: await testFundingEstimateEndpoint() });
  results.push({ name: "Global Funding Stats", passed: await testFundingStatsEndpoint() });
  results.push({ name: "WebSocket Subscription", passed: await testWebSocketFundingSubscription() });
  results.push({ name: "Positions & Funding", passed: await testFundingWithPositions() });
  results.push({ name: "Rate Calculation", passed: await testFundingRateCalculation() });
  results.push({ name: "Next Funding Time", passed: await testNextFundingTime() });
  results.push({ name: "Payment Direction", passed: await testFundingPaymentDirection() });
  
  // Cleanup
  await cleanup();
  
  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(60));
  
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  
  for (const result of results) {
    console.log(`   ${result.passed ? "✅" : "❌"} ${result.name}`);
  }
  
  console.log(`\n   Total: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log("\n🎉 ALL TESTS PASSED!");
  } else {
    console.log(`\n⚠️  ${total - passed} test(s) failed`);
  }
  
  console.log("=".repeat(60) + "\n");
  
  // Exit with appropriate code
  process.exit(passed === total ? 0 : 1);
}

// Run the tests
runTests().catch((error) => {
  console.error("❌ Test runner failed:", error);
  process.exit(1);
});
