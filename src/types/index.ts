import { Request } from "express";

export interface NonceStore {
  [address: string]: {
    nonce: string;
    createdAt: number;
  };
}

export interface AuthPayload {
  address: string;
  chainId: number;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthPayload;
}

export interface VerifyRequest {
  message: string;
  signature: string;
}

export interface NonceResponse {
  nonce: string;
  message: string;
}

export interface VerifyResponse {
  token: string;
  address: string;
  expiresAt: number;
  isNewUser?: boolean;
  userId?: unknown;
}

export interface ErrorResponse {
  error: string;
  message: string;
}
