"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
var mongoose_1 = require("mongoose");
var userSchema = new mongoose_1.Schema({
    address: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        index: true,
    },
    chainId: {
        type: Number,
        required: true,
        default: 1,
    },
    lastLoginAt: {
        type: Date,
        default: Date.now,
    },
}, {
    timestamps: true,
});
// Ensure address is always stored lowercase
userSchema.pre("save", function () {
    if (this.address) {
        this.address = this.address.toLowerCase();
    }
});
exports.User = mongoose_1.default.model("User", userSchema);
