"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Balance = void 0;
var mongoose_1 = require("mongoose");
var balanceChangeSchema = new mongoose_1.Schema({
    amount: {
        type: Number,
        required: true,
    },
    type: {
        type: String,
        enum: ["credit", "debit", "lock", "unlock"],
        required: true,
    },
    reason: {
        type: String,
        required: true,
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
    referenceId: {
        type: String,
    },
}, { _id: false });
var balanceSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true,
        index: true,
    },
    address: {
        type: String,
        required: true,
        lowercase: true,
        unique: true,
        index: true,
    },
    free: {
        type: Number,
        default: 0,
        min: 0,
    },
    locked: {
        type: Number,
        default: 0,
        min: 0,
    },
    totalCredits: {
        type: Number,
        default: 0,
    },
    totalDebits: {
        type: Number,
        default: 0,
    },
    changes: {
        type: [balanceChangeSchema],
        default: [],
    },
}, {
    timestamps: true,
});
// Virtual for total balance
balanceSchema.virtual("total").get(function () {
    return this.free + this.locked;
});
// Ensure virtuals are included in JSON
balanceSchema.set("toJSON", { virtuals: true });
balanceSchema.set("toObject", { virtuals: true });
exports.Balance = mongoose_1.default.model("Balance", balanceSchema);
