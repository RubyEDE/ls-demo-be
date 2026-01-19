import mongoose, { Document, Schema, Types } from "mongoose";

export interface IReferral extends Document {
  referrerId: Types.ObjectId; // User who referred
  refereeId: Types.ObjectId; // User who was referred
  referrerAddress: string;
  refereeAddress: string;
  referralCode: string; // The code used
  status: "pending" | "completed"; // Pending until referee uses faucet
  rewardAmount: number; // Amount credited to referrer
  rewardCredited: boolean;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const referralSchema = new Schema<IReferral>(
  {
    referrerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    refereeId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // A user can only be referred once
    },
    referrerAddress: {
      type: String,
      required: true,
      lowercase: true,
    },
    refereeAddress: {
      type: String,
      required: true,
      lowercase: true,
      unique: true,
    },
    referralCode: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed"],
      default: "pending",
    },
    rewardAmount: {
      type: Number,
      default: 0,
    },
    rewardCredited: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient lookups
referralSchema.index({ referrerId: 1, status: 1 });

export const Referral = mongoose.model<IReferral>("Referral", referralSchema);
