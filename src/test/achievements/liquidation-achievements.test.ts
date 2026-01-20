/**
 * Liquidation Achievement Test
 * 
 * Tests the liquidation achievement (first_liquidation / "Rekt")
 * 
 * Note: Actually triggering a liquidation requires:
 * 1. Opening a leveraged position
 * 2. Price moving against the position to liquidation price
 * 3. Liquidation engine detecting and executing the liquidation
 * 
 * This test verifies the achievement is properly defined and can be awarded.
 * 
 * Run with: yarn tsx src/test/achievements/liquidation-achievements.test.ts
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

// Helper to create a wallet and authenticate
async function createAuthenticatedWallet(): Promise<{
  account: ReturnType<typeof privateKeyToAccount>;
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
  
  return { account, token, address };
}

async function testLiquidationAchievementDefinition(): Promise<void> {
  console.log("🏆 Testing Liquidation Achievement Definition\n");
  console.log("=" .repeat(60));
  
  // Fetch all achievements
  console.log("\n1️⃣  Fetching all achievements...");
  const allAchievementsResponse = await fetch(`${BASE_URL}/achievements`);
  const allAchievements = (await allAchievementsResponse.json()) as { achievements: Achievement[]; total: number };
  
  console.log(`   ✅ Total achievements: ${allAchievements.total}`);
  
  // Find liquidation achievement
  const liquidationAchievement = allAchievements.achievements.find(
    a => a.id === "first_liquidation"
  );
  
  console.log("\n2️⃣  Verifying liquidation achievement definition...");
  
  if (!liquidationAchievement) {
    console.log("   ❌ MISSING: first_liquidation achievement not found!");
    throw new Error("Liquidation achievement not defined");
  }
  
  // Expected values
  const expected = {
    id: "first_liquidation",
    name: "Rekt",
    description: "Get liquidated for the first time",
    category: "trading",
    icon: "skull",
    points: 10,
    isProgression: false,
    requirement: {
      type: "liquidations",
      threshold: 1,
    },
  };
  
  let allCorrect = true;
  
  // Verify each field
  const checks = [
    { field: "id", expected: expected.id, actual: liquidationAchievement.id },
    { field: "name", expected: expected.name, actual: liquidationAchievement.name },
    { field: "description", expected: expected.description, actual: liquidationAchievement.description },
    { field: "category", expected: expected.category, actual: liquidationAchievement.category },
    { field: "icon", expected: expected.icon, actual: liquidationAchievement.icon },
    { field: "points", expected: expected.points, actual: liquidationAchievement.points },
    { field: "isProgression", expected: expected.isProgression, actual: liquidationAchievement.isProgression },
    { field: "requirement.type", expected: expected.requirement.type, actual: liquidationAchievement.requirement.type },
    { field: "requirement.threshold", expected: expected.requirement.threshold, actual: liquidationAchievement.requirement.threshold },
  ];
  
  for (const check of checks) {
    if (check.expected === check.actual) {
      console.log(`   ✅ ${check.field}: ${check.actual}`);
    } else {
      console.log(`   ❌ ${check.field}: expected "${check.expected}", got "${check.actual}"`);
      allCorrect = false;
    }
  }
  
  if (allCorrect) {
    console.log("\n   ✅ Liquidation achievement is correctly defined!");
  } else {
    console.log("\n   ❌ Some fields don't match expected values");
    throw new Error("Liquidation achievement definition mismatch");
  }
}

async function testLiquidationAchievementVisibility(): Promise<void> {
  console.log("\n\n🏆 Testing Liquidation Achievement Visibility for User\n");
  console.log("=" .repeat(60));
  
  // Create test wallet and authenticate
  console.log("\n1️⃣  Creating and authenticating test wallet...");
  const { token, address } = await createAuthenticatedWallet();
  console.log(`   ✅ Authenticated as ${address.slice(0, 10)}...`);
  
  // Get user's achievements
  console.log("\n2️⃣  Fetching user achievements...");
  const userAchievementsResponse = await fetch(`${BASE_URL}/achievements/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  const userAchievements = (await userAchievementsResponse.json()) as { achievements: UserAchievement[] };
  
  // Find liquidation achievement in user's list
  const liquidationAchievement = userAchievements.achievements.find(
    a => a.id === "first_liquidation"
  );
  
  if (!liquidationAchievement) {
    console.log("   ❌ Liquidation achievement not visible to user!");
    throw new Error("Liquidation achievement not in user's achievement list");
  }
  
  console.log("   ✅ Liquidation achievement is visible to user");
  console.log(`\n3️⃣  Achievement details for new user:`);
  console.log(`      Name: ${liquidationAchievement.name}`);
  console.log(`      Description: ${liquidationAchievement.description}`);
  console.log(`      Points: ${liquidationAchievement.points}`);
  console.log(`      Is Unlocked: ${liquidationAchievement.isUnlocked ? "Yes" : "No"}`);
  console.log(`      Progress: ${liquidationAchievement.currentProgress}/${liquidationAchievement.requirement.threshold}`);
  console.log(`      Progress %: ${liquidationAchievement.progressPercentage}%`);
  
  // Verify it's not unlocked for new user
  if (liquidationAchievement.isUnlocked) {
    console.log("\n   ⚠️  Warning: Achievement is already unlocked for new user (unexpected)");
  } else {
    console.log("\n   ✅ Achievement correctly shows as locked for new user");
  }
}

async function testLiquidationAchievementCategory(): Promise<void> {
  console.log("\n\n🏆 Testing Liquidation Achievement in Category Filter\n");
  console.log("=" .repeat(60));
  
  // Fetch trading category achievements
  console.log("\n1️⃣  Fetching trading category achievements...");
  const categoryResponse = await fetch(`${BASE_URL}/achievements/category/trading`);
  const categoryAchievements = (await categoryResponse.json()) as { achievements: Achievement[]; total: number };
  
  console.log(`   ✅ Found ${categoryAchievements.total} trading achievements`);
  
  // Check if liquidation achievement is in the category
  const liquidationAchievement = categoryAchievements.achievements.find(
    a => a.id === "first_liquidation"
  );
  
  if (liquidationAchievement) {
    console.log("   ✅ Liquidation achievement is included in trading category");
    console.log(`      ${liquidationAchievement.name}: ${liquidationAchievement.description}`);
  } else {
    console.log("   ❌ Liquidation achievement NOT found in trading category!");
    throw new Error("Liquidation achievement not in trading category");
  }
  
  // List all trading achievements for context
  console.log("\n2️⃣  All trading achievements:");
  categoryAchievements.achievements.forEach(a => {
    const type = a.isProgression ? "[Progression]" : "[Standalone]";
    console.log(`      ${type} ${a.name}: ${a.description} (${a.points} pts)`);
  });
}

// Main test runner
async function runAllTests(): Promise<void> {
  console.log("🏆 LIQUIDATION ACHIEVEMENT TEST SUITE");
  console.log("=" .repeat(60));
  console.log("This test suite verifies:");
  console.log("  • Liquidation achievement is properly defined");
  console.log("  • Achievement is visible to users");
  console.log("  • Achievement is in the correct category");
  console.log("\n📝 NOTE: Actually triggering a liquidation requires:");
  console.log("  • Opening a leveraged position");
  console.log("  • Price moving against the position");
  console.log("  • Liquidation engine executing the liquidation");
  console.log("=" .repeat(60));
  
  try {
    await testLiquidationAchievementDefinition();
    await testLiquidationAchievementVisibility();
    await testLiquidationAchievementCategory();
    
    console.log("\n" + "=" .repeat(60));
    console.log("✅ All liquidation achievement tests passed!");
    console.log("=" .repeat(60));
    console.log("\n🎉 Test suite completed successfully!\n");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

// Run tests
runAllTests();
