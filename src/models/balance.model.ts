import mongoose, { Document, Schema, Types } from "mongoose";

export interface IBalanceChange {
  amount: number;
  type: "credit" | "debit" | "lock" | "unlock";
  reason: string;
  timestamp: Date;
  referenceId?: string;
}

export interface IBalance extends Document {
  userId: Types.ObjectId;
  address: string;
  free: number;
  locked: number;
  totalCredits: number;
  totalDebits: number;
  changes: IBalanceChange[];
  createdAt: Date;
  updatedAt: Date;
}

const balanceChangeSchema = new Schema<IBalanceChange>(
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
  },
  { _id: false }
);

const balanceSchema = new Schema<IBalance>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    address: {
      type: String,
      required: true,
      lowercase: true,
      unique: true,
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
    changes: {
      type: [balanceChangeSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Virtual for total balance
balanceSchema.virtual("total").get(function () {
  return this.free + this.locked;
});

// Ensure virtuals are included in JSON
balanceSchema.set("toJSON", { virtuals: true });
balanceSchema.set("toObject", { virtuals: true });

export const Balance = mongoose.model<IBalance>("Balance", balanceSchema);
