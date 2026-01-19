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

// Generate a fresh test wallet for each run
const TEST_PRIVATE_KEY = generatePrivateKey();
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

async function testFaucetAchievements(): Promise<void> {
  console.log("🏆 Starting Faucet Achievement Tests\n");
  console.log(`📍 Test wallet address: ${account.address}\n`);
  
  // Authenticate first
  console.log("1️⃣  Authenticating...");
  const token = await authenticate();
  console.log(`   ✅ Authenticated\n`);
  
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  
  // Step 2: Check all available achievements
  console.log("2️⃣  Fetching all available achievements...");
  const allAchievementsResponse = await fetch(`${BASE_URL}/achievements`);
  
  if (!allAchievementsResponse.ok) {
    throw new Error("Failed to fetch achievements");
  }
  
  const allAchievements = (await allAchievementsResponse.json()) as { achievements: Achievement[]; total: number };
  console.log(`   ✅ Found ${allAchievements.total} achievements:`);
  
  const faucetAchievements = allAchievements.achievements.filter(a => a.category === "faucet");
  console.log(`   📋 Faucet achievements: ${faucetAchievements.length}`);
  faucetAchievements.forEach(a => {
    console.log(`      - ${a.name}: ${a.description} (${a.requirement.threshold} claims, ${a.points} pts)`);
  });
  console.log();
  
  // Step 3: Check initial user achievements (should be empty/none unlocked)
  console.log("3️⃣  Checking initial user achievements (new user)...");
  const initialAchievementsResponse = await fetch(`${BASE_URL}/achievements/me`, {
    headers: authHeaders,
  });
  
  if (!initialAchievementsResponse.ok) {
    throw new Error("Failed to fetch user achievements");
  }
  
  const initialAchievements = (await initialAchievementsResponse.json()) as { achievements: UserAchievement[] };
  const initialUnlocked = initialAchievements.achievements.filter(a => a.isUnlocked);
  console.log(`   ✅ Initially unlocked: ${initialUnlocked.length}`);
  
  if (initialUnlocked.length > 0) {
    console.log(`   ⚠️  Warning: New user already has unlocked achievements`);
  } else {
    console.log(`   ✅ Correct: New user has no unlocked achievements`);
  }
  console.log();
  
  // Step 4: Check initial stats
  console.log("4️⃣  Checking initial achievement stats...");
  const initialStatsResponse = await fetch(`${BASE_URL}/achievements/me/stats`, {
    headers: authHeaders,
  });
  
  const initialStats = (await initialStatsResponse.json()) as AchievementStats;
  console.log(`   ✅ Initial stats:`);
  console.log(`      Unlocked: ${initialStats.totalUnlocked}/${initialStats.totalAchievements}`);
  console.log(`      Points: ${initialStats.totalPoints}/${initialStats.maxPoints}`);
  console.log(`      Completion: ${initialStats.completionPercentage}%`);
  console.log();
  
  // Step 5: Make first faucet claim - should unlock "First Drops"
  console.log("5️⃣  Making first faucet claim (should unlock 'First Drops')...");
  const faucetResponse = await fetch(`${BASE_URL}/faucet/request`, {
    method: "POST",
    headers: authHeaders,
  });
  
  if (!faucetResponse.ok) {
    const error = (await faucetResponse.json()) as ErrorResponse;
    throw new Error(`Faucet request failed: ${error.message}`);
  }
  
  const faucetResult = (await faucetResponse.json()) as FaucetRequestResponse;
  console.log(`   ✅ Faucet claim successful! Amount: ${faucetResult.amount}`);
  
  if (faucetResult.newAchievements && faucetResult.newAchievements.length > 0) {
    console.log(`   🎉 NEW ACHIEVEMENTS UNLOCKED:`);
    faucetResult.newAchievements.forEach(a => {
      console.log(`      🏆 ${a.name}: ${a.description} (+${a.points} pts)`);
    });
    
    // Verify "First Drops" was unlocked
    const firstDrops = faucetResult.newAchievements.find(a => a.id === "faucet_first_claim");
    if (firstDrops) {
      console.log(`   ✅ Correct: "First Drops" achievement unlocked on first claim!`);
    } else {
      throw new Error("Expected 'First Drops' achievement to be unlocked on first claim");
    }
  } else {
    throw new Error("Expected achievement to be unlocked on first faucet claim");
  }
  console.log();
  
  // Step 6: Verify achievements were updated
  console.log("6️⃣  Verifying achievements were updated...");
  const updatedAchievementsResponse = await fetch(`${BASE_URL}/achievements/me`, {
    headers: authHeaders,
  });
  
  const updatedAchievements = (await updatedAchievementsResponse.json()) as { achievements: UserAchievement[] };
  const unlockedAfterFirst = updatedAchievements.achievements.filter(a => a.isUnlocked);
  console.log(`   ✅ Now unlocked: ${unlockedAfterFirst.length}`);
  
  unlockedAfterFirst.forEach(a => {
    console.log(`      🏆 ${a.name} (unlocked at ${a.unlockedAt})`);
  });
  
  // Verify progress on other faucet achievements
  const faucet5Claims = updatedAchievements.achievements.find(a => a.id === "faucet_5_claims");
  if (faucet5Claims) {
    console.log(`   📊 Progress on "Regular Customer": ${faucet5Claims.currentProgress}/${faucet5Claims.requirement.threshold} (${faucet5Claims.progressPercentage}%)`);
    
    if (faucet5Claims.currentProgress !== 1) {
      throw new Error(`Expected progress of 1, got ${faucet5Claims.currentProgress}`);
    }
    console.log(`   ✅ Correct: Progress tracking working`);
  }
  console.log();
  
  // Step 7: Test grouped endpoint
  console.log("7️⃣  Testing grouped progression endpoint...");
  const groupedResponse = await fetch(`${BASE_URL}/achievements/me/grouped`, {
    headers: authHeaders,
  });
  
  if (!groupedResponse.ok) {
    throw new Error("Failed to fetch grouped achievements");
  }
  
  const grouped = (await groupedResponse.json()) as { progressions: GroupedProgression[]; standalone: UserAchievement[] };
  console.log(`   ✅ Progressions: ${grouped.progressions.length}`);
  console.log(`   ✅ Standalone: ${grouped.standalone.length}`);
  
  const faucetProgression = grouped.progressions.find(p => p.progressionGroup === "faucet_claims");
  if (faucetProgression) {
    console.log(`   📊 Faucet Claims Progression:`);
    console.log(`      Current progress: ${faucetProgression.currentProgress}/${faucetProgression.maxThreshold}`);
    console.log(`      Current stage: ${faucetProgression.currentStage}/${faucetProgression.totalStages}`);
    console.log(`      Points earned: ${faucetProgression.earnedPoints}/${faucetProgression.totalPoints}`);
    console.log(`      Stages:`);
    faucetProgression.stages.forEach(s => {
      const status = s.isUnlocked ? "✅" : "⬜";
      console.log(`         ${status} ${s.name} (${s.threshold} claims) - ${s.points} pts`);
    });
    
    // Verify stage 1 is unlocked
    if (faucetProgression.currentStage !== 1) {
      throw new Error(`Expected current stage 1, got ${faucetProgression.currentStage}`);
    }
    console.log(`   ✅ Correct: Stage 1 unlocked`);
  } else {
    throw new Error("Expected faucet_claims progression group");
  }
  console.log();
  
  // Step 8: Verify stats were updated
  console.log("8️⃣  Verifying stats were updated...");
  const updatedStatsResponse = await fetch(`${BASE_URL}/achievements/me/stats`, {
    headers: authHeaders,
  });
  
  const updatedStats = (await updatedStatsResponse.json()) as AchievementStats;
  console.log(`   ✅ Updated stats:`);
  console.log(`      Unlocked: ${updatedStats.totalUnlocked}/${updatedStats.totalAchievements}`);
  console.log(`      Points: ${updatedStats.totalPoints}/${updatedStats.maxPoints}`);
  console.log(`      Completion: ${updatedStats.completionPercentage}%`);
  
  if (updatedStats.totalUnlocked !== 1) {
    throw new Error(`Expected 1 unlocked achievement, got ${updatedStats.totalUnlocked}`);
  }
  
  if (updatedStats.totalPoints !== 10) {
    throw new Error(`Expected 10 points, got ${updatedStats.totalPoints}`);
  }
  console.log(`   ✅ Correct: Stats properly updated`);
  console.log();
  
  // Step 9: Verify points endpoint
  console.log("9️⃣  Verifying points endpoint...");
  const pointsResponse = await fetch(`${BASE_URL}/achievements/me/points`, {
    headers: authHeaders,
  });
  
  const points = (await pointsResponse.json()) as { totalPoints: number };
  console.log(`   ✅ Total points: ${points.totalPoints}`);
  
  if (points.totalPoints !== 10) {
    throw new Error(`Expected 10 points, got ${points.totalPoints}`);
  }
  console.log();
  
  // Step 10: Test public profile endpoint
  console.log("🔟 Testing public profile endpoint...");
  const publicProfileResponse = await fetch(`${BASE_URL}/achievements/user/${account.address}`);
  
  if (!publicProfileResponse.ok) {
    throw new Error("Failed to fetch public profile");
  }
  
  const publicProfile = (await publicProfileResponse.json()) as {
    address: string;
    achievements: Array<{ id: string; name: string; points: number; unlockedAt: string }>;
    stats: { totalUnlocked: number; totalPoints: number; completionPercentage: number };
  };
  
  console.log(`   ✅ Public profile for ${publicProfile.address}:`);
  console.log(`      Unlocked achievements: ${publicProfile.achievements.length}`);
  console.log(`      Total points: ${publicProfile.stats.totalPoints}`);
  publicProfile.achievements.forEach(a => {
    console.log(`      🏆 ${a.name} (+${a.points} pts)`);
  });
  console.log();
  
  // Step 11: Test leaderboard
  console.log("1️⃣1️⃣ Testing leaderboard endpoint...");
  const leaderboardResponse = await fetch(`${BASE_URL}/achievements/leaderboard?limit=5`);
  
  if (!leaderboardResponse.ok) {
    throw new Error("Failed to fetch leaderboard");
  }
  
  const leaderboard = (await leaderboardResponse.json()) as {
    leaderboard: Array<{ address: string; totalPoints: number; achievementCount: number }>;
    total: number;
  };
  
  console.log(`   ✅ Leaderboard (top ${leaderboard.total}):`);
  leaderboard.leaderboard.forEach((entry, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    console.log(`      ${medal} ${entry.address.slice(0, 10)}... - ${entry.totalPoints} pts (${entry.achievementCount} achievements)`);
  });
  
  // Check if our user is on leaderboard
  const ourEntry = leaderboard.leaderboard.find(e => e.address.toLowerCase() === account.address.toLowerCase());
  if (ourEntry) {
    console.log(`   ✅ Our user is on the leaderboard!`);
  }
  console.log();
  
  // Step 12: Test category filter
  console.log("1️⃣2️⃣ Testing category filter endpoint...");
  const categoryResponse = await fetch(`${BASE_URL}/achievements/category/faucet`);
  
  if (!categoryResponse.ok) {
    throw new Error("Failed to fetch category achievements");
  }
  
  const categoryAchievements = (await categoryResponse.json()) as { achievements: Achievement[]; total: number };
  console.log(`   ✅ Faucet category achievements: ${categoryAchievements.total}`);
  categoryAchievements.achievements.forEach(a => {
    console.log(`      - ${a.name} (${a.points} pts)`);
  });
  console.log();
  
  // Step 13: Try to claim again (should be rate limited, no new achievements)
  console.log("1️⃣3️⃣ Testing rate-limited claim (should not unlock duplicate achievements)...");
  const rateLimitedResponse = await fetch(`${BASE_URL}/faucet/request`, {
    method: "POST",
    headers: authHeaders,
  });
  
  if (rateLimitedResponse.status === 429) {
    console.log(`   ✅ Correctly rate limited`);
  } else {
    console.log(`   ⚠️  Unexpected response status: ${rateLimitedResponse.status}`);
  }
  
  // Verify achievements didn't change
  const finalAchievementsResponse = await fetch(`${BASE_URL}/achievements/me`, {
    headers: authHeaders,
  });
  
  const finalAchievements = (await finalAchievementsResponse.json()) as { achievements: UserAchievement[] };
  const finalUnlocked = finalAchievements.achievements.filter(a => a.isUnlocked);
  
  if (finalUnlocked.length === unlockedAfterFirst.length) {
    console.log(`   ✅ Correct: No duplicate achievements created`);
  } else {
    throw new Error(`Achievement count changed unexpectedly: ${unlockedAfterFirst.length} -> ${finalUnlocked.length}`);
  }
  console.log();
  
  console.log("🎉 All faucet achievement tests passed!\n");
}

// Run the test
testFaucetAchievements().catch((error) => {
  console.error("❌ Test failed:", error.message);
  process.exit(1);
});
