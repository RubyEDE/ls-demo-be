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
var viem_1 = require("viem");
var auth_service_1 = require("../services/auth.service");
var token_service_1 = require("../services/token.service");
var user_service_1 = require("../services/user.service");
var auth_middleware_1 = require("../middleware/auth.middleware");
var router = (0, express_1.Router)();
/**
 * GET /auth/nonce
 * Generate a nonce and SIWE message for the given wallet address
 */
router.get("/nonce", function (req, res) {
    var _a = req.query, address = _a.address, chainId = _a.chainId;
    if (!address || typeof address !== "string") {
        res.status(400).json({
            error: "INVALID_REQUEST",
            message: "Address query parameter is required",
        });
        return;
    }
    if (!(0, viem_1.isAddress)(address)) {
        res.status(400).json({
            error: "INVALID_ADDRESS",
            message: "Invalid Ethereum address format",
        });
        return;
    }
    var chain = chainId ? parseInt(chainId, 10) : 1;
    var nonce = (0, auth_service_1.createNonce)(address);
    var message = (0, auth_service_1.createSiweMessage)(address, nonce, chain);
    res.json({ nonce: nonce, message: message });
});
/**
 * POST /auth/verify
 * Verify the signed SIWE message and issue a JWT token
 */
router.post("/verify", function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, message, signature, result, _b, user, isNewUser, token, expiresAt;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                _a = req.body, message = _a.message, signature = _a.signature;
                if (!message || !signature) {
                    res.status(400).json({
                        error: "INVALID_REQUEST",
                        message: "Message and signature are required",
                    });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, auth_service_1.verifySiweMessage)(message, signature)];
            case 1:
                result = _c.sent();
                if (!result.success) {
                    res.status(401).json({
                        error: "VERIFICATION_FAILED",
                        message: result.error,
                    });
                    return [2 /*return*/];
                }
                return [4 /*yield*/, (0, user_service_1.findOrCreateUser)(result.address, result.chainId)];
            case 2:
                _b = _c.sent(), user = _b.user, isNewUser = _b.isNewUser;
                token = (0, token_service_1.generateToken)(result.address, result.chainId);
                expiresAt = (0, token_service_1.getTokenExpiration)();
                res.json({
                    token: token,
                    address: result.address,
                    expiresAt: expiresAt,
                    isNewUser: isNewUser,
                    userId: user._id,
                });
                return [2 /*return*/];
        }
    });
}); });
/**
 * GET /auth/me
 * Get the current authenticated user's info (protected route example)
 */
router.get("/me", auth_middleware_1.authMiddleware, function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    var user, _a;
    var _b, _c, _d, _e, _f;
    return __generator(this, function (_g) {
        switch (_g.label) {
            case 0:
                if (!((_b = req.auth) === null || _b === void 0 ? void 0 : _b.address)) return [3 /*break*/, 2];
                return [4 /*yield*/, (0, user_service_1.findUserByAddress)(req.auth.address)];
            case 1:
                _a = _g.sent();
                return [3 /*break*/, 3];
            case 2:
                _a = null;
                _g.label = 3;
            case 3:
                user = _a;
                res.json({
                    address: (_c = req.auth) === null || _c === void 0 ? void 0 : _c.address,
                    chainId: (_d = req.auth) === null || _d === void 0 ? void 0 : _d.chainId,
                    authenticatedAt: ((_e = req.auth) === null || _e === void 0 ? void 0 : _e.iat) ? new Date(req.auth.iat * 1000).toISOString() : null,
                    expiresAt: ((_f = req.auth) === null || _f === void 0 ? void 0 : _f.exp) ? new Date(req.auth.exp * 1000).toISOString() : null,
                    user: user ? {
                        id: user._id,
                        createdAt: user.createdAt,
                        lastLoginAt: user.lastLoginAt,
                    } : null,
                });
                return [2 /*return*/];
        }
    });
}); });
exports.default = router;
