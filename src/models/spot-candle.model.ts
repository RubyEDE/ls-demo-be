import mongoose, { Schema, Document } from "mongoose";

export type SpotCandleInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export interface ISpotCandle extends Document {
  marketSymbol: string;
  interval: SpotCandleInterval;
  timestamp: Date;          // Start time of the candle
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;           // Trade volume in base asset
  quoteVolume: number;      // Volume in quote asset (USD)
  trades: number;           // Number of trades
  isClosed: boolean;        // Is this candle finalized
  createdAt: Date;
  updatedAt: Date;
}

const SpotCandleSchema = new Schema<ISpotCandle>(
  {
    marketSymbol: { type: String, required: true, uppercase: true },
    interval: { 
      type: String, 
      required: true, 
      enum: ["1m", "5m", "15m", "1h", "4h", "1d"] 
    },
    timestamp: { type: Date, required: true },
    open: { type: Number, required: true },
    high: { type: Number, required: true },
    low: { type: Number, required: true },
    close: { type: Number, required: true },
    volume: { type: Number, default: 0 },
    quoteVolume: { type: Number, default: 0 },
    trades: { type: Number, default: 0 },
    isClosed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Compound unique index: one candle per market/interval/timestamp
SpotCandleSchema.index({ marketSymbol: 1, interval: 1, timestamp: 1 }, { unique: true });

// Index for querying recent candles
SpotCandleSchema.index({ marketSymbol: 1, interval: 1, timestamp: -1 });

export const SpotCandle = mongoose.model<ISpotCandle>("SpotCandle", SpotCandleSchema);

// Interval durations in milliseconds
export const SPOT_INTERVAL_MS: Record<SpotCandleInterval, number> = {
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

// Get the start of a candle period for a given timestamp
export function getSpotCandleStart(timestamp: Date, interval: SpotCandleInterval): Date {
  const ms = timestamp.getTime();
  const intervalMs = SPOT_INTERVAL_MS[interval];
  const periodStart = Math.floor(ms / intervalMs) * intervalMs;
  return new Date(periodStart);
}
