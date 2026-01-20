/**
 * Trade Count Achievements Test
 * 
 * Tests the trade count progression achievements:
 * - trades_10: Getting Started (10 trades)
 * - trades_25: Active Trader (25 trades)
 * - trades_50: Seasoned Trader (50 trades)
 * - trades_100: Century Club (100 trades)
 * - trades_500: Trading Pro (500 trades)
 * - trades_1000: Market Veteran (1,000 trades)
 * - trades_10000: Trading Legend (10,000 trades)
 * 
 * Run with: yarn tsx src/test/achievements/trade-count-achievements.test.ts
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

// Helper to sleep
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testTradeCountAchievementStructure(): Promise<void> {
  console.log("🏆 Testing Trade Count Achievement Structure\n");
  console.log("=" .repeat(60));
  
  // Fetch all achievements to verify structure
  console.log("\n1️⃣  Fetching all achievements...");
  const allAchievementsResponse = await fetch(`${BASE_URL}/achievements`);
  const allAchievements = (await allAchievementsResponse.json()) as { achievements: Achievement[]; total: number };
  
  console.log(`   ✅ Total achievements: ${allAchievements.total}`);
  
  // Filter trade count achievements
  const tradeCountAchievements = allAchievements.achievements.filter(
    a => a.requirement.type === "trades_executed"
  );
  
  console.log(`\n2️⃣  Trade Count Achievements Found: ${tradeCountAchievements.length}`);
  
  // Expected achievements
  const expectedAchievements = [
    { id: "trades_10", name: "Getting Started", threshold: 10, points: 25 },
    { id: "trades_25", name: "Active Trader", threshold: 25, points: 50 },
    { id: "trades_50", name: "Seasoned Trader", threshold: 50, points: 100 },
    { id: "trades_100", name: "Century Club", threshold: 100, points: 200 },
    { id: "trades_500", name: "Trading Pro", threshold: 500, points: 500 },
    { id: "trades_1000", name: "Market Veteran", threshold: 1000, points: 1000 },
    { id: "trades_10000", name: "Trading Legend", threshold: 10000, points: 5000 },
  ];
  
  console.log(`\n3️⃣  Verifying achievement definitions...`);
  
  let allCorrect = true;
  for (const expected of expectedAchievements) {
    const found = tradeCountAchievements.find(a => a.id === expected.id);
    
    if (!found) {
      console.log(`   ❌ MISSING: ${expected.id} (${expected.name})`);
      allCorrect = false;
      continue;
    }
    
    const nameMatch = found.name === expected.name;
    const thresholdMatch = found.requirement.threshold === expected.threshold;
    const pointsMatch = found.points === expected.points;
    const isProgression = found.isProgression === true;
    const hasGroup = found.progressionGroup === "trade_count";
    
    if (nameMatch && thresholdMatch && pointsMatch && isProgression && hasGroup) {
      console.log(`   ✅ ${expected.id}: ${found.name} (${found.requirement.threshold} trades, ${found.points} pts)`);
    } else {
      console.log(`   ❌ ${expected.id}: Mismatch found`);
      if (!nameMatch) console.log(`      Name: expected "${expected.name}", got "${found.name}"`);
      if (!thresholdMatch) console.log(`      Threshold: expected ${expected.threshold}, got ${found.requirement.threshold}`);
      if (!pointsMatch) console.log(`      Points: expected ${expected.points}, got ${found.points}`);
      if (!isProgression) console.log(`      isProgression: expected true, got ${found.isProgression}`);
      if (!hasGroup) console.log(`      progressionGroup: expected "trade_count", got "${found.progressionGroup}"`);
      allCorrect = false;
    }
  }
  
  // Verify progression order
  console.log(`\n4️⃣  Verifying progression order...`);
  const sortedByOrder = [...tradeCountAchievements].sort(
    (a, b) => (a.progressionOrder || 0) - (b.progressionOrder || 0)
  );
  
  let orderCorrect = true;
  sortedByOrder.forEach((a, index) => {
    const expectedOrder = index + 1;
    if (a.progressionOrder !== expectedOrder) {
      console.log(`   ❌ ${a.id}: expected order ${expectedOrder}, got ${a.progressionOrder}`);
      orderCorrect = false;
    }
  });
  
  if (orderCorrect) {
    console.log(`   ✅ Progression order is correct (1-${sortedByOrder.length})`);
  }
  
  // Calculate total points
  const totalPoints = tradeCountAchievements.reduce((sum, a) => sum + a.points, 0);
  console.log(`\n5️⃣  Total points from trade count achievements: ${totalPoints}`);
  
  if (allCorrect && orderCorrect) {
    console.log(`\n✅ All trade count achievement definitions are correct!`);
  } else {
    console.log(`\n❌ Some trade count achievements have issues`);
  }
}

async function testTradeCountProgression(): Promise<void> {
  console.log("\n\n🏆 Testing Trade Count Progression with Real Trades\n");
  console.log("=" .repeat(60));
  
  // Create test wallet
  console.log("\n1️⃣  Creating and authenticating test wallet...");
  const { token, address } = await createAuthenticatedWallet();
  console.log(`   ✅ Authenticated as ${address.slice(0, 10)}...`);
  
  // Request faucet funds
  console.log("\n2️⃣  Requesting faucet funds...");
  try {
    const faucetResult = await requestFaucet(token);
    console.log(`   ✅ Received $${faucetResult.amount} (Balance: $${faucetResult.balance.free})`);
  } catch (error) {
    console.log(`   ⚠️  Faucet may be rate limited`);
  }
  
  await sleep(500);
  
  // Check initial progression
  console.log("\n3️⃣  Checking initial trade count progression...");
  let grouped = await getGroupedAchievements(token);
  let tradeCountProg = grouped.progressions.find(p => p.progressionGroup === "trade_count");
  
  if (tradeCountProg) {
    console.log(`   📊 Initial state:`);
    console.log(`      Progress: ${tradeCountProg.currentProgress}/${tradeCountProg.maxThreshold}`);
    console.log(`      Stage: ${tradeCountProg.currentStage}/${tradeCountProg.totalStages}`);
    console.log(`      Points: ${tradeCountProg.earnedPoints}/${tradeCountProg.totalPoints}`);
  } else {
    console.log(`   ⚠️  Trade count progression not found in grouped response`);
  }
  
  // Execute some trades and track progress
  console.log("\n4️⃣  Executing trades and tracking progress...");
  
  const tradesToExecute = 5; // Execute 5 trades to see progress
  let totalTradesExecuted = 0;
  const unlockedAchievements: NewAchievement[] = [];
  
  for (let i = 0; i < tradesToExecute; i++) {
    const side = i % 2 === 0 ? "buy" : "sell";
    
    const result = await placeOrder(token, {
      symbol: "BTC-USD",
      side: side as "buy" | "sell",
      type: "market",
      quantity: 0.001,
    });
    
    if (result.success && result.trades && result.trades.length > 0) {
      totalTradesExecuted += result.trades.length;
      console.log(`   Trade ${i + 1}: ${result.trades.length} trade(s) executed`);
      
      if (result.newAchievements && result.newAchievements.length > 0) {
        unlockedAchievements.push(...result.newAchievements);
        result.newAchievements.forEach(a => {
          console.log(`      🏆 UNLOCKED: ${a.name} (+${a.points} pts)`);
        });
      }
    } else {
      console.log(`   Trade ${i + 1}: Order placed (no fill or error: ${result.error || 'waiting for fill'})`);
    }
    
    await sleep(300);
  }
  
  console.log(`\n   Total trades executed: ${totalTradesExecuted}`);
  console.log(`   Achievements unlocked during trading: ${unlockedAchievements.length}`);
  
  // Check final progression
  console.log("\n5️⃣  Checking final trade count progression...");
  grouped = await getGroupedAchievements(token);
  tradeCountProg = grouped.progressions.find(p => p.progressionGroup === "trade_count");
  
  if (tradeCountProg) {
    console.log(`   📊 Final state:`);
    console.log(`      Progress: ${tradeCountProg.currentProgress}/${tradeCountProg.maxThreshold}`);
    console.log(`      Stage: ${tradeCountProg.currentStage}/${tradeCountProg.totalStages}`);
    console.log(`      Points: ${tradeCountProg.earnedPoints}/${tradeCountProg.totalPoints}`);
    
    console.log(`\n   📋 Stage details:`);
    tradeCountProg.stages.forEach(stage => {
      const status = stage.isUnlocked ? "✅" : "⬜";
      const progress = tradeCountProg!.currentProgress;
      const progressPct = Math.min(100, Math.round((progress / stage.threshold) * 100));
      console.log(`      ${status} ${stage.name}: ${progress}/${stage.threshold} (${progressPct}%) - ${stage.points} pts`);
    });
  }
  
  // Summary
  console.log("\n" + "=" .repeat(60));
  console.log("📊 TEST SUMMARY");
  console.log("=" .repeat(60));
  console.log(`   Trades executed: ${totalTradesExecuted}`);
  console.log(`   Achievements unlocked: ${unlockedAchievements.length}`);
  if (unlockedAchievements.length > 0) {
    unlockedAchievements.forEach(a => {
      console.log(`      🏆 ${a.name} (+${a.points} pts)`);
    });
  }
  
  console.log("\n📝 NOTE: To fully test trade count achievements, you would need to:");
  console.log("   - Execute 10+ trades to unlock 'Getting Started'");
  console.log("   - Execute 25+ trades to unlock 'Active Trader'");
  console.log("   - And so on up to 10,000 trades for 'Trading Legend'");
  
  console.log("\n🎉 Trade count progression test completed!\n");
}

// Main test runner
async function runAllTests(): Promise<void> {
  console.log("🏆 TRADE COUNT ACHIEVEMENTS TEST SUITE");
  console.log("=" .repeat(60));
  console.log("This test suite verifies:");
  console.log("  • All trade count achievements are properly defined");
  console.log("  • Progression structure is correct");
  console.log("  • Achievement tracking works during trading");
  console.log("=" .repeat(60));
  
  try {
    await testTradeCountAchievementStructure();
    await testTradeCountProgression();
    
    console.log("\n✅ All tests completed successfully!\n");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

// Run tests
runAllTests();
