import mongoose, { Schema, Document } from "mongoose";

export interface ITrade extends Document {
  tradeId: string;
  marketSymbol: string;
  
  // Maker side (the order that was on the book)
  makerOrderId: string;
  makerAddress: string | null;
  makerIsSynthetic: boolean;
  
  // Taker side (the order that matched)
  takerOrderId: string;
  takerAddress: string | null;
  takerIsSynthetic: boolean;
  
  // Trade details
  side: "buy" | "sell";  // Taker's side
  price: number;
  quantity: number;
  quoteQuantity: number;  // price * quantity
  
  // Fees
  makerFee: number;
  takerFee: number;
  
  createdAt: Date;
}

const TradeSchema = new Schema<ITrade>(
  {
    tradeId: { type: String, required: true, unique: true },
    marketSymbol: { type: String, required: true, uppercase: true },
    
    makerOrderId: { type: String, required: true },
    makerAddress: { type: String, default: null, lowercase: true },
    makerIsSynthetic: { type: Boolean, default: false },
    
    takerOrderId: { type: String, required: true },
    takerAddress: { type: String, default: null, lowercase: true },
    takerIsSynthetic: { type: Boolean, default: false },
    
    side: { type: String, enum: ["buy", "sell"], required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    quoteQuantity: { type: Number, required: true },
    
    makerFee: { type: Number, default: 0 },
    takerFee: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Indexes
TradeSchema.index({ marketSymbol: 1, createdAt: -1 });
TradeSchema.index({ makerAddress: 1, createdAt: -1 });
TradeSchema.index({ takerAddress: 1, createdAt: -1 });

export const Trade = mongoose.model<ITrade>("Trade", TradeSchema);
