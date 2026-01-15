import { SiweMessage, generateNonce } from "siwe";
import { config } from "../config/env";
import { NonceStore } from "../types";

// In-memory nonce store - in production, use Redis or a database
const nonceStore: NonceStore = {};

// Nonce expiration time (5 minutes)
const NONCE_EXPIRATION_MS = 5 * 60 * 1000;

export function createNonce(address: string): string {
  const nonce = generateNonce();
  
  nonceStore[address.toLowerCase()] = {
    nonce,
    createdAt: Date.now(),
  };
  
  return nonce;
}

export function createSiweMessage(
  address: string,
  nonce: string,
  chainId: number = 1,
  statement: string = "Sign in to authenticate your wallet"
): string {
  const message = new SiweMessage({
    domain: config.domain,
    address,
    statement,
    uri: config.origin,
    version: "1",
    chainId,
    nonce,
    issuedAt: new Date().toISOString(),
    expirationTime: new Date(Date.now() + NONCE_EXPIRATION_MS).toISOString(),
  });
  
  return message.prepareMessage();
}

export async function verifySiweMessage(
  message: string,
  signature: string
): Promise<{ success: true; address: string; chainId: number } | { success: false; error: string }> {
  try {
    const siweMessage = new SiweMessage(message);
    
    // Verify the signature
    const { data: verifiedMessage } = await siweMessage.verify({
      signature,
      domain: config.domain,
    });
    
    const address = verifiedMessage.address.toLowerCase();
    const storedNonce = nonceStore[address];
    
    // Check if nonce exists and is valid
    if (!storedNonce) {
      return { success: false, error: "Nonce not found. Please request a new nonce." };
    }
    
    // Check if nonce matches
    if (storedNonce.nonce !== verifiedMessage.nonce) {
      return { success: false, error: "Invalid nonce." };
    }
    
    // Check if nonce has expired
    if (Date.now() - storedNonce.createdAt > NONCE_EXPIRATION_MS) {
      delete nonceStore[address];
      return { success: false, error: "Nonce expired. Please request a new nonce." };
    }
    
    // Clear the used nonce
    delete nonceStore[address];
    
    return {
      success: true,
      address: verifiedMessage.address,
      chainId: verifiedMessage.chainId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Signature verification failed";
    return { success: false, error: errorMessage };
  }
}

// Clean up expired nonces periodically
export function cleanupExpiredNonces(): void {
  const now = Date.now();
  
  for (const address in nonceStore) {
    if (now - nonceStore[address].createdAt > NONCE_EXPIRATION_MS) {
      delete nonceStore[address];
    }
  }
}

// Run cleanup every minute
setInterval(cleanupExpiredNonces, 60 * 1000);
