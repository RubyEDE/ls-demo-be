import jwt from "jsonwebtoken";
import { config } from "../config/env";
import { AuthPayload } from "../types";

const TOKEN_EXPIRATION_DAYS = 30;

export function generateToken(address: string, chainId: number): string {
  const payload: Omit<AuthPayload, "iat" | "exp"> = {
    address,
    chainId,
  };
  
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthPayload;
    return decoded;
  } catch {
    return null;
  }
}

export function getTokenExpiration(): number {
  return Date.now() + TOKEN_EXPIRATION_DAYS * 24 * 60 * 60 * 1000;
}
