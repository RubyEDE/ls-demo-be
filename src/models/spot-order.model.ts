import mongoose, { Schema, Document } from "mongoose";

export type SpotOrderSide = "buy" | "sell";
export type SpotOrderType = "limit" | "market";
export type SpotOrderStatus = "pending" | "open" | "partial" | "filled" | "cancelled";

export interface ISpotOrder extends Document {
  // Order identification
  orderId: string;
  marketSymbol: string;     // e.g., "AK47-REDLINE-SPOT"
  
  // User info
  userId: mongoose.Types.ObjectId | null;
  userAddress: string | null;
  
  // Market assets
  baseAsset: string;        // e.g., "AK47-REDLINE"
  quoteAsset: string;       // e.g., "USD"
  
  // Order details
  side: SpotOrderSide;
  type: SpotOrderType;
  price: number;            // Limit price (0 for market orders)
  quantity: number;         // Base asset quantity
  filledQuantity: number;   // How much has been filled
  remainingQuantity: number; // quantity - filledQuantity
  
  // Execution
  averagePrice: number;     // Average fill price
  
  // Amount locked for this order
  lockedAsset: string;      // Which asset is locked (quote for buy, base for sell)
  lockedAmount: number;     // Amount locked
  
  // Flags
  isSynthetic: boolean;     // True for market maker orders
  postOnly: boolean;        // Only add to book, don't match
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  filledAt: Date | null;
  cancelledAt: Date | null;
  
  status: SpotOrderStatus;
}

const SpotOrderSchema = new Schema<ISpotOrder>(
  {
    orderId: { type: String, required: true, unique: true },
    marketSymbol: { type: String, required: true, uppercase: true },
    
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    userAddress: { type: String, default: null, lowercase: true },
    
    baseAsset: { type: String, required: true, uppercase: true },
    quoteAsset: { type: String, required: true, uppercase: true },
    
    side: { type: String, enum: ["buy", "sell"], required: true },
    type: { type: String, enum: ["limit", "market"], required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    filledQuantity: { type: Number, default: 0 },
    remainingQuantity: { type: Number, required: true },
    
    averagePrice: { type: Number, default: 0 },
    
    lockedAsset: { type: String, required: true, uppercase: true },
    lockedAmount: { type: Number, required: true, default: 0 },
    
    isSynthetic: { type: Boolean, default: false },
    postOnly: { type: Boolean, default: false },
    
    filledAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    
    status: { 
      type: String, 
      enum: ["pending", "open", "partial", "filled", "cancelled"] as const,
      default: "pending"
    },
  },
  { timestamps: true }
);

// Indexes for efficient order book queries
SpotOrderSchema.index({ marketSymbol: 1, side: 1, status: 1, price: 1 });
SpotOrderSchema.index({ marketSymbol: 1, status: 1, createdAt: 1 });
SpotOrderSchema.index({ userId: 1, status: 1 });
SpotOrderSchema.index({ userAddress: 1, status: 1 });
SpotOrderSchema.index({ isSynthetic: 1, marketSymbol: 1 });

export const SpotOrder = mongoose.model<ISpotOrder>("SpotOrder", SpotOrderSchema);
