"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.startLiquidationEngine = startLiquidationEngine;
exports.stopLiquidationEngine = stopLiquidationEngine;
exports.isLiquidationEngineRunning = isLiquidationEngineRunning;
exports.getLiquidationStats = getLiquidationStats;
exports.checkPositionLiquidation = checkPositionLiquidation;
exports.getPositionsAtRiskOfLiquidation = getPositionsAtRiskOfLiquidation;
var position_model_1 = require("../models/position.model");
var market_service_1 = require("./market.service");
var websocket_service_1 = require("./websocket.service");
var balance_service_1 = require("./balance.service");
var position_service_1 = require("./position.service");
// Liquidation check interval
var liquidationInterval = null;
var liquidationStats = {
    totalLiquidations: 0,
    totalValueLiquidated: 0,
    lastLiquidationAt: null,
};
/**
 * Execute liquidation for a single position
 * When liquidated:
 * - Position is closed at the liquidation price
 * - User loses their remaining margin (absorbed by the system)
 * - Position status is set to "liquidated"
 */
function executePositionLiquidation(position, currentPrice) {
    return __awaiter(this, void 0, void 0, function () {
        var unrealizedPnl, marginRemaining, liquidatedSize, liquidatedNotional, update, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 5, , 6]);
                    unrealizedPnl = (0, position_service_1.calculateUnrealizedPnl)(position, currentPrice);
                    marginRemaining = position.margin + unrealizedPnl;
                    // Update position status
                    position.status = "liquidated";
                    position.closedAt = new Date();
                    position.lastUpdatedAt = new Date();
                    position.realizedPnl += unrealizedPnl;
                    position.unrealizedPnl = 0;
                    liquidatedSize = position.size;
                    liquidatedNotional = position.entryPrice * liquidatedSize;
                    // Zero out the position
                    position.size = 0;
                    position.margin = 0;
                    position.leverage = 0;
                    position.liquidationPrice = 0;
                    return [4 /*yield*/, position.save()];
                case 1:
                    _a.sent();
                    if (!(marginRemaining > 0)) return [3 /*break*/, 3];
                    return [4 /*yield*/, (0, balance_service_1.creditBalanceByAddress)(position.userAddress, marginRemaining, "Liquidation settlement - ".concat(position.marketSymbol), position.positionId)];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    if (marginRemaining < 0) {
                        // Bad debt - in production, this would come from an insurance fund
                        // For now, we just log it
                        console.warn("\u26A0\uFE0F Bad debt from liquidation: $".concat(Math.abs(marginRemaining).toFixed(2), " for position ").concat(position.positionId));
                    }
                    _a.label = 4;
                case 4:
                    update = {
                        positionId: position.positionId,
                        marketSymbol: position.marketSymbol,
                        side: position.side,
                        size: 0,
                        entryPrice: position.entryPrice,
                        markPrice: currentPrice,
                        margin: 0,
                        leverage: 0,
                        unrealizedPnl: 0,
                        realizedPnl: position.realizedPnl,
                        liquidationPrice: 0,
                        status: "liquidated",
                        timestamp: Date.now(),
                    };
                    (0, websocket_service_1.sendPositionUpdate)(position.userAddress, update);
                    // Update stats
                    liquidationStats.totalLiquidations++;
                    liquidationStats.totalValueLiquidated += liquidatedNotional;
                    liquidationStats.lastLiquidationAt = new Date();
                    console.log("\uD83D\uDD25 LIQUIDATION: ".concat(position.side.toUpperCase(), " ").concat(liquidatedSize, " ").concat(position.marketSymbol, " ") +
                        "@ $".concat(currentPrice.toFixed(2), " | User: ").concat(position.userAddress.slice(0, 10), "... | ") +
                        "Entry: $".concat(position.entryPrice.toFixed(2), " | Loss: $").concat(Math.abs(unrealizedPnl).toFixed(2)));
                    return [2 /*return*/, true];
                case 5:
                    error_1 = _a.sent();
                    console.error("Failed to liquidate position ".concat(position.positionId, ":"), error_1);
                    return [2 /*return*/, false];
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * Scan all open positions for a specific market and liquidate underwater ones
 */
function scanMarketForLiquidations(marketSymbol) {
    return __awaiter(this, void 0, void 0, function () {
        var currentPrice, positions, liquidationCount, _i, positions_1, position, success;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    currentPrice = (0, market_service_1.getCachedPrice)(marketSymbol);
                    if (!currentPrice) {
                        return [2 /*return*/, 0];
                    }
                    return [4 /*yield*/, position_model_1.Position.find({
                            marketSymbol: marketSymbol.toUpperCase(),
                            status: "open",
                            size: { $gt: 0 },
                        })];
                case 1:
                    positions = _a.sent();
                    liquidationCount = 0;
                    _i = 0, positions_1 = positions;
                    _a.label = 2;
                case 2:
                    if (!(_i < positions_1.length)) return [3 /*break*/, 5];
                    position = positions_1[_i];
                    if (!(0, position_service_1.wouldBeLiquidated)(position, currentPrice)) return [3 /*break*/, 4];
                    return [4 /*yield*/, executePositionLiquidation(position, currentPrice)];
                case 3:
                    success = _a.sent();
                    if (success) {
                        liquidationCount++;
                    }
                    _a.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/, liquidationCount];
            }
        });
    });
}
/**
 * Scan all markets for liquidations
 */
function scanAllMarketsForLiquidations() {
    return __awaiter(this, void 0, void 0, function () {
        var markets, totalLiquidations, _i, markets_1, marketSymbol, count, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 6, , 7]);
                    return [4 /*yield*/, position_model_1.Position.distinct("marketSymbol", { status: "open" })];
                case 1:
                    markets = _a.sent();
                    totalLiquidations = 0;
                    _i = 0, markets_1 = markets;
                    _a.label = 2;
                case 2:
                    if (!(_i < markets_1.length)) return [3 /*break*/, 5];
                    marketSymbol = markets_1[_i];
                    return [4 /*yield*/, scanMarketForLiquidations(marketSymbol)];
                case 3:
                    count = _a.sent();
                    totalLiquidations += count;
                    _a.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5:
                    if (totalLiquidations > 0) {
                        console.log("\uD83D\uDD25 Liquidation scan complete: ".concat(totalLiquidations, " positions liquidated"));
                    }
                    return [3 /*break*/, 7];
                case 6:
                    error_2 = _a.sent();
                    console.error("Error during liquidation scan:", error_2);
                    return [3 /*break*/, 7];
                case 7: return [2 /*return*/];
            }
        });
    });
}
/**
 * Start the liquidation engine
 * @param intervalMs How often to check for liquidations (default: 1000ms / 1 second)
 */
function startLiquidationEngine(intervalMs) {
    var _this = this;
    if (intervalMs === void 0) { intervalMs = 1000; }
    if (liquidationInterval) {
        console.log("⚠️ Liquidation engine already running");
        return;
    }
    console.log("\uD83D\uDD25 Starting liquidation engine (checking every ".concat(intervalMs, "ms)"));
    // Run initial scan
    scanAllMarketsForLiquidations();
    // Set up periodic scanning
    liquidationInterval = setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, scanAllMarketsForLiquidations()];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); }, intervalMs);
}
/**
 * Stop the liquidation engine
 */
function stopLiquidationEngine() {
    if (liquidationInterval) {
        clearInterval(liquidationInterval);
        liquidationInterval = null;
        console.log("🔥 Liquidation engine stopped");
    }
}
/**
 * Check if liquidation engine is running
 */
function isLiquidationEngineRunning() {
    return liquidationInterval !== null;
}
/**
 * Get liquidation statistics
 */
function getLiquidationStats() {
    return __assign({}, liquidationStats);
}
/**
 * Manually trigger a liquidation check for a specific position
 * Useful for testing or immediate checks after price updates
 */
function checkPositionLiquidation(positionId) {
    return __awaiter(this, void 0, void 0, function () {
        var position, currentPrice, shouldLiquidate, liquidated;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, position_model_1.Position.findOne({ positionId: positionId, status: "open" })];
                case 1:
                    position = _a.sent();
                    if (!position) {
                        return [2 /*return*/, {
                                shouldLiquidate: false,
                                liquidated: false,
                                currentPrice: null,
                                liquidationPrice: 0,
                            }];
                    }
                    currentPrice = (0, market_service_1.getCachedPrice)(position.marketSymbol);
                    if (!currentPrice) {
                        return [2 /*return*/, {
                                shouldLiquidate: false,
                                liquidated: false,
                                currentPrice: null,
                                liquidationPrice: position.liquidationPrice,
                            }];
                    }
                    shouldLiquidate = (0, position_service_1.wouldBeLiquidated)(position, currentPrice);
                    liquidated = false;
                    if (!shouldLiquidate) return [3 /*break*/, 3];
                    return [4 /*yield*/, executePositionLiquidation(position, currentPrice)];
                case 2:
                    liquidated = _a.sent();
                    _a.label = 3;
                case 3: return [2 /*return*/, {
                        shouldLiquidate: shouldLiquidate,
                        liquidated: liquidated,
                        currentPrice: currentPrice,
                        liquidationPrice: position.liquidationPrice,
                    }];
            }
        });
    });
}
/**
 * Get all positions currently at risk of liquidation
 * Returns positions within a certain percentage of their liquidation price
 */
function getPositionsAtRiskOfLiquidation() {
    return __awaiter(this, arguments, void 0, function (riskThresholdPercent) {
        var atRisk, positions, _i, positions_2, position, currentPrice, distanceToLiquidation, distancePercent;
        if (riskThresholdPercent === void 0) { riskThresholdPercent = 5; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    atRisk = [];
                    return [4 /*yield*/, position_model_1.Position.find({ status: "open", size: { $gt: 0 } })];
                case 1:
                    positions = _a.sent();
                    for (_i = 0, positions_2 = positions; _i < positions_2.length; _i++) {
                        position = positions_2[_i];
                        currentPrice = (0, market_service_1.getCachedPrice)(position.marketSymbol);
                        if (!currentPrice || position.liquidationPrice === 0) {
                            continue;
                        }
                        distanceToLiquidation = void 0;
                        distancePercent = void 0;
                        if (position.side === "long") {
                            // Long positions: liquidated when price drops below liquidation price
                            distanceToLiquidation = currentPrice - position.liquidationPrice;
                            distancePercent = (distanceToLiquidation / currentPrice) * 100;
                        }
                        else {
                            // Short positions: liquidated when price rises above liquidation price
                            distanceToLiquidation = position.liquidationPrice - currentPrice;
                            distancePercent = (distanceToLiquidation / currentPrice) * 100;
                        }
                        // Check if within risk threshold
                        if (distancePercent <= riskThresholdPercent && distancePercent > 0) {
                            atRisk.push({
                                position: position,
                                currentPrice: currentPrice,
                                distanceToLiquidation: distanceToLiquidation,
                                distancePercent: distancePercent,
                            });
                        }
                    }
                    // Sort by risk (closest to liquidation first)
                    atRisk.sort(function (a, b) { return a.distancePercent - b.distancePercent; });
                    return [2 /*return*/, atRisk];
            }
        });
    });
}
