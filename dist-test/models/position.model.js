"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Position = void 0;
var mongoose_1 = require("mongoose");
var PositionSchema = new mongoose_1.Schema({
    positionId: { type: String, required: true, unique: true },
    marketSymbol: { type: String, required: true, uppercase: true },
    userAddress: { type: String, required: true, lowercase: true },
    side: { type: String, enum: ["long", "short"], required: true },
    size: { type: Number, required: true, default: 0 },
    entryPrice: { type: Number, required: true, default: 0 },
    margin: { type: Number, required: true, default: 0 },
    leverage: { type: Number, required: true, default: 1 },
    unrealizedPnl: { type: Number, default: 0 },
    realizedPnl: { type: Number, default: 0 },
    liquidationPrice: { type: Number, default: 0 },
    totalFeesPaid: { type: Number, default: 0 },
    accumulatedFunding: { type: Number, default: 0 },
    lastFundingTime: { type: Date, default: Date.now },
    status: {
        type: String,
        enum: ["open", "closed", "liquidated"],
        default: "open",
    },
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
    lastUpdatedAt: { type: Date, default: Date.now },
}, { timestamps: true });
// Indexes for efficient queries
PositionSchema.index({ userAddress: 1, status: 1 });
PositionSchema.index({ userAddress: 1, marketSymbol: 1, status: 1 });
PositionSchema.index({ marketSymbol: 1, status: 1 });
PositionSchema.index({ status: 1, liquidationPrice: 1 }); // For liquidation scanning
exports.Position = mongoose_1.default.model("Position", PositionSchema);
