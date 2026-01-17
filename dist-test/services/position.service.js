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
exports.getOpenPosition = getOpenPosition;
exports.getUserPositions = getUserPositions;
exports.getPositionHistory = getPositionHistory;
exports.calculateUnrealizedPnl = calculateUnrealizedPnl;
exports.calculateLiquidationPrice = calculateLiquidationPrice;
exports.openPosition = openPosition;
exports.increasePosition = increasePosition;
exports.decreasePosition = decreasePosition;
exports.closePosition = closePosition;
exports.handleTradeExecution = handleTradeExecution;
exports.updatePositionsPnl = updatePositionsPnl;
exports.getPositionSummary = getPositionSummary;
exports.wouldBeLiquidated = wouldBeLiquidated;
exports.getPositionsAtRisk = getPositionsAtRisk;
var uuid_1 = require("uuid");
var position_model_1 = require("../models/position.model");
var market_service_1 = require("./market.service");
var websocket_service_1 = require("./websocket.service");
var balance_service_1 = require("./balance.service");
/**
 * Get or create a position for a user in a market
 */
function getOpenPosition(userAddress, marketSymbol) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, position_model_1.Position.findOne({
                    userAddress: userAddress.toLowerCase(),
                    marketSymbol: marketSymbol.toUpperCase(),
                    status: "open",
                })];
        });
    });
}
/**
 * Get all open positions for a user
 */
function getUserPositions(userAddress) {
    return __awaiter(this, void 0, void 0, function () {
        var positions, _i, positions_1, position, currentPrice;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, position_model_1.Position.find({
                        userAddress: userAddress.toLowerCase(),
                        status: "open",
                    }).sort({ openedAt: -1 })];
                case 1:
                    positions = _a.sent();
                    // Update unrealized PnL for each position with current prices
                    for (_i = 0, positions_1 = positions; _i < positions_1.length; _i++) {
                        position = positions_1[_i];
                        currentPrice = (0, market_service_1.getCachedPrice)(position.marketSymbol);
                        if (currentPrice) {
                            position.unrealizedPnl = calculateUnrealizedPnl(position, currentPrice);
                        }
                    }
                    return [2 /*return*/, positions];
            }
        });
    });
}
/**
 * Get position history for a user
 */
function getPositionHistory(userAddress_1, marketSymbol_1) {
    return __awaiter(this, arguments, void 0, function (userAddress, marketSymbol, limit, offset) {
        var query;
        if (limit === void 0) { limit = 50; }
        if (offset === void 0) { offset = 0; }
        return __generator(this, function (_a) {
            query = {
                userAddress: userAddress.toLowerCase(),
                status: { $in: ["closed", "liquidated"] },
            };
            if (marketSymbol) {
                query.marketSymbol = marketSymbol.toUpperCase();
            }
            return [2 /*return*/, position_model_1.Position.find(query)
                    .sort({ closedAt: -1 })
                    .skip(offset)
                    .limit(limit)];
        });
    });
}
/**
 * Calculate unrealized PnL for a position
 */
function calculateUnrealizedPnl(position, currentPrice) {
    if (position.size === 0)
        return 0;
    var priceDiff = currentPrice - position.entryPrice;
    if (position.side === "long") {
        // Long: profit when price goes up
        return priceDiff * position.size;
    }
    else {
        // Short: profit when price goes down
        return -priceDiff * position.size;
    }
}
/**
 * Calculate liquidation price for a position
 */
function calculateLiquidationPrice(side, entryPrice, margin, size, maintenanceMarginRate) {
    if (size === 0)
        return 0;
    // Position value at entry
    var positionValue = entryPrice * size;
    // Maintenance margin required
    var maintenanceMargin = positionValue * maintenanceMarginRate;
    // Available margin for loss before liquidation
    var availableForLoss = margin - maintenanceMargin;
    // Price movement that would trigger liquidation
    var priceMovement = availableForLoss / size;
    if (side === "long") {
        // Long gets liquidated when price drops
        return Math.max(0, entryPrice - priceMovement);
    }
    else {
        // Short gets liquidated when price rises
        return entryPrice + priceMovement;
    }
}
/**
 * Open a new position
 */
function openPosition(params) {
    return __awaiter(this, void 0, void 0, function () {
        var marketSymbol, userAddress, side, size, entryPrice, margin, market, liquidationPrice, notionalValue, leverage, position;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    marketSymbol = params.marketSymbol, userAddress = params.userAddress, side = params.side, size = params.size, entryPrice = params.entryPrice, margin = params.margin;
                    return [4 /*yield*/, (0, market_service_1.getMarket)(marketSymbol)];
                case 1:
                    market = _a.sent();
                    if (!market) {
                        return [2 /*return*/, { success: false, error: "Market not found" }];
                    }
                    liquidationPrice = calculateLiquidationPrice(side, entryPrice, margin, size, market.maintenanceMarginRate);
                    notionalValue = entryPrice * size;
                    leverage = notionalValue / margin;
                    position = new position_model_1.Position({
                        positionId: "POS-".concat((0, uuid_1.v4)()),
                        marketSymbol: market.symbol,
                        userAddress: userAddress.toLowerCase(),
                        side: side,
                        size: size,
                        entryPrice: entryPrice,
                        margin: margin,
                        leverage: leverage,
                        unrealizedPnl: 0,
                        realizedPnl: 0,
                        liquidationPrice: liquidationPrice,
                        totalFeesPaid: 0,
                        accumulatedFunding: 0,
                        lastFundingTime: new Date(),
                        status: "open",
                        openedAt: new Date(),
                        lastUpdatedAt: new Date(),
                    });
                    return [4 /*yield*/, position.save()];
                case 2:
                    _a.sent();
                    // Notify user via WebSocket
                    broadcastPositionUpdate(position, (0, market_service_1.getCachedPrice)(marketSymbol) || entryPrice);
                    console.log("\uD83D\uDCCA Opened ".concat(side, " position for ").concat(userAddress, ": ").concat(size, " ").concat(marketSymbol, " @ $").concat(entryPrice));
                    return [2 /*return*/, { success: true, position: position }];
            }
        });
    });
}
/**
 * Increase position size (add to existing position)
 */
function increasePosition(position, additionalSize, executionPrice, additionalMargin) {
    return __awaiter(this, void 0, void 0, function () {
        var market, totalValue, newSize, newEntryPrice, notionalValue;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, market_service_1.getMarket)(position.marketSymbol)];
                case 1:
                    market = _a.sent();
                    if (!market) {
                        return [2 /*return*/, { success: false, error: "Market not found" }];
                    }
                    totalValue = (position.entryPrice * position.size) + (executionPrice * additionalSize);
                    newSize = position.size + additionalSize;
                    newEntryPrice = totalValue / newSize;
                    // Update position
                    position.size = newSize;
                    position.entryPrice = newEntryPrice;
                    position.margin += additionalMargin;
                    notionalValue = newEntryPrice * newSize;
                    position.leverage = notionalValue / position.margin;
                    position.liquidationPrice = calculateLiquidationPrice(position.side, newEntryPrice, position.margin, newSize, market.maintenanceMarginRate);
                    position.lastUpdatedAt = new Date();
                    return [4 /*yield*/, position.save()];
                case 2:
                    _a.sent();
                    // Notify user
                    broadcastPositionUpdate(position, (0, market_service_1.getCachedPrice)(position.marketSymbol) || executionPrice);
                    console.log("\uD83D\uDCCA Increased position ".concat(position.positionId, ": +").concat(additionalSize, " @ $").concat(executionPrice));
                    return [2 /*return*/, { success: true, position: position }];
            }
        });
    });
}
/**
 * Decrease position size (partial close)
 */
function decreasePosition(position, closeSize, executionPrice) {
    return __awaiter(this, void 0, void 0, function () {
        var market, priceDiff, realizedPnl, marginToRelease, totalReturn;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (closeSize > position.size) {
                        return [2 /*return*/, { success: false, error: "Close size exceeds position size" }];
                    }
                    return [4 /*yield*/, (0, market_service_1.getMarket)(position.marketSymbol)];
                case 1:
                    market = _a.sent();
                    if (!market) {
                        return [2 /*return*/, { success: false, error: "Market not found" }];
                    }
                    priceDiff = executionPrice - position.entryPrice;
                    if (position.side === "long") {
                        realizedPnl = priceDiff * closeSize;
                    }
                    else {
                        realizedPnl = -priceDiff * closeSize;
                    }
                    marginToRelease = (closeSize / position.size) * position.margin;
                    // Update position
                    position.size -= closeSize;
                    position.realizedPnl += realizedPnl;
                    position.margin -= marginToRelease;
                    position.lastUpdatedAt = new Date();
                    totalReturn = marginToRelease + realizedPnl;
                    if (!(totalReturn > 0)) return [3 /*break*/, 3];
                    return [4 /*yield*/, (0, balance_service_1.creditBalanceByAddress)(position.userAddress, totalReturn, "Closed ".concat(closeSize, " ").concat(position.marketSymbol, " - PnL: ").concat(realizedPnl >= 0 ? '+' : '', "$").concat(realizedPnl.toFixed(2)), position.positionId)];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3:
                    if (position.size === 0) {
                        // Position fully closed
                        position.status = "closed";
                        position.closedAt = new Date();
                        position.liquidationPrice = 0;
                        position.leverage = 0;
                    }
                    else {
                        // Recalculate liquidation price for remaining position
                        position.liquidationPrice = calculateLiquidationPrice(position.side, position.entryPrice, position.margin, position.size, market.maintenanceMarginRate);
                        position.leverage = (position.entryPrice * position.size) / position.margin;
                    }
                    return [4 /*yield*/, position.save()];
                case 4:
                    _a.sent();
                    // Notify user
                    broadcastPositionUpdate(position, (0, market_service_1.getCachedPrice)(position.marketSymbol) || executionPrice);
                    console.log("\uD83D\uDCCA Decreased position ".concat(position.positionId, ": -").concat(closeSize, " @ $").concat(executionPrice, ", realized PnL: $").concat(realizedPnl.toFixed(2)));
                    return [2 /*return*/, { success: true, position: position, realizedPnl: realizedPnl }];
            }
        });
    });
}
/**
 * Close entire position
 */
function closePosition(position, executionPrice) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, decreasePosition(position, position.size, executionPrice)];
        });
    });
}
/**
 * Handle a trade execution - update or create position
 */
function handleTradeExecution(userAddress, marketSymbol, tradeSide, tradeSize, executionPrice, marginUsed) {
    return __awaiter(this, void 0, void 0, function () {
        var market, positionSide, existingPosition, closeSize, newPositionSize, closeResult, newMargin, excessMargin;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, market_service_1.getMarket)(marketSymbol)];
                case 1:
                    market = _a.sent();
                    if (!market) {
                        return [2 /*return*/, { success: false, error: "Market not found" }];
                    }
                    positionSide = tradeSide === "buy" ? "long" : "short";
                    return [4 /*yield*/, getOpenPosition(userAddress, marketSymbol)];
                case 2:
                    existingPosition = _a.sent();
                    if (!existingPosition) {
                        // No existing position - open new one
                        return [2 /*return*/, openPosition({
                                marketSymbol: marketSymbol,
                                userAddress: userAddress,
                                side: positionSide,
                                size: tradeSize,
                                entryPrice: executionPrice,
                                margin: marginUsed,
                            })];
                    }
                    if (!(existingPosition.side === positionSide)) return [3 /*break*/, 3];
                    // Same direction - increase position
                    return [2 /*return*/, increasePosition(existingPosition, tradeSize, executionPrice, marginUsed)];
                case 3:
                    if (!(tradeSize <= existingPosition.size)) return [3 /*break*/, 5];
                    // Just reducing position
                    // First unlock the margin that was locked for this order since we're closing
                    return [4 /*yield*/, (0, balance_service_1.unlockBalanceByAddress)(userAddress, marginUsed, "Margin returned - closing position")];
                case 4:
                    // Just reducing position
                    // First unlock the margin that was locked for this order since we're closing
                    _a.sent();
                    return [2 /*return*/, decreasePosition(existingPosition, tradeSize, executionPrice)];
                case 5:
                    closeSize = existingPosition.size;
                    newPositionSize = tradeSize - closeSize;
                    return [4 /*yield*/, closePosition(existingPosition, executionPrice)];
                case 6:
                    closeResult = _a.sent();
                    if (!closeResult.success) {
                        return [2 /*return*/, closeResult];
                    }
                    newMargin = (newPositionSize / tradeSize) * marginUsed;
                    excessMargin = marginUsed - newMargin;
                    if (!(excessMargin > 0)) return [3 /*break*/, 8];
                    return [4 /*yield*/, (0, balance_service_1.unlockBalanceByAddress)(userAddress, excessMargin, "Excess margin returned")];
                case 7:
                    _a.sent();
                    _a.label = 8;
                case 8: 
                // Open new position in opposite direction
                return [2 /*return*/, openPosition({
                        marketSymbol: marketSymbol,
                        userAddress: userAddress,
                        side: positionSide,
                        size: newPositionSize,
                        entryPrice: executionPrice,
                        margin: newMargin,
                    })];
            }
        });
    });
}
/**
 * Update unrealized PnL for all open positions in a market
 * Called when oracle price updates
 */
function updatePositionsPnl(marketSymbol, currentPrice) {
    return __awaiter(this, void 0, void 0, function () {
        var positions, _i, positions_2, position, newUnrealizedPnl;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, position_model_1.Position.find({
                        marketSymbol: marketSymbol.toUpperCase(),
                        status: "open",
                    })];
                case 1:
                    positions = _a.sent();
                    _i = 0, positions_2 = positions;
                    _a.label = 2;
                case 2:
                    if (!(_i < positions_2.length)) return [3 /*break*/, 5];
                    position = positions_2[_i];
                    newUnrealizedPnl = calculateUnrealizedPnl(position, currentPrice);
                    if (!(Math.abs(newUnrealizedPnl - position.unrealizedPnl) > 0.01)) return [3 /*break*/, 4];
                    position.unrealizedPnl = newUnrealizedPnl;
                    position.lastUpdatedAt = new Date();
                    return [4 /*yield*/, position.save()];
                case 3:
                    _a.sent();
                    // Notify user
                    broadcastPositionUpdate(position, currentPrice);
                    _a.label = 4;
                case 4:
                    _i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/];
            }
        });
    });
}
/**
 * Get position summary for a user
 */
function getPositionSummary(userAddress) {
    return __awaiter(this, void 0, void 0, function () {
        var positions, totalMargin, totalUnrealizedPnl, totalRealizedPnl, _i, positions_3, position;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getUserPositions(userAddress)];
                case 1:
                    positions = _a.sent();
                    totalMargin = 0;
                    totalUnrealizedPnl = 0;
                    totalRealizedPnl = 0;
                    for (_i = 0, positions_3 = positions; _i < positions_3.length; _i++) {
                        position = positions_3[_i];
                        totalMargin += position.margin;
                        totalUnrealizedPnl += position.unrealizedPnl;
                        totalRealizedPnl += position.realizedPnl;
                    }
                    return [2 /*return*/, {
                            totalPositions: positions.length,
                            totalMargin: totalMargin,
                            totalUnrealizedPnl: totalUnrealizedPnl,
                            totalRealizedPnl: totalRealizedPnl,
                            positions: positions,
                        }];
            }
        });
    });
}
/**
 * Helper to broadcast position update via WebSocket
 */
function broadcastPositionUpdate(position, currentPrice) {
    var update = {
        positionId: position.positionId,
        marketSymbol: position.marketSymbol,
        side: position.side,
        size: position.size,
        entryPrice: position.entryPrice,
        markPrice: currentPrice,
        margin: position.margin,
        leverage: position.leverage,
        unrealizedPnl: calculateUnrealizedPnl(position, currentPrice),
        realizedPnl: position.realizedPnl,
        liquidationPrice: position.liquidationPrice,
        status: position.status,
        timestamp: Date.now(),
    };
    (0, websocket_service_1.sendPositionUpdate)(position.userAddress, update);
}
/**
 * Check if a position would be liquidated at a given price
 */
function wouldBeLiquidated(position, price) {
    if (position.status !== "open" || position.size === 0)
        return false;
    if (position.side === "long") {
        return price <= position.liquidationPrice;
    }
    else {
        return price >= position.liquidationPrice;
    }
}
/**
 * Get all positions at risk of liquidation
 */
function getPositionsAtRisk(marketSymbol, currentPrice) {
    return __awaiter(this, void 0, void 0, function () {
        var positions;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, position_model_1.Position.find({
                        marketSymbol: marketSymbol.toUpperCase(),
                        status: "open",
                    })];
                case 1:
                    positions = _a.sent();
                    return [2 /*return*/, positions.filter(function (p) { return wouldBeLiquidated(p, currentPrice); })];
            }
        });
    });
}
