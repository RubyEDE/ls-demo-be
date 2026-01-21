import mongoose, { Schema, Document } from "mongoose";
import { CSGO_ITEMS } from "../config/csgo-markets.config";

export interface IMarket extends Document {
  symbol: string;           // e.g., "AK47-REDLINE-PERP"
  name: string;             // e.g., "AK-47 Redline Perpetual"
  baseAsset: string;        // e.g., "AK47-REDLINE"
  quoteAsset: string;       // e.g., "USD"
  steamMarketHashName: string;  // Steam market hash name for price fetching
  
  // Current oracle price (from Steam)
  oraclePrice: number;
  oraclePriceUpdatedAt: Date;
  
  // Market parameters
  tickSize: number;         // Minimum price increment (e.g., 0.01)
  lotSize: number;          // Minimum quantity increment (e.g., 1 for items)
  minOrderSize: number;     // Minimum order quantity
  
  // Leverage settings
  maxLeverage: number;      // e.g., 10 for 10x
  initialMarginRate: number; // e.g., 0.1 for 10%
  maintenanceMarginRate: number; // e.g., 0.05 for 5%
  
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
    steamMarketHashName: { type: String, required: true },
    
    oraclePrice: { type: Number, default: 0 },
    oraclePriceUpdatedAt: { type: Date, default: Date.now },
    
    tickSize: { type: Number, required: true, default: 0.01 },
    lotSize: { type: Number, required: true, default: 1 },
    minOrderSize: { type: Number, required: true, default: 1 },
    
    maxLeverage: { type: Number, required: true, default: 10 },
    initialMarginRate: { type: Number, required: true, default: 0.1 },
    maintenanceMarginRate: { type: Number, required: true, default: 0.05 },
    
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
MarketSchema.index({ steamMarketHashName: 1 });
MarketSchema.index({ status: 1 });

export const Market = mongoose.model<IMarket>("Market", MarketSchema);

// Required markets - CS:GO items from config
export const REQUIRED_MARKETS = CSGO_ITEMS.map(item => ({
  symbol: item.symbol,
  name: item.name,
  baseAsset: item.baseAsset,
  quoteAsset: "USD",
  steamMarketHashName: item.steamMarketHashName,
  tickSize: item.tickSize ?? 0.01,
  lotSize: item.lotSize ?? 1,
  minOrderSize: item.minOrderSize ?? 1,
  maxLeverage: item.maxLeverage ?? 10,
  initialMarginRate: item.initialMarginRate ?? 0.1,
  maintenanceMarginRate: item.maintenanceMarginRate ?? 0.05,
}));

// Alias for backwards compatibility
export const INITIAL_MARKETS = REQUIRED_MARKETS;
