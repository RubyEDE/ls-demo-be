import mongoose, { Schema, Document } from "mongoose";

export interface IMarket extends Document {
  symbol: string;           // e.g., "SP500-PERP"
  name: string;             // e.g., "S&P 500 Perpetual"
  baseAsset: string;        // e.g., "SP500"
  quoteAsset: string;       // e.g., "USD"
  finnhubSymbol: string;    // e.g., "SPY" - the symbol to fetch price from
  
  // Current oracle price (from Finnhub)
  oraclePrice: number;
  oraclePriceUpdatedAt: Date;
  
  // Market parameters
  tickSize: number;         // Minimum price increment (e.g., 0.01)
  lotSize: number;          // Minimum quantity increment (e.g., 0.001)
  minOrderSize: number;     // Minimum order quantity
  maxOrderSize: number;     // Maximum order quantity
  
  // Leverage settings
  maxLeverage: number;      // e.g., 20 for 20x
  initialMarginRate: number; // e.g., 0.05 for 5%
  maintenanceMarginRate: number; // e.g., 0.025 for 2.5%
  
  // Funding rate (for perpetuals)
  fundingRate: number;
  fundingInterval: number;  // in hours
  nextFundingTime: Date;
  
  // Market stats
  volume24h: number;
  high24h: number;
  low24h: number;
  openInterest: number;
  
  // Status
  status: "active" | "paused" | "settlement";
  
  createdAt: Date;
  updatedAt: Date;
}

const MarketSchema = new Schema<IMarket>(
  {
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
  },
  { timestamps: true }
);

// Index for quick lookups
MarketSchema.index({ finnhubSymbol: 1 });
MarketSchema.index({ status: 1 });

export const Market = mongoose.model<IMarket>("Market", MarketSchema);

// Seed data for initial markets
export const INITIAL_MARKETS = [
  {
    symbol: "SP500-PERP",
    name: "S&P 500 Perpetual",
    baseAsset: "SP500",
    quoteAsset: "USD",
    finnhubSymbol: "SPY",  // SPY ETF tracks S&P 500
    tickSize: 0.01,
    lotSize: 0.01,
    minOrderSize: 0.01,
    maxOrderSize: 100,
    maxLeverage: 20,
    initialMarginRate: 0.05,
    maintenanceMarginRate: 0.025,
  },
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
    symbol: "TSLA-PERP",
    name: "Tesla Perpetual",
    baseAsset: "TSLA",
    quoteAsset: "USD",
    finnhubSymbol: "TSLA",
    tickSize: 0.01,
    lotSize: 0.01,
    minOrderSize: 0.01,
    maxOrderSize: 100,
    maxLeverage: 10,
    initialMarginRate: 0.1,
    maintenanceMarginRate: 0.05,
  },
];
