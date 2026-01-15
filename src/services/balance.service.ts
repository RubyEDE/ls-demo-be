import { Types } from "mongoose";
import { Balance, IBalance, IBalanceChange } from "../models/balance.model";

export interface BalanceOperationResult {
  success: boolean;
  balance?: IBalance;
  error?: string;
}

/**
 * Get or create a balance record for a user
 */
export async function getOrCreateBalance(
  userId: Types.ObjectId,
  address: string
): Promise<IBalance> {
  const normalizedAddress = address.toLowerCase();
  
  let balance = await Balance.findOne({ userId });
  
  if (!balance) {
    balance = await Balance.create({
      userId,
      address: normalizedAddress,
      free: 0,
      locked: 0,
      totalCredits: 0,
      totalDebits: 0,
      changes: [],
    });
  }
  
  return balance;
}

/**
 * Get balance by address
 */
export async function getBalanceByAddress(
  address: string
): Promise<IBalance | null> {
  return Balance.findOne({ address: address.toLowerCase() });
}

/**
 * Get balance by user ID
 */
export async function getBalanceByUserId(
  userId: Types.ObjectId
): Promise<IBalance | null> {
  return Balance.findOne({ userId });
}

/**
 * Credit free balance (add money)
 */
export async function creditBalance(
  userId: Types.ObjectId,
  address: string,
  amount: number,
  reason: string,
  referenceId?: string
): Promise<BalanceOperationResult> {
  if (amount <= 0) {
    return { success: false, error: "Amount must be positive" };
  }

  const balance = await getOrCreateBalance(userId, address);
  
  const change: IBalanceChange = {
    amount,
    type: "credit",
    reason,
    timestamp: new Date(),
    referenceId,
  };
  
  balance.free += amount;
  balance.totalCredits += amount;
  balance.changes.push(change);
  
  await balance.save();
  
  return { success: true, balance };
}

/**
 * Debit free balance (remove money)
 */
export async function debitBalance(
  userId: Types.ObjectId,
  amount: number,
  reason: string,
  referenceId?: string
): Promise<BalanceOperationResult> {
  if (amount <= 0) {
    return { success: false, error: "Amount must be positive" };
  }

  const balance = await Balance.findOne({ userId });
  
  if (!balance) {
    return { success: false, error: "Balance not found" };
  }
  
  if (balance.free < amount) {
    return { success: false, error: "Insufficient free balance" };
  }
  
  const change: IBalanceChange = {
    amount,
    type: "debit",
    reason,
    timestamp: new Date(),
    referenceId,
  };
  
  balance.free -= amount;
  balance.totalDebits += amount;
  balance.changes.push(change);
  
  await balance.save();
  
  return { success: true, balance };
}

/**
 * Lock balance (move from free to locked)
 */
export async function lockBalance(
  userId: Types.ObjectId,
  amount: number,
  reason: string,
  referenceId?: string
): Promise<BalanceOperationResult> {
  if (amount <= 0) {
    return { success: false, error: "Amount must be positive" };
  }

  const balance = await Balance.findOne({ userId });
  
  if (!balance) {
    return { success: false, error: "Balance not found" };
  }
  
  if (balance.free < amount) {
    return { success: false, error: "Insufficient free balance to lock" };
  }
  
  const change: IBalanceChange = {
    amount,
    type: "lock",
    reason,
    timestamp: new Date(),
    referenceId,
  };
  
  balance.free -= amount;
  balance.locked += amount;
  balance.changes.push(change);
  
  await balance.save();
  
  return { success: true, balance };
}

/**
 * Unlock balance (move from locked to free)
 */
export async function unlockBalance(
  userId: Types.ObjectId,
  amount: number,
  reason: string,
  referenceId?: string
): Promise<BalanceOperationResult> {
  if (amount <= 0) {
    return { success: false, error: "Amount must be positive" };
  }

  const balance = await Balance.findOne({ userId });
  
  if (!balance) {
    return { success: false, error: "Balance not found" };
  }
  
  if (balance.locked < amount) {
    return { success: false, error: "Insufficient locked balance to unlock" };
  }
  
  const change: IBalanceChange = {
    amount,
    type: "unlock",
    reason,
    timestamp: new Date(),
    referenceId,
  };
  
  balance.locked -= amount;
  balance.free += amount;
  balance.changes.push(change);
  
  await balance.save();
  
  return { success: true, balance };
}

/**
 * Get balance change history
 */
export async function getBalanceHistory(
  userId: Types.ObjectId,
  limit: number = 50,
  offset: number = 0
): Promise<IBalanceChange[]> {
  const balance = await Balance.findOne({ userId });
  
  if (!balance) {
    return [];
  }
  
  // Return changes in reverse chronological order
  return balance.changes
    .slice()
    .reverse()
    .slice(offset, offset + limit);
}

// ============ Address-based functions for CLOB ============

/**
 * Lock balance by address (for CLOB orders)
 */
export async function lockBalanceByAddress(
  address: string,
  amount: number,
  reason: string,
  referenceId?: string
): Promise<BalanceOperationResult> {
  if (amount <= 0) {
    return { success: false, error: "Amount must be positive" };
  }

  const balance = await Balance.findOne({ address: address.toLowerCase() });
  
  if (!balance) {
    return { success: false, error: "Balance not found" };
  }
  
  if (balance.free < amount) {
    return { success: false, error: "Insufficient free balance to lock" };
  }
  
  const change: IBalanceChange = {
    amount,
    type: "lock",
    reason,
    timestamp: new Date(),
    referenceId,
  };
  
  balance.free -= amount;
  balance.locked += amount;
  balance.changes.push(change);
  
  await balance.save();
  
  return { success: true, balance };
}

/**
 * Unlock balance by address (for CLOB orders)
 */
export async function unlockBalanceByAddress(
  address: string,
  amount: number,
  reason: string,
  referenceId?: string
): Promise<BalanceOperationResult> {
  if (amount <= 0) {
    return { success: false, error: "Amount must be positive" };
  }

  const balance = await Balance.findOne({ address: address.toLowerCase() });
  
  if (!balance) {
    return { success: false, error: "Balance not found" };
  }
  
  if (balance.locked < amount) {
    return { success: false, error: "Insufficient locked balance to unlock" };
  }
  
  const change: IBalanceChange = {
    amount,
    type: "unlock",
    reason,
    timestamp: new Date(),
    referenceId,
  };
  
  balance.locked -= amount;
  balance.free += amount;
  balance.changes.push(change);
  
  await balance.save();
  
  return { success: true, balance };
}
