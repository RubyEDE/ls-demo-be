import { Types } from "mongoose";
import { Referral, IReferral } from "../models/referral.model";
import { User, IUser, generateReferralCode } from "../models/user.model";
import { creditBalance } from "./balance.service";

// Referral configuration
const REFERRAL_REWARD_AMOUNT = 10; // Amount credited to referrer when referee uses faucet

export interface ReferralStats {
  totalReferrals: number;
  completedReferrals: number;
  pendingReferrals: number;
  totalRewardsEarned: number;
  referralCode: string;
}

export interface ReferralLeaderboardEntry {
  address: string;
  referralCode: string;
  completedReferrals: number;
  totalRewardsEarned: number;
}

export interface ApplyReferralResult {
  success: boolean;
  error?: string;
  referral?: IReferral;
}

export interface CompleteReferralResult {
  success: boolean;
  error?: string;
  referral?: IReferral;
  rewardAmount?: number;
}

/**
 * Get user's referral code (generates one if not present)
 */
export async function getUserReferralCode(userId: Types.ObjectId): Promise<string | null> {
  const user = await User.findById(userId);
  if (!user) {
    return null;
  }
  
  // If user doesn't have a referral code, generate one (handles existing users)
  if (!user.referralCode) {
    user.referralCode = generateReferralCode(user.address);
    await user.save();
  }
  
  return user.referralCode;
}

/**
 * Find user by referral code
 */
export async function findUserByReferralCode(referralCode: string): Promise<IUser | null> {
  return User.findOne({ referralCode: referralCode.toUpperCase() });
}

/**
 * Apply a referral code when a new user signs up
 * Creates a pending referral that will be completed when referee uses faucet
 */
export async function applyReferralCode(
  refereeId: Types.ObjectId,
  refereeAddress: string,
  referralCode: string
): Promise<ApplyReferralResult> {
  const normalizedCode = referralCode.toUpperCase();
  
  // Find the referrer
  const referrer = await findUserByReferralCode(normalizedCode);
  if (!referrer) {
    return { success: false, error: "Invalid referral code" };
  }
  
  // Can't refer yourself
  if (referrer._id.toString() === refereeId.toString()) {
    return { success: false, error: "You cannot refer yourself" };
  }
  
  // Check if user is already referred
  const existingReferral = await Referral.findOne({ refereeId });
  if (existingReferral) {
    return { success: false, error: "User has already been referred" };
  }
  
  // Create pending referral
  const referral = await Referral.create({
    referrerId: referrer._id,
    refereeId,
    referrerAddress: referrer.address,
    refereeAddress: refereeAddress.toLowerCase(),
    referralCode: normalizedCode,
    status: "pending",
    rewardAmount: 0,
    rewardCredited: false,
  });
  
  // Update referee's referredBy field
  await User.findByIdAndUpdate(refereeId, { referredBy: normalizedCode });
  
  return { success: true, referral };
}

/**
 * Complete a referral when referee uses the faucet for the first time
 * Credits the referrer with the reward
 */
export async function completeReferral(
  refereeId: Types.ObjectId,
  refereeAddress: string
): Promise<CompleteReferralResult> {
  // Find pending referral for this referee
  const referral = await Referral.findOne({
    refereeId,
    status: "pending",
  });
  
  if (!referral) {
    // No pending referral - this is fine, user just wasn't referred
    return { success: true };
  }
  
  // Check if referrer still exists
  const referrer = await User.findById(referral.referrerId);
  if (!referrer) {
    // Referrer no longer exists, mark as completed without reward
    referral.status = "completed";
    referral.completedAt = new Date();
    await referral.save();
    return { success: true, referral };
  }
  
  // Credit the referrer
  const creditResult = await creditBalance(
    referral.referrerId,
    referrer.address,
    REFERRAL_REWARD_AMOUNT,
    `Referral reward for ${refereeAddress.slice(0, 6)}...${refereeAddress.slice(-4)}`,
    `referral_${referral._id}`
  );
  
  if (!creditResult.success) {
    return { success: false, error: `Failed to credit referrer: ${creditResult.error}` };
  }
  
  // Update referral status
  referral.status = "completed";
  referral.rewardAmount = REFERRAL_REWARD_AMOUNT;
  referral.rewardCredited = true;
  referral.completedAt = new Date();
  await referral.save();
  
  return {
    success: true,
    referral,
    rewardAmount: REFERRAL_REWARD_AMOUNT,
  };
}

/**
 * Get referral statistics for a user
 */
export async function getReferralStats(userId: Types.ObjectId): Promise<ReferralStats | null> {
  const user = await User.findById(userId);
  if (!user) {
    return null;
  }
  
  // Ensure user has a referral code (handles existing users)
  if (!user.referralCode) {
    user.referralCode = generateReferralCode(user.address);
    await user.save();
  }
  
  const [totalReferrals, completedReferrals, rewardsResult] = await Promise.all([
    Referral.countDocuments({ referrerId: userId }),
    Referral.countDocuments({ referrerId: userId, status: "completed" }),
    Referral.aggregate([
      { $match: { referrerId: userId, rewardCredited: true } },
      { $group: { _id: null, total: { $sum: "$rewardAmount" } } },
    ]),
  ]);
  
  return {
    totalReferrals,
    completedReferrals,
    pendingReferrals: totalReferrals - completedReferrals,
    totalRewardsEarned: rewardsResult[0]?.total || 0,
    referralCode: user.referralCode,
  };
}

/**
 * Get list of referrals made by a user
 */
export async function getReferralsList(
  userId: Types.ObjectId,
  limit: number = 50,
  offset: number = 0
): Promise<IReferral[]> {
  return Referral.find({ referrerId: userId })
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit);
}

/**
 * Check if a user was referred and by whom
 */
export async function getReferredBy(userId: Types.ObjectId): Promise<{
  wasReferred: boolean;
  referrerAddress?: string;
  referralCode?: string;
  status?: string;
} | null> {
  const referral = await Referral.findOne({ refereeId: userId });
  
  if (!referral) {
    return { wasReferred: false };
  }
  
  return {
    wasReferred: true,
    referrerAddress: referral.referrerAddress,
    referralCode: referral.referralCode,
    status: referral.status,
  };
}

/**
 * Get referral leaderboard
 */
export async function getReferralLeaderboard(limit: number = 20): Promise<ReferralLeaderboardEntry[]> {
  const leaderboard = await Referral.aggregate([
    { $match: { status: "completed" } },
    {
      $group: {
        _id: "$referrerId",
        completedReferrals: { $sum: 1 },
        totalRewardsEarned: { $sum: "$rewardAmount" },
        referrerAddress: { $first: "$referrerAddress" },
      },
    },
    { $sort: { completedReferrals: -1, totalRewardsEarned: -1 } },
    { $limit: limit },
  ]);
  
  // Get referral codes for users
  const userIds = leaderboard.map((entry) => entry._id);
  const users = await User.find({ _id: { $in: userIds } });
  const userMap = new Map(users.map((u) => [u._id.toString(), u.referralCode]));
  
  return leaderboard.map((entry) => ({
    address: entry.referrerAddress,
    referralCode: userMap.get(entry._id.toString()) || "",
    completedReferrals: entry.completedReferrals,
    totalRewardsEarned: entry.totalRewardsEarned,
  }));
}

/**
 * Get global referral statistics
 */
export async function getGlobalReferralStats(): Promise<{
  totalReferrals: number;
  completedReferrals: number;
  totalRewardsDistributed: number;
  uniqueReferrers: number;
}> {
  const [totalReferrals, completedReferrals, rewardsResult, uniqueReferrers] = await Promise.all([
    Referral.countDocuments(),
    Referral.countDocuments({ status: "completed" }),
    Referral.aggregate([
      { $match: { rewardCredited: true } },
      { $group: { _id: null, total: { $sum: "$rewardAmount" } } },
    ]),
    Referral.distinct("referrerId").then((ids) => ids.length),
  ]);
  
  return {
    totalReferrals,
    completedReferrals,
    totalRewardsDistributed: rewardsResult[0]?.total || 0,
    uniqueReferrers,
  };
}

/**
 * Validate a referral code without applying it
 */
export async function validateReferralCode(referralCode: string): Promise<{
  valid: boolean;
  referrerAddress?: string;
}> {
  const referrer = await findUserByReferralCode(referralCode);
  
  if (!referrer) {
    return { valid: false };
  }
  
  return {
    valid: true,
    referrerAddress: referrer.address,
  };
}
