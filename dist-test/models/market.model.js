"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INITIAL_MARKETS = exports.REQUIRED_MARKETS = exports.Market = void 0;
var mongoose_1 = require("mongoose");
var MarketSchema = new mongoose_1.Schema({
    symbol: { type: String, required: true, unique: true, uppercase: true },
    name: { type: String, required: true },
    baseAsset: { type: String, required: true },
    quoteAsset: { type: String, required: true, default: "USD" },
    finnhubSymbol: { type: String, required: true },
    oraclePrice: { type: Number, default: 0 },
    oraclePriceUpdatedAt: { type: Date, default: Date.now },
    tickSize: { type: Number, required: true, default: 0.01 },
    lotSize: { type: Number, required: true, default: 0.001 },
    minOrderSize: { type: Number, required: true, default: 0.001 },
    maxOrderSize: { type: Number, required: true, default: 1000 },
    maxLeverage: { type: Number, required: true, default: 20 },
    initialMarginRate: { type: Number, required: true, default: 0.05 },
    maintenanceMarginRate: { type: Number, required: true, default: 0.025 },
    fundingRate: { type: Number, default: 0 },
    fundingInterval: { type: Number, default: 8 }, // 8 hours
    nextFundingTime: { type: Date, default: Date.now },
    volume24h: { type: Number, default: 0 },
    high24h: { type: Number, default: 0 },
    low24h: { type: Number, default: 0 },
    openInterest: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ["active", "paused", "settlement"],
        default: "active"
    },
}, { timestamps: true });
// Index for quick lookups
MarketSchema.index({ finnhubSymbol: 1 });
MarketSchema.index({ status: 1 });
exports.Market = mongoose_1.default.model("Market", MarketSchema);
// Required markets - always ensure these exist on startup
exports.REQUIRED_MARKETS = [
    {
        symbol: "AAPL-PERP",
        name: "Apple Perpetual",
        baseAsset: "AAPL",
        quoteAsset: "USD",
        finnhubSymbol: "AAPL",
        tickSize: 0.01,
        lotSize: 0.01,
        minOrderSize: 0.01,
        maxOrderSize: 100,
        maxLeverage: 10,
        initialMarginRate: 0.1,
        maintenanceMarginRate: 0.05,
    },
    {
        symbol: "GOOGL-PERP",
        name: "Alphabet Perpetual",
        baseAsset: "GOOGL",
        quoteAsset: "USD",
        finnhubSymbol: "GOOGL",
        tickSize: 0.01,
        lotSize: 0.01,
        minOrderSize: 0.01,
        maxOrderSize: 100,
        maxLeverage: 10,
        initialMarginRate: 0.1,
        maintenanceMarginRate: 0.05,
    },
    {
        symbol: "MSFT-PERP",
        name: "Microsoft Perpetual",
        baseAsset: "MSFT",
        quoteAsset: "USD",
        finnhubSymbol: "MSFT",
        tickSize: 0.01,
        lotSize: 0.01,
        minOrderSize: 0.01,
        maxOrderSize: 100,
        maxLeverage: 10,
        initialMarginRate: 0.1,
        maintenanceMarginRate: 0.05,
    },
];
// Alias for backwards compatibility
exports.INITIAL_MARKETS = exports.REQUIRED_MARKETS;
