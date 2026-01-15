import mongoose, { Schema, Document } from "mongoose";

export type OrderSide = "buy" | "sell";
export type OrderType = "limit" | "market";
export type OrderStatus = "pending" | "open" | "partial" | "filled" | "cancelled";

// Note: "open" is when the order is placed on the book, 
// "partial" is when it's partially filled,
// "pending" is before it's processed

export interface IOrder extends Document {
  // Order identification
  orderId: string;
  marketSymbol: string;     // e.g., "SP500-PERP"
  
  // User info (null for synthetic/fake orders)
  userId: mongoose.Types.ObjectId | null;
  userAddress: string | null;
  
  // Order details
  side: OrderSide;
  type: OrderType;
  price: number;            // Limit price (0 for market orders)
  quantity: number;         // Total quantity
  filledQuantity: number;   // How much has been filled
  remainingQuantity: number; // quantity - filledQuantity
  
  // Execution
  averagePrice: number;     // Average fill price
  
  // Flags
  isSynthetic: boolean;     // True for fake/market maker orders
  postOnly: boolean;        // Only add to book, don't match
  reduceOnly: boolean;      // Only reduce position
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  filledAt: Date | null;
  cancelledAt: Date | null;
  
  status: OrderStatus;
}

const OrderSchema = new Schema<IOrder>(
  {
    orderId: { type: String, required: true, unique: true },
    marketSymbol: { type: String, required: true, uppercase: true },
    
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    userAddress: { type: String, default: null, lowercase: true },
    
    side: { type: String, enum: ["buy", "sell"], required: true },
    type: { type: String, enum: ["limit", "market"], required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    filledQuantity: { type: Number, default: 0 },
    remainingQuantity: { type: Number, required: true },
    
    averagePrice: { type: Number, default: 0 },
    
    isSynthetic: { type: Boolean, default: false },
    postOnly: { type: Boolean, default: false },
    reduceOnly: { type: Boolean, default: false },
    
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
OrderSchema.index({ marketSymbol: 1, side: 1, status: 1, price: 1 });
OrderSchema.index({ marketSymbol: 1, status: 1, createdAt: 1 });
OrderSchema.index({ userId: 1, status: 1 });
OrderSchema.index({ userAddress: 1, status: 1 });
OrderSchema.index({ isSynthetic: 1, marketSymbol: 1 });

export const Order = mongoose.model<IOrder>("Order", OrderSchema);
