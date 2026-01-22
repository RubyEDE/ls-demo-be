import { Router, Response } from "express";
import { Types } from "mongoose";
import { authMiddleware } from "../middleware/auth.middleware";
import { AuthenticatedRequest } from "../types";
import {
  getUserLevelInfo,
  getLevelLeaderboard,
  getUserLevelRank,
  getAllLevelThresholds,
} from "../services/leveling.service";
import {
  getTalentTreeInfo,
  allocateTalentPoint,
  resetTalentPoints,
  getFaucetBonuses,
  getLeverageBonuses,
  TALENT_CONFIG,
  TalentId,
} from "../services/talent.service";
import { findUserByAddress } from "../services/user.service";

const router = Router();

/**
 * GET /user/level
 * Get current user's level info (requires auth)
 */
router.get("/level", authMiddleware, async (req, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const levelInfo = await getUserLevelInfo(authReq.auth!.address);
    
    if (!levelInfo) {
      return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
    }
    
    res.json(levelInfo);
  } catch (error) {
    console.error("Error fetching level info:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch level info" });
  }
});

/**
 * GET /user/level/rank
 * Get current user's rank on the level leaderboard (requires auth)
 */
router.get("/level/rank", authMiddleware, async (req, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const [levelInfo, rank] = await Promise.all([
      getUserLevelInfo(authReq.auth!.address),
      getUserLevelRank(authReq.auth!.address),
    ]);
    
    if (!levelInfo) {
      return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
    }
    
    res.json({
      ...levelInfo,
      rank,
    });
  } catch (error) {
    console.error("Error fetching level rank:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch level rank" });
  }
});

/**
 * GET /user/level/thresholds
 * Get XP thresholds for all levels (public)
 */
router.get("/level/thresholds", (_req, res: Response) => {
  try {
    const thresholds = getAllLevelThresholds();
    res.json({ thresholds });
  } catch (error) {
    console.error("Error fetching level thresholds:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch thresholds" });
  }
});

/**
 * GET /user/leaderboard/levels
 * Get level leaderboard (public)
 */
router.get("/leaderboard/levels", async (req, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const leaderboard = await getLevelLeaderboard(limit);
    res.json({ leaderboard });
  } catch (error) {
    console.error("Error fetching level leaderboard:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch leaderboard" });
  }
});

/**
 * GET /user/:address/level
 * Get any user's public level info
 */
router.get("/:address/level", async (req, res: Response) => {
  try {
    const address = req.params.address;
    const levelInfo = await getUserLevelInfo(address);
    
    if (!levelInfo) {
      return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
    }
    
    res.json(levelInfo);
  } catch (error) {
    console.error("Error fetching user level info:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch level info" });
  }
});

// ==================== TALENT TREE ROUTES ====================

/**
 * GET /user/talents
 * Get current user's talent tree info (requires auth)
 */
router.get("/talents", authMiddleware, async (req, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const address = authReq.auth!.address;
    
    const user = await findUserByAddress(address);
    if (!user) {
      return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
    }
    
    const talentTree = await getTalentTreeInfo(user._id as Types.ObjectId, address);
    
    res.json(talentTree);
  } catch (error) {
    console.error("Error fetching talent tree:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch talent tree" });
  }
});

/**
 * GET /user/talents/config
 * Get talent tree configuration (public)
 */
router.get("/talents/config", (_req, res: Response) => {
  try {
    const config = Object.entries(TALENT_CONFIG).map(([id, talent]) => ({
      id,
      name: talent.name,
      description: talent.description,
      maxPoints: talent.maxPoints,
      tier: talent.tier,
      requires: talent.requires,
      requiresPoints: talent.requiresPoints,
      bonusPerPoint: "bonusPerPoint" in talent ? talent.bonusPerPoint : null,
    }));
    
    res.json({ talents: config });
  } catch (error) {
    console.error("Error fetching talent config:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch talent config" });
  }
});

/**
 * POST /user/talents/allocate
 * Allocate a talent point (requires auth)
 * Body: { talentId: string }
 */
router.post("/talents/allocate", authMiddleware, async (req, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const address = authReq.auth!.address;
    const { talentId } = req.body;
    
    if (!talentId) {
      return res.status(400).json({ error: "INVALID_REQUEST", message: "talentId is required" });
    }
    
    // Validate talentId
    if (!(talentId in TALENT_CONFIG)) {
      return res.status(400).json({ error: "INVALID_TALENT", message: "Invalid talent ID" });
    }
    
    const user = await findUserByAddress(address);
    if (!user) {
      return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
    }
    
    const result = await allocateTalentPoint(
      user._id as Types.ObjectId,
      address,
      talentId as TalentId
    );
    
    if (!result.success) {
      return res.status(400).json({ error: "ALLOCATION_FAILED", message: result.error });
    }
    
    // Return updated talent tree
    const talentTree = await getTalentTreeInfo(user._id as Types.ObjectId, address);
    
    res.json({
      success: true,
      message: `Point allocated to ${TALENT_CONFIG[talentId as TalentId].name}`,
      talentTree,
      newAchievements: result.newAchievements?.map((a) => ({
        id: a.achievement.id,
        name: a.achievement.name,
        description: a.achievement.description,
        icon: a.achievement.icon,
        points: a.achievement.points,
      })),
    });
  } catch (error) {
    console.error("Error allocating talent point:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to allocate talent point" });
  }
});

/**
 * POST /user/talents/reset
 * Reset all talent points (requires auth)
 * Note: This could cost in-game currency in a full implementation
 */
router.post("/talents/reset", authMiddleware, async (req, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const address = authReq.auth!.address;
    
    const user = await findUserByAddress(address);
    if (!user) {
      return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
    }
    
    const result = await resetTalentPoints(user._id as Types.ObjectId);
    
    if (!result.success) {
      return res.status(400).json({ error: "RESET_FAILED", message: result.error });
    }
    
    // Return updated talent tree
    const talentTree = await getTalentTreeInfo(user._id as Types.ObjectId, address);
    
    res.json({
      success: true,
      message: "All talent points have been reset",
      talentTree,
    });
  } catch (error) {
    console.error("Error resetting talents:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to reset talents" });
  }
});

/**
 * GET /user/talents/bonuses
 * Get current user's active talent bonuses (requires auth)
 */
router.get("/talents/bonuses", authMiddleware, async (req, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const address = authReq.auth!.address;
    
    const user = await findUserByAddress(address);
    if (!user) {
      return res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
    }
    
    const [faucetBonuses, leverageBonuses] = await Promise.all([
      getFaucetBonuses(user._id as Types.ObjectId),
      getLeverageBonuses(user._id as Types.ObjectId),
    ]);
    
    res.json({
      faucet: {
        amountMultiplier: faucetBonuses.amountMultiplier,
        amountBonus: `+${Math.round((faucetBonuses.amountMultiplier - 1) * 100)}%`,
        cooldownMultiplier: faucetBonuses.cooldownMultiplier,
        cooldownReduction: `-${Math.round((1 - faucetBonuses.cooldownMultiplier) * 100)}%`,
        claimsPerCooldown: faucetBonuses.claimsPerCooldown,
      },
      leverage: {
        maxLeverageBonus: leverageBonuses.maxLeverageBonus,
        maxLeverageBonusDisplay: `+${leverageBonuses.maxLeverageBonus}x`,
        hasLiquidationSave: leverageBonuses.hasLiquidationSave,
        liquidationSaveAvailable: leverageBonuses.liquidationSaveAvailable,
        lastLiquidationSaveAt: leverageBonuses.lastLiquidationSaveAt?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error("Error fetching talent bonuses:", error);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to fetch talent bonuses" });
  }
});

export default router;
