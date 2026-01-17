"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTERVAL_MS = exports.Candle = void 0;
exports.getCandleStart = getCandleStart;
var mongoose_1 = require("mongoose");
var CandleSchema = new mongoose_1.Schema({
    marketSymbol: { type: String, required: true, uppercase: true },
    interval: {
        type: String,
        required: true,
        enum: ["1m", "5m", "15m", "1h", "4h", "1d"]
    },
    timestamp: { type: Date, required: true },
    open: { type: Number, required: true },
    high: { type: Number, required: true },
    low: { type: Number, required: true },
    close: { type: Number, required: true },
    volume: { type: Number, default: 0 },
    quoteVolume: { type: Number, default: 0 },
    trades: { type: Number, default: 0 },
    isClosed: { type: Boolean, default: false },
    isMarketOpen: { type: Boolean, default: true },
}, { timestamps: true });
// Compound unique index: one candle per market/interval/timestamp
CandleSchema.index({ marketSymbol: 1, interval: 1, timestamp: 1 }, { unique: true });
// Index for querying recent candles
CandleSchema.index({ marketSymbol: 1, interval: 1, timestamp: -1 });
exports.Candle = mongoose_1.default.model("Candle", CandleSchema);
// Interval durations in milliseconds
exports.INTERVAL_MS = {
    "1m": 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
};
// Get the start of a candle period for a given timestamp
function getCandleStart(timestamp, interval) {
    var ms = timestamp.getTime();
    var intervalMs = exports.INTERVAL_MS[interval];
    var periodStart = Math.floor(ms / intervalMs) * intervalMs;
    return new Date(periodStart);
}
