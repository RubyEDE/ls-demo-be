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
exports.canRequestFromFaucet = canRequestFromFaucet;
exports.requestFromFaucet = requestFromFaucet;
exports.getFaucetStats = getFaucetStats;
exports.getFaucetHistory = getFaucetHistory;
exports.getGlobalFaucetStats = getGlobalFaucetStats;
var faucet_request_model_1 = require("../models/faucet-request.model");
var balance_service_1 = require("./balance.service");
// Faucet configuration
var FAUCET_AMOUNT = 100; // Amount given per request
var COOLDOWN_HOURS = 24; // Hours between requests
/**
 * Get the start of today (for daily limit checks)
 */
function getCooldownStartTime() {
    var now = new Date();
    return new Date(now.getTime() - COOLDOWN_HOURS * 60 * 60 * 1000);
}
/**
 * Check if user can request from faucet
 */
function canRequestFromFaucet(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var cooldownStart, lastRequest, nextRequestAt, lastRequestEver;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    cooldownStart = getCooldownStartTime();
                    return [4 /*yield*/, faucet_request_model_1.FaucetRequest.findOne({
                            userId: userId,
                            createdAt: { $gte: cooldownStart },
                        }).sort({ createdAt: -1 })];
                case 1:
                    lastRequest = _a.sent();
                    if (lastRequest) {
                        nextRequestAt = new Date(lastRequest.createdAt.getTime() + COOLDOWN_HOURS * 60 * 60 * 1000);
                        return [2 /*return*/, { canRequest: false, nextRequestAt: nextRequestAt, lastRequest: lastRequest }];
                    }
                    return [4 /*yield*/, faucet_request_model_1.FaucetRequest.findOne({ userId: userId }).sort({
                            createdAt: -1,
                        })];
                case 2:
                    lastRequestEver = _a.sent();
                    return [2 /*return*/, { canRequest: true, nextRequestAt: null, lastRequest: lastRequestEver }];
            }
        });
    });
}
/**
 * Request tokens from the faucet
 */
function requestFromFaucet(userId, address, ipAddress, userAgent) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, canRequest, nextRequestAt, creditResult, newNextRequestAt;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, canRequestFromFaucet(userId)];
                case 1:
                    _a = _b.sent(), canRequest = _a.canRequest, nextRequestAt = _a.nextRequestAt;
                    if (!canRequest) {
                        return [2 /*return*/, {
                                success: false,
                                nextRequestAt: nextRequestAt,
                                error: "You can only request once every ".concat(COOLDOWN_HOURS, " hours"),
                            }];
                    }
                    // Ensure balance exists
                    return [4 /*yield*/, (0, balance_service_1.getOrCreateBalance)(userId, address)];
                case 2:
                    // Ensure balance exists
                    _b.sent();
                    return [4 /*yield*/, (0, balance_service_1.creditBalance)(userId, address, FAUCET_AMOUNT, "Faucet request", "faucet_".concat(Date.now()))];
                case 3:
                    creditResult = _b.sent();
                    if (!creditResult.success) {
                        return [2 /*return*/, {
                                success: false,
                                error: creditResult.error,
                            }];
                    }
                    // Record the faucet request
                    return [4 /*yield*/, faucet_request_model_1.FaucetRequest.create({
                            userId: userId,
                            address: address.toLowerCase(),
                            amount: FAUCET_AMOUNT,
                            ipAddress: ipAddress,
                            userAgent: userAgent,
                        })];
                case 4:
                    // Record the faucet request
                    _b.sent();
                    newNextRequestAt = new Date(Date.now() + COOLDOWN_HOURS * 60 * 60 * 1000);
                    return [2 /*return*/, {
                            success: true,
                            amount: FAUCET_AMOUNT,
                            balance: creditResult.balance,
                            nextRequestAt: newNextRequestAt,
                        }];
            }
        });
    });
}
/**
 * Get faucet statistics for a user
 */
function getFaucetStats(userId) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, totalRequests, totalAmountResult, _b, canRequest, nextRequestAt, lastRequest, totalAmountDistributed;
        var _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, Promise.all([
                        faucet_request_model_1.FaucetRequest.countDocuments({ userId: userId }),
                        faucet_request_model_1.FaucetRequest.aggregate([
                            { $match: { userId: userId } },
                            { $group: { _id: null, total: { $sum: "$amount" } } },
                        ]),
                        canRequestFromFaucet(userId),
                    ])];
                case 1:
                    _a = _d.sent(), totalRequests = _a[0], totalAmountResult = _a[1], _b = _a[2], canRequest = _b.canRequest, nextRequestAt = _b.nextRequestAt, lastRequest = _b.lastRequest;
                    totalAmountDistributed = ((_c = totalAmountResult[0]) === null || _c === void 0 ? void 0 : _c.total) || 0;
                    return [2 /*return*/, {
                            totalRequests: totalRequests,
                            totalAmountDistributed: totalAmountDistributed,
                            lastRequestAt: (lastRequest === null || lastRequest === void 0 ? void 0 : lastRequest.createdAt) || null,
                            nextRequestAt: nextRequestAt,
                            canRequest: canRequest,
                        }];
            }
        });
    });
}
/**
 * Get faucet request history for a user
 */
function getFaucetHistory(userId_1) {
    return __awaiter(this, arguments, void 0, function (userId, limit, offset) {
        if (limit === void 0) { limit = 50; }
        if (offset === void 0) { offset = 0; }
        return __generator(this, function (_a) {
            return [2 /*return*/, faucet_request_model_1.FaucetRequest.find({ userId: userId })
                    .sort({ createdAt: -1 })
                    .skip(offset)
                    .limit(limit)];
        });
    });
}
/**
 * Get global faucet statistics
 */
function getGlobalFaucetStats() {
    return __awaiter(this, void 0, void 0, function () {
        var _a, totalRequests, totalAmountResult, uniqueUsers;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, Promise.all([
                        faucet_request_model_1.FaucetRequest.countDocuments(),
                        faucet_request_model_1.FaucetRequest.aggregate([
                            { $group: { _id: null, total: { $sum: "$amount" } } },
                        ]),
                        faucet_request_model_1.FaucetRequest.distinct("userId").then(function (ids) { return ids.length; }),
                    ])];
                case 1:
                    _a = _c.sent(), totalRequests = _a[0], totalAmountResult = _a[1], uniqueUsers = _a[2];
                    return [2 /*return*/, {
                            totalRequests: totalRequests,
                            totalAmountDistributed: ((_b = totalAmountResult[0]) === null || _b === void 0 ? void 0 : _b.total) || 0,
                            uniqueUsers: uniqueUsers,
                        }];
            }
        });
    });
}
