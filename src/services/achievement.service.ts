import { Types } from "mongoose";
import { Achievement, IAchievement } from "../models/achievement.model";
import { UserAchievement, IUserAchievement } from "../models/user-achievement.model";
import { User } from "../models/user.model";

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
  // Find all achievements that match this requirement type
  const achievements = await Achievement.find({
    "requirement.type": requirementType,
    "requirement.threshold": { $lte: currentCount },
    isActive: true,
  }).sort({ "requirement.threshold": 1 });
  
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
