import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  address: string;
  chainId: number;
  lastLoginAt: Date;
  createdAt: Date;
  updatedAt: Date;
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
    lastLoginAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure address is always stored lowercase
userSchema.pre("save", function () {
  if (this.address) {
    this.address = this.address.toLowerCase();
  }
});

export const User = mongoose.model<IUser>("User", userSchema);
