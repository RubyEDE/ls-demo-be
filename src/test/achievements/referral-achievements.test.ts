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

interface ReferralCodeResponse {
  referralCode: string;
}

interface ApplyReferralResponse {
  success: boolean;
  referrerAddress?: string;
  error?: string;
}

interface ReferralStatsResponse {
  totalReferrals: number;
  completedReferrals: number;
  pendingReferrals: number;
  totalRewardsEarned: number;
  referralCode: string;
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

async function testReferralAchievements(): Promise<void> {
  console.log("🏆 Starting Referral Achievement Tests\n");
  
  // Step 1: Create referrer wallet
  console.log("1️⃣  Creating referrer wallet...");
  const referrer = await createAuthenticatedWallet();
  console.log(`   ✅ Referrer address: ${referrer.address}\n`);
  
  const referrerHeaders = {
    Authorization: `Bearer ${referrer.token}`,
    "Content-Type": "application/json",
  };
  
  // Step 2: Get referrer's referral code
  console.log("2️⃣  Getting referrer's referral code...");
  const codeResponse = await fetch(`${BASE_URL}/referrals/code`, {
    headers: referrerHeaders,
  });
  
  if (!codeResponse.ok) {
    throw new Error("Failed to get referral code");
  }
  
  const { referralCode } = (await codeResponse.json()) as ReferralCodeResponse;
  console.log(`   ✅ Referral code: ${referralCode}\n`);
  
  // Step 3: Check referrer's initial achievements
  console.log("3️⃣  Checking referrer's initial achievements...");
  const initialAchievementsResponse = await fetch(`${BASE_URL}/achievements/me`, {
    headers: referrerHeaders,
  });
  
  const initialAchievements = (await initialAchievementsResponse.json()) as { achievements: UserAchievement[] };
  const referralAchievements = initialAchievements.achievements.filter(a => a.category === "referral");
  const initialUnlocked = referralAchievements.filter(a => a.isUnlocked);
  console.log(`   ✅ Referral achievements: ${referralAchievements.length}`);
  console.log(`   ✅ Initially unlocked: ${initialUnlocked.length}\n`);
  
  // Step 4: Check referrer's initial stats
  console.log("4️⃣  Checking referrer's initial referral stats...");
  const initialStatsResponse = await fetch(`${BASE_URL}/referrals/stats`, {
    headers: referrerHeaders,
  });
  
  const initialStats = (await initialStatsResponse.json()) as ReferralStatsResponse;
  console.log(`   ✅ Initial stats:`);
  console.log(`      Total referrals: ${initialStats.totalReferrals}`);
  console.log(`      Completed: ${initialStats.completedReferrals}`);
  console.log(`      Pending: ${initialStats.pendingReferrals}\n`);
  
  // Step 5: Create referee wallet
  console.log("5️⃣  Creating referee wallet...");
  const referee = await createAuthenticatedWallet();
  console.log(`   ✅ Referee address: ${referee.address}\n`);
  
  const refereeHeaders = {
    Authorization: `Bearer ${referee.token}`,
    "Content-Type": "application/json",
  };
  
  // Step 6: Apply referral code
  console.log("6️⃣  Applying referral code...");
  const applyResponse = await fetch(`${BASE_URL}/referrals/apply`, {
    method: "POST",
    headers: refereeHeaders,
    body: JSON.stringify({ referralCode }),
  });
  
  if (!applyResponse.ok) {
    const error = (await applyResponse.json()) as ErrorResponse;
    throw new Error(`Failed to apply referral code: ${error.message}`);
  }
  
  const applyResult = (await applyResponse.json()) as ApplyReferralResponse;
  console.log(`   ✅ Referral applied! Referrer: ${applyResult.referrerAddress}\n`);
  
  // Step 7: Check referrer's stats (should show pending referral)
  console.log("7️⃣  Checking referrer's stats (should have pending)...");
  const pendingStatsResponse = await fetch(`${BASE_URL}/referrals/stats`, {
    headers: referrerHeaders,
  });
  
  const pendingStats = (await pendingStatsResponse.json()) as ReferralStatsResponse;
  console.log(`   ✅ Stats after referral applied:`);
  console.log(`      Total referrals: ${pendingStats.totalReferrals}`);
  console.log(`      Completed: ${pendingStats.completedReferrals}`);
  console.log(`      Pending: ${pendingStats.pendingReferrals}`);
  
  if (pendingStats.pendingReferrals !== 1) {
    throw new Error(`Expected 1 pending referral, got ${pendingStats.pendingReferrals}`);
  }
  console.log(`   ✅ Correct: 1 pending referral\n`);
  
  // Step 8: Referee uses faucet (completes referral)
  console.log("8️⃣  Referee using faucet (should complete referral)...");
  const faucetResponse = await fetch(`${BASE_URL}/faucet/request`, {
    method: "POST",
    headers: refereeHeaders,
  });
  
  if (!faucetResponse.ok) {
    const error = (await faucetResponse.json()) as ErrorResponse;
    throw new Error(`Faucet request failed: ${error.message}`);
  }
  
  const faucetResult = (await faucetResponse.json()) as FaucetRequestResponse;
  console.log(`   ✅ Faucet claim successful! Amount: ${faucetResult.amount}`);
  
  // Referee should get faucet achievement
  if (faucetResult.newAchievements && faucetResult.newAchievements.length > 0) {
    console.log(`   🎉 Referee achievements:`);
    faucetResult.newAchievements.forEach(a => {
      console.log(`      🏆 ${a.name} (+${a.points} pts)`);
    });
  }
  console.log();
  
  // Step 9: Check referrer's stats (should show completed referral)
  console.log("9️⃣  Checking referrer's stats (should have completed)...");
  const completedStatsResponse = await fetch(`${BASE_URL}/referrals/stats`, {
    headers: referrerHeaders,
  });
  
  const completedStats = (await completedStatsResponse.json()) as ReferralStatsResponse;
  console.log(`   ✅ Stats after referral completed:`);
  console.log(`      Total referrals: ${completedStats.totalReferrals}`);
  console.log(`      Completed: ${completedStats.completedReferrals}`);
  console.log(`      Pending: ${completedStats.pendingReferrals}`);
  console.log(`      Rewards earned: ${completedStats.totalRewardsEarned}`);
  
  if (completedStats.completedReferrals !== 1) {
    throw new Error(`Expected 1 completed referral, got ${completedStats.completedReferrals}`);
  }
  console.log(`   ✅ Correct: 1 completed referral\n`);
  
  // Step 10: Check referrer's achievements (should have "First Friend")
  console.log("🔟 Checking referrer's achievements (should have 'First Friend')...");
  const updatedAchievementsResponse = await fetch(`${BASE_URL}/achievements/me`, {
    headers: referrerHeaders,
  });
  
  const updatedAchievements = (await updatedAchievementsResponse.json()) as { achievements: UserAchievement[] };
  const updatedReferralAchievements = updatedAchievements.achievements.filter(a => a.category === "referral");
  const unlockedReferralAchievements = updatedReferralAchievements.filter(a => a.isUnlocked);
  
  console.log(`   ✅ Referral achievements unlocked: ${unlockedReferralAchievements.length}`);
  unlockedReferralAchievements.forEach(a => {
    console.log(`      🏆 ${a.name} (unlocked at ${a.unlockedAt})`);
  });
  
  const firstFriend = unlockedReferralAchievements.find(a => a.id === "referral_1");
  if (!firstFriend) {
    throw new Error("Expected 'First Friend' achievement to be unlocked");
  }
  console.log(`   ✅ Correct: 'First Friend' achievement unlocked!\n`);
  
  // Step 11: Check grouped progression
  console.log("1️⃣1️⃣ Checking grouped progression endpoint...");
  const groupedResponse = await fetch(`${BASE_URL}/achievements/me/grouped`, {
    headers: referrerHeaders,
  });
  
  const grouped = (await groupedResponse.json()) as { progressions: GroupedProgression[]; standalone: UserAchievement[] };
  const referralProgression = grouped.progressions.find(p => p.progressionGroup === "referrals");
  
  if (referralProgression) {
    console.log(`   📊 Referral Progression:`);
    console.log(`      Current progress: ${referralProgression.currentProgress}/${referralProgression.maxThreshold}`);
    console.log(`      Current stage: ${referralProgression.currentStage}/${referralProgression.totalStages}`);
    console.log(`      Points earned: ${referralProgression.earnedPoints}/${referralProgression.totalPoints}`);
    console.log(`      Stages:`);
    referralProgression.stages.forEach(s => {
      const status = s.isUnlocked ? "✅" : "⬜";
      console.log(`         ${status} ${s.name} (${s.threshold} referrals) - ${s.points} pts`);
    });
    
    if (referralProgression.currentStage !== 1) {
      throw new Error(`Expected current stage 1, got ${referralProgression.currentStage}`);
    }
    console.log(`   ✅ Correct: Stage 1 unlocked\n`);
  } else {
    throw new Error("Expected referrals progression group");
  }
  
  // Step 12: Check referrer's stats
  console.log("1️⃣2️⃣ Checking referrer's achievement stats...");
  const statsResponse = await fetch(`${BASE_URL}/achievements/me/stats`, {
    headers: referrerHeaders,
  });
  
  const stats = (await statsResponse.json()) as AchievementStats;
  console.log(`   ✅ Achievement stats:`);
  console.log(`      Unlocked: ${stats.totalUnlocked}/${stats.totalAchievements}`);
  console.log(`      Points: ${stats.totalPoints}/${stats.maxPoints}`);
  console.log(`      Completion: ${stats.completionPercentage}%`);
  
  // Should have at least the referral achievement (20 points)
  if (stats.totalPoints < 20) {
    throw new Error(`Expected at least 20 points from referral achievement, got ${stats.totalPoints}`);
  }
  console.log(`   ✅ Correct: Has at least 20 points from referral\n`);
  
  // Step 13: Verify progress on next referral tier
  console.log("1️⃣3️⃣ Verifying progress on next tier...");
  const referral5 = updatedReferralAchievements.find(a => a.id === "referral_5");
  if (referral5) {
    console.log(`   📊 Progress on "Social Butterfly": ${referral5.currentProgress}/${referral5.requirement.threshold} (${referral5.progressPercentage}%)`);
    
    if (referral5.currentProgress !== 1) {
      throw new Error(`Expected progress of 1, got ${referral5.currentProgress}`);
    }
    console.log(`   ✅ Correct: Progress tracking working\n`);
  }
  
  // Step 14: Test that duplicate referral doesn't give double achievement
  console.log("1️⃣4️⃣ Creating another referee to test second referral...");
  const referee2 = await createAuthenticatedWallet();
  console.log(`   ✅ Second referee address: ${referee2.address}`);
  
  const referee2Headers = {
    Authorization: `Bearer ${referee2.token}`,
    "Content-Type": "application/json",
  };
  
  // Apply referral code
  const apply2Response = await fetch(`${BASE_URL}/referrals/apply`, {
    method: "POST",
    headers: referee2Headers,
    body: JSON.stringify({ referralCode }),
  });
  
  if (!apply2Response.ok) {
    const error = (await apply2Response.json()) as ErrorResponse;
    throw new Error(`Failed to apply referral code: ${error.message}`);
  }
  console.log(`   ✅ Second referral applied`);
  
  // Use faucet to complete referral
  const faucet2Response = await fetch(`${BASE_URL}/faucet/request`, {
    method: "POST",
    headers: referee2Headers,
  });
  
  if (!faucet2Response.ok) {
    const error = (await faucet2Response.json()) as ErrorResponse;
    throw new Error(`Faucet request failed: ${error.message}`);
  }
  console.log(`   ✅ Second referee claimed faucet`);
  
  // Check referrer's referral count
  const final2StatsResponse = await fetch(`${BASE_URL}/referrals/stats`, {
    headers: referrerHeaders,
  });
  
  const final2Stats = (await final2StatsResponse.json()) as ReferralStatsResponse;
  console.log(`   ✅ Referrer now has ${final2Stats.completedReferrals} completed referrals`);
  
  if (final2Stats.completedReferrals !== 2) {
    throw new Error(`Expected 2 completed referrals, got ${final2Stats.completedReferrals}`);
  }
  
  // Verify no duplicate "First Friend" achievement
  const final2AchievementsResponse = await fetch(`${BASE_URL}/achievements/me`, {
    headers: referrerHeaders,
  });
  
  const final2Achievements = (await final2AchievementsResponse.json()) as { achievements: UserAchievement[] };
  const firstFriendCount = final2Achievements.achievements.filter(
    a => a.id === "referral_1" && a.isUnlocked
  ).length;
  
  if (firstFriendCount !== 1) {
    throw new Error(`Expected exactly 1 'First Friend' achievement, found ${firstFriendCount}`);
  }
  console.log(`   ✅ Correct: No duplicate achievement created\n`);
  
  // Step 15: Verify progress updated
  console.log("1️⃣5️⃣ Verifying progress updated after second referral...");
  const referral5After = final2Achievements.achievements.find(a => a.id === "referral_5");
  if (referral5After) {
    console.log(`   📊 Progress on "Social Butterfly": ${referral5After.currentProgress}/${referral5After.requirement.threshold} (${referral5After.progressPercentage}%)`);
    
    if (referral5After.currentProgress !== 2) {
      throw new Error(`Expected progress of 2, got ${referral5After.currentProgress}`);
    }
    console.log(`   ✅ Correct: Progress updated to 2\n`);
  }
  
  console.log("🎉 All referral achievement tests passed!\n");
}

// Run the test
testReferralAchievements().catch((error) => {
  console.error("❌ Test failed:", error.message);
  process.exit(1);
});
