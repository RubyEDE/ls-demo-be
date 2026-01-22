import { Types } from "mongoose";
import { UserTalents, IUserTalents } from "../models/talent.model";
import { User } from "../models/user.model";

// Talent tree configuration
export const TALENT_CONFIG = {
  // ==================== FAUCET TREE ====================
  // Tier 1: Faucet Amount Boost
  faucetAmountBoost: {
    id: "faucetAmountBoost",
    name: "Faucet Fortune",
    description: "Increase the amount received from the faucet by 50% per point",
    maxPoints: 3,
    bonusPerPoint: 0.5, // 50% per point
    tier: 1,
    tree: "faucet",
    requires: null,
    requiresPoints: 0,
  },
  // Tier 2: Cooldown Reduction (requires 3 points in tier 1)
  faucetCooldownReduction: {
    id: "faucetCooldownReduction",
    name: "Quick Refresh",
    description: "Reduce faucet cooldown by 30% per point",
    maxPoints: 2,
    bonusPerPoint: 0.3, // 30% reduction per point
    tier: 2,
    tree: "faucet",
    requires: "faucetAmountBoost",
    requiresPoints: 3,
  },
  // Tier 3: Double Claim (requires 2 points in tier 2)
  faucetDoubleClaim: {
    id: "faucetDoubleClaim",
    name: "Double Dip",
    description: "Claim from the faucet twice before cooldown starts",
    maxPoints: 1,
    tier: 3,
    tree: "faucet",
    requires: "faucetCooldownReduction",
    requiresPoints: 2,
  },
  // ==================== LEVERAGE TREE ====================
  // Tier 1: Small Leverage Boost (+1 per point, up to +4)
  leverageBoostSmall: {
    id: "leverageBoostSmall",
    name: "Risk Taker",
    description: "Increase maximum leverage by 1 per point (up to 14x from base 10x)",
    maxPoints: 4,
    bonusPerPoint: 1, // +1 leverage per point
    tier: 1,
    tree: "leverage",
    requires: null,
    requiresPoints: 0,
  },
  // Tier 2: Large Leverage Boost (+6, requires 4 points in tier 1)
  leverageBoostLarge: {
    id: "leverageBoostLarge",
    name: "High Roller",
    description: "Increase maximum leverage by 6 (up to 20x total)",
    maxPoints: 1,
    bonusPerPoint: 6, // +6 leverage
    tier: 2,
    tree: "leverage",
    requires: "leverageBoostSmall",
    requiresPoints: 4,
  },
  // Tier 3: Liquidation Save (requires 1 point in tier 2)
  liquidationSave: {
    id: "liquidationSave",
    name: "Second Chance",
    description: "Save one position from liquidation per day (reduces position size by 50% instead)",
    maxPoints: 1,
    tier: 3,
    tree: "leverage",
    requires: "leverageBoostLarge",
    requiresPoints: 1,
  },
} as const;

export type TalentId = keyof typeof TALENT_CONFIG;

export interface TalentInfo {
  id: TalentId;
  name: string;
  description: string;
  maxPoints: number;
  currentPoints: number;
  tier: number;
  tree: string;
  isUnlocked: boolean;
  requires: TalentId | null;
  requiresPoints: number;
  prerequisiteMet: boolean;
}

export interface TalentTreeInfo {
  faucetTree: TalentInfo[];
  leverageTree: TalentInfo[];
  totalPointsSpent: number;
  availablePoints: number;
  userLevel: number;
}

export interface AllocateTalentResult {
  success: boolean;
  error?: string;
  talents?: IUserTalents;
  newPointsSpent?: number;
}

export interface FaucetBonuses {
  amountMultiplier: number; // e.g., 2.5 means 250% of base amount
  cooldownMultiplier: number; // e.g., 0.4 means 40% of base cooldown
  claimsPerCooldown: number; // e.g., 2 means can claim twice
}

export interface LeverageBonuses {
  maxLeverageBonus: number; // Additional leverage on top of market's base (e.g., +10)
  hasLiquidationSave: boolean; // Whether user has the save talent
  liquidationSaveAvailable: boolean; // Whether save is available today
  lastLiquidationSaveAt: Date | null; // When last used
}

/**
 * Get or create talent document for a user
 */
export async function getOrCreateTalents(
  userId: Types.ObjectId,
  address: string
): Promise<IUserTalents> {
  const normalizedAddress = address.toLowerCase();

  let talents = await UserTalents.findOne({ userId });

  if (!talents) {
    talents = await UserTalents.create({
      userId,
      address: normalizedAddress,
      // Faucet tree
      faucetAmountBoost: 0,
      faucetCooldownReduction: 0,
      faucetDoubleClaim: 0,
      // Leverage tree
      leverageBoostSmall: 0,
      leverageBoostLarge: 0,
      liquidationSave: 0,
      lastLiquidationSaveAt: null,
      totalPointsSpent: 0,
    });
  }

  return talents;
}

/**
 * Get user's talent document
 */
export async function getUserTalents(
  userId: Types.ObjectId
): Promise<IUserTalents | null> {
  return UserTalents.findOne({ userId });
}

/**
 * Get user's talent document by address
 */
export async function getUserTalentsByAddress(
  address: string
): Promise<IUserTalents | null> {
  const normalizedAddress = address.toLowerCase();
  return UserTalents.findOne({ address: normalizedAddress });
}

/**
 * Calculate available talent points based on user level
 * Each level gives 1 talent point, starting from level 1
 * Level 1 = 0 points (no talents yet)
 * Level 2 = 1 point
 * Level 3 = 2 points
 * etc.
 */
export function calculateAvailablePoints(level: number, pointsSpent: number): number {
  // Users get (level - 1) total points
  const totalPoints = Math.max(0, level - 1);
  return Math.max(0, totalPoints - pointsSpent);
}

/**
 * Check if a talent is unlocked based on prerequisites
 */
export function isTalentUnlocked(
  talentId: TalentId,
  talents: IUserTalents
): boolean {
  const config = TALENT_CONFIG[talentId];

  if (!config.requires) {
    // Tier 1 talent - always unlocked
    return true;
  }

  // Check if prerequisite talent has enough points
  const prereqPoints = talents[config.requires as keyof IUserTalents] as number;
  return prereqPoints >= config.requiresPoints;
}

/**
 * Get full talent tree info for a user
 */
export async function getTalentTreeInfo(
  userId: Types.ObjectId,
  address: string
): Promise<TalentTreeInfo> {
  const [talents, user] = await Promise.all([
    getOrCreateTalents(userId, address),
    User.findById(userId),
  ]);

  const userLevel = user?.level ?? 1;
  const totalPointsSpent = talents.totalPointsSpent;
  const availablePoints = calculateAvailablePoints(userLevel, totalPointsSpent);

  const faucetTree: TalentInfo[] = [];
  const leverageTree: TalentInfo[] = [];

  Object.entries(TALENT_CONFIG).forEach(([id, config]) => {
    const talentId = id as TalentId;
    const currentPoints = talents[talentId as keyof IUserTalents] as number;
    const isUnlocked = isTalentUnlocked(talentId, talents);

    // Check if prerequisite is met (different from unlocked - unlocked means can allocate)
    let prerequisiteMet = true;
    if (config.requires) {
      const prereqPoints = talents[config.requires as keyof IUserTalents] as number;
      prerequisiteMet = prereqPoints >= config.requiresPoints;
    }

    const talentInfo: TalentInfo = {
      id: talentId,
      name: config.name,
      description: config.description,
      maxPoints: config.maxPoints,
      currentPoints,
      tier: config.tier,
      tree: config.tree,
      isUnlocked,
      requires: config.requires as TalentId | null,
      requiresPoints: config.requiresPoints,
      prerequisiteMet,
    };

    if (config.tree === "faucet") {
      faucetTree.push(talentInfo);
    } else if (config.tree === "leverage") {
      leverageTree.push(talentInfo);
    }
  });

  return {
    faucetTree,
    leverageTree,
    totalPointsSpent,
    availablePoints,
    userLevel,
  };
}

/**
 * Allocate a point to a talent
 */
export async function allocateTalentPoint(
  userId: Types.ObjectId,
  address: string,
  talentId: TalentId
): Promise<AllocateTalentResult> {
  // Validate talent exists
  const config = TALENT_CONFIG[talentId];
  if (!config) {
    return { success: false, error: "Invalid talent ID" };
  }

  // Get user and talents
  const [user, talents] = await Promise.all([
    User.findById(userId),
    getOrCreateTalents(userId, address),
  ]);

  if (!user) {
    return { success: false, error: "User not found" };
  }

  const userLevel = user.level ?? 1;
  const availablePoints = calculateAvailablePoints(userLevel, talents.totalPointsSpent);

  // Check if user has available points
  if (availablePoints <= 0) {
    return {
      success: false,
      error: `No talent points available. You have ${userLevel - 1} total points and have spent ${talents.totalPointsSpent}`,
    };
  }

  // Check if talent is unlocked (prerequisite met)
  if (!isTalentUnlocked(talentId, talents)) {
    const prereqConfig = TALENT_CONFIG[config.requires as TalentId];
    return {
      success: false,
      error: `Talent locked. Requires ${config.requiresPoints} points in ${prereqConfig?.name || config.requires}`,
    };
  }

  // Check if talent is already maxed
  const currentPoints = talents[talentId as keyof IUserTalents] as number;
  if (currentPoints >= config.maxPoints) {
    return {
      success: false,
      error: `Talent already at maximum (${config.maxPoints} points)`,
    };
  }

  // Allocate the point
  const updateField = talentId as string;
  const updatedTalents = await UserTalents.findOneAndUpdate(
    { userId },
    {
      $inc: {
        [updateField]: 1,
        totalPointsSpent: 1,
      },
    },
    { new: true }
  );

  if (!updatedTalents) {
    return { success: false, error: "Failed to update talents" };
  }

  console.log(
    `🌟 ${address} allocated 1 point to ${config.name} (now ${currentPoints + 1}/${config.maxPoints})`
  );

  return {
    success: true,
    talents: updatedTalents,
    newPointsSpent: updatedTalents.totalPointsSpent,
  };
}

/**
 * Reset all talent points for a user (admin function or for respec)
 */
export async function resetTalentPoints(
  userId: Types.ObjectId
): Promise<AllocateTalentResult> {
  const updatedTalents = await UserTalents.findOneAndUpdate(
    { userId },
    {
      $set: {
        // Faucet tree
        faucetAmountBoost: 0,
        faucetCooldownReduction: 0,
        faucetDoubleClaim: 0,
        // Leverage tree
        leverageBoostSmall: 0,
        leverageBoostLarge: 0,
        liquidationSave: 0,
        // Don't reset lastLiquidationSaveAt - that's a daily timer, not a talent point
        totalPointsSpent: 0,
      },
    },
    { new: true }
  );

  if (!updatedTalents) {
    return { success: false, error: "Talent document not found" };
  }

  console.log(`🔄 Talent points reset for user ${userId}`);

  return {
    success: true,
    talents: updatedTalents,
    newPointsSpent: 0,
  };
}

/**
 * Calculate faucet bonuses based on user's talents
 */
export async function getFaucetBonuses(userId: Types.ObjectId): Promise<FaucetBonuses> {
  const talents = await getUserTalents(userId);

  if (!talents) {
    return {
      amountMultiplier: 1,
      cooldownMultiplier: 1,
      claimsPerCooldown: 1,
    };
  }

  // Amount boost: +50% per point (3 points = 250% total = 2.5x)
  const amountBoost = talents.faucetAmountBoost * TALENT_CONFIG.faucetAmountBoost.bonusPerPoint;
  const amountMultiplier = 1 + amountBoost;

  // Cooldown reduction: -30% per point (2 points = 40% of original = 0.4x)
  const cooldownReduction =
    talents.faucetCooldownReduction * TALENT_CONFIG.faucetCooldownReduction.bonusPerPoint;
  const cooldownMultiplier = Math.max(0.1, 1 - cooldownReduction); // Min 10% of original

  // Double claim: 1 point = 2 claims per cooldown
  const claimsPerCooldown = talents.faucetDoubleClaim >= 1 ? 2 : 1;

  return {
    amountMultiplier,
    cooldownMultiplier,
    claimsPerCooldown,
  };
}

/**
 * Get faucet bonuses by address (convenience function)
 */
export async function getFaucetBonusesByAddress(address: string): Promise<FaucetBonuses> {
  const normalizedAddress = address.toLowerCase();
  const user = await User.findOne({ address: normalizedAddress });

  if (!user) {
    return {
      amountMultiplier: 1,
      cooldownMultiplier: 1,
      claimsPerCooldown: 1,
    };
  }

  return getFaucetBonuses(user._id as Types.ObjectId);
}

/**
 * Check if liquidation save is available today
 */
function isLiquidationSaveAvailableToday(lastUsed: Date | null): boolean {
  if (!lastUsed) return true;
  
  const now = new Date();
  const lastUsedDate = new Date(lastUsed);
  
  // Check if it's a different day (UTC)
  return (
    now.getUTCFullYear() !== lastUsedDate.getUTCFullYear() ||
    now.getUTCMonth() !== lastUsedDate.getUTCMonth() ||
    now.getUTCDate() !== lastUsedDate.getUTCDate()
  );
}

/**
 * Calculate leverage bonuses based on user's talents
 */
export async function getLeverageBonuses(userId: Types.ObjectId): Promise<LeverageBonuses> {
  const talents = await getUserTalents(userId);

  if (!talents) {
    return {
      maxLeverageBonus: 0,
      hasLiquidationSave: false,
      liquidationSaveAvailable: false,
      lastLiquidationSaveAt: null,
    };
  }

  // Small boost: +1 per point (max 4 points = +4 leverage)
  const smallBoost = talents.leverageBoostSmall * TALENT_CONFIG.leverageBoostSmall.bonusPerPoint;
  
  // Large boost: +6 if unlocked
  const largeBoost = talents.leverageBoostLarge * TALENT_CONFIG.leverageBoostLarge.bonusPerPoint;
  
  const maxLeverageBonus = smallBoost + largeBoost;
  
  // Liquidation save
  const hasLiquidationSave = talents.liquidationSave >= 1;
  const liquidationSaveAvailable = hasLiquidationSave && 
    isLiquidationSaveAvailableToday(talents.lastLiquidationSaveAt);

  return {
    maxLeverageBonus,
    hasLiquidationSave,
    liquidationSaveAvailable,
    lastLiquidationSaveAt: talents.lastLiquidationSaveAt,
  };
}

/**
 * Get leverage bonuses by address (convenience function)
 */
export async function getLeverageBonusesByAddress(address: string): Promise<LeverageBonuses> {
  const normalizedAddress = address.toLowerCase();
  const user = await User.findOne({ address: normalizedAddress });

  if (!user) {
    return {
      maxLeverageBonus: 0,
      hasLiquidationSave: false,
      liquidationSaveAvailable: false,
      lastLiquidationSaveAt: null,
    };
  }

  return getLeverageBonuses(user._id as Types.ObjectId);
}

/**
 * Use the liquidation save (called when a position would be liquidated)
 * Returns true if save was used successfully
 */
export async function useLiquidationSave(userId: Types.ObjectId): Promise<{
  success: boolean;
  error?: string;
}> {
  const talents = await getUserTalents(userId);

  if (!talents) {
    return { success: false, error: "User talents not found" };
  }

  if (talents.liquidationSave < 1) {
    return { success: false, error: "Liquidation save talent not unlocked" };
  }

  if (!isLiquidationSaveAvailableToday(talents.lastLiquidationSaveAt)) {
    return { success: false, error: "Liquidation save already used today" };
  }

  // Mark the save as used
  await UserTalents.updateOne(
    { userId },
    { $set: { lastLiquidationSaveAt: new Date() } }
  );

  console.log(`🛡️ Liquidation save used for user ${userId}`);

  return { success: true };
}

/**
 * Check if liquidation save can be used for a user
 */
export async function canUseLiquidationSave(userId: Types.ObjectId): Promise<boolean> {
  const bonuses = await getLeverageBonuses(userId);
  return bonuses.liquidationSaveAvailable;
}

/**
 * Get effective max leverage for a user (base + talent bonus)
 */
export async function getEffectiveMaxLeverage(
  userId: Types.ObjectId,
  baseMaxLeverage: number
): Promise<number> {
  const bonuses = await getLeverageBonuses(userId);
  return baseMaxLeverage + bonuses.maxLeverageBonus;
}

/**
 * Get effective max leverage by address
 */
export async function getEffectiveMaxLeverageByAddress(
  address: string,
  baseMaxLeverage: number
): Promise<number> {
  const normalizedAddress = address.toLowerCase();
  const user = await User.findOne({ address: normalizedAddress });

  if (!user) {
    return baseMaxLeverage;
  }

  return getEffectiveMaxLeverage(user._id as Types.ObjectId, baseMaxLeverage);
}
