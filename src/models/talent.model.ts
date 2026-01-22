import mongoose, { Document, Schema, Types } from "mongoose";

export interface IUserTalents extends Document {
  userId: Types.ObjectId;
  address: string;
  // Faucet talent tree
  faucetAmountBoost: number; // 0-3 points, each point = +50% faucet amount
  faucetCooldownReduction: number; // 0-2 points, each point = -30% cooldown
  faucetDoubleClaim: number; // 0-1 points, allows claiming twice per cooldown
  // Leverage talent tree
  leverageBoostSmall: number; // 0-4 points, each point = +1 max leverage
  leverageBoostLarge: number; // 0-1 points, +6 max leverage
  liquidationSave: number; // 0-1 points, save from liquidation once per day
  lastLiquidationSaveAt: Date | null; // Track when liquidation save was last used
  // Track total points spent
  totalPointsSpent: number;
  createdAt: Date;
  updatedAt: Date;
}

const userTalentsSchema = new Schema<IUserTalents>(
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
      index: true,
    },
    // Faucet talent tree
    faucetAmountBoost: {
      type: Number,
      default: 0,
      min: 0,
      max: 3,
    },
    faucetCooldownReduction: {
      type: Number,
      default: 0,
      min: 0,
      max: 2,
    },
    faucetDoubleClaim: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },
    // Leverage talent tree
    leverageBoostSmall: {
      type: Number,
      default: 0,
      min: 0,
      max: 4,
    },
    leverageBoostLarge: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },
    liquidationSave: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },
    lastLiquidationSaveAt: {
      type: Date,
      default: null,
    },
    totalPointsSpent: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure address is always stored lowercase
userTalentsSchema.pre("save", function () {
  if (this.address) {
    this.address = this.address.toLowerCase();
  }
  // Calculate total points spent (faucet tree + leverage tree)
  this.totalPointsSpent =
    this.faucetAmountBoost +
    this.faucetCooldownReduction +
    this.faucetDoubleClaim +
    this.leverageBoostSmall +
    this.leverageBoostLarge +
    this.liquidationSave;
});

export const UserTalents = mongoose.model<IUserTalents>("UserTalents", userTalentsSchema);
