import mongoose, { Document, Schema, Types } from "mongoose";

export interface IUserAchievement extends Document {
  userId: Types.ObjectId;
  address: string;
  achievementId: string; // References Achievement.id
  unlockedAt: Date;
  // Progress tracking for progression achievements
  currentProgress: number;
  createdAt: Date;
  updatedAt: Date;
}

const userAchievementSchema = new Schema<IUserAchievement>(
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
    achievementId: {
      type: String,
      required: true,
      index: true,
    },
    unlockedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    currentProgress: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Compound unique index - a user can only unlock each achievement once
userAchievementSchema.index({ userId: 1, achievementId: 1 }, { unique: true });
userAchievementSchema.index({ address: 1, achievementId: 1 });

export const UserAchievement = mongoose.model<IUserAchievement>(
  "UserAchievement",
  userAchievementSchema
);
