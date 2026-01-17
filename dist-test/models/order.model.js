"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Order = void 0;
var mongoose_1 = require("mongoose");
var OrderSchema = new mongoose_1.Schema({
    orderId: { type: String, required: true, unique: true },
    marketSymbol: { type: String, required: true, uppercase: true },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", default: null },
    userAddress: { type: String, default: null, lowercase: true },
    side: { type: String, enum: ["buy", "sell"], required: true },
    type: { type: String, enum: ["limit", "market"], required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    filledQuantity: { type: Number, default: 0 },
    remainingQuantity: { type: Number, required: true },
    averagePrice: { type: Number, default: 0 },
    isSynthetic: { type: Boolean, default: false },
    postOnly: { type: Boolean, default: false },
    reduceOnly: { type: Boolean, default: false },
    filledAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    status: {
        type: String,
        enum: ["pending", "open", "partial", "filled", "cancelled"],
        default: "pending"
    },
}, { timestamps: true });
// Indexes for efficient order book queries
OrderSchema.index({ marketSymbol: 1, side: 1, status: 1, price: 1 });
OrderSchema.index({ marketSymbol: 1, status: 1, createdAt: 1 });
OrderSchema.index({ userId: 1, status: 1 });
OrderSchema.index({ userAddress: 1, status: 1 });
OrderSchema.index({ isSynthetic: 1, marketSymbol: 1 });
exports.Order = mongoose_1.default.model("Order", OrderSchema);
