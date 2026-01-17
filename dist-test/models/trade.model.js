"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Trade = void 0;
var mongoose_1 = require("mongoose");
var TradeSchema = new mongoose_1.Schema({
    tradeId: { type: String, required: true, unique: true },
    marketSymbol: { type: String, required: true, uppercase: true },
    makerOrderId: { type: String, required: true },
    makerAddress: { type: String, default: null, lowercase: true },
    makerIsSynthetic: { type: Boolean, default: false },
    takerOrderId: { type: String, required: true },
    takerAddress: { type: String, default: null, lowercase: true },
    takerIsSynthetic: { type: Boolean, default: false },
    side: { type: String, enum: ["buy", "sell"], required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    quoteQuantity: { type: Number, required: true },
    makerFee: { type: Number, default: 0 },
    takerFee: { type: Number, default: 0 },
}, { timestamps: true });
// Indexes
TradeSchema.index({ marketSymbol: 1, createdAt: -1 });
TradeSchema.index({ makerAddress: 1, createdAt: -1 });
TradeSchema.index({ takerAddress: 1, createdAt: -1 });
exports.Trade = mongoose_1.default.model("Trade", TradeSchema);
