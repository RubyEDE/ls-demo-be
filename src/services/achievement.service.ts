import { Types } from "mongoose";
import { Achievement, IAchievement } from "../models/achievement.model";
import { UserAchievement, IUserAchievement } from "../models/user-achievement.model";
import { User } from "../models/user.model";
import { Trade } from "../models/trade.model";

// Achievement definition interface for seeding
interface AchievementDefinition {
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
  isActive: boolean;
}

// Achievement definitions - these will be seeded into the database
const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  // Faucet progression achievements
  {
    id: "faucet_first_claim",
    name: "First Drops",
    description: "Claim from the faucet for the first time",
    category: "faucet",
    icon: "droplet",
    points: 10,
    isProgression: true,
    progressionGroup: "faucet_claims",
    progressionOrder: 1,
    requirement: {
      type: "faucet_claims",
      threshold: 1,
    },
    isActive: true,
  },
  {
    id: "faucet_5_claims",
    name: "Regular Customer",
    description: "Claim from the faucet 5 times",
    category: "faucet",
    icon: "droplets",
    points: 25,
    isProgression: true,
    progressionGroup: "faucet_claims",
    progressionOrder: 2,
    requirement: {
      type: "faucet_claims",
      threshold: 5,
    },
    isActive: true,
  },
  {
    id: "faucet_10_claims",
    name: "Thirsty Trader",
    description: "Claim from the faucet 10 times",
    category: "faucet",
    icon: "glass-water",
    points: 50,
    isProgression: true,
    progressionGroup: "faucet_claims",
    progressionOrder: 3,
    requirement: {
      type: "faucet_claims",
      threshold: 10,
    },
    isActive: true,
  },
  {
    id: "faucet_30_claims",
    name: "Faucet Veteran",
    description: "Claim from the faucet 30 times",
    category: "faucet",
    icon: "trophy",
    points: 100,
    isProgression: true,
    progressionGroup: "faucet_claims",
    progressionOrder: 4,
    requirement: {
      type: "faucet_claims",
      threshold: 30,
    },
    isActive: true,
  },
  // Trading achievements (standalone)
  {
    id: "first_order",
    name: "First Trade",
    description: "Place your first order",
    category: "trading",
    icon: "shopping-cart",
    points: 15,
    isProgression: false,
    requirement: {
      type: "orders_placed",
      threshold: 1,
    },
    isActive: true,
  },
  {
    id: "first_market_order",
    name: "Market Mover",
    description: "Place your first market order",
    category: "trading",
    icon: "zap",
    points: 20,
    isProgression: false,
    requirement: {
      type: "market_orders_placed",
      threshold: 1,
    },
    isActive: true,
  },
  {
    id: "first_limit_order",
    name: "Patient Trader",
    description: "Place your first limit order",
    category: "trading",
    icon: "clock",
    points: 20,
    isProgression: false,
    requirement: {
      type: "limit_orders_placed",
      threshold: 1,
    },
    isActive: true,
  },
  {
    id: "first_liquidation",
    name: "Rekt",
    description: "Get liquidated for the first time",
    category: "trading",
    icon: "skull",
    points: 10,
    isProgression: false,
    requirement: {
      type: "liquidations",
      threshold: 1,
    },
    isActive: true,
  },
  {
    id: "high_leverage_trade",
    name: "Degen Mode",
    description: "Open a position with 10x leverage",
    category: "trading",
    icon: "flame",
    points: 25,
    isProgression: false,
    requirement: {
      type: "high_leverage_trades",
      threshold: 1,
    },
    isActive: true,
  },
  {
    id: "first_profitable_close",
    name: "In the Green",
    description: "Close a position with profit",
    category: "trading",
    icon: "trending-up",
    points: 25,
    isProgression: false,
    requirement: {
      type: "profitable_closes",
      threshold: 1,
    },
    isActive: true,
  },
  {
    id: "first_losing_close",
    name: "Lesson Learned",
    description: "Close a position with a loss",
    category: "trading",
    icon: "trending-down",
    points: 10,
    isProgression: false,
    requirement: {
      type: "losing_closes",
      threshold: 1,
    },
    isActive: true,
  },
  {
    id: "zero_balance",
    name: "Back to Zero",
    description: "Lose all your funds",
    category: "trading",
    icon: "ban",
    points: 5,
    isProgression: false,
    requirement: {
      type: "zero_balance",
      threshold: 1,
    },
    isActive: true,
  },
  // Trade count progression achievements
  {
    id: "trades_10",
    name: "Getting Started",
    description: "Complete 10 trades",
    category: "trading",
    icon: "trending-up",
    points: 25,
    isProgression: true,
    progressionGroup: "trade_count",
    progressionOrder: 1,
    requirement: {
      type: "trades_executed",
      threshold: 10,
    },
    isActive: true,
  },
  {
    id: "trades_25",
    name: "Active Trader",
    description: "Complete 25 trades",
    category: "trading",
    icon: "activity",
    points: 50,
    isProgression: true,
    progressionGroup: "trade_count",
    progressionOrder: 2,
    requirement: {
      type: "trades_executed",
      threshold: 25,
    },
    isActive: true,
  },
  {
    id: "trades_50",
    name: "Seasoned Trader",
    description: "Complete 50 trades",
    category: "trading",
    icon: "bar-chart-2",
    points: 100,
    isProgression: true,
    progressionGroup: "trade_count",
    progressionOrder: 3,
    requirement: {
      type: "trades_executed",
      threshold: 50,
    },
    isActive: true,
  },
  {
    id: "trades_100",
    name: "Century Club",
    description: "Complete 100 trades",
    category: "trading",
    icon: "award",
    points: 200,
    isProgression: true,
    progressionGroup: "trade_count",
    progressionOrder: 4,
    requirement: {
      type: "trades_executed",
      threshold: 100,
    },
    isActive: true,
  },
  {
    id: "trades_500",
    name: "Trading Pro",
    description: "Complete 500 trades",
    category: "trading",
    icon: "target",
    points: 500,
    isProgression: true,
    progressionGroup: "trade_count",
    progressionOrder: 5,
    requirement: {
      type: "trades_executed",
      threshold: 500,
    },
    isActive: true,
  },
  {
    id: "trades_1000",
    name: "Market Veteran",
    description: "Complete 1,000 trades",
    category: "trading",
    icon: "shield",
    points: 1000,
    isProgression: true,
    progressionGroup: "trade_count",
    progressionOrder: 6,
    requirement: {
      type: "trades_executed",
      threshold: 1000,
    },
    isActive: true,
  },
  {
    id: "trades_10000",
    name: "Trading Legend",
    description: "Complete 10,000 trades",
    category: "trading",
    icon: "crown",
    points: 5000,
    isProgression: true,
    progressionGroup: "trade_count",
    progressionOrder: 7,
    requirement: {
      type: "trades_executed",
      threshold: 10000,
    },
    isActive: true,
  },
  // Referral progression achievements
  {
    id: "referral_1",
    name: "First Friend",
    description: "Refer your first friend",
    category: "referral",
    icon: "user-plus",
    points: 20,
    isProgression: true,
    progressionGroup: "referrals",
    progressionOrder: 1,
    requirement: {
      type: "completed_referrals",
      threshold: 1,
    },
    isActive: true,
  },
  {
    id: "referral_5",
    name: "Social Butterfly",
    description: "Refer 5 friends",
    category: "referral",
    icon: "users",
    points: 50,
    isProgression: true,
    progressionGroup: "referrals",
    progressionOrder: 2,
    requirement: {
      type: "completed_referrals",
      threshold: 5,
    },
    isActive: true,
  },
  {
    id: "referral_10",
    name: "Community Builder",
    description: "Refer 10 friends",
    category: "referral",
    icon: "users-round",
    points: 100,
    isProgression: true,
    progressionGroup: "referrals",
    progressionOrder: 3,
    requirement: {
      type: "completed_referrals",
      threshold: 10,
    },
    isActive: true,
  },
  {
    id: "referral_30",
    name: "Network King",
    description: "Refer 30 friends",
    category: "referral",
    icon: "crown",
    points: 200,
    isProgression: true,
    progressionGroup: "referrals",
    progressionOrder: 4,
    requirement: {
      type: "completed_referrals",
      threshold: 30,
    },
    isActive: true,
  },
  {
    id: "referral_50",
    name: "Viral Marketer",
    description: "Refer 50 friends",
    category: "referral",
    icon: "megaphone",
    points: 350,
    isProgression: true,
    progressionGroup: "referrals",
    progressionOrder: 5,
    requirement: {
      type: "completed_referrals",
      threshold: 50,
    },
    isActive: true,
  },
  {
    id: "referral_100",
    name: "Legendary Recruiter",
    description: "Refer 100 friends",
    category: "referral",
    icon: "star",
    points: 500,
    isProgression: true,
    progressionGroup: "referrals",
    progressionOrder: 6,
    requirement: {
      type: "completed_referrals",
      threshold: 100,
    },
    isActive: true,
  },
];

export interface AchievementUnlockResult {
  achievement: IAchievement;
  isNew: boolean;
  userAchievement: IUserAchievement;
}

export interface UserAchievementProgress {
  achievement: IAchievement;
  isUnlocked: boolean;
  unlockedAt: Date | null;
  currentProgress: number;
  progressPercentage: number;
}

export interface ProgressionStage {
  id: string;
  name: string;
  description: string;
  icon: string;
  points: number;
  threshold: number;
  order: number;
  isUnlocked: boolean;
  unlockedAt: Date | null;
}

export interface GroupedProgression {
  progressionGroup: string;
  category: string;
  currentProgress: number;
  maxThreshold: number;
  totalPoints: number;
  earnedPoints: number;
  currentStage: number;      // 0 = none unlocked, 1-4 = stage number
  totalStages: number;
  stages: ProgressionStage[];
}

/**
 * Initialize achievements - seed achievement definitions into the database
 */
export async function initializeAchievements(): Promise<void> {
  console.log("🏆 Initializing achievements...");
  
  for (const achievementDef of ACHIEVEMENT_DEFINITIONS) {
    await Achievement.findOneAndUpdate(
      { id: achievementDef.id },
      { $set: achievementDef },
      { upsert: true, new: true }
    );
  }
  
  const count = await Achievement.countDocuments({ isActive: true });
  console.log(`✅ Achievements initialized: ${count} active achievements`);
}

/**
 * Get all achievements
 */
export async function getAllAchievements(): Promise<IAchievement[]> {
  return Achievement.find({ isActive: true }).sort({ category: 1, progressionOrder: 1 });
}

/**
 * Get achievements by category
 */
export async function getAchievementsByCategory(category: string): Promise<IAchievement[]> {
  return Achievement.find({ category, isActive: true }).sort({ progressionOrder: 1 });
}

/**
 * Get a specific achievement by ID
 */
export async function getAchievementById(achievementId: string): Promise<IAchievement | null> {
  return Achievement.findOne({ id: achievementId, isActive: true });
}

/**
 * Get user's unlocked achievements
 */
export async function getUserAchievements(userId: Types.ObjectId): Promise<IUserAchievement[]> {
  return UserAchievement.find({ userId }).sort({ unlockedAt: -1 });
}

/**
 * Get user's achievements with full details
 */
export async function getUserAchievementsWithDetails(
  userId: Types.ObjectId
): Promise<UserAchievementProgress[]> {
  const [allAchievements, userAchievements] = await Promise.all([
    getAllAchievements(),
    getUserAchievements(userId),
  ]);
  
  const unlockedMap = new Map<string, IUserAchievement>();
  for (const ua of userAchievements) {
    unlockedMap.set(ua.achievementId, ua);
  }
  
  return allAchievements.map((achievement) => {
    const userAchievement = unlockedMap.get(achievement.id);
    const currentProgress = userAchievement?.currentProgress || 0;
    
    return {
      achievement,
      isUnlocked: !!userAchievement,
      unlockedAt: userAchievement?.unlockedAt || null,
      currentProgress,
      progressPercentage: Math.min(
        100,
        Math.round((currentProgress / achievement.requirement.threshold) * 100)
      ),
    };
  });
}

/**
 * Check if user has unlocked a specific achievement
 */
export async function hasAchievement(
  userId: Types.ObjectId,
  achievementId: string
): Promise<boolean> {
  const userAchievement = await UserAchievement.findOne({ userId, achievementId });
  return !!userAchievement;
}

/**
 * Unlock an achievement for a user
 */
export async function unlockAchievement(
  userId: Types.ObjectId,
  address: string,
  achievementId: string,
  currentProgress: number
): Promise<AchievementUnlockResult | null> {
  const achievement = await getAchievementById(achievementId);
  
  if (!achievement) {
    console.warn(`Achievement not found: ${achievementId}`);
    return null;
  }
  
  // Check if already unlocked
  const existing = await UserAchievement.findOne({ userId, achievementId });
  
  if (existing) {
    // Update progress but it's not a new unlock
    existing.currentProgress = currentProgress;
    await existing.save();
    return {
      achievement,
      isNew: false,
      userAchievement: existing,
    };
  }
  
  // Create new user achievement
  const userAchievement = await UserAchievement.create({
    userId,
    address: address.toLowerCase(),
    achievementId,
    unlockedAt: new Date(),
    currentProgress,
  });
  
  console.log(`🏆 Achievement unlocked: ${achievement.name} for ${address}`);
  
  return {
    achievement,
    isNew: true,
    userAchievement,
  };
}

/**
 * Check and award progression achievements based on a requirement type and current count
 * Returns newly unlocked achievements
 */
export async function checkProgressionAchievements(
  userId: Types.ObjectId,
  address: string,
  requirementType: string,
  currentCount: number
): Promise<AchievementUnlockResult[]> {
  console.log(`🔍 checkProgressionAchievements: type=${requirementType}, count=${currentCount}`);
  
  // Find all achievements that match this requirement type
  const achievements = await Achievement.find({
    "requirement.type": requirementType,
    "requirement.threshold": { $lte: currentCount },
    isActive: true,
  }).sort({ "requirement.threshold": 1 });
  
  console.log(`🔍 Found ${achievements.length} matching achievements for ${requirementType}`);
  achievements.forEach(a => console.log(`   - ${a.id}: threshold ${a.requirement.threshold}`));
  
  const newlyUnlocked: AchievementUnlockResult[] = [];
  
  for (const achievement of achievements) {
    const result = await unlockAchievement(userId, address, achievement.id, currentCount);
    
    if (result && result.isNew) {
      newlyUnlocked.push(result);
    }
  }
  
  return newlyUnlocked;
}

/**
 * Check faucet achievements for a user
 * Call this after a successful faucet claim
 */
export async function checkFaucetAchievements(
  userId: Types.ObjectId,
  address: string,
  totalFaucetClaims: number
): Promise<AchievementUnlockResult[]> {
  return checkProgressionAchievements(userId, address, "faucet_claims", totalFaucetClaims);
}

/**
 * Check referral achievements for a user
 * Call this after a successful referral completion
 */
export async function checkReferralAchievements(
  userId: Types.ObjectId,
  address: string,
  totalCompletedReferrals: number
): Promise<AchievementUnlockResult[]> {
  console.log(`🔍 Checking referral achievements for ${address} with ${totalCompletedReferrals} completed referrals`);
  const results = await checkProgressionAchievements(userId, address, "completed_referrals", totalCompletedReferrals);
  console.log(`🔍 Referral achievement check result: ${results.length} new achievements`);
  if (results.length > 0) {
    results.forEach(r => console.log(`   🏆 Unlocked: ${r.achievement.name}`));
  }
  return results;
}

/**
 * Sync achievements for a user based on their current stats
 * This can retroactively award achievements for existing progress
 */
export async function syncUserAchievements(
  userId: Types.ObjectId,
  address: string,
  stats: {
    faucetClaims?: number;
    completedReferrals?: number;
  }
): Promise<AchievementUnlockResult[]> {
  console.log(`🔄 Syncing achievements for ${address}...`);
  const allNewAchievements: AchievementUnlockResult[] = [];
  
  if (stats.faucetClaims && stats.faucetClaims > 0) {
    const faucetResults = await checkProgressionAchievements(
      userId,
      address,
      "faucet_claims",
      stats.faucetClaims
    );
    allNewAchievements.push(...faucetResults);
  }
  
  if (stats.completedReferrals && stats.completedReferrals > 0) {
    const referralResults = await checkProgressionAchievements(
      userId,
      address,
      "completed_referrals",
      stats.completedReferrals
    );
    allNewAchievements.push(...referralResults);
  }
  
  console.log(`🔄 Sync complete: ${allNewAchievements.length} achievements awarded`);
  return allNewAchievements;
}

/**
 * Check first order achievement for a user
 * Call this after a successful order placement
 * Returns the unlocked achievement if it's the user's first order
 */
export async function checkFirstOrderAchievement(
  address: string
): Promise<AchievementUnlockResult | null> {
  try {
    const normalizedAddress = address.toLowerCase();
    
    // Get the user to get their userId
    const user = await User.findOne({ address: normalizedAddress });
    if (!user) {
      console.warn(`⚠️ User not found for address ${address}`);
      return null;
    }
    
    // Check if user already has this achievement (check by userId for consistency)
    const existing = await UserAchievement.findOne({
      userId: user._id,
      achievementId: "first_order",
    });
    
    if (existing) {
      console.log(`🏆 First order achievement already unlocked for ${address}`);
      return null; // Already has achievement
    }
    
    // Get the achievement
    const achievement = await getAchievementById("first_order");
    if (!achievement) {
      console.warn(`⚠️ Achievement 'first_order' not found in database. Did you restart the server?`);
      return null;
    }
    
    // Create user achievement with the actual userId
    const userAchievement = await UserAchievement.create({
      userId: user._id,
      address: normalizedAddress,
      achievementId: "first_order",
      unlockedAt: new Date(),
      currentProgress: 1,
    });
    
    console.log(`🏆 Achievement unlocked: ${achievement.name} for ${address}`);
    
    return {
      achievement,
      isNew: true,
      userAchievement,
    };
  } catch (error) {
    console.error(`❌ Error checking first order achievement:`, error);
    return null;
  }
}

/**
 * Check first market order achievement for a user
 * Call this after a successful market order placement
 * Returns the unlocked achievement if it's the user's first market order
 */
export async function checkFirstMarketOrderAchievement(
  address: string
): Promise<AchievementUnlockResult | null> {
  try {
    const normalizedAddress = address.toLowerCase();
    
    // Get the user to get their userId
    const user = await User.findOne({ address: normalizedAddress });
    if (!user) {
      console.warn(`⚠️ User not found for address ${address}`);
      return null;
    }
    
    // Check if user already has this achievement
    const existing = await UserAchievement.findOne({
      userId: user._id,
      achievementId: "first_market_order",
    });
    
    if (existing) {
      console.log(`🏆 First market order achievement already unlocked for ${address}`);
      return null;
    }
    
    // Get the achievement
    const achievement = await getAchievementById("first_market_order");
    if (!achievement) {
      console.warn(`⚠️ Achievement 'first_market_order' not found in database. Did you restart the server?`);
      return null;
    }
    
    // Create user achievement
    const userAchievement = await UserAchievement.create({
      userId: user._id,
      address: normalizedAddress,
      achievementId: "first_market_order",
      unlockedAt: new Date(),
      currentProgress: 1,
    });
    
    console.log(`🏆 Achievement unlocked: ${achievement.name} for ${address}`);
    
    return {
      achievement,
      isNew: true,
      userAchievement,
    };
  } catch (error) {
    console.error(`❌ Error checking first market order achievement:`, error);
    return null;
  }
}

/**
 * Check first limit order achievement for a user
 * Call this after a successful limit order placement
 * Returns the unlocked achievement if it's the user's first limit order
 */
export async function checkFirstLimitOrderAchievement(
  address: string
): Promise<AchievementUnlockResult | null> {
  try {
    const normalizedAddress = address.toLowerCase();
    
    // Get the user to get their userId
    const user = await User.findOne({ address: normalizedAddress });
    if (!user) {
      console.warn(`⚠️ User not found for address ${address}`);
      return null;
    }
    
    // Check if user already has this achievement
    const existing = await UserAchievement.findOne({
      userId: user._id,
      achievementId: "first_limit_order",
    });
    
    if (existing) {
      console.log(`🏆 First limit order achievement already unlocked for ${address}`);
      return null;
    }
    
    // Get the achievement
    const achievement = await getAchievementById("first_limit_order");
    if (!achievement) {
      console.warn(`⚠️ Achievement 'first_limit_order' not found in database. Did you restart the server?`);
      return null;
    }
    
    // Create user achievement
    const userAchievement = await UserAchievement.create({
      userId: user._id,
      address: normalizedAddress,
      achievementId: "first_limit_order",
      unlockedAt: new Date(),
      currentProgress: 1,
    });
    
    console.log(`🏆 Achievement unlocked: ${achievement.name} for ${address}`);
    
    return {
      achievement,
      isNew: true,
      userAchievement,
    };
  } catch (error) {
    console.error(`❌ Error checking first limit order achievement:`, error);
    return null;
  }
}

/**
 * Check first liquidation achievement for a user
 * Call this after a user's position is liquidated
 * Returns the unlocked achievement if it's the user's first liquidation
 */
export async function checkFirstLiquidationAchievement(
  address: string
): Promise<AchievementUnlockResult | null> {
  try {
    const normalizedAddress = address.toLowerCase();
    
    // Get the user to get their userId
    const user = await User.findOne({ address: normalizedAddress });
    if (!user) {
      console.warn(`⚠️ User not found for address ${address}`);
      return null;
    }
    
    // Check if user already has this achievement
    const existing = await UserAchievement.findOne({
      userId: user._id,
      achievementId: "first_liquidation",
    });
    
    if (existing) {
      console.log(`🏆 First liquidation achievement already unlocked for ${address}`);
      return null;
    }
    
    // Get the achievement
    const achievement = await getAchievementById("first_liquidation");
    if (!achievement) {
      console.warn(`⚠️ Achievement 'first_liquidation' not found in database. Did you restart the server?`);
      return null;
    }
    
    // Create user achievement
    const userAchievement = await UserAchievement.create({
      userId: user._id,
      address: normalizedAddress,
      achievementId: "first_liquidation",
      unlockedAt: new Date(),
      currentProgress: 1,
    });
    
    console.log(`🏆 Achievement unlocked: ${achievement.name} for ${address}`);
    
    return {
      achievement,
      isNew: true,
      userAchievement,
    };
  } catch (error) {
    console.error(`❌ Error checking first liquidation achievement:`, error);
    return null;
  }
}

/**
 * Check high leverage trade achievement for a user
 * Call this when a position is opened or increased with 10x+ leverage
 * Returns the unlocked achievement if it's the user's first high leverage trade
 */
export async function checkHighLeverageAchievement(
  address: string,
  leverage: number
): Promise<AchievementUnlockResult | null> {
  // Only award if leverage is 10x or higher
  if (leverage < 10) {
    return null;
  }

  try {
    const normalizedAddress = address.toLowerCase();
    
    // Get the user to get their userId
    const user = await User.findOne({ address: normalizedAddress });
    if (!user) {
      console.warn(`⚠️ User not found for address ${address}`);
      return null;
    }
    
    // Check if user already has this achievement
    const existing = await UserAchievement.findOne({
      userId: user._id,
      achievementId: "high_leverage_trade",
    });
    
    if (existing) {
      console.log(`🏆 High leverage achievement already unlocked for ${address}`);
      return null;
    }
    
    // Get the achievement
    const achievement = await getAchievementById("high_leverage_trade");
    if (!achievement) {
      console.warn(`⚠️ Achievement 'high_leverage_trade' not found in database. Did you restart the server?`);
      return null;
    }
    
    // Create user achievement
    const userAchievement = await UserAchievement.create({
      userId: user._id,
      address: normalizedAddress,
      achievementId: "high_leverage_trade",
      unlockedAt: new Date(),
      currentProgress: 1,
    });
    
    console.log(`🏆 Achievement unlocked: ${achievement.name} for ${address} (${leverage.toFixed(1)}x leverage)`);
    
    return {
      achievement,
      isNew: true,
      userAchievement,
    };
  } catch (error) {
    console.error(`❌ Error checking high leverage achievement:`, error);
    return null;
  }
}

/**
 * Check first profitable close achievement for a user
 * Call this when a position is closed with positive realized PnL
 */
export async function checkFirstProfitableCloseAchievement(
  address: string,
  realizedPnl: number
): Promise<AchievementUnlockResult | null> {
  // Only award if profitable
  if (realizedPnl <= 0) {
    return null;
  }

  try {
    const normalizedAddress = address.toLowerCase();
    
    const user = await User.findOne({ address: normalizedAddress });
    if (!user) {
      console.warn(`⚠️ User not found for address ${address}`);
      return null;
    }
    
    const existing = await UserAchievement.findOne({
      userId: user._id,
      achievementId: "first_profitable_close",
    });
    
    if (existing) {
      return null;
    }
    
    const achievement = await getAchievementById("first_profitable_close");
    if (!achievement) {
      console.warn(`⚠️ Achievement 'first_profitable_close' not found in database`);
      return null;
    }
    
    const userAchievement = await UserAchievement.create({
      userId: user._id,
      address: normalizedAddress,
      achievementId: "first_profitable_close",
      unlockedAt: new Date(),
      currentProgress: 1,
    });
    
    console.log(`🏆 Achievement unlocked: ${achievement.name} for ${address} (+$${realizedPnl.toFixed(2)} profit)`);
    
    return {
      achievement,
      isNew: true,
      userAchievement,
    };
  } catch (error) {
    console.error(`❌ Error checking first profitable close achievement:`, error);
    return null;
  }
}

/**
 * Check first losing close achievement for a user
 * Call this when a position is closed with negative realized PnL
 */
export async function checkFirstLosingCloseAchievement(
  address: string,
  realizedPnl: number
): Promise<AchievementUnlockResult | null> {
  // Only award if losing
  if (realizedPnl >= 0) {
    return null;
  }

  try {
    const normalizedAddress = address.toLowerCase();
    
    const user = await User.findOne({ address: normalizedAddress });
    if (!user) {
      console.warn(`⚠️ User not found for address ${address}`);
      return null;
    }
    
    const existing = await UserAchievement.findOne({
      userId: user._id,
      achievementId: "first_losing_close",
    });
    
    if (existing) {
      return null;
    }
    
    const achievement = await getAchievementById("first_losing_close");
    if (!achievement) {
      console.warn(`⚠️ Achievement 'first_losing_close' not found in database`);
      return null;
    }
    
    const userAchievement = await UserAchievement.create({
      userId: user._id,
      address: normalizedAddress,
      achievementId: "first_losing_close",
      unlockedAt: new Date(),
      currentProgress: 1,
    });
    
    console.log(`🏆 Achievement unlocked: ${achievement.name} for ${address} (-$${Math.abs(realizedPnl).toFixed(2)} loss)`);
    
    return {
      achievement,
      isNew: true,
      userAchievement,
    };
  } catch (error) {
    console.error(`❌ Error checking first losing close achievement:`, error);
    return null;
  }
}

/**
 * Check zero balance achievement for a user
 * Call this when a user's balance becomes 0 (both free and locked)
 */
export async function checkZeroBalanceAchievement(
  address: string,
  free: number,
  locked: number
): Promise<AchievementUnlockResult | null> {
  // Only award if both free and locked are 0
  if (free !== 0 || locked !== 0) {
    return null;
  }

  try {
    const normalizedAddress = address.toLowerCase();
    
    const user = await User.findOne({ address: normalizedAddress });
    if (!user) {
      console.warn(`⚠️ User not found for address ${address}`);
      return null;
    }
    
    const existing = await UserAchievement.findOne({
      userId: user._id,
      achievementId: "zero_balance",
    });
    
    if (existing) {
      return null;
    }
    
    const achievement = await getAchievementById("zero_balance");
    if (!achievement) {
      console.warn(`⚠️ Achievement 'zero_balance' not found in database`);
      return null;
    }
    
    const userAchievement = await UserAchievement.create({
      userId: user._id,
      address: normalizedAddress,
      achievementId: "zero_balance",
      unlockedAt: new Date(),
      currentProgress: 1,
    });
    
    console.log(`🏆 Achievement unlocked: ${achievement.name} for ${address} (balance hit zero)`);
    
    return {
      achievement,
      isNew: true,
      userAchievement,
    };
  } catch (error) {
    console.error(`❌ Error checking zero balance achievement:`, error);
    return null;
  }
}

/**
 * Get user's total trade count
 * Counts trades where the user is either maker or taker (non-synthetic)
 */
async function getUserTradeCount(address: string): Promise<number> {
  const normalizedAddress = address.toLowerCase();
  
  const count = await Trade.countDocuments({
    $or: [
      { makerAddress: normalizedAddress, makerIsSynthetic: false },
      { takerAddress: normalizedAddress, takerIsSynthetic: false },
    ],
  });
  
  return count;
}

/**
 * Check trade count achievements for a user
 * Call this after a trade is executed
 * Returns newly unlocked achievements
 */
export async function checkTradeCountAchievements(
  address: string
): Promise<AchievementUnlockResult[]> {
  try {
    const normalizedAddress = address.toLowerCase();
    
    // Get the user to get their userId
    const user = await User.findOne({ address: normalizedAddress });
    if (!user) {
      console.warn(`⚠️ User not found for address ${address}`);
      return [];
    }
    
    // Get the user's total trade count
    const tradeCount = await getUserTradeCount(address);
    
    // Check progression achievements for trades_executed
    const newAchievements = await checkProgressionAchievements(
      user._id as Types.ObjectId,
      address,
      "trades_executed",
      tradeCount
    );
    
    if (newAchievements.length > 0) {
      console.log(`🏆 Trade count achievements unlocked for ${address}: ${newAchievements.map(a => a.achievement.name).join(', ')}`);
    }
    
    return newAchievements;
  } catch (error) {
    console.error(`❌ Error checking trade count achievements:`, error);
    return [];
  }
}

/**
 * Get user's achievements grouped by progression
 * Returns progression achievements as single items with stages
 */
export async function getUserAchievementsGrouped(
  userId: Types.ObjectId
): Promise<{ progressions: GroupedProgression[]; standalone: UserAchievementProgress[] }> {
  const [allAchievements, userAchievements] = await Promise.all([
    getAllAchievements(),
    getUserAchievements(userId),
  ]);
  
  const unlockedMap = new Map<string, IUserAchievement>();
  for (const ua of userAchievements) {
    unlockedMap.set(ua.achievementId, ua);
  }
  
  // Group achievements by progressionGroup
  const progressionGroups = new Map<string, IAchievement[]>();
  const standaloneAchievements: IAchievement[] = [];
  
  for (const achievement of allAchievements) {
    if (achievement.isProgression && achievement.progressionGroup) {
      const group = progressionGroups.get(achievement.progressionGroup) || [];
      group.push(achievement);
      progressionGroups.set(achievement.progressionGroup, group);
    } else {
      standaloneAchievements.push(achievement);
    }
  }
  
  // Build grouped progressions
  const progressions: GroupedProgression[] = [];
  
  for (const [groupId, achievements] of progressionGroups) {
    // Sort by progression order
    achievements.sort((a, b) => (a.progressionOrder || 0) - (b.progressionOrder || 0));
    
    // Get current progress from most recent unlocked achievement in group
    let currentProgress = 0;
    let currentStage = 0;
    let earnedPoints = 0;
    
    const stages: ProgressionStage[] = achievements.map((achievement, index) => {
      const userAchievement = unlockedMap.get(achievement.id);
      const isUnlocked = !!userAchievement;
      
      if (isUnlocked) {
        currentStage = index + 1;
        earnedPoints += achievement.points;
        currentProgress = userAchievement.currentProgress;
      }
      
      return {
        id: achievement.id,
        name: achievement.name,
        description: achievement.description,
        icon: achievement.icon,
        points: achievement.points,
        threshold: achievement.requirement.threshold,
        order: achievement.progressionOrder || index + 1,
        isUnlocked,
        unlockedAt: userAchievement?.unlockedAt || null,
      };
    });
    
    // If no achievement unlocked yet, get progress from last checked (stored in any unlocked achievement)
    // For display purposes, we use 0 if nothing is unlocked
    const maxThreshold = Math.max(...achievements.map(a => a.requirement.threshold));
    const totalPoints = achievements.reduce((sum, a) => sum + a.points, 0);
    
    progressions.push({
      progressionGroup: groupId,
      category: achievements[0].category,
      currentProgress,
      maxThreshold,
      totalPoints,
      earnedPoints,
      currentStage,
      totalStages: achievements.length,
      stages,
    });
  }
  
  // Build standalone achievements
  const standalone: UserAchievementProgress[] = standaloneAchievements.map((achievement) => {
    const userAchievement = unlockedMap.get(achievement.id);
    const currentProgress = userAchievement?.currentProgress || 0;
    
    return {
      achievement,
      isUnlocked: !!userAchievement,
      unlockedAt: userAchievement?.unlockedAt || null,
      currentProgress,
      progressPercentage: Math.min(
        100,
        Math.round((currentProgress / achievement.requirement.threshold) * 100)
      ),
    };
  });
  
  return { progressions, standalone };
}

/**
 * Get user's total achievement points
 */
export async function getUserAchievementPoints(userId: Types.ObjectId): Promise<number> {
  const userAchievements = await getUserAchievements(userId);
  const achievementIds = userAchievements.map((ua) => ua.achievementId);
  
  if (achievementIds.length === 0) {
    return 0;
  }
  
  const achievements = await Achievement.find({
    id: { $in: achievementIds },
    isActive: true,
  });
  
  return achievements.reduce((total, a) => total + a.points, 0);
}

/**
 * Get achievement leaderboard
 */
export async function getAchievementLeaderboard(
  limit: number = 10
): Promise<{ address: string; totalPoints: number; achievementCount: number }[]> {
  const leaderboard = await UserAchievement.aggregate([
    {
      $group: {
        _id: "$address",
        achievementIds: { $addToSet: "$achievementId" },
        achievementCount: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "achievements",
        localField: "achievementIds",
        foreignField: "id",
        as: "achievements",
      },
    },
    {
      $project: {
        address: "$_id",
        achievementCount: 1,
        totalPoints: {
          $sum: "$achievements.points",
        },
      },
    },
    { $sort: { totalPoints: -1 } },
    { $limit: limit },
  ]);
  
  return leaderboard.map((entry) => ({
    address: entry.address,
    totalPoints: entry.totalPoints,
    achievementCount: entry.achievementCount,
  }));
}

/**
 * Get user's achievement stats summary
 */
export async function getUserAchievementStats(
  userId: Types.ObjectId
): Promise<{
  totalUnlocked: number;
  totalAchievements: number;
  totalPoints: number;
  maxPoints: number;
  completionPercentage: number;
}> {
  const [userAchievements, allAchievements, totalPoints] = await Promise.all([
    getUserAchievements(userId),
    getAllAchievements(),
    getUserAchievementPoints(userId),
  ]);
  
  const maxPoints = allAchievements.reduce((total, a) => total + a.points, 0);
  
  return {
    totalUnlocked: userAchievements.length,
    totalAchievements: allAchievements.length,
    totalPoints,
    maxPoints,
    completionPercentage: Math.round((userAchievements.length / allAchievements.length) * 100),
  };
}
