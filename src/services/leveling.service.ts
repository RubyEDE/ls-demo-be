import { Types } from "mongoose";
import { User, IUser } from "../models/user.model";
import { sendXPGained, sendLevelUp, XPGainedEvent, LevelUpEvent } from "./websocket.service";

// XP Configuration
// Using a polynomial curve: XP_required = BASE_XP * (level ^ EXPONENT)
const BASE_XP = 100; // XP needed for level 2
const EXPONENT = 1.5; // Growth rate (1.5 = moderate curve, 2 = steep curve)
const MAX_LEVEL = 100;

// XP rewards for various actions
export const XP_REWARDS = {
  // Trading actions
  TRADE_EXECUTED: 10, // Per trade
  POSITION_OPENED: 25, // Opening a new position
  POSITION_CLOSED_PROFIT: 50, // Closing a position with profit
  POSITION_CLOSED_LOSS: 15, // Closing a position with loss
  HIGH_LEVERAGE_TRADE: 30, // Using 10x+ leverage
  FIRST_TRADE_OF_DAY: 25, // Bonus for first trade of the day
  
  // Faucet actions
  FAUCET_CLAIM: 5, // Per faucet claim
  
  // Referral actions
  REFERRAL_COMPLETE: 100, // When someone you referred completes their first trade
  BEING_REFERRED: 50, // Bonus for signing up with a referral code
  
  // Achievement bonuses (awarded on top of achievement points)
  ACHIEVEMENT_UNLOCKED: 25, // Bonus XP when unlocking any achievement
  
  // Milestone bonuses
  DAILY_LOGIN: 10, // Daily login bonus
  WEEKLY_ACTIVE: 75, // Bonus for being active 7 days in a row
} as const;

export interface LevelInfo {
  level: number;
  experience: number;
  totalExperience: number;
  experienceForNextLevel: number;
  experienceToNextLevel: number; // How much more XP needed
  progressPercentage: number;
  isMaxLevel: boolean;
}

export interface LevelUpResult {
  previousLevel: number;
  newLevel: number;
  levelsGained: number;
  experienceGained: number;
  currentExperience: number;
  totalExperience: number;
}

export interface XPGainResult {
  experienceGained: number;
  previousExperience: number;
  currentExperience: number;
  totalExperience: number;
  levelUp: LevelUpResult | null;
}

/**
 * Calculate XP required to reach a specific level from level 1
 * Formula: Sum of XP for each level = BASE_XP * (level ^ EXPONENT)
 */
export function getExperienceForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level > MAX_LEVEL) return getExperienceForLevel(MAX_LEVEL);
  
  let totalXP = 0;
  for (let i = 2; i <= level; i++) {
    totalXP += Math.floor(BASE_XP * Math.pow(i - 1, EXPONENT));
  }
  return totalXP;
}

/**
 * Calculate XP required to go from current level to next level
 */
export function getExperienceToNextLevel(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return Math.floor(BASE_XP * Math.pow(level, EXPONENT));
}

/**
 * Calculate level from total experience
 */
export function getLevelFromExperience(totalXP: number): number {
  let level = 1;
  let xpRequired = 0;
  
  while (level < MAX_LEVEL) {
    const nextLevelXP = getExperienceToNextLevel(level);
    if (xpRequired + nextLevelXP > totalXP) break;
    xpRequired += nextLevelXP;
    level++;
  }
  
  return level;
}

/**
 * Get experience within current level (for progress bar)
 */
export function getExperienceInCurrentLevel(totalXP: number): number {
  const level = getLevelFromExperience(totalXP);
  const xpForCurrentLevel = getExperienceForLevel(level);
  return totalXP - xpForCurrentLevel;
}

/**
 * Get detailed level information for a user
 */
export async function getUserLevelInfo(address: string): Promise<LevelInfo | null> {
  const normalizedAddress = address.toLowerCase();
  const user = await User.findOne({ address: normalizedAddress });
  
  if (!user) {
    return null;
  }
  
  const level = user.level;
  const experience = user.experience;
  const totalExperience = user.totalExperience;
  const experienceForNextLevel = getExperienceToNextLevel(level);
  const isMaxLevel = level >= MAX_LEVEL;
  
  return {
    level,
    experience,
    totalExperience,
    experienceForNextLevel,
    experienceToNextLevel: isMaxLevel ? 0 : Math.max(0, experienceForNextLevel - experience),
    progressPercentage: isMaxLevel ? 100 : Math.min(100, Math.round((experience / experienceForNextLevel) * 100)),
    isMaxLevel,
  };
}

/**
 * Get level info by user ID
 */
export async function getUserLevelInfoById(userId: Types.ObjectId): Promise<LevelInfo | null> {
  const user = await User.findById(userId);
  
  if (!user) {
    return null;
  }
  
  return getUserLevelInfo(user.address);
}

/**
 * Add experience to a user and handle level ups
 */
export async function addExperience(
  address: string,
  amount: number,
  reason?: string
): Promise<XPGainResult | null> {
  if (amount <= 0) {
    return null;
  }
  
  const normalizedAddress = address.toLowerCase();
  const user = await User.findOne({ address: normalizedAddress });
  
  if (!user) {
    console.warn(`⚠️ Cannot add XP: User not found for address ${address}`);
    return null;
  }
  
  const previousLevel = user.level;
  const previousExperience = user.experience;
  const previousTotalExperience = user.totalExperience;
  
  // Add experience
  user.totalExperience += amount;
  user.experience += amount;
  
  // Check for level ups
  let levelsGained = 0;
  while (user.level < MAX_LEVEL) {
    const xpNeeded = getExperienceToNextLevel(user.level);
    if (user.experience >= xpNeeded) {
      user.experience -= xpNeeded;
      user.level++;
      levelsGained++;
    } else {
      break;
    }
  }
  
  // Cap experience at max level
  if (user.level >= MAX_LEVEL) {
    user.experience = 0;
  }
  
  await user.save();
  
  // Log the XP gain
  const reasonStr = reason ? ` (${reason})` : "";
  if (levelsGained > 0) {
    console.log(`⬆️ ${address} gained ${amount} XP${reasonStr} and leveled up! Level ${previousLevel} → ${user.level}`);
  } else {
    console.log(`✨ ${address} gained ${amount} XP${reasonStr}`);
  }
  
  const experienceForNextLevel = getExperienceToNextLevel(user.level);
  const progressPercentage = user.level >= MAX_LEVEL 
    ? 100 
    : Math.min(100, Math.round((user.experience / experienceForNextLevel) * 100));
  
  // Broadcast XP gained via WebSocket
  const xpEvent: XPGainedEvent = {
    amount,
    reason: reason || "unknown",
    currentExperience: user.experience,
    totalExperience: user.totalExperience,
    level: user.level,
    experienceForNextLevel,
    progressPercentage,
    timestamp: Date.now(),
  };
  sendXPGained(normalizedAddress, xpEvent);
  
  // Broadcast level up if it happened
  if (levelsGained > 0) {
    const levelUpEvent: LevelUpEvent = {
      previousLevel,
      newLevel: user.level,
      levelsGained,
      currentExperience: user.experience,
      totalExperience: user.totalExperience,
      experienceForNextLevel,
      timestamp: Date.now(),
    };
    sendLevelUp(normalizedAddress, levelUpEvent);
  }
  
  const levelUp: LevelUpResult | null = levelsGained > 0
    ? {
        previousLevel,
        newLevel: user.level,
        levelsGained,
        experienceGained: amount,
        currentExperience: user.experience,
        totalExperience: user.totalExperience,
      }
    : null;
  
  return {
    experienceGained: amount,
    previousExperience,
    currentExperience: user.experience,
    totalExperience: user.totalExperience,
    levelUp,
  };
}

/**
 * Add experience by user ID
 */
export async function addExperienceById(
  userId: Types.ObjectId,
  amount: number,
  reason?: string
): Promise<XPGainResult | null> {
  const user = await User.findById(userId);
  
  if (!user) {
    console.warn(`⚠️ Cannot add XP: User not found for ID ${userId}`);
    return null;
  }
  
  return addExperience(user.address, amount, reason);
}

/**
 * Check if a date is today (same calendar day)
 */
function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

/**
 * Award XP for a trade execution (limited to once per day)
 */
export async function awardTradeXP(address: string): Promise<XPGainResult | null> {
  const normalizedAddress = address.toLowerCase();
  const user = await User.findOne({ address: normalizedAddress });
  
  if (!user) {
    console.warn(`⚠️ Cannot award trade XP: User not found for address ${address}`);
    return null;
  }
  
  // Check if user already earned trade XP today
  if (user.lastTradeXPAt && isToday(user.lastTradeXPAt)) {
    // Already earned trade XP today, skip
    return null;
  }
  
  // Update last trade XP timestamp
  user.lastTradeXPAt = new Date();
  await user.save();
  
  // Award XP
  return addExperience(address, XP_REWARDS.TRADE_EXECUTED, "daily trade bonus");
}

/**
 * Award XP for opening a position
 */
export async function awardPositionOpenedXP(address: string): Promise<XPGainResult | null> {
  return addExperience(address, XP_REWARDS.POSITION_OPENED, "position opened");
}

/**
 * Award XP for closing a position
 */
export async function awardPositionClosedXP(
  address: string,
  isProfit: boolean
): Promise<XPGainResult | null> {
  const xp = isProfit ? XP_REWARDS.POSITION_CLOSED_PROFIT : XP_REWARDS.POSITION_CLOSED_LOSS;
  const reason = isProfit ? "position closed (profit)" : "position closed (loss)";
  return addExperience(address, xp, reason);
}

/**
 * Award XP for high leverage trade
 */
export async function awardHighLeverageXP(address: string, leverage: number): Promise<XPGainResult | null> {
  if (leverage < 10) return null;
  return addExperience(address, XP_REWARDS.HIGH_LEVERAGE_TRADE, `high leverage trade (${leverage.toFixed(1)}x)`);
}

/**
 * Award XP for faucet claim
 */
export async function awardFaucetXP(address: string): Promise<XPGainResult | null> {
  return addExperience(address, XP_REWARDS.FAUCET_CLAIM, "faucet claim");
}

/**
 * Award XP for completing a referral
 */
export async function awardReferralXP(referrerAddress: string): Promise<XPGainResult | null> {
  return addExperience(referrerAddress, XP_REWARDS.REFERRAL_COMPLETE, "referral completed");
}

/**
 * Award XP for being referred
 */
export async function awardReferredBonusXP(refereeAddress: string): Promise<XPGainResult | null> {
  return addExperience(refereeAddress, XP_REWARDS.BEING_REFERRED, "referral signup bonus");
}

/**
 * Award XP for unlocking an achievement
 */
export async function awardAchievementXP(address: string): Promise<XPGainResult | null> {
  return addExperience(address, XP_REWARDS.ACHIEVEMENT_UNLOCKED, "achievement unlocked");
}

/**
 * Award XP for daily login
 */
export async function awardDailyLoginXP(address: string): Promise<XPGainResult | null> {
  return addExperience(address, XP_REWARDS.DAILY_LOGIN, "daily login");
}

/**
 * Get level leaderboard
 */
export async function getLevelLeaderboard(
  limit: number = 10
): Promise<{ address: string; level: number; totalExperience: number }[]> {
  const users = await User.find({})
    .sort({ level: -1, totalExperience: -1 })
    .limit(limit)
    .select("address level totalExperience");
  
  return users.map((user) => ({
    address: user.address,
    level: user.level,
    totalExperience: user.totalExperience,
  }));
}

/**
 * Get user's rank on the level leaderboard
 */
export async function getUserLevelRank(address: string): Promise<number | null> {
  const normalizedAddress = address.toLowerCase();
  const user = await User.findOne({ address: normalizedAddress });
  
  if (!user) return null;
  
  // Count users with higher level or same level but more XP
  const rank = await User.countDocuments({
    $or: [
      { level: { $gt: user.level } },
      { level: user.level, totalExperience: { $gt: user.totalExperience } },
    ],
  });
  
  return rank + 1;
}

/**
 * Get XP thresholds for all levels (useful for displaying level requirements)
 */
export function getAllLevelThresholds(): { level: number; totalXpRequired: number; xpForLevel: number }[] {
  const thresholds: { level: number; totalXpRequired: number; xpForLevel: number }[] = [];
  
  for (let level = 1; level <= MAX_LEVEL; level++) {
    thresholds.push({
      level,
      totalXpRequired: getExperienceForLevel(level),
      xpForLevel: level === 1 ? 0 : getExperienceToNextLevel(level - 1),
    });
  }
  
  return thresholds;
}

/**
 * Reset a user's level and experience (admin only)
 */
export async function resetUserLevel(address: string): Promise<boolean> {
  const normalizedAddress = address.toLowerCase();
  const result = await User.updateOne(
    { address: normalizedAddress },
    { $set: { level: 1, experience: 0, totalExperience: 0 } }
  );
  
  if (result.modifiedCount > 0) {
    console.log(`🔄 Level reset for ${address}`);
    return true;
  }
  
  return false;
}

/**
 * Set a user's experience directly (admin only, for testing)
 */
export async function setUserExperience(
  address: string,
  totalXP: number
): Promise<XPGainResult | null> {
  const normalizedAddress = address.toLowerCase();
  const user = await User.findOne({ address: normalizedAddress });
  
  if (!user) {
    return null;
  }
  
  const previousLevel = user.level;
  const previousExperience = user.experience;
  
  // Calculate new level from total XP
  const newLevel = getLevelFromExperience(totalXP);
  const newExperience = getExperienceInCurrentLevel(totalXP);
  
  user.level = newLevel;
  user.experience = newExperience;
  user.totalExperience = totalXP;
  
  await user.save();
  
  const levelsGained = newLevel - previousLevel;
  const levelUp: LevelUpResult | null = levelsGained !== 0
    ? {
        previousLevel,
        newLevel,
        levelsGained,
        experienceGained: totalXP - (previousLevel === 1 ? 0 : getExperienceForLevel(previousLevel)) - previousExperience,
        currentExperience: newExperience,
        totalExperience: totalXP,
      }
    : null;
  
  return {
    experienceGained: totalXP - user.totalExperience,
    previousExperience,
    currentExperience: newExperience,
    totalExperience: totalXP,
    levelUp,
  };
}
