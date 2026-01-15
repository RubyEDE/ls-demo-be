import { Router, Request, Response } from "express";
import { isAddress } from "viem";
import { createNonce, createSiweMessage, verifySiweMessage } from "../services/auth.service";
import { generateToken, getTokenExpiration } from "../services/token.service";
import { findOrCreateUser, findUserByAddress } from "../services/user.service";
import { authMiddleware } from "../middleware/auth.middleware";
import {
  AuthenticatedRequest,
  VerifyRequest,
  NonceResponse,
  VerifyResponse,
  ErrorResponse,
} from "../types";

const router = Router();

/**
 * GET /auth/nonce
 * Generate a nonce and SIWE message for the given wallet address
 */
router.get(
  "/nonce",
  (req: Request, res: Response<NonceResponse | ErrorResponse>) => {
    const { address, chainId } = req.query;
    
    if (!address || typeof address !== "string") {
      res.status(400).json({
        error: "INVALID_REQUEST",
        message: "Address query parameter is required",
      });
      return;
    }
    
    if (!isAddress(address)) {
      res.status(400).json({
        error: "INVALID_ADDRESS",
        message: "Invalid Ethereum address format",
      });
      return;
    }
    
    const chain = chainId ? parseInt(chainId as string, 10) : 1;
    const nonce = createNonce(address);
    const message = createSiweMessage(address, nonce, chain);
    
    res.json({ nonce, message });
  }
);

/**
 * POST /auth/verify
 * Verify the signed SIWE message and issue a JWT token
 */
router.post(
  "/verify",
  async (req: Request<object, object, VerifyRequest>, res: Response<VerifyResponse | ErrorResponse>) => {
    const { message, signature } = req.body;
    
    if (!message || !signature) {
      res.status(400).json({
        error: "INVALID_REQUEST",
        message: "Message and signature are required",
      });
      return;
    }
    
    const result = await verifySiweMessage(message, signature);
    
    if (!result.success) {
      res.status(401).json({
        error: "VERIFICATION_FAILED",
        message: result.error,
      });
      return;
    }
    
    // Find or create user in database
    const { user, isNewUser } = await findOrCreateUser(result.address, result.chainId);
    
    const token = generateToken(result.address, result.chainId);
    const expiresAt = getTokenExpiration();
    
    res.json({
      token,
      address: result.address,
      expiresAt,
      isNewUser,
      userId: user._id,
    });
  }
);

/**
 * GET /auth/me
 * Get the current authenticated user's info (protected route example)
 */
router.get(
  "/me",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    const user = req.auth?.address 
      ? await findUserByAddress(req.auth.address)
      : null;
    
    res.json({
      address: req.auth?.address,
      chainId: req.auth?.chainId,
      authenticatedAt: req.auth?.iat ? new Date(req.auth.iat * 1000).toISOString() : null,
      expiresAt: req.auth?.exp ? new Date(req.auth.exp * 1000).toISOString() : null,
      user: user ? {
        id: user._id,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      } : null,
    });
  }
);

export default router;
