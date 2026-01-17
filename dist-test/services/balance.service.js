"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrCreateBalance = getOrCreateBalance;
exports.getBalanceByAddress = getBalanceByAddress;
exports.getBalanceByUserId = getBalanceByUserId;
exports.creditBalance = creditBalance;
exports.debitBalance = debitBalance;
exports.lockBalance = lockBalance;
exports.unlockBalance = unlockBalance;
exports.getBalanceHistory = getBalanceHistory;
exports.lockBalanceByAddress = lockBalanceByAddress;
exports.unlockBalanceByAddress = unlockBalanceByAddress;
exports.creditBalanceByAddress = creditBalanceByAddress;
exports.debitBalanceByAddress = debitBalanceByAddress;
var balance_model_1 = require("../models/balance.model");
/**
 * Get or create a balance record for a user
 */
function getOrCreateBalance(userId, address) {
    return __awaiter(this, void 0, void 0, function () {
        var normalizedAddress, balance;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    normalizedAddress = address.toLowerCase();
                    return [4 /*yield*/, balance_model_1.Balance.findOne({ userId: userId })];
                case 1:
                    balance = _a.sent();
                    if (!!balance) return [3 /*break*/, 3];
                    return [4 /*yield*/, balance_model_1.Balance.create({
                            userId: userId,
                            address: normalizedAddress,
                            free: 0,
                            locked: 0,
                            totalCredits: 0,
                            totalDebits: 0,
                            changes: [],
                        })];
                case 2:
                    balance = _a.sent();
                    _a.label = 3;
                case 3: return [2 /*return*/, balance];
            }
        });
    });
}
/**
 * Get balance by address
 */
function getBalanceByAddress(address) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, balance_model_1.Balance.findOne({ address: address.toLowerCase() })];
        });
    });
}
/**
 * Get balance by user ID
 */
function getBalanceByUserId(userId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, balance_model_1.Balance.findOne({ userId: userId })];
        });
    });
}
/**
 * Credit free balance (add money)
 */
function creditBalance(userId, address, amount, reason, referenceId) {
    return __awaiter(this, void 0, void 0, function () {
        var balance, change;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (amount <= 0) {
                        return [2 /*return*/, { success: false, error: "Amount must be positive" }];
                    }
                    return [4 /*yield*/, getOrCreateBalance(userId, address)];
                case 1:
                    balance = _a.sent();
                    change = {
                        amount: amount,
                        type: "credit",
                        reason: reason,
                        timestamp: new Date(),
                        referenceId: referenceId,
                    };
                    balance.free += amount;
                    balance.totalCredits += amount;
                    balance.changes.push(change);
                    return [4 /*yield*/, balance.save()];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { success: true, balance: balance }];
            }
        });
    });
}
/**
 * Debit free balance (remove money)
 */
function debitBalance(userId, amount, reason, referenceId) {
    return __awaiter(this, void 0, void 0, function () {
        var balance, change;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (amount <= 0) {
                        return [2 /*return*/, { success: false, error: "Amount must be positive" }];
                    }
                    return [4 /*yield*/, balance_model_1.Balance.findOne({ userId: userId })];
                case 1:
                    balance = _a.sent();
                    if (!balance) {
                        return [2 /*return*/, { success: false, error: "Balance not found" }];
                    }
                    if (balance.free < amount) {
                        return [2 /*return*/, { success: false, error: "Insufficient free balance" }];
                    }
                    change = {
                        amount: amount,
                        type: "debit",
                        reason: reason,
                        timestamp: new Date(),
                        referenceId: referenceId,
                    };
                    balance.free -= amount;
                    balance.totalDebits += amount;
                    balance.changes.push(change);
                    return [4 /*yield*/, balance.save()];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { success: true, balance: balance }];
            }
        });
    });
}
/**
 * Lock balance (move from free to locked)
 */
function lockBalance(userId, amount, reason, referenceId) {
    return __awaiter(this, void 0, void 0, function () {
        var balance, change;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (amount <= 0) {
                        return [2 /*return*/, { success: false, error: "Amount must be positive" }];
                    }
                    return [4 /*yield*/, balance_model_1.Balance.findOne({ userId: userId })];
                case 1:
                    balance = _a.sent();
                    if (!balance) {
                        return [2 /*return*/, { success: false, error: "Balance not found" }];
                    }
                    if (balance.free < amount) {
                        return [2 /*return*/, { success: false, error: "Insufficient free balance to lock" }];
                    }
                    change = {
                        amount: amount,
                        type: "lock",
                        reason: reason,
                        timestamp: new Date(),
                        referenceId: referenceId,
                    };
                    balance.free -= amount;
                    balance.locked += amount;
                    balance.changes.push(change);
                    return [4 /*yield*/, balance.save()];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { success: true, balance: balance }];
            }
        });
    });
}
/**
 * Unlock balance (move from locked to free)
 */
function unlockBalance(userId, amount, reason, referenceId) {
    return __awaiter(this, void 0, void 0, function () {
        var balance, change;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (amount <= 0) {
                        return [2 /*return*/, { success: false, error: "Amount must be positive" }];
                    }
                    return [4 /*yield*/, balance_model_1.Balance.findOne({ userId: userId })];
                case 1:
                    balance = _a.sent();
                    if (!balance) {
                        return [2 /*return*/, { success: false, error: "Balance not found" }];
                    }
                    if (balance.locked < amount) {
                        return [2 /*return*/, { success: false, error: "Insufficient locked balance to unlock" }];
                    }
                    change = {
                        amount: amount,
                        type: "unlock",
                        reason: reason,
                        timestamp: new Date(),
                        referenceId: referenceId,
                    };
                    balance.locked -= amount;
                    balance.free += amount;
                    balance.changes.push(change);
                    return [4 /*yield*/, balance.save()];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { success: true, balance: balance }];
            }
        });
    });
}
/**
 * Get balance change history
 */
function getBalanceHistory(userId_1) {
    return __awaiter(this, arguments, void 0, function (userId, limit, offset) {
        var balance;
        if (limit === void 0) { limit = 50; }
        if (offset === void 0) { offset = 0; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, balance_model_1.Balance.findOne({ userId: userId })];
                case 1:
                    balance = _a.sent();
                    if (!balance) {
                        return [2 /*return*/, []];
                    }
                    // Return changes in reverse chronological order
                    return [2 /*return*/, balance.changes
                            .slice()
                            .reverse()
                            .slice(offset, offset + limit)];
            }
        });
    });
}
// ============ Address-based functions for CLOB ============
/**
 * Lock balance by address (for CLOB orders)
 */
function lockBalanceByAddress(address, amount, reason, referenceId) {
    return __awaiter(this, void 0, void 0, function () {
        var balance, change;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (amount <= 0) {
                        return [2 /*return*/, { success: false, error: "Amount must be positive" }];
                    }
                    return [4 /*yield*/, balance_model_1.Balance.findOne({ address: address.toLowerCase() })];
                case 1:
                    balance = _a.sent();
                    if (!balance) {
                        return [2 /*return*/, { success: false, error: "Balance not found" }];
                    }
                    if (balance.free < amount) {
                        return [2 /*return*/, { success: false, error: "Insufficient free balance to lock" }];
                    }
                    change = {
                        amount: amount,
                        type: "lock",
                        reason: reason,
                        timestamp: new Date(),
                        referenceId: referenceId,
                    };
                    balance.free -= amount;
                    balance.locked += amount;
                    balance.changes.push(change);
                    return [4 /*yield*/, balance.save()];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { success: true, balance: balance }];
            }
        });
    });
}
/**
 * Unlock balance by address (for CLOB orders)
 */
function unlockBalanceByAddress(address, amount, reason, referenceId) {
    return __awaiter(this, void 0, void 0, function () {
        var balance, change;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (amount <= 0) {
                        return [2 /*return*/, { success: false, error: "Amount must be positive" }];
                    }
                    return [4 /*yield*/, balance_model_1.Balance.findOne({ address: address.toLowerCase() })];
                case 1:
                    balance = _a.sent();
                    if (!balance) {
                        return [2 /*return*/, { success: false, error: "Balance not found" }];
                    }
                    if (balance.locked < amount) {
                        return [2 /*return*/, { success: false, error: "Insufficient locked balance to unlock" }];
                    }
                    change = {
                        amount: amount,
                        type: "unlock",
                        reason: reason,
                        timestamp: new Date(),
                        referenceId: referenceId,
                    };
                    balance.locked -= amount;
                    balance.free += amount;
                    balance.changes.push(change);
                    return [4 /*yield*/, balance.save()];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { success: true, balance: balance }];
            }
        });
    });
}
/**
 * Credit balance by address (for PnL settlements)
 */
function creditBalanceByAddress(address, amount, reason, referenceId) {
    return __awaiter(this, void 0, void 0, function () {
        var balance, change;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (amount <= 0) {
                        return [2 /*return*/, { success: false, error: "Amount must be positive" }];
                    }
                    return [4 /*yield*/, balance_model_1.Balance.findOne({ address: address.toLowerCase() })];
                case 1:
                    balance = _a.sent();
                    if (!balance) {
                        return [2 /*return*/, { success: false, error: "Balance not found" }];
                    }
                    change = {
                        amount: amount,
                        type: "credit",
                        reason: reason,
                        timestamp: new Date(),
                        referenceId: referenceId,
                    };
                    balance.free += amount;
                    balance.totalCredits += amount;
                    balance.changes.push(change);
                    return [4 /*yield*/, balance.save()];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { success: true, balance: balance }];
            }
        });
    });
}
/**
 * Debit balance by address (for losses)
 */
function debitBalanceByAddress(address, amount, reason, referenceId) {
    return __awaiter(this, void 0, void 0, function () {
        var balance, totalAvailable, change, remaining;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (amount <= 0) {
                        return [2 /*return*/, { success: false, error: "Amount must be positive" }];
                    }
                    return [4 /*yield*/, balance_model_1.Balance.findOne({ address: address.toLowerCase() })];
                case 1:
                    balance = _a.sent();
                    if (!balance) {
                        return [2 /*return*/, { success: false, error: "Balance not found" }];
                    }
                    totalAvailable = balance.free + balance.locked;
                    if (totalAvailable < amount) {
                        return [2 /*return*/, { success: false, error: "Insufficient balance" }];
                    }
                    change = {
                        amount: amount,
                        type: "debit",
                        reason: reason,
                        timestamp: new Date(),
                        referenceId: referenceId,
                    };
                    // First debit from locked, then from free
                    if (balance.locked >= amount) {
                        balance.locked -= amount;
                    }
                    else {
                        remaining = amount - balance.locked;
                        balance.locked = 0;
                        balance.free -= remaining;
                    }
                    balance.totalDebits += amount;
                    balance.changes.push(change);
                    return [4 /*yield*/, balance.save()];
                case 2:
                    _a.sent();
                    return [2 /*return*/, { success: true, balance: balance }];
            }
        });
    });
}
