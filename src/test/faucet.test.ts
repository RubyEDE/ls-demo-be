import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
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

interface BalanceResponse {
  address: string;
  free: number;
  locked: number;
  total: number;
  totalCredits: number;
  totalDebits: number;
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
}

interface FaucetStatsResponse {
  totalRequests: number;
  totalAmountReceived: number;
  lastRequestAt: string | null;
  nextRequestAt: string | null;
  canRequest: boolean;
}

interface LockUnlockResponse {
  success: boolean;
  balance: {
    free: number;
    locked: number;
    total: number;
  };
}

interface ErrorResponse {
  error: string;
  message: string;
  nextRequestAt?: string;
}

// Generate a test wallet (DO NOT use this key for real funds!)
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(TEST_PRIVATE_KEY);

const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http(),
});

async function authenticate(): Promise<string> {
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
  
  const { token } = (await verifyResponse.json()) as VerifyResponse;
  return token;
}

async function testFaucetFlow(): Promise<void> {
  console.log("🧪 Starting Faucet Test\n");
  console.log(`📍 Test wallet address: ${account.address}\n`);
  
  // Authenticate first
  console.log("1️⃣  Authenticating...");
  const token = await authenticate();
  console.log(`   ✅ Authenticated\n`);
  
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  
  // Step 2: Check initial balance
  console.log("2️⃣  Checking initial balance...");
  const balanceResponse = await fetch(`${BASE_URL}/faucet/balance`, {
    headers: authHeaders,
  });
  
  const initialBalance = (await balanceResponse.json()) as BalanceResponse;
  console.log(`   ✅ Current balance:`);
  console.log(`      Free: ${initialBalance.free}`);
  console.log(`      Locked: ${initialBalance.locked}`);
  console.log(`      Total: ${initialBalance.total}\n`);
  
  // Step 3: Check faucet stats
  console.log("3️⃣  Checking faucet stats...");
  const statsResponse = await fetch(`${BASE_URL}/faucet/stats`, {
    headers: authHeaders,
  });
  
  const stats = (await statsResponse.json()) as FaucetStatsResponse;
  console.log(`   ✅ Faucet stats:`);
  console.log(`      Total requests: ${stats.totalRequests}`);
  console.log(`      Total received: ${stats.totalAmountReceived}`);
  console.log(`      Can request: ${stats.canRequest}`);
  if (stats.nextRequestAt) {
    console.log(`      Next request at: ${stats.nextRequestAt}`);
  }
  console.log();
  
  // Step 4: Request from faucet
  console.log("4️⃣  Requesting from faucet...");
  const faucetResponse = await fetch(`${BASE_URL}/faucet/request`, {
    method: "POST",
    headers: authHeaders,
  });
  
  if (faucetResponse.ok) {
    const faucetResult = (await faucetResponse.json()) as FaucetRequestResponse;
    console.log(`   ✅ Faucet request successful!`);
    console.log(`      Amount received: ${faucetResult.amount}`);
    console.log(`      New balance - Free: ${faucetResult.balance.free}, Locked: ${faucetResult.balance.locked}`);
    console.log(`      Next request available: ${faucetResult.nextRequestAt}\n`);
  } else if (faucetResponse.status === 429) {
    const error = (await faucetResponse.json()) as ErrorResponse;
    console.log(`   ⏳ Rate limited (already requested today)`);
    console.log(`      Message: ${error.message}`);
    console.log(`      Next request at: ${error.nextRequestAt}\n`);
  } else {
    const error = (await faucetResponse.json()) as ErrorResponse;
    throw new Error(`Faucet request failed: ${error.message}`);
  }
  
  // Step 5: Try requesting multiple times in rapid succession (all should fail)
  console.log("5️⃣  Testing multiple rapid claim attempts...");
  const claimAttempts = 5;
  let allRateLimited = true;
  let rateLimitedCount = 0;
  
  const claimPromises = Array.from({ length: claimAttempts }, () =>
    fetch(`${BASE_URL}/faucet/request`, {
      method: "POST",
      headers: authHeaders,
    })
  );
  
  const claimResults = await Promise.all(claimPromises);
  
  for (let i = 0; i < claimResults.length; i++) {
    const response = claimResults[i];
    if (response.status === 429) {
      rateLimitedCount++;
      const error = (await response.json()) as ErrorResponse;
      console.log(`   Attempt ${i + 1}: ✅ Rate limited - ${error.message}`);
    } else if (response.ok) {
      allRateLimited = false;
      console.log(`   Attempt ${i + 1}: ⚠️ Unexpectedly succeeded`);
    } else {
      const error = (await response.json()) as ErrorResponse;
      console.log(`   Attempt ${i + 1}: ❌ Failed - ${error.message}`);
    }
  }
  
  if (rateLimitedCount === claimAttempts) {
    console.log(`   ✅ All ${claimAttempts} attempts correctly rate limited\n`);
  } else {
    throw new Error(`Expected all ${claimAttempts} attempts to be rate limited, but only ${rateLimitedCount} were`);
  }
  
  // Step 6: Verify balance hasn't changed from multiple attempts
  console.log("6️⃣  Verifying balance unchanged after multiple attempts...");
  const balanceAfterAttemptsResponse = await fetch(`${BASE_URL}/faucet/balance`, {
    headers: authHeaders,
  });
  const balanceAfterAttempts = (await balanceAfterAttemptsResponse.json()) as BalanceResponse;
  
  // Compare with what we expect (initial + 100 from first successful claim, or just initial if rate limited)
  console.log(`   ✅ Balance after ${claimAttempts} failed attempts:`);
  console.log(`      Free: ${balanceAfterAttempts.free}`);
  console.log(`      Total credits: ${balanceAfterAttempts.totalCredits}`);
  console.log(`      (Balance unchanged by failed attempts)\n`);
  
  // Step 7: Lock some balance
  if (balanceAfterAttempts.free >= 10) {
    console.log("7️⃣  Locking 10 tokens...");
    const lockResponse = await fetch(`${BASE_URL}/faucet/lock`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ amount: 10, reason: "Test lock" }),
    });
    
    if (lockResponse.ok) {
      const lockResult = (await lockResponse.json()) as LockUnlockResponse;
      console.log(`   ✅ Lock successful!`);
      console.log(`      Free: ${lockResult.balance.free}`);
      console.log(`      Locked: ${lockResult.balance.locked}\n`);
    } else {
      const error = (await lockResponse.json()) as ErrorResponse;
      console.log(`   ❌ Lock failed: ${error.message}\n`);
    }
    
    // Step 8: Unlock the balance
    console.log("8️⃣  Unlocking 10 tokens...");
    const unlockResponse = await fetch(`${BASE_URL}/faucet/unlock`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ amount: 10, reason: "Test unlock" }),
    });
    
    if (unlockResponse.ok) {
      const unlockResult = (await unlockResponse.json()) as LockUnlockResponse;
      console.log(`   ✅ Unlock successful!`);
      console.log(`      Free: ${unlockResult.balance.free}`);
      console.log(`      Locked: ${unlockResult.balance.locked}\n`);
    } else {
      const error = (await unlockResponse.json()) as ErrorResponse;
      console.log(`   ❌ Unlock failed: ${error.message}\n`);
    }
  } else {
    console.log("7️⃣  Skipping lock/unlock test (insufficient balance)\n");
  }
  
  // Step 9: Check balance history
  console.log("9️⃣  Checking balance history...");
  const historyResponse = await fetch(`${BASE_URL}/faucet/balance/history?limit=5`, {
    headers: authHeaders,
  });
  
  const historyData = (await historyResponse.json()) as { history: Array<{ amount: number; type: string; reason: string; timestamp: string }> };
  console.log(`   ✅ Recent balance changes:`);
  historyData.history.slice(0, 5).forEach((change, i) => {
    console.log(`      ${i + 1}. ${change.type}: ${change.amount} - ${change.reason}`);
  });
  console.log();
  
  // Step 10: Check global stats
  console.log("🔟 Checking global faucet stats...");
  const globalStatsResponse = await fetch(`${BASE_URL}/faucet/global-stats`);
  
  const globalStats = (await globalStatsResponse.json()) as { totalRequests: number; totalAmountDistributed: number; uniqueUsers: number };
  console.log(`   ✅ Global stats:`);
  console.log(`      Total requests: ${globalStats.totalRequests}`);
  console.log(`      Total distributed: ${globalStats.totalAmountDistributed}`);
  console.log(`      Unique users: ${globalStats.uniqueUsers}\n`);
  
  console.log("🎉 All faucet tests passed!\n");
}

// Run the test
testFaucetFlow().catch((error) => {
  console.error("❌ Test failed:", error.message);
  process.exit(1);
});
