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
  isNewUser?: boolean;
  userId?: string;
}

interface UserDataResponse {
  address: string;
  chainId: number;
  authenticatedAt: string;
  expiresAt: string;
  user?: {
    id: string;
    createdAt: string;
    lastLoginAt: string;
  };
}

interface ErrorResponse {
  error: string;
  message: string;
}

// Generate a test wallet (DO NOT use this key for real funds!)
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(TEST_PRIVATE_KEY);

const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http(),
});

async function testAuthFlow(): Promise<void> {
  console.log("🧪 Starting EVM Authentication Test\n");
  console.log(`📍 Test wallet address: ${account.address}\n`);

  // Step 1: Request nonce
  console.log("1️⃣  Requesting nonce...");
  const nonceResponse = await fetch(
    `${BASE_URL}/auth/nonce?address=${account.address}&chainId=1`
  );

  if (!nonceResponse.ok) {
    const error = (await nonceResponse.json()) as ErrorResponse;
    throw new Error(`Failed to get nonce: ${error.message}`);
  }

  const { nonce, message } = (await nonceResponse.json()) as NonceResponse;
  console.log(`   ✅ Received nonce: ${nonce}`);
  console.log(`   📝 Message to sign:\n${message}\n`);

  // Step 2: Sign the message
  console.log("2️⃣  Signing message with wallet...");
  const signature = await walletClient.signMessage({
    message,
  });
  console.log(`   ✅ Signature: ${signature.slice(0, 20)}...${signature.slice(-10)}\n`);

  // Step 3: Verify signature and get token
  console.log("3️⃣  Verifying signature and getting token...");
  const verifyResponse = await fetch(`${BASE_URL}/auth/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, signature }),
  });

  if (!verifyResponse.ok) {
    const error = (await verifyResponse.json()) as ErrorResponse;
    throw new Error(`Verification failed: ${error.message}`);
  }

  const { token, address, expiresAt, isNewUser, userId } = (await verifyResponse.json()) as VerifyResponse;
  console.log(`   ✅ Token received: ${token.slice(0, 30)}...`);
  console.log(`   📍 Authenticated address: ${address}`);
  console.log(`   ⏰ Token expires: ${new Date(expiresAt).toISOString()}`);
  console.log(`   👤 New user: ${isNewUser}`);
  console.log(`   🆔 User ID: ${userId}\n`);

  // Step 4: Make authenticated request
  console.log("4️⃣  Making authenticated request to /auth/me...");
  const meResponse = await fetch(`${BASE_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!meResponse.ok) {
    const error = (await meResponse.json()) as ErrorResponse;
    throw new Error(`Auth request failed: ${error.message}`);
  }

  const userData = (await meResponse.json()) as UserDataResponse;
  console.log(`   ✅ Authenticated user data:`);
  console.log(`      Address: ${userData.address}`);
  console.log(`      Chain ID: ${userData.chainId}`);
  console.log(`      Authenticated at: ${userData.authenticatedAt}`);
  console.log(`      Expires at: ${userData.expiresAt}`);
  if (userData.user) {
    console.log(`      User created at: ${userData.user.createdAt}`);
    console.log(`      Last login: ${userData.user.lastLoginAt}`);
  }
  console.log();

  // Step 5: Test unauthenticated request (should fail)
  console.log("5️⃣  Testing unauthenticated request (should fail)...");
  const unauthResponse = await fetch(`${BASE_URL}/auth/me`);
  
  if (unauthResponse.status === 401) {
    const error = (await unauthResponse.json()) as ErrorResponse;
    console.log(`   ✅ Correctly rejected: ${error.message}\n`);
  } else {
    throw new Error("Unauthenticated request should have been rejected!");
  }

  // Step 6: Test invalid token (should fail)
  console.log("6️⃣  Testing invalid token (should fail)...");
  const invalidTokenResponse = await fetch(`${BASE_URL}/auth/me`, {
    headers: {
      Authorization: "Bearer invalid-token-here",
    },
  });

  if (invalidTokenResponse.status === 401) {
    const error = (await invalidTokenResponse.json()) as ErrorResponse;
    console.log(`   ✅ Correctly rejected: ${error.message}\n`);
  } else {
    throw new Error("Invalid token should have been rejected!");
  }

  console.log("🎉 All tests passed! Authentication flow is working correctly.\n");
}

// Run the test
testAuthFlow().catch((error) => {
  console.error("❌ Test failed:", error.message);
  process.exit(1);
});
