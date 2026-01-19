import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  address: string;
  chainId: number;
  referralCode: string; // Unique code for referring others
  referredBy?: string; // Referral code used during signup (if any)
  lastLoginAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Generate a unique referral code from address
 * Uses first 4 and last 4 chars of address + random suffix
 */
export function generateReferralCode(address: string): string {
  const prefix = address.slice(2, 6).toUpperCase();
  const suffix = address.slice(-4).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${suffix}${random}`;
}

const userSchema = new Schema<IUser>(
  {
    address: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },
    chainId: {
      type: Number,
      required: true,
      default: 1,
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true, // Allow null/undefined values to not conflict
      index: true,
    },
    referredBy: {
      type: String,
      index: true,
    },
    lastLoginAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure address is always stored lowercase and generate referral code
userSchema.pre("save", function () {
  if (this.address) {
    this.address = this.address.toLowerCase();
  }
  // Generate referral code for new users
  if (!this.referralCode && this.address) {
    this.referralCode = generateReferralCode(this.address);
  }
});

export const User = mongoose.model<IUser>("User", userSchema);
