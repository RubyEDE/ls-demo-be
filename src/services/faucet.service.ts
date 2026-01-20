import { Types } from "mongoose";
import { FaucetRequest, IFaucetRequest } from "../models/faucet-request.model";
import { creditBalance, getOrCreateBalance } from "./balance.service";
import { IBalance } from "../models/balance.model";
import { checkFaucetAchievements, AchievementUnlockResult } from "./achievement.service";
import { completeReferral, applyReferralCode } from "./referral.service";

// Faucet configuration
const FAUCET_AMOUNT = 100; // Amount given per request
const COOLDOWN_HOURS = 24; // Hours between requests

export interface FaucetRequestResult {
  success: boolean;
  amount?: number;
  balance?: IBalance;
  nextRequestAt?: Date;
  error?: string;
  newAchievements?: AchievementUnlockResult[];
  referralCompleted?: boolean;
  referrerRewarded?: number;
}

export interface FaucetStats {
  totalRequests: number;
  totalAmountDistributed: number;
  lastRequestAt: Date | null;
  nextRequestAt: Date | null;
  canRequest: boolean;
}

/**
 * Get the start of today (for daily limit checks)
 */
function getCooldownStartTime(): Date {
  const now = new Date();
  return new Date(now.getTime() - COOLDOWN_HOURS * 60 * 60 * 1000);
}

/**
 * Check if user can request from faucet
 */
export async function canRequestFromFaucet(
  userId: Types.ObjectId
): Promise<{ canRequest: boolean; nextRequestAt: Date | null; lastRequest: IFaucetRequest | null }> {
  const cooldownStart = getCooldownStartTime();
  
  const lastRequest = await FaucetRequest.findOne({
    userId,
    createdAt: { $gte: cooldownStart },
  }).sort({ createdAt: -1 });
  
  if (lastRequest) {
    const nextRequestAt = new Date(
      lastRequest.createdAt.getTime() + COOLDOWN_HOURS * 60 * 60 * 1000
    );
    return { canRequest: false, nextRequestAt, lastRequest };
  }
  
  // Get last request ever for stats
  const lastRequestEver = await FaucetRequest.findOne({ userId }).sort({
    createdAt: -1,
  });
  
  return { canRequest: true, nextRequestAt: null, lastRequest: lastRequestEver };
}

/**
 * Request tokens from the faucet
 * @param referralCode - Optional referral code to apply on first claim
 */
export async function requestFromFaucet(
  userId: Types.ObjectId,
  address: string,
  ipAddress?: string,
  userAgent?: string,
  referralCode?: string
): Promise<FaucetRequestResult> {
  const { canRequest, nextRequestAt } = await canRequestFromFaucet(userId);
  
  if (!canRequest) {
    return {
      success: false,
      nextRequestAt: nextRequestAt!,
      error: `You can only request once every ${COOLDOWN_HOURS} hours`,
    };
  }
  
  // Check if this is the first faucet claim (before recording)
  const existingClaims = await FaucetRequest.countDocuments({ userId });
  const isFirstClaim = existingClaims === 0;
  
  // If this is the first claim and a referral code is provided, apply it first
  if (isFirstClaim && referralCode) {
    const applyResult = await applyReferralCode(userId, address, referralCode);
    if (!applyResult.success) {
      console.log(`Referral code application failed: ${applyResult.error}`);
      // Don't fail the faucet request, just log it
    } else {
      console.log(`✅ Referral code ${referralCode} applied for ${address}`);
    }
  }
  
  // Ensure balance exists
  await getOrCreateBalance(userId, address);
  
  // Credit the balance
  const creditResult = await creditBalance(
    userId,
    address,
    FAUCET_AMOUNT,
    "Faucet request",
    `faucet_${Date.now()}`
  );
  
  if (!creditResult.success) {
    return {
      success: false,
      error: creditResult.error,
    };
  }
  
  // Record the faucet request
  await FaucetRequest.create({
    userId,
    address: address.toLowerCase(),
    amount: FAUCET_AMOUNT,
    ipAddress,
    userAgent,
  });
  
  // Calculate next available request time
  const newNextRequestAt = new Date(Date.now() + COOLDOWN_HOURS * 60 * 60 * 1000);
  
  // Get total faucet claims and check for achievements
  const totalClaims = await FaucetRequest.countDocuments({ userId });
  const newAchievements = await checkFaucetAchievements(userId, address, totalClaims);
  
  // Complete referral on first faucet use (user is now considered "referred")
  let referralCompleted = false;
  let referrerRewarded = 0;
  
  if (totalClaims === 1) {
    // This is the first faucet claim - complete any pending referral
    const referralResult = await completeReferral(userId, address);
    if (referralResult.success && referralResult.rewardAmount) {
      referralCompleted = true;
      referrerRewarded = referralResult.rewardAmount;
      console.log(`🎉 Referral completed! Referrer rewarded ${referralResult.rewardAmount} credits`);
    }
  }
  
  return {
    success: true,
    amount: FAUCET_AMOUNT,
    balance: creditResult.balance,
    nextRequestAt: newNextRequestAt,
    newAchievements: newAchievements.length > 0 ? newAchievements : undefined,
    referralCompleted: referralCompleted || undefined,
    referrerRewarded: referrerRewarded || undefined,
  };
}

/**
 * Get faucet statistics for a user
 */
export async function getFaucetStats(userId: Types.ObjectId): Promise<FaucetStats> {
  const [totalRequests, totalAmountResult, { canRequest, nextRequestAt, lastRequest }] =
    await Promise.all([
      FaucetRequest.countDocuments({ userId }),
      FaucetRequest.aggregate([
        { $match: { userId } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      canRequestFromFaucet(userId),
    ]);
  
  const totalAmountDistributed = totalAmountResult[0]?.total || 0;
  
  return {
    totalRequests,
    totalAmountDistributed,
    lastRequestAt: lastRequest?.createdAt || null,
    nextRequestAt,
    canRequest,
  };
}

/**
 * Get faucet request history for a user
 */
export async function getFaucetHistory(
  userId: Types.ObjectId,
  limit: number = 50,
  offset: number = 0
): Promise<IFaucetRequest[]> {
  return FaucetRequest.find({ userId })
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit);
}

/**
 * Get global faucet statistics
 */
export async function getGlobalFaucetStats(): Promise<{
  totalRequests: number;
  totalAmountDistributed: number;
  uniqueUsers: number;
}> {
  const [totalRequests, totalAmountResult, uniqueUsers] = await Promise.all([
    FaucetRequest.countDocuments(),
    FaucetRequest.aggregate([
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    FaucetRequest.distinct("userId").then((ids) => ids.length),
  ]);
  
  return {
    totalRequests,
    totalAmountDistributed: totalAmountResult[0]?.total || 0,
    uniqueUsers,
  };
}
