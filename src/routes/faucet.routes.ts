import { Router, Response } from "express";
import { Types } from "mongoose";
import { authMiddleware } from "../middleware/auth.middleware";
import { AuthenticatedRequest, ErrorResponse } from "../types";
import { findUserByAddress } from "../services/user.service";
import {
  getOrCreateBalance,
  getBalanceByAddress,
  getBalanceHistory,
  lockBalance,
  unlockBalance,
} from "../services/balance.service";
import {
  requestFromFaucet,
  getFaucetStats,
  getFaucetHistory,
  getGlobalFaucetStats,
} from "../services/faucet.service";

const router = Router();

/**
 * GET /faucet/balance
 * Get the current user's balance
 */
router.get(
  "/balance",
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
    
    const balance = await getOrCreateBalance(
      user._id as Types.ObjectId,
      address
    );
    
    res.json({
      address: balance.address,
      free: balance.free,
      locked: balance.locked,
      total: balance.free + balance.locked,
      totalCredits: balance.totalCredits,
      totalDebits: balance.totalDebits,
    });
  }
);

/**
 * GET /faucet/balance/history
 * Get the current user's balance change history
 */
router.get(
  "/balance/history",
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
    
    const history = await getBalanceHistory(
      user._id as Types.ObjectId,
      limit,
      offset
    );
    
    res.json({
      history,
      limit,
      offset,
    });
  }
);

/**
 * POST /faucet/request
 * Request tokens from the faucet (once per day)
 */
router.post(
  "/request",
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
    
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];
    
    const result = await requestFromFaucet(
      user._id as Types.ObjectId,
      address,
      ipAddress,
      userAgent
    );
    
    if (!result.success) {
      res.status(429).json({
        error: "RATE_LIMITED",
        message: result.error,
        nextRequestAt: result.nextRequestAt?.toISOString(),
      });
      return;
    }
    
    res.json({
      success: true,
      amount: result.amount,
      balance: {
        free: result.balance?.free,
        locked: result.balance?.locked,
        total: (result.balance?.free || 0) + (result.balance?.locked || 0),
      },
      nextRequestAt: result.nextRequestAt?.toISOString(),
      newAchievements: result.newAchievements?.map((a) => ({
        id: a.achievement.id,
        name: a.achievement.name,
        description: a.achievement.description,
        icon: a.achievement.icon,
        points: a.achievement.points,
      })),
      referral: result.referralCompleted
        ? {
            completed: true,
            referrerRewarded: result.referrerRewarded,
          }
        : undefined,
    });
  }
);

/**
 * GET /faucet/stats
 * Get the current user's faucet statistics
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
    
    const stats = await getFaucetStats(user._id as Types.ObjectId);
    
    res.json({
      totalRequests: stats.totalRequests,
      totalAmountReceived: stats.totalAmountDistributed,
      lastRequestAt: stats.lastRequestAt?.toISOString() || null,
      nextRequestAt: stats.nextRequestAt?.toISOString() || null,
      canRequest: stats.canRequest,
    });
  }
);

/**
 * GET /faucet/history
 * Get the current user's faucet request history
 */
router.get(
  "/history",
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
    
    const history = await getFaucetHistory(
      user._id as Types.ObjectId,
      limit,
      offset
    );
    
    res.json({
      history: history.map((h) => ({
        amount: h.amount,
        createdAt: h.createdAt.toISOString(),
      })),
      limit,
      offset,
    });
  }
);

/**
 * GET /faucet/global-stats
 * Get global faucet statistics (public endpoint)
 */
router.get("/global-stats", async (_req, res: Response) => {
  const stats = await getGlobalFaucetStats();
  
  res.json({
    totalRequests: stats.totalRequests,
    totalAmountDistributed: stats.totalAmountDistributed,
    uniqueUsers: stats.uniqueUsers,
  });
});

/**
 * POST /faucet/lock
 * Lock a portion of free balance
 */
router.post(
  "/lock",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response<object | ErrorResponse>) => {
    const address = req.auth?.address;
    const { amount, reason } = req.body;
    
    if (!address) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "Not authenticated" });
      return;
    }
    
    if (!amount || amount <= 0) {
      res.status(400).json({ error: "INVALID_AMOUNT", message: "Amount must be positive" });
      return;
    }
    
    const user = await findUserByAddress(address);
    
    if (!user) {
      res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
      return;
    }
    
    const result = await lockBalance(
      user._id as Types.ObjectId,
      amount,
      reason || "Manual lock"
    );
    
    if (!result.success) {
      res.status(400).json({ error: "LOCK_FAILED", message: result.error! });
      return;
    }
    
    res.json({
      success: true,
      balance: {
        free: result.balance?.free,
        locked: result.balance?.locked,
        total: (result.balance?.free || 0) + (result.balance?.locked || 0),
      },
    });
  }
);

/**
 * POST /faucet/unlock
 * Unlock a portion of locked balance
 */
router.post(
  "/unlock",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response<object | ErrorResponse>) => {
    const address = req.auth?.address;
    const { amount, reason } = req.body;
    
    if (!address) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "Not authenticated" });
      return;
    }
    
    if (!amount || amount <= 0) {
      res.status(400).json({ error: "INVALID_AMOUNT", message: "Amount must be positive" });
      return;
    }
    
    const user = await findUserByAddress(address);
    
    if (!user) {
      res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
      return;
    }
    
    const result = await unlockBalance(
      user._id as Types.ObjectId,
      amount,
      reason || "Manual unlock"
    );
    
    if (!result.success) {
      res.status(400).json({ error: "UNLOCK_FAILED", message: result.error! });
      return;
    }
    
    res.json({
      success: true,
      balance: {
        free: result.balance?.free,
        locked: result.balance?.locked,
        total: (result.balance?.free || 0) + (result.balance?.locked || 0),
      },
    });
  }
);

export default router;
