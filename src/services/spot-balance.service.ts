import { Types } from "mongoose";
import { SpotBalance, ISpotBalance, ISpotBalanceChange } from "../models/spot-balance.model";
import { Balance, IBalance } from "../models/balance.model";
import {
  lockBalanceByAddress,
  unlockBalanceByAddress,
  creditBalance as creditPerpBalance,
  creditBalanceByAddress,
  debitBalanceByAddress,
  getBalanceByAddress,
} from "./balance.service";

// USD is special - it uses the main perp balance, not SpotBalance
const USD_ASSET = "USD";

export interface SpotBalanceOperationResult {
  success: boolean;
  balance?: ISpotBalance;
  error?: string;
}

export interface SpotBalanceSummary {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

/**
 * Check if an asset is USD (uses main perp balance)
 */
function isUsdAsset(asset: string): boolean {
  return asset.toUpperCase() === USD_ASSET;
}

// ============ Core Balance Operations ============

/**
 * Get or create a spot balance record for a user and asset
 */
export async function getOrCreateSpotBalance(
  userId: Types.ObjectId,
  address: string,
  asset: string
): Promise<ISpotBalance> {
  const normalizedAddress = address.toLowerCase();
  const normalizedAsset = asset.toUpperCase();
  
  let balance = await SpotBalance.findOne({ 
    userId, 
    asset: normalizedAsset 
  });
  
  if (!balance) {
    balance = await SpotBalance.create({
      userId,
      address: normalizedAddress,
      asset: normalizedAsset,
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
 * Get spot balance by address and asset
 * For USD, returns the main perp balance
 */
export async function getSpotBalanceByAddress(
  address: string,
  asset: string
): Promise<ISpotBalance | null> {
  const normalizedAsset = asset.toUpperCase();
  
  // USD uses the main perp balance
  if (isUsdAsset(normalizedAsset)) {
    const perpBalance = await getBalanceByAddress(address);
    if (!perpBalance) return null;
    
    // Return a compatible object structure
    return {
      asset: USD_ASSET,
      address: perpBalance.address,
      free: perpBalance.free,
      locked: perpBalance.locked,
      totalCredits: perpBalance.totalCredits,
      totalDebits: perpBalance.totalDebits,
      changes: perpBalance.changes,
    } as unknown as ISpotBalance;
  }
  
  return SpotBalance.findOne({ 
    address: address.toLowerCase(),
    asset: normalizedAsset
  });
}

/**
 * Get all spot balances for a user by address
 * Note: Does NOT include USD - use getSpotBalanceSummary for full view
 */
export async function getAllSpotBalancesByAddress(
  address: string
): Promise<ISpotBalance[]> {
  return SpotBalance.find({ 
    address: address.toLowerCase() 
  }).sort({ asset: 1 });
}

/**
 * Get all spot balances including USD from main perp balance
 */
export async function getAllSpotBalancesWithUsd(
  address: string
): Promise<SpotBalanceSummary[]> {
  const spotBalances = await getAllSpotBalancesByAddress(address);
  const perpBalance = await getBalanceByAddress(address);
  
  const result: SpotBalanceSummary[] = [];
  
  // Add USD from perp balance
  if (perpBalance) {
    result.push({
      asset: USD_ASSET,
      free: perpBalance.free,
      locked: perpBalance.locked,
      total: perpBalance.free + perpBalance.locked,
    });
  }
  
  // Add non-USD assets
  for (const balance of spotBalances) {
    result.push({
      asset: balance.asset,
      free: balance.free,
      locked: balance.locked,
      total: balance.free + balance.locked,
    });
  }
  
  return result;
}

/**
 * Get all spot balances for a user by userId
 */
export async function getAllSpotBalancesByUserId(
  userId: Types.ObjectId
): Promise<ISpotBalance[]> {
  return SpotBalance.find({ userId }).sort({ asset: 1 });
}

/**
 * Get spot balance summary for a user (simplified view)
 * Includes USD from main perp balance
 */
export async function getSpotBalanceSummary(
  address: string
): Promise<SpotBalanceSummary[]> {
  const balances = await getAllSpotBalancesByAddress(address);
  
  const summary: SpotBalanceSummary[] = balances
    .filter(b => b.free > 0 || b.locked > 0)
    .map(b => ({
      asset: b.asset,
      free: b.free,
      locked: b.locked,
      total: b.free + b.locked,
    }));
  
  // Add USD from main perp balance
  const perpBalance = await getBalanceByAddress(address);
  if (perpBalance && (perpBalance.free > 0 || perpBalance.locked > 0)) {
    // Insert USD at the beginning
    summary.unshift({
      asset: USD_ASSET,
      free: perpBalance.free,
      locked: perpBalance.locked,
      total: perpBalance.free + perpBalance.locked,
    });
  }
  
  return summary;
}

// ============ Credit Operations ============

/**
 * Credit spot balance (add funds)
 * For USD, uses the main perp balance (creates if doesn't exist)
 */
export async function creditSpotBalance(
  userId: Types.ObjectId,
  address: string,
  asset: string,
  amount: number,
  reason: string,
  referenceId?: string
): Promise<SpotBalanceOperationResult> {
  if (amount <= 0) {
    return { success: false, error: "Amount must be positive" };
  }

  const normalizedAsset = asset.toUpperCase();
  
  // USD uses the main perp balance (creates if doesn't exist)
  if (isUsdAsset(normalizedAsset)) {
    const result = await creditPerpBalance(userId, address, amount, `[SPOT] ${reason}`, referenceId);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    // Return a compatible response
    return { 
      success: true,
      balance: {
        asset: USD_ASSET,
        free: result.balance!.free,
        locked: result.balance!.locked,
      } as unknown as ISpotBalance
    };
  }

  const balance = await getOrCreateSpotBalance(userId, address, asset);
  
  const change: ISpotBalanceChange = {
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
 * Credit spot balance by address only (when userId not available)
 * For USD, uses the main perp balance
 */
export async function creditSpotBalanceByAddress(
  address: string,
  asset: string,
  amount: number,
  reason: string,
  referenceId?: string
): Promise<SpotBalanceOperationResult> {
  if (amount <= 0) {
    return { success: false, error: "Amount must be positive" };
  }

  const normalizedAsset = asset.toUpperCase();
  const normalizedAddress = address.toLowerCase();
  
  // USD uses the main perp balance
  if (isUsdAsset(normalizedAsset)) {
    const result = await creditBalanceByAddress(address, amount, `[SPOT] ${reason}`, referenceId);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true };
  }

  // For non-USD assets, create balance if it doesn't exist
  let balance = await SpotBalance.findOne({ 
    address: normalizedAddress,
    asset: normalizedAsset
  });
  
  if (!balance) {
    // Need to find the user to get userId for creating balance
    const { User } = await import("../models/user.model");
    const user = await User.findOne({ address: normalizedAddress });
    
    if (!user) {
      return { success: false, error: "User not found - cannot create balance" };
    }
    
    // Auto-create balance for non-USD assets when crediting
    balance = await SpotBalance.create({
      userId: user._id,
      address: normalizedAddress,
      asset: normalizedAsset,
      free: 0,
      locked: 0,
      totalCredits: 0,
      totalDebits: 0,
      changes: [],
    });
  }
  
  const change: ISpotBalanceChange = {
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

// ============ Debit Operations ============

/**
 * Debit spot balance (remove funds from free balance)
 */
export async function debitSpotBalance(
  userId: Types.ObjectId,
  asset: string,
  amount: number,
  reason: string,
  referenceId?: string
): Promise<SpotBalanceOperationResult> {
  if (amount <= 0) {
    return { success: false, error: "Amount must be positive" };
  }

  const balance = await SpotBalance.findOne({ 
    userId, 
    asset: asset.toUpperCase() 
  });
  
  if (!balance) {
    return { success: false, error: `Balance not found for asset ${asset}` };
  }
  
  if (balance.free < amount) {
    return { success: false, error: `Insufficient free ${asset} balance` };
  }
  
  const change: ISpotBalanceChange = {
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
 * Debit spot balance by address
 */
export async function debitSpotBalanceByAddress(
  address: string,
  asset: string,
  amount: number,
  reason: string,
  referenceId?: string
): Promise<SpotBalanceOperationResult> {
  if (amount <= 0) {
    return { success: false, error: "Amount must be positive" };
  }

  const balance = await SpotBalance.findOne({ 
    address: address.toLowerCase(),
    asset: asset.toUpperCase()
  });
  
  if (!balance) {
    return { success: false, error: `Balance not found for asset ${asset}` };
  }
  
  if (balance.free < amount) {
    return { success: false, error: `Insufficient free ${asset} balance` };
  }
  
  const change: ISpotBalanceChange = {
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

// ============ Lock/Unlock Operations ============

/**
 * Lock spot balance (move from free to locked for open orders)
 */
export async function lockSpotBalance(
  userId: Types.ObjectId,
  asset: string,
  amount: number,
  reason: string,
  referenceId?: string
): Promise<SpotBalanceOperationResult> {
  if (amount <= 0) {
    return { success: false, error: "Amount must be positive" };
  }

  const balance = await SpotBalance.findOne({ 
    userId, 
    asset: asset.toUpperCase() 
  });
  
  if (!balance) {
    return { success: false, error: `Balance not found for asset ${asset}` };
  }
  
  if (balance.free < amount) {
    return { success: false, error: `Insufficient free ${asset} balance to lock` };
  }
  
  const change: ISpotBalanceChange = {
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
 * Lock spot balance by address
 * For USD, uses the main perp balance
 */
export async function lockSpotBalanceByAddress(
  address: string,
  asset: string,
  amount: number,
  reason: string,
  referenceId?: string
): Promise<SpotBalanceOperationResult> {
  if (amount <= 0) {
    return { success: false, error: "Amount must be positive" };
  }

  const normalizedAsset = asset.toUpperCase();
  
  // USD uses the main perp balance
  if (isUsdAsset(normalizedAsset)) {
    const result = await lockBalanceByAddress(address, amount, `[SPOT] ${reason}`, referenceId);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true };
  }

  const balance = await SpotBalance.findOne({ 
    address: address.toLowerCase(),
    asset: normalizedAsset
  });
  
  if (!balance) {
    return { success: false, error: `Balance not found for asset ${asset}` };
  }
  
  if (balance.free < amount) {
    return { success: false, error: `Insufficient free ${asset} balance to lock` };
  }
  
  const change: ISpotBalanceChange = {
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
 * Unlock spot balance (move from locked to free)
 */
export async function unlockSpotBalance(
  userId: Types.ObjectId,
  asset: string,
  amount: number,
  reason: string,
  referenceId?: string
): Promise<SpotBalanceOperationResult> {
  if (amount <= 0) {
    return { success: false, error: "Amount must be positive" };
  }

  const balance = await SpotBalance.findOne({ 
    userId, 
    asset: asset.toUpperCase() 
  });
  
  if (!balance) {
    return { success: false, error: `Balance not found for asset ${asset}` };
  }
  
  if (balance.locked < amount) {
    return { success: false, error: `Insufficient locked ${asset} balance to unlock` };
  }
  
  const change: ISpotBalanceChange = {
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
 * Unlock spot balance by address
 * For USD, uses the main perp balance
 */
export async function unlockSpotBalanceByAddress(
  address: string,
  asset: string,
  amount: number,
  reason: string,
  referenceId?: string
): Promise<SpotBalanceOperationResult> {
  if (amount <= 0) {
    return { success: false, error: "Amount must be positive" };
  }

  const normalizedAsset = asset.toUpperCase();
  
  // USD uses the main perp balance
  if (isUsdAsset(normalizedAsset)) {
    const result = await unlockBalanceByAddress(address, amount, `[SPOT] ${reason}`, referenceId);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true };
  }

  const balance = await SpotBalance.findOne({ 
    address: address.toLowerCase(),
    asset: normalizedAsset
  });
  
  if (!balance) {
    return { success: false, error: `Balance not found for asset ${asset}` };
  }
  
  if (balance.locked < amount) {
    return { success: false, error: `Insufficient locked ${asset} balance to unlock` };
  }
  
  const change: ISpotBalanceChange = {
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

// ============ Trade Settlement ============

/**
 * Execute a spot trade settlement (atomic debit/credit for both sides)
 * For a BUY: debit quote asset, credit base asset
 * For a SELL: debit base asset, credit quote asset
 */
export async function settleSpotTrade(
  address: string,
  baseAsset: string,
  quoteAsset: string,
  side: "buy" | "sell",
  baseAmount: number,
  quoteAmount: number,
  referenceId: string
): Promise<{ success: boolean; error?: string }> {
  const normalizedAddress = address.toLowerCase();
  const normalizedBaseAsset = baseAsset.toUpperCase();
  const normalizedQuoteAsset = quoteAsset.toUpperCase();

  if (side === "buy") {
    // Buying base asset: pay quote, receive base
    // Debit locked quote asset (was locked when order placed)
    const debitResult = await debitLockedSpotBalance(
      normalizedAddress,
      normalizedQuoteAsset,
      quoteAmount,
      `Spot trade: buy ${baseAmount} ${normalizedBaseAsset}`,
      referenceId
    );
    
    if (!debitResult.success) {
      return { success: false, error: debitResult.error };
    }
    
    // Credit base asset
    const creditResult = await creditSpotBalanceByAddress(
      normalizedAddress,
      normalizedBaseAsset,
      baseAmount,
      `Spot trade: bought ${baseAmount} ${normalizedBaseAsset}`,
      referenceId
    );
    
    if (!creditResult.success) {
      // Rollback: re-credit the quote asset
      await creditSpotBalanceByAddress(
        normalizedAddress,
        normalizedQuoteAsset,
        quoteAmount,
        `Rollback: failed to credit ${normalizedBaseAsset}`,
        referenceId
      );
      return { success: false, error: creditResult.error };
    }
  } else {
    // Selling base asset: pay base, receive quote
    // Debit locked base asset (was locked when order placed)
    const debitResult = await debitLockedSpotBalance(
      normalizedAddress,
      normalizedBaseAsset,
      baseAmount,
      `Spot trade: sell ${baseAmount} ${normalizedBaseAsset}`,
      referenceId
    );
    
    if (!debitResult.success) {
      return { success: false, error: debitResult.error };
    }
    
    // Credit quote asset
    const creditResult = await creditSpotBalanceByAddress(
      normalizedAddress,
      normalizedQuoteAsset,
      quoteAmount,
      `Spot trade: sold ${baseAmount} ${normalizedBaseAsset}`,
      referenceId
    );
    
    if (!creditResult.success) {
      // Rollback: re-credit the base asset
      await creditSpotBalanceByAddress(
        normalizedAddress,
        normalizedBaseAsset,
        baseAmount,
        `Rollback: failed to credit ${normalizedQuoteAsset}`,
        referenceId
      );
      return { success: false, error: creditResult.error };
    }
  }
  
  return { success: true };
}

/**
 * Debit from locked balance (used during trade settlement)
 * For USD, uses the main perp balance
 */
async function debitLockedSpotBalance(
  address: string,
  asset: string,
  amount: number,
  reason: string,
  referenceId?: string
): Promise<SpotBalanceOperationResult> {
  if (amount <= 0) {
    return { success: false, error: "Amount must be positive" };
  }

  const normalizedAsset = asset.toUpperCase();
  
  // USD uses the main perp balance
  if (isUsdAsset(normalizedAsset)) {
    // For perp balance, debitBalanceByAddress debits from locked first
    const result = await debitBalanceByAddress(address, amount, `[SPOT] ${reason}`, referenceId);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true };
  }

  const balance = await SpotBalance.findOne({ 
    address: address.toLowerCase(),
    asset: normalizedAsset
  });
  
  if (!balance) {
    return { success: false, error: `Balance not found for asset ${asset}` };
  }
  
  if (balance.locked < amount) {
    return { success: false, error: `Insufficient locked ${asset} balance` };
  }
  
  const change: ISpotBalanceChange = {
    amount,
    type: "debit",
    reason,
    timestamp: new Date(),
    referenceId,
  };
  
  balance.locked -= amount;
  balance.totalDebits += amount;
  balance.changes.push(change);
  
  await balance.save();
  
  return { success: true, balance };
}

// ============ History ============

/**
 * Get balance change history for a specific asset
 */
export async function getSpotBalanceHistory(
  address: string,
  asset: string,
  limit: number = 50,
  offset: number = 0
): Promise<ISpotBalanceChange[]> {
  const balance = await SpotBalance.findOne({ 
    address: address.toLowerCase(),
    asset: asset.toUpperCase()
  });
  
  if (!balance) {
    return [];
  }
  
  return balance.changes
    .slice()
    .reverse()
    .slice(offset, offset + limit);
}

/**
 * Check if user has sufficient free balance for an asset
 */
export async function hasSufficientSpotBalance(
  address: string,
  asset: string,
  amount: number
): Promise<boolean> {
  const balance = await getSpotBalanceByAddress(address, asset);
  return balance ? balance.free >= amount : false;
}
