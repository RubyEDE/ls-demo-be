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

// Required markets - always ensure these exist on startup
export const REQUIRED_MARKETS = [
  {
    symbol: "AAPL-PERP",
    name: "Apple Perpetual",
    baseAsset: "AAPL",
    quoteAsset: "USD",
    finnhubSymbol: "AAPL",
    tickSize: 0.01,
    lotSize: 0.01,
    minOrderSize: 0.01,
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
    maxLeverage: 10,
    initialMarginRate: 0.1,
    maintenanceMarginRate: 0.05,
  },
];

// Alias for backwards compatibility
export const INITIAL_MARKETS = REQUIRED_MARKETS;
