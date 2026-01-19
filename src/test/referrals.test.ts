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

interface ReferralCodeResponse {
  referralCode: string;
  referralLink: string;
}

interface ValidateCodeResponse {
  valid: boolean;
  referrerAddress?: string;
}

interface ApplyReferralResponse {
  success: boolean;
  message: string;
  referral: {
    status: string;
    referrerAddress: string;
  };
}

interface ReferralStats {
  totalReferrals: number;
  completedReferrals: number;
  pendingReferrals: number;
  totalRewardsEarned: number;
  referralCode: string;
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
  referral?: {
    completed: boolean;
    referrerRewarded: number;
  };
}

interface BalanceResponse {
  address: string;
  free: number;
  locked: number;
  total: number;
  totalCredits: number;
  totalDebits: number;
}

interface ErrorResponse {
  error: string;
  message: string;
}

interface ReferralListResponse {
  referrals: Array<{
    refereeAddress: string;
    status: string;
    rewardAmount: number;
    rewardCredited: boolean;
    createdAt: string;
    completedAt: string | null;
  }>;
  limit: number;
  offset: number;
}

interface ReferredByResponse {
  wasReferred: boolean;
  referrerAddress?: string;
  referralCode?: string;
  status?: string;
}

interface GlobalReferralStats {
  totalReferrals: number;
  completedReferrals: number;
  totalRewardsDistributed: number;
  uniqueReferrers: number;
}

interface LeaderboardResponse {
  leaderboard: Array<{
    address: string;
    referralCode: string;
    completedReferrals: number;
    totalRewardsEarned: number;
  }>;
}

// Test wallet utilities
function createTestWallet() {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: mainnet,
    transport: http(),
  });
  return { account, walletClient };
}

async function authenticate(
  account: ReturnType<typeof privateKeyToAccount>,
  walletClient: ReturnType<typeof createWalletClient<ReturnType<typeof http>, typeof mainnet, ReturnType<typeof privateKeyToAccount>>>
): Promise<string> {
  const nonceResponse = await fetch(
    `${BASE_URL}/auth/nonce?address=${account.address}&chainId=1`
  );
  
  if (!nonceResponse.ok) {
    throw new Error(`Failed to get nonce: ${nonceResponse.status}`);
  }
  
  const { message } = (await nonceResponse.json()) as NonceResponse;
  
  const signature = await walletClient.signMessage({ account, message });
  
  const verifyResponse = await fetch(`${BASE_URL}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  
  if (!verifyResponse.ok) {
    throw new Error(`Failed to verify: ${verifyResponse.status}`);
  }
  
  const { token } = (await verifyResponse.json()) as VerifyResponse;
  return token;
}

async function testReferralSystem(): Promise<void> {
  console.log("🔗 Starting Referral System Tests\n");
  console.log("=".repeat(60));
  
  // Create test wallets
  const referrer = createTestWallet();
  const referee1 = createTestWallet();
  const referee2 = createTestWallet();
  
  console.log(`📍 Referrer wallet: ${referrer.account.address}`);
  console.log(`📍 Referee 1 wallet: ${referee1.account.address}`);
  console.log(`📍 Referee 2 wallet: ${referee2.account.address}\n`);
  
  // ============================================
  // TEST 1: Get Referral Code
  // ============================================
  console.log("=".repeat(60));
  console.log("TEST 1: Get Referral Code");
  console.log("=".repeat(60));
  
  console.log("\n1.1 Authenticating referrer...");
  const referrerToken = await authenticate(referrer.account, referrer.walletClient);
  console.log("    ✅ Referrer authenticated\n");
  
  const referrerHeaders = {
    Authorization: `Bearer ${referrerToken}`,
    "Content-Type": "application/json",
  };
  
  console.log("1.2 Fetching referrer's referral code...");
  const codeResponse = await fetch(`${BASE_URL}/referrals/code`, {
    headers: referrerHeaders,
  });
  
  if (!codeResponse.ok) {
    const error = await codeResponse.json() as ErrorResponse;
    throw new Error(`Failed to get referral code: ${error.message}`);
  }
  
  const { referralCode, referralLink } = (await codeResponse.json()) as ReferralCodeResponse;
  
  console.log(`    ✅ Referral code: ${referralCode}`);
  console.log(`    ✅ Referral link: ${referralLink}`);
  
  if (!referralCode || referralCode.length < 8) {
    throw new Error(`Invalid referral code format: ${referralCode}`);
  }
  console.log("    ✅ TEST 1 PASSED: Referral code generated correctly\n");
  
  // ============================================
  // TEST 2: Validate Referral Code (Public)
  // ============================================
  console.log("=".repeat(60));
  console.log("TEST 2: Validate Referral Code");
  console.log("=".repeat(60));
  
  console.log("\n2.1 Validating existing code...");
  const validateResponse = await fetch(`${BASE_URL}/referrals/validate/${referralCode}`);
  const validateResult = (await validateResponse.json()) as ValidateCodeResponse;
  
  console.log(`    Valid: ${validateResult.valid}`);
  console.log(`    Referrer address: ${validateResult.referrerAddress}`);
  
  if (!validateResult.valid) {
    throw new Error("Valid referral code was marked as invalid");
  }
  console.log("    ✅ Valid code validated correctly\n");
  
  console.log("2.2 Validating non-existent code...");
  const invalidCodeResponse = await fetch(`${BASE_URL}/referrals/validate/INVALIDCODE`);
  const invalidCodeResult = (await invalidCodeResponse.json()) as ValidateCodeResponse;
  
  console.log(`    Valid: ${invalidCodeResult.valid}`);
  
  if (invalidCodeResult.valid) {
    throw new Error("Invalid code was marked as valid");
  }
  console.log("    ✅ Invalid code correctly rejected");
  console.log("    ✅ TEST 2 PASSED: Code validation works correctly\n");
  
  // ============================================
  // TEST 3: Apply Referral Code
  // ============================================
  console.log("=".repeat(60));
  console.log("TEST 3: Apply Referral Code");
  console.log("=".repeat(60));
  
  console.log("\n3.1 Authenticating referee 1...");
  const referee1Token = await authenticate(referee1.account, referee1.walletClient);
  console.log("    ✅ Referee 1 authenticated\n");
  
  const referee1Headers = {
    Authorization: `Bearer ${referee1Token}`,
    "Content-Type": "application/json",
  };
  
  console.log("3.2 Applying referral code...");
  const applyResponse = await fetch(`${BASE_URL}/referrals/apply`, {
    method: "POST",
    headers: referee1Headers,
    body: JSON.stringify({ referralCode }),
  });
  
  if (!applyResponse.ok) {
    const error = await applyResponse.json() as ErrorResponse;
    throw new Error(`Failed to apply referral code: ${error.message}`);
  }
  
  const applyResult = (await applyResponse.json()) as ApplyReferralResponse;
  console.log(`    Success: ${applyResult.success}`);
  console.log(`    Status: ${applyResult.referral.status}`);
  console.log(`    Message: ${applyResult.message}`);
  
  if (applyResult.referral.status !== "pending") {
    throw new Error(`Expected pending status, got: ${applyResult.referral.status}`);
  }
  console.log("    ✅ Referral applied with pending status\n");
  
  console.log("3.3 Attempting to apply code again (should fail)...");
  const duplicateApplyResponse = await fetch(`${BASE_URL}/referrals/apply`, {
    method: "POST",
    headers: referee1Headers,
    body: JSON.stringify({ referralCode }),
  });
  
  if (duplicateApplyResponse.ok) {
    throw new Error("Duplicate referral application should have failed");
  }
  
  const duplicateError = await duplicateApplyResponse.json() as ErrorResponse;
  console.log(`    Error: ${duplicateError.message}`);
  console.log("    ✅ Duplicate application correctly rejected\n");
  
  console.log("3.4 Testing self-referral prevention...");
  const selfReferralResponse = await fetch(`${BASE_URL}/referrals/apply`, {
    method: "POST",
    headers: referrerHeaders,
    body: JSON.stringify({ referralCode }),
  });
  
  if (selfReferralResponse.ok) {
    throw new Error("Self-referral should have been rejected");
  }
  
  const selfReferralError = await selfReferralResponse.json() as ErrorResponse;
  console.log(`    Error: ${selfReferralError.message}`);
  console.log("    ✅ Self-referral correctly rejected");
  console.log("    ✅ TEST 3 PASSED: Referral application works correctly\n");
  
  // ============================================
  // TEST 4: Referral Stats (Before Completion)
  // ============================================
  console.log("=".repeat(60));
  console.log("TEST 4: Referral Stats (Before Completion)");
  console.log("=".repeat(60));
  
  console.log("\n4.1 Checking referrer's stats (should have 1 pending)...");
  const statsResponse = await fetch(`${BASE_URL}/referrals/stats`, {
    headers: referrerHeaders,
  });
  
  const stats = (await statsResponse.json()) as ReferralStats;
  console.log(`    Total referrals: ${stats.totalReferrals}`);
  console.log(`    Completed: ${stats.completedReferrals}`);
  console.log(`    Pending: ${stats.pendingReferrals}`);
  console.log(`    Rewards earned: ${stats.totalRewardsEarned}`);
  console.log(`    Referral code: ${stats.referralCode}`);
  
  if (stats.totalReferrals !== 1 || stats.pendingReferrals !== 1 || stats.completedReferrals !== 0) {
    throw new Error(`Unexpected stats: expected 1 pending, got ${stats.pendingReferrals} pending, ${stats.completedReferrals} completed`);
  }
  console.log("    ✅ Stats correctly show 1 pending referral\n");
  
  console.log("4.2 Checking referral list...");
  const listResponse = await fetch(`${BASE_URL}/referrals/list`, {
    headers: referrerHeaders,
  });
  
  const listResult = (await listResponse.json()) as ReferralListResponse;
  console.log(`    Found ${listResult.referrals.length} referral(s)`);
  
  if (listResult.referrals.length !== 1) {
    throw new Error(`Expected 1 referral, got ${listResult.referrals.length}`);
  }
  
  const pendingReferral = listResult.referrals[0];
  console.log(`    - Status: ${pendingReferral.status}`);
  console.log(`    - Reward credited: ${pendingReferral.rewardCredited}`);
  
  if (pendingReferral.status !== "pending" || pendingReferral.rewardCredited) {
    throw new Error("Referral should be pending with no reward credited");
  }
  console.log("    ✅ TEST 4 PASSED: Stats correctly track pending referral\n");
  
  // ============================================
  // TEST 5: Complete Referral via Faucet
  // ============================================
  console.log("=".repeat(60));
  console.log("TEST 5: Complete Referral via Faucet");
  console.log("=".repeat(60));
  
  console.log("\n5.1 Checking referrer's initial balance...");
  const initialBalanceResponse = await fetch(`${BASE_URL}/faucet/balance`, {
    headers: referrerHeaders,
  });
  
  const initialBalance = (await initialBalanceResponse.json()) as BalanceResponse;
  console.log(`    Initial balance: ${initialBalance.free} (free) + ${initialBalance.locked} (locked) = ${initialBalance.total}\n`);
  
  console.log("5.2 Referee uses faucet (should complete referral)...");
  const faucetResponse = await fetch(`${BASE_URL}/faucet/request`, {
    method: "POST",
    headers: referee1Headers,
  });
  
  if (!faucetResponse.ok) {
    const error = await faucetResponse.json() as ErrorResponse;
    throw new Error(`Faucet request failed: ${error.message}`);
  }
  
  const faucetResult = (await faucetResponse.json()) as FaucetRequestResponse;
  console.log(`    Faucet amount: ${faucetResult.amount}`);
  console.log(`    Referral info: ${JSON.stringify(faucetResult.referral)}`);
  
  if (!faucetResult.referral?.completed) {
    throw new Error("Referral should have been completed on faucet use");
  }
  
  if (faucetResult.referral.referrerRewarded !== 10) {
    throw new Error(`Expected 10 referral reward, got ${faucetResult.referral.referrerRewarded}`);
  }
  console.log("    ✅ Referral completed! Referrer rewarded 10 credits\n");
  
  console.log("5.3 Checking referrer's balance after referral completion...");
  const finalBalanceResponse = await fetch(`${BASE_URL}/faucet/balance`, {
    headers: referrerHeaders,
  });
  
  const finalBalance = (await finalBalanceResponse.json()) as BalanceResponse;
  console.log(`    Final balance: ${finalBalance.free} (free) + ${finalBalance.locked} (locked) = ${finalBalance.total}`);
  
  const expectedBalance = initialBalance.free + 10; // Referral reward
  if (finalBalance.free !== expectedBalance) {
    throw new Error(`Expected balance ${expectedBalance}, got ${finalBalance.free}`);
  }
  console.log(`    ✅ Referrer received 10 credit bonus!`);
  console.log("    ✅ TEST 5 PASSED: Referral completed via faucet\n");
  
  // ============================================
  // TEST 6: Referral Stats (After Completion)
  // ============================================
  console.log("=".repeat(60));
  console.log("TEST 6: Referral Stats (After Completion)");
  console.log("=".repeat(60));
  
  console.log("\n6.1 Checking referrer's stats (should have 1 completed)...");
  const finalStatsResponse = await fetch(`${BASE_URL}/referrals/stats`, {
    headers: referrerHeaders,
  });
  
  const finalStats = (await finalStatsResponse.json()) as ReferralStats;
  console.log(`    Total referrals: ${finalStats.totalReferrals}`);
  console.log(`    Completed: ${finalStats.completedReferrals}`);
  console.log(`    Pending: ${finalStats.pendingReferrals}`);
  console.log(`    Rewards earned: ${finalStats.totalRewardsEarned}`);
  
  if (finalStats.completedReferrals !== 1 || finalStats.pendingReferrals !== 0 || finalStats.totalRewardsEarned !== 10) {
    throw new Error(`Unexpected stats: expected 1 completed with 10 rewards, got ${finalStats.completedReferrals} completed with ${finalStats.totalRewardsEarned} rewards`);
  }
  console.log("    ✅ Stats correctly updated to completed\n");
  
  console.log("6.2 Checking referral list (should show completed)...");
  const finalListResponse = await fetch(`${BASE_URL}/referrals/list`, {
    headers: referrerHeaders,
  });
  
  const finalListResult = (await finalListResponse.json()) as ReferralListResponse;
  const completedReferral = finalListResult.referrals[0];
  
  console.log(`    - Status: ${completedReferral.status}`);
  console.log(`    - Reward amount: ${completedReferral.rewardAmount}`);
  console.log(`    - Reward credited: ${completedReferral.rewardCredited}`);
  console.log(`    - Completed at: ${completedReferral.completedAt}`);
  
  if (completedReferral.status !== "completed" || !completedReferral.rewardCredited || completedReferral.rewardAmount !== 10) {
    throw new Error("Referral should be completed with reward credited");
  }
  console.log("    ✅ TEST 6 PASSED: Stats correctly track completed referral\n");
  
  // ============================================
  // TEST 7: Check Referred By (Referee's View)
  // ============================================
  console.log("=".repeat(60));
  console.log("TEST 7: Check Referred By (Referee's View)");
  console.log("=".repeat(60));
  
  console.log("\n7.1 Checking who referred the referee...");
  const referredByResponse = await fetch(`${BASE_URL}/referrals/referred-by`, {
    headers: referee1Headers,
  });
  
  const referredByResult = (await referredByResponse.json()) as ReferredByResponse;
  console.log(`    Was referred: ${referredByResult.wasReferred}`);
  console.log(`    Referrer address: ${referredByResult.referrerAddress}`);
  console.log(`    Referral code: ${referredByResult.referralCode}`);
  console.log(`    Status: ${referredByResult.status}`);
  
  if (!referredByResult.wasReferred || referredByResult.status !== "completed") {
    throw new Error("Referee should show as referred with completed status");
  }
  console.log("    ✅ TEST 7 PASSED: Referee can see referral info\n");
  
  // ============================================
  // TEST 8: Multiple Referrals
  // ============================================
  console.log("=".repeat(60));
  console.log("TEST 8: Multiple Referrals");
  console.log("=".repeat(60));
  
  console.log("\n8.1 Authenticating referee 2...");
  const referee2Token = await authenticate(referee2.account, referee2.walletClient);
  console.log("    ✅ Referee 2 authenticated\n");
  
  const referee2Headers = {
    Authorization: `Bearer ${referee2Token}`,
    "Content-Type": "application/json",
  };
  
  console.log("8.2 Applying referral code for referee 2...");
  const apply2Response = await fetch(`${BASE_URL}/referrals/apply`, {
    method: "POST",
    headers: referee2Headers,
    body: JSON.stringify({ referralCode }),
  });
  
  if (!apply2Response.ok) {
    const error = await apply2Response.json() as ErrorResponse;
    throw new Error(`Failed to apply referral for referee 2: ${error.message}`);
  }
  console.log("    ✅ Referral code applied\n");
  
  console.log("8.3 Checking referrer stats (should have 2 total, 1 pending)...");
  const multiStatsResponse = await fetch(`${BASE_URL}/referrals/stats`, {
    headers: referrerHeaders,
  });
  
  const multiStats = (await multiStatsResponse.json()) as ReferralStats;
  console.log(`    Total: ${multiStats.totalReferrals}, Completed: ${multiStats.completedReferrals}, Pending: ${multiStats.pendingReferrals}`);
  
  if (multiStats.totalReferrals !== 2 || multiStats.completedReferrals !== 1 || multiStats.pendingReferrals !== 1) {
    throw new Error(`Expected 2 total, 1 completed, 1 pending`);
  }
  console.log("    ✅ TEST 8 PASSED: Multiple referrals tracked correctly\n");
  
  // ============================================
  // TEST 9: Global Stats & Leaderboard
  // ============================================
  console.log("=".repeat(60));
  console.log("TEST 9: Global Stats & Leaderboard");
  console.log("=".repeat(60));
  
  console.log("\n9.1 Checking global referral stats...");
  const globalStatsResponse = await fetch(`${BASE_URL}/referrals/global-stats`);
  const globalStats = (await globalStatsResponse.json()) as GlobalReferralStats;
  
  console.log(`    Total referrals: ${globalStats.totalReferrals}`);
  console.log(`    Completed: ${globalStats.completedReferrals}`);
  console.log(`    Rewards distributed: ${globalStats.totalRewardsDistributed}`);
  console.log(`    Unique referrers: ${globalStats.uniqueReferrers}`);
  
  if (globalStats.completedReferrals < 1 || globalStats.totalRewardsDistributed < 10) {
    throw new Error("Global stats should reflect at least 1 completed referral");
  }
  console.log("    ✅ Global stats accessible\n");
  
  console.log("9.2 Checking referral leaderboard...");
  const leaderboardResponse = await fetch(`${BASE_URL}/referrals/leaderboard`);
  const leaderboard = (await leaderboardResponse.json()) as LeaderboardResponse;
  
  console.log(`    Leaderboard entries: ${leaderboard.leaderboard.length}`);
  
  if (leaderboard.leaderboard.length > 0) {
    const topReferrer = leaderboard.leaderboard[0];
    console.log(`    Top referrer: ${topReferrer.address} with ${topReferrer.completedReferrals} referrals`);
  }
  console.log("    ✅ TEST 9 PASSED: Global stats and leaderboard working\n");
  
  // ============================================
  // SUMMARY
  // ============================================
  console.log("=".repeat(60));
  console.log("🎉 ALL TESTS PASSED!");
  console.log("=".repeat(60));
  console.log(`
Summary:
  ✅ TEST 1: Referral code generation
  ✅ TEST 2: Code validation (public)
  ✅ TEST 3: Apply referral code
  ✅ TEST 4: Stats before completion
  ✅ TEST 5: Complete referral via faucet
  ✅ TEST 6: Stats after completion
  ✅ TEST 7: Referee's view (referred-by)
  ✅ TEST 8: Multiple referrals
  ✅ TEST 9: Global stats & leaderboard
  `);
}

// Run tests
testReferralSystem()
  .then(() => {
    console.log("Tests completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ TEST FAILED:", error.message);
    console.error(error);
    process.exit(1);
  });
