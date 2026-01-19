import { Router, Response } from "express";
import { Types } from "mongoose";
import { authMiddleware } from "../middleware/auth.middleware";
import { AuthenticatedRequest, ErrorResponse } from "../types";
import { findUserByAddress } from "../services/user.service";
import {
  getUserReferralCode,
  applyReferralCode,
  getReferralStats,
  getReferralsList,
  getReferredBy,
  getReferralLeaderboard,
  getGlobalReferralStats,
  validateReferralCode,
} from "../services/referral.service";

const router = Router();

/**
 * GET /referrals/code
 * Get the current user's referral code
 */
router.get(
  "/code",
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
    
    const referralCode = await getUserReferralCode(user._id as Types.ObjectId);
    
    res.json({
      referralCode,
      referralLink: `${req.protocol}://${req.get("host")}?ref=${referralCode}`,
    });
  }
);

/**
 * GET /referrals/validate/:code
 * Validate a referral code (public endpoint)
 */
router.get("/validate/:code", async (req, res: Response) => {
  const { code } = req.params;
  
  if (!code) {
    res.status(400).json({ error: "INVALID_CODE", message: "Referral code is required" });
    return;
  }
  
  const result = await validateReferralCode(code);
  
  res.json({
    valid: result.valid,
    referrerAddress: result.referrerAddress
      ? `${result.referrerAddress.slice(0, 6)}...${result.referrerAddress.slice(-4)}`
      : undefined,
  });
});

/**
 * POST /referrals/apply
 * Apply a referral code to the current user
 * Note: This creates a pending referral that completes when user uses faucet
 */
router.post(
  "/apply",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response<object | ErrorResponse>) => {
    const address = req.auth?.address;
    const { referralCode } = req.body;
    
    if (!address) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "Not authenticated" });
      return;
    }
    
    if (!referralCode) {
      res.status(400).json({ error: "INVALID_CODE", message: "Referral code is required" });
      return;
    }
    
    const user = await findUserByAddress(address);
    
    if (!user) {
      res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
      return;
    }
    
    const result = await applyReferralCode(
      user._id as Types.ObjectId,
      address,
      referralCode
    );
    
    if (!result.success) {
      res.status(400).json({ error: "REFERRAL_FAILED", message: result.error! });
      return;
    }
    
    res.json({
      success: true,
      message: "Referral code applied. Referrer will receive reward when you use the faucet.",
      referral: {
        status: result.referral?.status,
        referrerAddress: `${result.referral?.referrerAddress.slice(0, 6)}...${result.referral?.referrerAddress.slice(-4)}`,
      },
    });
  }
);

/**
 * GET /referrals/stats
 * Get the current user's referral statistics
 */
router.get(
  "/stats",
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
    
    const stats = await getReferralStats(user._id as Types.ObjectId);
    
    if (!stats) {
      res.status(404).json({ error: "NOT_FOUND", message: "Stats not found" });
      return;
    }
    
    res.json(stats);
  }
);

/**
 * GET /referrals/list
 * Get the list of users referred by the current user
 */
router.get(
  "/list",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const address = req.auth?.address;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    
    if (!address) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "Not authenticated" });
      return;
    }
    
    const user = await findUserByAddress(address);
    
    if (!user) {
      res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
      return;
    }
    
    const referrals = await getReferralsList(
      user._id as Types.ObjectId,
      limit,
      offset
    );
    
    res.json({
      referrals: referrals.map((r) => ({
        refereeAddress: `${r.refereeAddress.slice(0, 6)}...${r.refereeAddress.slice(-4)}`,
        status: r.status,
        rewardAmount: r.rewardAmount,
        rewardCredited: r.rewardCredited,
        createdAt: r.createdAt.toISOString(),
        completedAt: r.completedAt?.toISOString() || null,
      })),
      limit,
      offset,
    });
  }
);

/**
 * GET /referrals/referred-by
 * Check if the current user was referred and by whom
 */
router.get(
  "/referred-by",
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
    
    const referredBy = await getReferredBy(user._id as Types.ObjectId);
    
    if (!referredBy) {
      res.json({ wasReferred: false });
      return;
    }
    
    res.json({
      wasReferred: referredBy.wasReferred,
      referrerAddress: referredBy.referrerAddress
        ? `${referredBy.referrerAddress.slice(0, 6)}...${referredBy.referrerAddress.slice(-4)}`
        : undefined,
      referralCode: referredBy.referralCode,
      status: referredBy.status,
    });
  }
);

/**
 * GET /referrals/leaderboard
 * Get the referral leaderboard (public endpoint)
 */
router.get("/leaderboard", async (req, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  
  const leaderboard = await getReferralLeaderboard(limit);
  
  res.json({
    leaderboard: leaderboard.map((entry) => ({
      address: `${entry.address.slice(0, 6)}...${entry.address.slice(-4)}`,
      referralCode: entry.referralCode,
      completedReferrals: entry.completedReferrals,
      totalRewardsEarned: entry.totalRewardsEarned,
    })),
  });
});

/**
 * GET /referrals/global-stats
 * Get global referral statistics (public endpoint)
 */
router.get("/global-stats", async (_req, res: Response) => {
  const stats = await getGlobalReferralStats();
  
  res.json(stats);
});

export default router;
