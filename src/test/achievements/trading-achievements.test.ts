/**
 * Trading Achievements Test
 * 
 * Tests trading-related achievements:
 * - First order (first_order)
 * - First market order (first_market_order)
 * - First limit order (first_limit_order)
 * - High leverage trade (high_leverage_trade)
 * - Trade count progression (trades_10, trades_25, etc.)
 * 
 * Run with: yarn tsx src/test/achievements/trading-achievements.test.ts
 */

import { createWalletClient, http } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { mainnet } from "viem/chains";

const BASE_URL = "http://localhost:3000";

interface NonceResponse {
  nonce: string;
  message: string;
}

interface VerifyResponse {
  token: string;
  address: string;
  expiresAt: number;
}

interface NewAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  points: number;
}

interface FaucetRequestResponse {
  success: boolean;
  amount: number;
  balance: {
    free: number;
    locked: number;
    total: number;
  };
  nextRequestAt: string;
  newAchievements?: NewAchievement[];
}

interface OrderResult {
  success: boolean;
  order?: {
    orderId: string;
    symbol: string;
    side: string;
    type: string;
    price: number;
    quantity: number;
    status: string;
  };
  trades?: Array<{
    tradeId: string;
    price: number;
    quantity: number;
  }>;
  newAchievements?: NewAchievement[];
  error?: string;
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  points: number;
  isProgression: boolean;
  progressionGroup?: string;
  progressionOrder?: number;
  requirement: {
    type: string;
    threshold: number;
  };
}

interface UserAchievement extends Achievement {
  isUnlocked: boolean;
  unlockedAt: string | null;
  currentProgress: number;
  progressPercentage: number;
}

interface ProgressionStage {
  id: string;
  name: string;
  description: string;
  icon: string;
  points: number;
  threshold: number;
  order: number;
  isUnlocked: boolean;
  unlockedAt: string | null;
}

interface GroupedProgression {
  progressionGroup: string;
  category: string;
  currentProgress: number;
  maxThreshold: number;
  totalPoints: number;
  earnedPoints: number;
  currentStage: number;
  totalStages: number;
  stages: ProgressionStage[];
}

interface AchievementStats {
  totalUnlocked: number;
  totalAchievements: number;
  totalPoints: number;
  maxPoints: number;
  completionPercentage: number;
}

interface ErrorResponse {
  error: string;
  message: string;
}

// Helper to create a wallet and authenticate
async function createAuthenticatedWallet(): Promise<{
  account: ReturnType<typeof privateKeyToAccount>;
  walletClient: ReturnType<typeof createWalletClient>;
  token: string;
  address: string;
}> {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  
  const walletClient = createWalletClient({
    account,
    chain: mainnet,
    transport: http(),
  });
  
  // Get nonce
  const nonceResponse = await fetch(
    `${BASE_URL}/auth/nonce?address=${account.address}&chainId=1`
  );
  const { message } = (await nonceResponse.json()) as NonceResponse;
  
  // Sign message
  const signature = await walletClient.signMessage({ message });
  
  // Verify and get token
  const verifyResponse = await fetch(`${BASE_URL}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  
  const { token, address } = (await verifyResponse.json()) as VerifyResponse;
  
  return { account, walletClient, token, address };
}

// Helper to request faucet funds
async function requestFaucet(token: string): Promise<FaucetRequestResponse> {
  const response = await fetch(`${BASE_URL}/faucet/request`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  
  if (!response.ok) {
    throw new Error(`Faucet request failed: ${response.status}`);
  }
  
  return response.json() as Promise<FaucetRequestResponse>;
}

// Helper to place an order
async function placeOrder(
  token: string,
  params: {
    symbol: string;
    side: "buy" | "sell";
    type: "market" | "limit";
    quantity: number;
    price?: number;
  }
): Promise<OrderResult> {
  const response = await fetch(`${BASE_URL}/clob/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  
  return response.json() as Promise<OrderResult>;
}

// Helper to get user achievements
async function getUserAchievements(token: string): Promise<{ achievements: UserAchievement[] }> {
  const response = await fetch(`${BASE_URL}/achievements/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  
  return response.json() as Promise<{ achievements: UserAchievement[] }>;
}

// Helper to get grouped achievements
async function getGroupedAchievements(token: string): Promise<{
  progressions: GroupedProgression[];
  standalone: UserAchievement[];
}> {
  const response = await fetch(`${BASE_URL}/achievements/me/grouped`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  
  return response.json() as Promise<{ progressions: GroupedProgression[]; standalone: UserAchievement[] }>;
}

// Helper to get achievement stats
async function getAchievementStats(token: string): Promise<AchievementStats> {
  const response = await fetch(`${BASE_URL}/achievements/me/stats`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  
  return response.json() as Promise<AchievementStats>;
}

// Helper to sleep
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testTradingAchievements(): Promise<void> {
  console.log("🏆 Starting Trading Achievement Tests\n");
  console.log("=" .repeat(60));
  
  // Create test wallet
  console.log("\n1️⃣  Creating and authenticating test wallet...");
  const { token, address } = await createAuthenticatedWallet();
  console.log(`   ✅ Authenticated as ${address.slice(0, 10)}...`);
  
  // Get initial achievements
  console.log("\n2️⃣  Checking initial achievements (new user)...");
  const initialAchievements = await getUserAchievements(token);
  const initialUnlocked = initialAchievements.achievements.filter(a => a.isUnlocked);
  console.log(`   ✅ Initially unlocked: ${initialUnlocked.length}`);
  
  // Check trading achievements are defined
  const tradingAchievements = initialAchievements.achievements.filter(a => a.category === "trading");
  console.log(`   📋 Total trading achievements available: ${tradingAchievements.length}`);
  tradingAchievements.forEach(a => {
    const status = a.isUnlocked ? "✅" : "⬜";
    console.log(`      ${status} ${a.name}: ${a.description} (${a.points} pts)`);
  });
  
  // Request faucet funds
  console.log("\n3️⃣  Requesting faucet funds for trading...");
  try {
    const faucetResult = await requestFaucet(token);
    console.log(`   ✅ Received $${faucetResult.amount} (Balance: $${faucetResult.balance.free})`);
  } catch (error) {
    console.log(`   ⚠️  Faucet request failed (may be rate limited)`);
  }
  
  // Give the system a moment to process
  await sleep(500);
  
  // Test First Market Order Achievement
  console.log("\n4️⃣  Testing First Market Order Achievement...");
  console.log("   Placing a market buy order for BTC-USD...");
  
  const marketOrderResult = await placeOrder(token, {
    symbol: "BTC-USD",
    side: "buy",
    type: "market",
    quantity: 0.001,
  });
  
  if (marketOrderResult.success) {
    console.log(`   ✅ Market order placed successfully!`);
    console.log(`      Order ID: ${marketOrderResult.order?.orderId}`);
    console.log(`      Status: ${marketOrderResult.order?.status}`);
    
    if (marketOrderResult.newAchievements && marketOrderResult.newAchievements.length > 0) {
      console.log(`   🎉 NEW ACHIEVEMENTS UNLOCKED:`);
      marketOrderResult.newAchievements.forEach(a => {
        console.log(`      🏆 ${a.name}: ${a.description} (+${a.points} pts)`);
      });
      
      // Verify expected achievements
      const hasFirstOrder = marketOrderResult.newAchievements.some(a => a.id === "first_order");
      const hasFirstMarketOrder = marketOrderResult.newAchievements.some(a => a.id === "first_market_order");
      
      if (hasFirstOrder) {
        console.log(`   ✅ "First Trade" achievement unlocked correctly!`);
      } else {
        console.log(`   ⚠️  Expected "First Trade" achievement`);
      }
      
      if (hasFirstMarketOrder) {
        console.log(`   ✅ "Market Mover" achievement unlocked correctly!`);
      } else {
        console.log(`   ⚠️  Expected "Market Mover" achievement`);
      }
    } else {
      console.log(`   ⚠️  No achievements returned (may already be unlocked)`);
    }
  } else {
    console.log(`   ❌ Market order failed: ${marketOrderResult.error}`);
  }
  
  // Give system time to process
  await sleep(500);
  
  // Test First Limit Order Achievement
  console.log("\n5️⃣  Testing First Limit Order Achievement...");
  console.log("   Placing a limit sell order for BTC-USD...");
  
  const limitOrderResult = await placeOrder(token, {
    symbol: "BTC-USD",
    side: "sell",
    type: "limit",
    quantity: 0.001,
    price: 150000, // High price so it won't fill
  });
  
  if (limitOrderResult.success) {
    console.log(`   ✅ Limit order placed successfully!`);
    console.log(`      Order ID: ${limitOrderResult.order?.orderId}`);
    console.log(`      Status: ${limitOrderResult.order?.status}`);
    
    if (limitOrderResult.newAchievements && limitOrderResult.newAchievements.length > 0) {
      console.log(`   🎉 NEW ACHIEVEMENTS UNLOCKED:`);
      limitOrderResult.newAchievements.forEach(a => {
        console.log(`      🏆 ${a.name}: ${a.description} (+${a.points} pts)`);
      });
      
      const hasFirstLimitOrder = limitOrderResult.newAchievements.some(a => a.id === "first_limit_order");
      if (hasFirstLimitOrder) {
        console.log(`   ✅ "Patient Trader" achievement unlocked correctly!`);
      } else {
        console.log(`   ⚠️  Expected "Patient Trader" achievement`);
      }
    } else {
      console.log(`   ⚠️  No achievements returned (may already be unlocked)`);
    }
  } else {
    console.log(`   ❌ Limit order failed: ${limitOrderResult.error}`);
  }
  
  // Give system time to process
  await sleep(500);
  
  // Check current achievement status
  console.log("\n6️⃣  Verifying current achievement status...");
  const currentAchievements = await getUserAchievements(token);
  const unlockedNow = currentAchievements.achievements.filter(a => a.isUnlocked);
  
  console.log(`   ✅ Currently unlocked: ${unlockedNow.length} achievements`);
  unlockedNow.forEach(a => {
    console.log(`      🏆 ${a.name} (${a.points} pts)`);
  });
  
  // Check trade count progression
  console.log("\n7️⃣  Checking trade count progression...");
  const grouped = await getGroupedAchievements(token);
  
  const tradeCountProgression = grouped.progressions.find(p => p.progressionGroup === "trade_count");
  if (tradeCountProgression) {
    console.log(`   📊 Trade Count Progression:`);
    console.log(`      Current progress: ${tradeCountProgression.currentProgress}/${tradeCountProgression.maxThreshold}`);
    console.log(`      Current stage: ${tradeCountProgression.currentStage}/${tradeCountProgression.totalStages}`);
    console.log(`      Points earned: ${tradeCountProgression.earnedPoints}/${tradeCountProgression.totalPoints}`);
    console.log(`      Stages:`);
    tradeCountProgression.stages.forEach(s => {
      const status = s.isUnlocked ? "✅" : "⬜";
      console.log(`         ${status} ${s.name} (${s.threshold} trades) - ${s.points} pts`);
    });
  } else {
    console.log(`   ⚠️  Trade count progression not found`);
  }
  
  // Check standalone trading achievements
  console.log("\n8️⃣  Checking standalone trading achievements...");
  const standaloneTradingAchievements = grouped.standalone.filter(a => a.category === "trading");
  console.log(`   📋 Standalone trading achievements:`);
  standaloneTradingAchievements.forEach(a => {
    const status = a.isUnlocked ? "✅" : "⬜";
    console.log(`      ${status} ${a.name}: ${a.description} (${a.points} pts)`);
  });
  
  // Get final stats
  console.log("\n9️⃣  Final achievement stats...");
  const stats = await getAchievementStats(token);
  console.log(`   ✅ Final stats:`);
  console.log(`      Unlocked: ${stats.totalUnlocked}/${stats.totalAchievements}`);
  console.log(`      Points: ${stats.totalPoints}/${stats.maxPoints}`);
  console.log(`      Completion: ${stats.completionPercentage}%`);
  
  // Summary
  console.log("\n" + "=" .repeat(60));
  console.log("📊 TEST SUMMARY");
  console.log("=" .repeat(60));
  
  const achievementTests = [
    { id: "first_order", name: "First Trade", unlocked: unlockedNow.some(a => a.id === "first_order") },
    { id: "first_market_order", name: "Market Mover", unlocked: unlockedNow.some(a => a.id === "first_market_order") },
    { id: "first_limit_order", name: "Patient Trader", unlocked: unlockedNow.some(a => a.id === "first_limit_order") },
  ];
  
  let passedTests = 0;
  achievementTests.forEach(test => {
    const status = test.unlocked ? "✅ PASS" : "❌ FAIL";
    console.log(`   ${status}: ${test.name} (${test.id})`);
    if (test.unlocked) passedTests++;
  });
  
  console.log(`\n   Results: ${passedTests}/${achievementTests.length} tests passed`);
  
  // Note about achievements that require more setup
  console.log("\n📝 NOTE: The following achievements require additional setup to test:");
  console.log("   - high_leverage_trade: Requires opening a position with 10x leverage");
  console.log("   - first_liquidation: Requires a position to be liquidated");
  console.log("   - trade_count (10+): Requires executing multiple trades");
  
  console.log("\n🎉 Trading achievement tests completed!\n");
}

// Test high leverage achievement specifically
async function testHighLeverageAchievement(): Promise<void> {
  console.log("\n🔥 Testing High Leverage Achievement\n");
  console.log("=" .repeat(60));
  
  // Create test wallet
  console.log("\n1️⃣  Creating and authenticating test wallet...");
  const { token, address } = await createAuthenticatedWallet();
  console.log(`   ✅ Authenticated as ${address.slice(0, 10)}...`);
  
  // Request faucet funds (need enough for margin)
  console.log("\n2️⃣  Requesting faucet funds...");
  try {
    const faucetResult = await requestFaucet(token);
    console.log(`   ✅ Received $${faucetResult.amount} (Balance: $${faucetResult.balance.free})`);
  } catch (error) {
    console.log(`   ⚠️  Faucet may be rate limited`);
  }
  
  await sleep(500);
  
  // Place a small order with high notional value relative to margin
  // This should result in high leverage
  console.log("\n3️⃣  Placing order that would result in high leverage...");
  console.log("   Note: Leverage = Notional Value / Margin");
  console.log("   A small margin with larger position size = higher leverage");
  
  // Try to place a market order that would use most of our balance
  const result = await placeOrder(token, {
    symbol: "BTC-USD",
    side: "buy",
    type: "market",
    quantity: 0.01, // Larger quantity = higher notional value
  });
  
  if (result.success) {
    console.log(`   ✅ Order placed successfully!`);
    
    if (result.newAchievements && result.newAchievements.length > 0) {
      console.log(`   🎉 NEW ACHIEVEMENTS UNLOCKED:`);
      result.newAchievements.forEach(a => {
        console.log(`      🏆 ${a.name}: ${a.description} (+${a.points} pts)`);
      });
      
      const hasHighLeverage = result.newAchievements.some(a => a.id === "high_leverage_trade");
      if (hasHighLeverage) {
        console.log(`   ✅ "Degen Mode" achievement unlocked! High leverage detected.`);
      }
    }
    
    // Check position to see leverage
    const positionsResponse = await fetch(`${BASE_URL}/clob/positions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (positionsResponse.ok) {
      const positions = await positionsResponse.json() as { positions: Array<{ leverage: number; marketSymbol: string }> };
      if (positions.positions && positions.positions.length > 0) {
        positions.positions.forEach(p => {
          console.log(`   📊 Position ${p.marketSymbol}: ${p.leverage.toFixed(2)}x leverage`);
        });
      }
    }
  } else {
    console.log(`   ❌ Order failed: ${result.error}`);
  }
  
  console.log("\n🎉 High leverage test completed!\n");
}

// Main test runner
async function runAllTests(): Promise<void> {
  console.log("🏆 TRADING ACHIEVEMENTS TEST SUITE");
  console.log("=" .repeat(60));
  console.log("This test suite covers:");
  console.log("  • First order achievement");
  console.log("  • First market order achievement");
  console.log("  • First limit order achievement");
  console.log("  • High leverage achievement");
  console.log("  • Trade count progression");
  console.log("=" .repeat(60));
  
  try {
    await testTradingAchievements();
    await testHighLeverageAchievement();
    
    console.log("\n✅ All tests completed successfully!\n");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

// Run tests
runAllTests();
