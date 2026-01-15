import mongoose, { Document, Schema, Types } from "mongoose";

export interface IFaucetRequest extends Document {
  userId: Types.ObjectId;
  address: string;
  amount: number;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const faucetRequestSchema = new Schema<IFaucetRequest>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    address: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient daily limit queries
faucetRequestSchema.index({ address: 1, createdAt: -1 });
faucetRequestSchema.index({ userId: 1, createdAt: -1 });

export const FaucetRequest = mongoose.model<IFaucetRequest>(
  "FaucetRequest",
  faucetRequestSchema
);
