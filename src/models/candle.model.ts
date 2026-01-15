import mongoose, { Schema, Document } from "mongoose";

export type CandleInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export interface ICandle extends Document {
  marketSymbol: string;
  interval: CandleInterval;
  timestamp: Date;          // Start time of the candle
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;           // Trade volume in this period
  quoteVolume: number;      // USD volume
  trades: number;           // Number of trades
  isClosed: boolean;        // Is this candle finalized
  isMarketOpen: boolean;    // Was market open during this candle
  createdAt: Date;
  updatedAt: Date;
}

const CandleSchema = new Schema<ICandle>(
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
    isMarketOpen: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Compound unique index: one candle per market/interval/timestamp
CandleSchema.index({ marketSymbol: 1, interval: 1, timestamp: 1 }, { unique: true });

// Index for querying recent candles
CandleSchema.index({ marketSymbol: 1, interval: 1, timestamp: -1 });

export const Candle = mongoose.model<ICandle>("Candle", CandleSchema);

// Interval durations in milliseconds
export const INTERVAL_MS: Record<CandleInterval, number> = {
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

// Get the start of a candle period for a given timestamp
export function getCandleStart(timestamp: Date, interval: CandleInterval): Date {
  const ms = timestamp.getTime();
  const intervalMs = INTERVAL_MS[interval];
  const periodStart = Math.floor(ms / intervalMs) * intervalMs;
  return new Date(periodStart);
}
