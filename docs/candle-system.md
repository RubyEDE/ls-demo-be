# Candle System Architecture

This document describes the real-time candlestick (OHLCV) data system for the perpetuals DEX.

## Overview

The candle system provides continuous 24/7 price data for all markets. Candles are:

- **Generated from actual trades** - OHLCV data reflects real trade execution prices
- **Broadcast in real-time** - WebSocket updates every 5 seconds + on every trade
- **Persisted to database** - Full history stored for charting
- **Auto-closing** - Previous candles automatically close when new period starts

## Supported Intervals

| Interval | Duration | Use Case |
|----------|----------|----------|
| `1m` | 1 minute | Real-time trading, scalping |
| `5m` | 5 minutes | Short-term analysis |
| `15m` | 15 minutes | Intraday trading |
| `1h` | 1 hour | Swing trading |
| `4h` | 4 hours | Position trading |
| `1d` | 1 day | Long-term analysis |

## Architecture

### Data Flow

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Trades    │────▶│  Candle Service  │────▶│  WebSocket      │
│  (orders)   │     │                  │     │  Broadcast      │
└─────────────┘     └──────────────────┘     └─────────────────┘
                            │                        │
                            ▼                        ▼
                    ┌──────────────┐         ┌─────────────────┐
                    │  MongoDB     │         │  Frontend       │
                    │  (persist)   │         │  Charts         │
                    └──────────────┘         └─────────────────┘
```

### Components

1. **In-Memory Current Candles** - Fast access to current period's OHLCV
2. **Database Storage** - Historical candle persistence
3. **Trade Handler** - Updates candles on each trade execution
4. **1-Minute Generator** - Closes candles and ensures continuity
5. **5-Second Broadcaster** - Real-time updates for live charts

## Real-Time Updates

### Update Triggers

| Trigger | Frequency | What Happens |
|---------|-----------|--------------|
| Trade executed | Per trade | Updates OHLCV, broadcasts immediately |
| Periodic broadcast | Every 5s | Broadcasts current candle state |
| Minute boundary | Every 1m | Closes previous candle, creates new one |

### WebSocket Event

```typescript
// Subscribe to candle updates
socket.emit("subscribe:candles", { symbol: "AAPL-PERP", interval: "1m" });

// Receive updates
socket.on("candle:update", (candle) => {
  // candle structure:
  {
    symbol: "AAPL-PERP",
    interval: "1m",
    timestamp: 1737072000000,  // Candle start time (ms)
    open: 258.35,
    high: 258.42,
    low: 258.30,
    close: 258.38,
    volume: 12.5,             // Total traded quantity
    trades: 23,               // Number of trades
    isClosed: false           // true when candle is finalized
  }
});

// Unsubscribe
socket.emit("unsubscribe:candles", { symbol: "AAPL-PERP", interval: "1m" });
```

### Update Frequency

- **With active trading**: Updates on every trade + every 5 seconds
- **During quiet periods**: Updates every 5 seconds with latest price
- **On candle close**: Final update with `isClosed: true`

## Candle Generation Logic

### From Trades (Primary)

When a trade executes, `updateCandleFromTrade()` is called:

```typescript
// For each trade:
await updateCandleFromTrade(marketSymbol, price, quantity);

// Updates all intervals (1m, 5m, 15m, 1h, 4h, 1d)
// - If same candle period: update high/low/close/volume
// - If new period: close previous, start new candle
```

### Candle Period Transitions

When time crosses into a new candle period:

1. **Previous candle is closed**
   - `isClosed` set to `true`
   - Saved to database
   - Broadcast with `isClosed: true`

2. **New candle is created**
   - Opens at the trade price (or last known price)
   - Broadcast immediately
   - Saved to database

### Flat Candles (No Trades)

When no trades occur in a period:

1. System detects missing candle for previous period
2. Creates flat candle: `open = high = low = close = lastKnownPrice`
3. Volume and trades set to 0
4. Broadcasts the closed flat candle

## Price Sources

### Priority Order

1. **Trade prices** - Actual execution prices (highest priority)
2. **Last known price** - Most recent trade price for the symbol
3. **Oracle price** - Finnhub price data (fallback)

### Price Tracking

```typescript
// Updated on every trade
lastKnownPrices.set(symbol, tradePrice);

// Used for:
// - New candle open price
// - Flat candle generation
// - Close price updates during quiet periods
```

## API Endpoints

### Get Candles

```
GET /clob/candles/:symbol?interval=1m&limit=100
```

**Response:**

```json
{
  "symbol": "AAPL-PERP",
  "interval": "1m",
  "marketStatus": {
    "isOpen": true,
    "currentTime": "2026-01-17T12:00:00.000Z"
  },
  "candles": [
    {
      "timestamp": 1737072000000,
      "open": 258.35,
      "high": 258.42,
      "low": 258.30,
      "close": 258.38,
      "volume": 12.5,
      "trades": 23,
      "isClosed": true,
      "isMarketOpen": true
    }
  ],
  "currentCandle": {
    "timestamp": 1737072060000,
    "open": 258.38,
    "high": 258.40,
    "low": 258.35,
    "close": 258.39,
    "volume": 5.2,
    "trades": 8,
    "isClosed": false
  },
  "meta": {
    "count": 100,
    "hasEnoughData": true
  }
}
```

### Get Candle Status

```
GET /clob/candles/:symbol/status
```

### Get Market Status

```
GET /clob/market-status
```

**Response:**

```json
{
  "isOpen": true,
  "currentTime": "2026-01-17T12:00:00.000Z"
}
```

## Database Schema

```typescript
interface ICandle {
  marketSymbol: string;     // "AAPL-PERP"
  interval: CandleInterval; // "1m" | "5m" | "15m" | "1h" | "4h" | "1d"
  timestamp: Date;          // Start time of candle period
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;           // Total traded quantity
  quoteVolume: number;      // Total traded value (price * quantity)
  trades: number;           // Number of trades
  isClosed: boolean;        // Is this candle finalized?
  isMarketOpen: boolean;    // Always true (24/7 market)
}

// Indexes
{ marketSymbol: 1, interval: 1, timestamp: 1 }  // Unique
{ marketSymbol: 1, interval: 1, timestamp: -1 } // Query performance
```

## Internal Functions

### Key Functions

| Function | Purpose |
|----------|---------|
| `updateCandleFromTrade()` | Update candles when trade executes |
| `generateCandlesFromTrades()` | Close previous candles, create new ones (1min) |
| `broadcastCurrentCandles()` | Emit current candle state (5sec) |
| `saveCandle()` | Persist candle to database |
| `startCandleGenerator()` | Start both intervals |
| `stopCandleGenerator()` | Stop both intervals |

### Initialization

```typescript
// Called on server start
await initializeCandles();

// This:
// 1. Sets initial prices from oracle
// 2. Seeds historical candles if needed
// 3. Starts the 1-minute generator
// 4. Starts the 5-second broadcaster
```

## Frontend Integration

### React Hook Example

```typescript
import { useEffect, useState, useCallback } from 'react';

function useLiveCandles(symbol: string, interval: string = '1m') {
  const [candles, setCandles] = useState([]);
  const [currentCandle, setCurrentCandle] = useState(null);

  useEffect(() => {
    // Fetch initial data
    fetch(`/clob/candles/${symbol}?interval=${interval}&limit=100`)
      .then(res => res.json())
      .then(data => {
        setCandles(data.candles);
        setCurrentCandle(data.currentCandle);
      });

    // Subscribe to updates
    socket.emit('subscribe:candles', { symbol, interval });

    socket.on('candle:update', (candle) => {
      if (candle.symbol !== symbol || candle.interval !== interval) return;

      if (candle.isClosed) {
        // Add closed candle to history
        setCandles(prev => [...prev.slice(-99), candle]);
        setCurrentCandle(null);
      } else {
        // Update current candle
        setCurrentCandle(candle);
      }
    });

    return () => {
      socket.emit('unsubscribe:candles', { symbol, interval });
      socket.off('candle:update');
    };
  }, [symbol, interval]);

  return { candles, currentCandle };
}
```

### Chart Library Integration

```typescript
// For TradingView Lightweight Charts
const chartData = candles.map(c => ({
  time: c.timestamp / 1000,  // Convert to seconds
  open: c.open,
  high: c.high,
  low: c.low,
  close: c.close,
}));

// Update on new candle
if (currentCandle) {
  series.update({
    time: currentCandle.timestamp / 1000,
    open: currentCandle.open,
    high: currentCandle.high,
    low: currentCandle.low,
    close: currentCandle.close,
  });
}
```

## Timing Guarantees

| Event | Timing |
|-------|--------|
| Trade update broadcast | < 100ms after trade |
| Periodic broadcast | Every 5 seconds |
| Candle close | Within 1 second of minute boundary |
| Database persist | Every trade (1m) or 20% chance (other intervals) |

## Troubleshooting

### Candles Not Updating

1. Check WebSocket connection
2. Verify subscription: `socket.emit('subscribe:candles', { symbol, interval })`
3. Check server logs for candle generation errors

### Missing Candles

```bash
# Check candle status
curl http://localhost:3000/clob/candles/AAPL-PERP/status

# Check for gaps
curl http://localhost:3000/clob/candles/AAPL-PERP/gaps
```

### Zero Volume Candles

Expected during periods with no trading activity. Price data continues from:
- Oracle price updates
- Previous candle close price

## Configuration

### Intervals (candle.service.ts)

```typescript
// 1-minute generator: closes candles, creates new ones
setInterval(generateCandlesFromTrades, 60 * 1000);

// 5-second broadcaster: real-time updates
setInterval(broadcastCurrentCandles, 5000);
```

### Trade Generator (marketmaker.service.ts)

```typescript
// Synthetic trades for market activity
const DEFAULT_TRADE_CONFIG = {
  minTrades: 1,
  maxTrades: 2,
  minQuantity: 0.1,
  maxQuantity: 1.5,
  intervalMs: 500,  // Generate trades every 500ms
};
```
