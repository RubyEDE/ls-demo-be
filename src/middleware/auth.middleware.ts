import { Response, NextFunction } from "express";
import { verifyToken } from "../services/token.service";
import { AuthenticatedRequest, ErrorResponse } from "../types";

// Re-export for convenience
export { AuthenticatedRequest } from "../types";

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response<ErrorResponse>,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Authorization header is required",
    });
    return;
  }
  
  const [bearer, token] = authHeader.split(" ");
  
  if (bearer !== "Bearer" || !token) {
    res.status(401).json({
      error: "INVALID_TOKEN_FORMAT",
      message: "Authorization header must be in format: Bearer <token>",
    });
    return;
  }
  
  const payload = verifyToken(token);
  
  if (!payload) {
    res.status(401).json({
      error: "INVALID_TOKEN",
      message: "Token is invalid or expired",
    });
    return;
  }
  
  req.auth = payload;
  next();
}
