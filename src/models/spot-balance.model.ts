import mongoose, { Document, Schema, Types } from "mongoose";

export interface ISpotBalanceChange {
  amount: number;
  type: "credit" | "debit" | "lock" | "unlock";
  reason: string;
  timestamp: Date;
  referenceId?: string;
  price?: number;           // Price per unit (for cost basis tracking)
}

export interface ISpotBalance extends Document {
  userId: Types.ObjectId;
  address: string;
  asset: string;            // e.g., "USD", "BTC", "AK47-REDLINE"
  free: number;             // Available balance
  locked: number;           // Locked in open orders
  totalCredits: number;
  totalDebits: number;
  totalCostBasis: number;   // Total cost of all purchases (for avg cost calc)
  avgCost: number;          // Average cost per unit
  totalSold: number;        // Total units ever sold (for achievements)
  changes: ISpotBalanceChange[];
  createdAt: Date;
  updatedAt: Date;
}

const spotBalanceChangeSchema = new Schema<ISpotBalanceChange>(
  {
    amount: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: ["credit", "debit", "lock", "unlock"],
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    referenceId: {
      type: String,
    },
    price: {
      type: Number,
    },
  },
  { _id: false }
);

const spotBalanceSchema = new Schema<ISpotBalance>(
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
    asset: {
      type: String,
      required: true,
      uppercase: true,
      index: true,
    },
    free: {
      type: Number,
      default: 0,
      min: 0,
    },
    locked: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalCredits: {
      type: Number,
      default: 0,
    },
    totalDebits: {
      type: Number,
      default: 0,
    },
    totalCostBasis: {
      type: Number,
      default: 0,
    },
    avgCost: {
      type: Number,
      default: 0,
    },
    totalSold: {
      type: Number,
      default: 0,
    },
    changes: {
      type: [spotBalanceChangeSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index: one balance per user per asset
spotBalanceSchema.index({ userId: 1, asset: 1 }, { unique: true });
spotBalanceSchema.index({ address: 1, asset: 1 }, { unique: true });

// Virtual for total balance
spotBalanceSchema.virtual("total").get(function () {
  return this.free + this.locked;
});

// Ensure virtuals are included in JSON
spotBalanceSchema.set("toJSON", { virtuals: true });
spotBalanceSchema.set("toObject", { virtuals: true });

export const SpotBalance = mongoose.model<ISpotBalance>("SpotBalance", spotBalanceSchema);

// Common assets
export const SPOT_ASSETS = {
  USD: "USD",
  // CS:GO items will be added dynamically based on markets
} as const;
