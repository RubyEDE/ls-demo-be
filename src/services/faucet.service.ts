import { Types } from "mongoose";
import { FaucetRequest, IFaucetRequest } from "../models/faucet-request.model";
import { creditBalance, getOrCreateBalance } from "./balance.service";
import { IBalance } from "../models/balance.model";
import { checkFaucetAchievements, AchievementUnlockResult } from "./achievement.service";
import { completeReferral, applyReferralCode } from "./referral.service";
import { awardFaucetXP } from "./leveling.service";
import { getFaucetBonuses, FaucetBonuses } from "./talent.service";

// Faucet configuration
const BASE_FAUCET_AMOUNT = 100; // Base amount given per request
const BASE_COOLDOWN_HOURS = 24; // Base hours between requests

export interface FaucetRequestResult {
  success: boolean;
  amount?: number;
  balance?: IBalance;
  nextRequestAt?: Date;
  error?: string;
  newAchievements?: AchievementUnlockResult[];
  referralCompleted?: boolean;
  referrerRewarded?: number;
  bonusesApplied?: {
    amountMultiplier: number;
    cooldownMultiplier: number;
    claimsRemaining: number;
  };
}

export interface FaucetStats {
  totalRequests: number;
  totalAmountDistributed: number;
  lastRequestAt: Date | null;
  nextRequestAt: Date | null;
  canRequest: boolean;
  claimsRemaining: number;
  bonuses: FaucetBonuses;
  nextClaimAmount: number;
  cooldownHours: number;
}

/**
 * Get the cooldown period in milliseconds based on talent bonuses
 */
function getCooldownMs(bonuses: FaucetBonuses): number {
  return BASE_COOLDOWN_HOURS * 60 * 60 * 1000 * bonuses.cooldownMultiplier;
}

/**
 * Get the cooldown start time based on talent bonuses
 */
function getCooldownStartTime(bonuses: FaucetBonuses): Date {
  const now = new Date();
  const cooldownMs = getCooldownMs(bonuses);
  return new Date(now.getTime() - cooldownMs);
}

/**
 * Check if user can request from faucet
 * Now considers talent bonuses for cooldown and multi-claim
 */
export async function canRequestFromFaucet(
  userId: Types.ObjectId
): Promise<{ 
  canRequest: boolean; 
  nextRequestAt: Date | null; 
  lastRequest: IFaucetRequest | null;
  claimsRemaining: number;
  bonuses: FaucetBonuses;
}> {
  // Get user's talent bonuses
  const bonuses = await getFaucetBonuses(userId);
  const cooldownMs = getCooldownMs(bonuses);
  const cooldownStart = getCooldownStartTime(bonuses);
  
  // Count requests within the current cooldown period
  const requestsInPeriod = await FaucetRequest.countDocuments({
    userId,
    createdAt: { $gte: cooldownStart },
  });
  
  // Get the last request in the cooldown period
  const lastRequest = await FaucetRequest.findOne({
    userId,
    createdAt: { $gte: cooldownStart },
  }).sort({ createdAt: -1 });
  
  // Calculate claims remaining based on talent (claimsPerCooldown)
  const claimsAllowed = bonuses.claimsPerCooldown;
  const claimsRemaining = Math.max(0, claimsAllowed - requestsInPeriod);
  
  if (claimsRemaining <= 0 && lastRequest) {
    // No claims remaining, calculate when cooldown ends
    const nextRequestAt = new Date(lastRequest.createdAt.getTime() + cooldownMs);
    return { canRequest: false, nextRequestAt, lastRequest, claimsRemaining: 0, bonuses };
  }
  
  // Get last request ever for stats
  const lastRequestEver = await FaucetRequest.findOne({ userId }).sort({
    createdAt: -1,
  });
  
  return { canRequest: true, nextRequestAt: null, lastRequest: lastRequestEver, claimsRemaining, bonuses };
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
  const { canRequest, nextRequestAt, claimsRemaining, bonuses } = await canRequestFromFaucet(userId);
  
  if (!canRequest) {
    const cooldownHours = BASE_COOLDOWN_HOURS * bonuses.cooldownMultiplier;
    return {
      success: false,
      nextRequestAt: nextRequestAt!,
      error: `You can only request ${bonuses.claimsPerCooldown} time(s) every ${cooldownHours.toFixed(1)} hours`,
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
  
  // Calculate faucet amount with talent bonus
  const faucetAmount = Math.floor(BASE_FAUCET_AMOUNT * bonuses.amountMultiplier);
  
  // Credit the balance
  const creditResult = await creditBalance(
    userId,
    address,
    faucetAmount,
    bonuses.amountMultiplier > 1 
      ? `Faucet request (${Math.round((bonuses.amountMultiplier - 1) * 100)}% talent bonus)`
      : "Faucet request",
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
    amount: faucetAmount,
    ipAddress,
    userAgent,
  });
  
  // Award XP for faucet claim
  awardFaucetXP(address).catch(err => {
    console.error(`❌ Error awarding faucet XP:`, err);
  });
  
  // Calculate next available request time based on talent cooldown reduction
  const cooldownMs = getCooldownMs(bonuses);
  const newClaimsRemaining = claimsRemaining - 1;
  
  // If user has more claims available, next request is now
  // Otherwise, calculate based on reduced cooldown
  const newNextRequestAt = newClaimsRemaining > 0 
    ? new Date() // Can claim again immediately
    : new Date(Date.now() + cooldownMs);
  
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
  
  console.log(`💧 Faucet claimed by ${address}: ${faucetAmount} credits (${bonuses.amountMultiplier}x multiplier, ${newClaimsRemaining} claims remaining)`);
  
  return {
    success: true,
    amount: faucetAmount,
    balance: creditResult.balance,
    nextRequestAt: newNextRequestAt,
    newAchievements: newAchievements.length > 0 ? newAchievements : undefined,
    referralCompleted: referralCompleted || undefined,
    referrerRewarded: referrerRewarded || undefined,
    bonusesApplied: {
      amountMultiplier: bonuses.amountMultiplier,
      cooldownMultiplier: bonuses.cooldownMultiplier,
      claimsRemaining: newClaimsRemaining,
    },
  };
}

/**
 * Get faucet statistics for a user
 */
export async function getFaucetStats(userId: Types.ObjectId): Promise<FaucetStats> {
  const [totalRequests, totalAmountResult, { canRequest, nextRequestAt, lastRequest, claimsRemaining, bonuses }] =
    await Promise.all([
      FaucetRequest.countDocuments({ userId }),
      FaucetRequest.aggregate([
        { $match: { userId } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      canRequestFromFaucet(userId),
    ]);
  
  const totalAmountDistributed = totalAmountResult[0]?.total || 0;
  const nextClaimAmount = Math.floor(BASE_FAUCET_AMOUNT * bonuses.amountMultiplier);
  const cooldownHours = BASE_COOLDOWN_HOURS * bonuses.cooldownMultiplier;
  
  return {
    totalRequests,
    totalAmountDistributed,
    lastRequestAt: lastRequest?.createdAt || null,
    nextRequestAt,
    canRequest,
    claimsRemaining,
    bonuses,
    nextClaimAmount,
    cooldownHours,
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
