import mongoose, { Document, Schema } from "mongoose";

export interface IAchievement extends Document {
  id: string; // Unique identifier (e.g., "faucet_first_claim")
  name: string;
  description: string;
  category: string; // e.g., "faucet", "trading", "positions"
  icon: string; // Icon identifier for frontend
  points: number; // XP/points value
  isProgression: boolean; // Whether this is part of a progression chain
  progressionGroup?: string; // Group ID for progression achievements
  progressionOrder?: number; // Order in progression chain
  requirement: {
    type: string; // e.g., "faucet_claims", "trades_executed"
    threshold: number; // Number required to unlock
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const achievementSchema = new Schema<IAchievement>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
      index: true,
    },
    icon: {
      type: String,
      required: true,
    },
    points: {
      type: Number,
      required: true,
      default: 10,
    },
    isProgression: {
      type: Boolean,
      default: false,
    },
    progressionGroup: {
      type: String,
      index: true,
    },
    progressionOrder: {
      type: Number,
    },
    requirement: {
      type: {
        type: String,
        required: true,
      },
      threshold: {
        type: Number,
        required: true,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for progression queries
achievementSchema.index({ progressionGroup: 1, progressionOrder: 1 });
achievementSchema.index({ "requirement.type": 1, "requirement.threshold": 1 });

export const Achievement = mongoose.model<IAchievement>(
  "Achievement",
  achievementSchema
);
