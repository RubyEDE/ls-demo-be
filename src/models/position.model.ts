import mongoose, { Schema, Document } from "mongoose";

export type PositionSide = "long" | "short";

export interface IPosition extends Document {
  // Identification
  positionId: string;
  marketSymbol: string;
  userAddress: string;
  
  // Position details
  side: PositionSide;
  size: number;              // Current position size (always positive)
  entryPrice: number;        // Average entry price
  
  // Margin
  margin: number;            // Collateral locked for this position
  leverage: number;          // Effective leverage
  
  // PnL tracking
  unrealizedPnl: number;     // Current unrealized PnL (updated on price change)
  realizedPnl: number;       // Total realized PnL from partial closes
  
  // Liquidation
  liquidationPrice: number;  // Price at which position gets liquidated
  
  // Fees paid
  totalFeesPaid: number;
  
  // Funding
  accumulatedFunding: number; // Total funding payments (positive = received, negative = paid)
  lastFundingTime: Date;
  
  // Status
  status: "open" | "closed" | "liquidated";
  
  // Timestamps
  openedAt: Date;
  closedAt: Date | null;
  lastUpdatedAt: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

const PositionSchema = new Schema<IPosition>(
  {
    positionId: { type: String, required: true, unique: true },
    marketSymbol: { type: String, required: true, uppercase: true },
    userAddress: { type: String, required: true, lowercase: true },
    
    side: { type: String, enum: ["long", "short"], required: true },
    size: { type: Number, required: true, default: 0 },
    entryPrice: { type: Number, required: true, default: 0 },
    
    margin: { type: Number, required: true, default: 0 },
    leverage: { type: Number, required: true, default: 1 },
    
    unrealizedPnl: { type: Number, default: 0 },
    realizedPnl: { type: Number, default: 0 },
    
    liquidationPrice: { type: Number, default: 0 },
    
    totalFeesPaid: { type: Number, default: 0 },
    
    accumulatedFunding: { type: Number, default: 0 },
    lastFundingTime: { type: Date, default: Date.now },
    
    status: {
      type: String,
      enum: ["open", "closed", "liquidated"],
      default: "open",
    },
    
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
    lastUpdatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Indexes for efficient queries
PositionSchema.index({ userAddress: 1, status: 1 });
PositionSchema.index({ userAddress: 1, marketSymbol: 1, status: 1 });
PositionSchema.index({ marketSymbol: 1, status: 1 });
PositionSchema.index({ status: 1, liquidationPrice: 1 }); // For liquidation scanning

export const Position = mongoose.model<IPosition>("Position", PositionSchema);
