"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FaucetRequest = void 0;
var mongoose_1 = require("mongoose");
var faucetRequestSchema = new mongoose_1.Schema({
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    address: {
        type: String,
        required: true,
        lowercase: true,
        index: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    ipAddress: {
        type: String,
    },
    userAgent: {
        type: String,
    },
}, {
    timestamps: true,
});
// Index for efficient daily limit queries
faucetRequestSchema.index({ address: 1, createdAt: -1 });
faucetRequestSchema.index({ userId: 1, createdAt: -1 });
exports.FaucetRequest = mongoose_1.default.model("FaucetRequest", faucetRequestSchema);
