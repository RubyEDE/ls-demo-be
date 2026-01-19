import { Router, Response } from "express";
import { Types } from "mongoose";
import { authMiddleware } from "../middleware/auth.middleware";
import { AuthenticatedRequest } from "../types";
import { findUserByAddress } from "../services/user.service";
import {
  getAllAchievements,
  getAchievementsByCategory,
  getUserAchievementsWithDetails,
  getUserAchievementsGrouped,
  getUserAchievementStats,
  getUserAchievementPoints,
  getAchievementLeaderboard,
} from "../services/achievement.service";

const router = Router();

/**
 * GET /achievements
 * Get all available achievements
 */
router.get("/", async (_req, res: Response) => {
  const achievements = await getAllAchievements();
  
  res.json({
    achievements: achievements.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      category: a.category,
      icon: a.icon,
      points: a.points,
      isProgression: a.isProgression,
      progressionGroup: a.progressionGroup,
      progressionOrder: a.progressionOrder,
      requirement: a.requirement,
    })),
    total: achievements.length,
  });
});

/**
 * GET /achievements/category/:category
 * Get achievements by category
 */
router.get("/category/:category", async (req, res: Response) => {
  const { category } = req.params;
  const achievements = await getAchievementsByCategory(category);
  
  res.json({
    achievements: achievements.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      category: a.category,
      icon: a.icon,
      points: a.points,
      isProgression: a.isProgression,
      progressionGroup: a.progressionGroup,
      progressionOrder: a.progressionOrder,
      requirement: a.requirement,
    })),
    total: achievements.length,
  });
});

/**
 * GET /achievements/me
 * Get current user's achievements with progress
 */
router.get(
  "/me",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const address = req.auth?.address;
    
    if (!address) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "Not authenticated" });
      return;
    }
    
    const user = await findUserByAddress(address);
    
    if (!user) {
      res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
      return;
    }
    
    const achievements = await getUserAchievementsWithDetails(user._id as Types.ObjectId);
    
    res.json({
      achievements: achievements.map((a) => ({
        id: a.achievement.id,
        name: a.achievement.name,
        description: a.achievement.description,
        category: a.achievement.category,
        icon: a.achievement.icon,
        points: a.achievement.points,
        isProgression: a.achievement.isProgression,
        progressionGroup: a.achievement.progressionGroup,
        progressionOrder: a.achievement.progressionOrder,
        requirement: a.achievement.requirement,
        isUnlocked: a.isUnlocked,
        unlockedAt: a.unlockedAt?.toISOString() || null,
        currentProgress: a.currentProgress,
        progressPercentage: a.progressPercentage,
      })),
    });
  }
);

/**
 * GET /achievements/me/grouped
 * Get current user's achievements grouped by progression
 * Returns progression achievements as single items with stages
 */
router.get(
  "/me/grouped",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const address = req.auth?.address;
    
    if (!address) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "Not authenticated" });
      return;
    }
    
    const user = await findUserByAddress(address);
    
    if (!user) {
      res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
      return;
    }
    
    const { progressions, standalone } = await getUserAchievementsGrouped(user._id as Types.ObjectId);
    
    res.json({
      progressions: progressions.map((p) => ({
        progressionGroup: p.progressionGroup,
        category: p.category,
        currentProgress: p.currentProgress,
        maxThreshold: p.maxThreshold,
        totalPoints: p.totalPoints,
        earnedPoints: p.earnedPoints,
        currentStage: p.currentStage,
        totalStages: p.totalStages,
        stages: p.stages.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          icon: s.icon,
          points: s.points,
          threshold: s.threshold,
          order: s.order,
          isUnlocked: s.isUnlocked,
          unlockedAt: s.unlockedAt?.toISOString() || null,
        })),
      })),
      standalone: standalone.map((a) => ({
        id: a.achievement.id,
        name: a.achievement.name,
        description: a.achievement.description,
        category: a.achievement.category,
        icon: a.achievement.icon,
        points: a.achievement.points,
        requirement: a.achievement.requirement,
        isUnlocked: a.isUnlocked,
        unlockedAt: a.unlockedAt?.toISOString() || null,
        currentProgress: a.currentProgress,
        progressPercentage: a.progressPercentage,
      })),
    });
  }
);

/**
 * GET /achievements/me/stats
 * Get current user's achievement statistics
 */
router.get(
  "/me/stats",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const address = req.auth?.address;
    
    if (!address) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "Not authenticated" });
      return;
    }
    
    const user = await findUserByAddress(address);
    
    if (!user) {
      res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
      return;
    }
    
    const stats = await getUserAchievementStats(user._id as Types.ObjectId);
    
    res.json(stats);
  }
);

/**
 * GET /achievements/me/points
 * Get current user's total achievement points
 */
router.get(
  "/me/points",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const address = req.auth?.address;
    
    if (!address) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "Not authenticated" });
      return;
    }
    
    const user = await findUserByAddress(address);
    
    if (!user) {
      res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
      return;
    }
    
    const totalPoints = await getUserAchievementPoints(user._id as Types.ObjectId);
    
    res.json({ totalPoints });
  }
);

/**
 * GET /achievements/leaderboard
 * Get achievement leaderboard (public)
 */
router.get("/leaderboard", async (req, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
  
  const leaderboard = await getAchievementLeaderboard(limit);
  
  res.json({
    leaderboard,
    total: leaderboard.length,
  });
});

/**
 * GET /achievements/user/:address
 * Get a specific user's achievements (public profile)
 */
router.get("/user/:address", async (req, res: Response) => {
  const { address } = req.params;
  
  const user = await findUserByAddress(address.toLowerCase());
  
  if (!user) {
    res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
    return;
  }
  
  const [achievements, stats] = await Promise.all([
    getUserAchievementsWithDetails(user._id as Types.ObjectId),
    getUserAchievementStats(user._id as Types.ObjectId),
  ]);
  
  // Only return unlocked achievements for public profile
  const unlockedAchievements = achievements.filter((a) => a.isUnlocked);
  
  res.json({
    address: address.toLowerCase(),
    achievements: unlockedAchievements.map((a) => ({
      id: a.achievement.id,
      name: a.achievement.name,
      description: a.achievement.description,
      category: a.achievement.category,
      icon: a.achievement.icon,
      points: a.achievement.points,
      unlockedAt: a.unlockedAt?.toISOString(),
    })),
    stats: {
      totalUnlocked: stats.totalUnlocked,
      totalPoints: stats.totalPoints,
      completionPercentage: stats.completionPercentage,
    },
  });
});

export default router;
