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
var express_1 = require("express");
var auth_middleware_1 = require("../middleware/auth.middleware");
var user_service_1 = require("../services/user.service");
var balance_service_1 = require("../services/balance.service");
var faucet_service_1 = require("../services/faucet.service");
var router = (0, express_1.Router)();
/**
 * GET /faucet/balance
 * Get the current user's balance
 */
router.get("/balance", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var address, user, balance;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                address = (_a = req.auth) === null || _a === void 0 ? void 0 : _a.address;
                if (!address) {
                    res.status(401).json({ error: "UNAUTHORIZED", message: "Not authenticated" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, user_service_1.findUserByAddress)(address)];
            case 1:
                user = _b.sent();
                if (!user) {
                    res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, balance_service_1.getOrCreateBalance)(user._id, address)];
            case 2:
                balance = _b.sent();
                res.json({
                    address: balance.address,
                    free: balance.free,
                    locked: balance.locked,
                    total: balance.free + balance.locked,
                    totalCredits: balance.totalCredits,
                    totalDebits: balance.totalDebits,
                });
                return [2 /*return*/];
        }
    });
}); });
/**
 * GET /faucet/balance/history
 * Get the current user's balance change history
 */
router.get("/balance/history", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var address, limit, offset, user, history;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                address = (_a = req.auth) === null || _a === void 0 ? void 0 : _a.address;
                limit = Math.min(parseInt(req.query.limit) || 50, 100);
                offset = parseInt(req.query.offset) || 0;
                if (!address) {
                    res.status(401).json({ error: "UNAUTHORIZED", message: "Not authenticated" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, user_service_1.findUserByAddress)(address)];
            case 1:
                user = _b.sent();
                if (!user) {
                    res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, balance_service_1.getBalanceHistory)(user._id, limit, offset)];
            case 2:
                history = _b.sent();
                res.json({
                    history: history,
                    limit: limit,
                    offset: offset,
                });
                return [2 /*return*/];
        }
    });
}); });
/**
 * POST /faucet/request
 * Request tokens from the faucet (once per day)
 */
router.post("/request", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var address, user, ipAddress, userAgent, result;
    var _a, _b, _c, _d, _e, _f, _g;
    return __generator(this, function (_h) {
        switch (_h.label) {
            case 0:
                address = (_a = req.auth) === null || _a === void 0 ? void 0 : _a.address;
                if (!address) {
                    res.status(401).json({ error: "UNAUTHORIZED", message: "Not authenticated" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, user_service_1.findUserByAddress)(address)];
            case 1:
                user = _h.sent();
                if (!user) {
                    res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
                    return [2 /*return*/];
                }
                ipAddress = req.ip || req.socket.remoteAddress;
                userAgent = req.headers["user-agent"];
                return [4 /*yield*/, (0, faucet_service_1.requestFromFaucet)(user._id, address, ipAddress, userAgent)];
            case 2:
                result = _h.sent();
                if (!result.success) {
                    res.status(429).json({
                        error: "RATE_LIMITED",
                        message: result.error,
                        nextRequestAt: (_b = result.nextRequestAt) === null || _b === void 0 ? void 0 : _b.toISOString(),
                    });
                    return [2 /*return*/];
                }
                res.json({
                    success: true,
                    amount: result.amount,
                    balance: {
                        free: (_c = result.balance) === null || _c === void 0 ? void 0 : _c.free,
                        locked: (_d = result.balance) === null || _d === void 0 ? void 0 : _d.locked,
                        total: (((_e = result.balance) === null || _e === void 0 ? void 0 : _e.free) || 0) + (((_f = result.balance) === null || _f === void 0 ? void 0 : _f.locked) || 0),
                    },
                    nextRequestAt: (_g = result.nextRequestAt) === null || _g === void 0 ? void 0 : _g.toISOString(),
                });
                return [2 /*return*/];
        }
    });
}); });
/**
 * GET /faucet/stats
 * Get the current user's faucet statistics
 */
router.get("/stats", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var address, user, stats;
    var _a, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                address = (_a = req.auth) === null || _a === void 0 ? void 0 : _a.address;
                if (!address) {
                    res.status(401).json({ error: "UNAUTHORIZED", message: "Not authenticated" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, user_service_1.findUserByAddress)(address)];
            case 1:
                user = _d.sent();
                if (!user) {
                    res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, faucet_service_1.getFaucetStats)(user._id)];
            case 2:
                stats = _d.sent();
                res.json({
                    totalRequests: stats.totalRequests,
                    totalAmountReceived: stats.totalAmountDistributed,
                    lastRequestAt: ((_b = stats.lastRequestAt) === null || _b === void 0 ? void 0 : _b.toISOString()) || null,
                    nextRequestAt: ((_c = stats.nextRequestAt) === null || _c === void 0 ? void 0 : _c.toISOString()) || null,
                    canRequest: stats.canRequest,
                });
                return [2 /*return*/];
        }
    });
}); });
/**
 * GET /faucet/history
 * Get the current user's faucet request history
 */
router.get("/history", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var address, limit, offset, user, history;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                address = (_a = req.auth) === null || _a === void 0 ? void 0 : _a.address;
                limit = Math.min(parseInt(req.query.limit) || 50, 100);
                offset = parseInt(req.query.offset) || 0;
                if (!address) {
                    res.status(401).json({ error: "UNAUTHORIZED", message: "Not authenticated" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, user_service_1.findUserByAddress)(address)];
            case 1:
                user = _b.sent();
                if (!user) {
                    res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, faucet_service_1.getFaucetHistory)(user._id, limit, offset)];
            case 2:
                history = _b.sent();
                res.json({
                    history: history.map(function (h) { return ({
                        amount: h.amount,
                        createdAt: h.createdAt.toISOString(),
                    }); }),
                    limit: limit,
                    offset: offset,
                });
                return [2 /*return*/];
        }
    });
}); });
/**
 * GET /faucet/global-stats
 * Get global faucet statistics (public endpoint)
 */
router.get("/global-stats", function (_req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var stats;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, faucet_service_1.getGlobalFaucetStats)()];
            case 1:
                stats = _a.sent();
                res.json({
                    totalRequests: stats.totalRequests,
                    totalAmountDistributed: stats.totalAmountDistributed,
                    uniqueUsers: stats.uniqueUsers,
                });
                return [2 /*return*/];
        }
    });
}); });
/**
 * POST /faucet/lock
 * Lock a portion of free balance
 */
router.post("/lock", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var address, _a, amount, reason, user, result;
    var _b, _c, _d, _e, _f;
    return __generator(this, function (_g) {
        switch (_g.label) {
            case 0:
                address = (_b = req.auth) === null || _b === void 0 ? void 0 : _b.address;
                _a = req.body, amount = _a.amount, reason = _a.reason;
                if (!address) {
                    res.status(401).json({ error: "UNAUTHORIZED", message: "Not authenticated" });
                    return [2 /*return*/];
                }
                if (!amount || amount <= 0) {
                    res.status(400).json({ error: "INVALID_AMOUNT", message: "Amount must be positive" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, user_service_1.findUserByAddress)(address)];
            case 1:
                user = _g.sent();
                if (!user) {
                    res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, balance_service_1.lockBalance)(user._id, amount, reason || "Manual lock")];
            case 2:
                result = _g.sent();
                if (!result.success) {
                    res.status(400).json({ error: "LOCK_FAILED", message: result.error });
                    return [2 /*return*/];
                }
                res.json({
                    success: true,
                    balance: {
                        free: (_c = result.balance) === null || _c === void 0 ? void 0 : _c.free,
                        locked: (_d = result.balance) === null || _d === void 0 ? void 0 : _d.locked,
                        total: (((_e = result.balance) === null || _e === void 0 ? void 0 : _e.free) || 0) + (((_f = result.balance) === null || _f === void 0 ? void 0 : _f.locked) || 0),
                    },
                });
                return [2 /*return*/];
        }
    });
}); });
/**
 * POST /faucet/unlock
 * Unlock a portion of locked balance
 */
router.post("/unlock", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var address, _a, amount, reason, user, result;
    var _b, _c, _d, _e, _f;
    return __generator(this, function (_g) {
        switch (_g.label) {
            case 0:
                address = (_b = req.auth) === null || _b === void 0 ? void 0 : _b.address;
                _a = req.body, amount = _a.amount, reason = _a.reason;
                if (!address) {
                    res.status(401).json({ error: "UNAUTHORIZED", message: "Not authenticated" });
                    return [2 /*return*/];
                }
                if (!amount || amount <= 0) {
                    res.status(400).json({ error: "INVALID_AMOUNT", message: "Amount must be positive" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, user_service_1.findUserByAddress)(address)];
            case 1:
                user = _g.sent();
                if (!user) {
                    res.status(404).json({ error: "NOT_FOUND", message: "User not found" });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, balance_service_1.unlockBalance)(user._id, amount, reason || "Manual unlock")];
            case 2:
                result = _g.sent();
                if (!result.success) {
                    res.status(400).json({ error: "UNLOCK_FAILED", message: result.error });
                    return [2 /*return*/];
                }
                res.json({
                    success: true,
                    balance: {
                        free: (_c = result.balance) === null || _c === void 0 ? void 0 : _c.free,
                        locked: (_d = result.balance) === null || _d === void 0 ? void 0 : _d.locked,
                        total: (((_e = result.balance) === null || _e === void 0 ? void 0 : _e.free) || 0) + (((_f = result.balance) === null || _f === void 0 ? void 0 : _f.locked) || 0),
                    },
                });
                return [2 /*return*/];
        }
    });
}); });
exports.default = router;
