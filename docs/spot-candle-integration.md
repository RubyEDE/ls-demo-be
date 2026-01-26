# Spot Candle Integration Guide

This document covers how to integrate with the spot trading candle (OHLCV) data API for price charting.

## Overview

The spot candle API provides historical and real-time price data for spot markets. Candles are OHLCV (Open, High, Low, Close, Volume) data points representing price action over specific time intervals.

### Available Intervals

| Interval | Description | Data Available |
|----------|-------------|----------------|
| `1m` | 1 minute | ~30 days |
| `5m` | 5 minutes | ~30 days |
| `15m` | 15 minutes | ~30 days |
| `1h` | 1 hour | ~30 days |
| `4h` | 4 hours | ~30 days |
| `1d` | 1 day | ~30 days |

### Available Markets

| Symbol | Name | Base Asset | Quote Asset |
|--------|------|------------|-------------|
| `UMBREON-VMAX-SPOT` | Umbreon VMAX 215/203 Spot | UMBREON-VMAX | USD |

---

## API Reference

### Get Candles

Retrieve historical candle data for a spot market.

```
GET /spot/candles/:symbol
```

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `interval` | string | `1m` | Candle interval: `1m`, `5m`, `15m`, `1h`, `4h`, `1d` |
| `limit` | number | `400` | Number of candles to return (max 2000) |

#### Example Request

```bash
curl "http://localhost:3000/spot/candles/UMBREON-VMAX-SPOT?interval=1h&limit=100"
```

#### Example Response

```json
{
  "symbol": "UMBREON-VMAX-SPOT",
  "interval": "1h",
  "candles": [
    {
      "timestamp": 1706140800000,
      "open": 3390.50,
      "high": 3425.00,
      "low": 3380.25,
      "close": 3410.75,
      "volume": 125,
      "trades": 42,
      "isClosed": true
    },
    {
      "timestamp": 1706144400000,
      "open": 3410.75,
      "high": 3450.00,
      "low": 3400.00,
      "close": 3445.50,
      "volume": 98,
      "trades": 31,
      "isClosed": true
    }
  ],
  "currentCandle": {
    "timestamp": 1706148000000,
    "open": 3445.50,
    "high": 3460.25,
    "low": 3440.00,
    "close": 3455.00,
    "volume": 15,
    "trades": 5,
    "isClosed": false
  },
  "meta": {
    "count": 100,
    "hasEnoughData": true,
    "available": 720,
    "required": 50
  }
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `symbol` | string | Market symbol |
| `interval` | string | Candle interval |
| `candles` | array | Array of historical candles |
| `candles[].timestamp` | number | Candle start time (Unix ms) |
| `candles[].open` | number | Opening price |
| `candles[].high` | number | Highest price in period |
| `candles[].low` | number | Lowest price in period |
| `candles[].close` | number | Closing price |
| `candles[].volume` | number | Trade volume (base asset) |
| `candles[].trades` | number | Number of trades |
| `candles[].isClosed` | boolean | Whether candle is finalized |
| `currentCandle` | object\|null | Live candle (not yet closed) |
| `meta.count` | number | Number of candles returned |
| `meta.hasEnoughData` | boolean | Whether enough data for charting |
| `meta.available` | number | Total closed candles available |
| `meta.required` | number | Minimum required for charting |

---

### Check Candle Status

Check if enough candle data exists for charting across all intervals.

```
GET /spot/candles/:symbol/status
```

#### Example Request

```bash
curl "http://localhost:3000/spot/candles/UMBREON-VMAX-SPOT/status"
```

#### Example Response

```json
{
  "symbol": "UMBREON-VMAX-SPOT",
  "intervals": {
    "1m": {
      "hasEnough": true,
      "count": 43200,
      "required": 50
    },
    "5m": {
      "hasEnough": true,
      "count": 8640,
      "required": 50
    },
    "15m": {
      "hasEnough": true,
      "count": 2880,
      "required": 50
    },
    "1h": {
      "hasEnough": true,
      "count": 720,
      "required": 50
    },
    "4h": {
      "hasEnough": true,
      "count": 180,
      "required": 50
    },
    "1d": {
      "hasEnough": false,
      "count": 30,
      "required": 50
    }
  }
}
```

---

## WebSocket Integration

### Subscribe to Candle Updates

Connect to WebSocket and subscribe to real-time candle updates.

```typescript
import { io } from "socket.io-client";

const socket = io("ws://localhost:3000");

// Subscribe to spot candles (note the "spot:" prefix)
socket.emit("subscribe:candles", {
  symbol: "spot:UMBREON-VMAX-SPOT",
  interval: "1m"
});

// Listen for candle updates
socket.on("candle:update", (data) => {
  console.log("Candle update:", data);
  // {
  //   symbol: "spot:UMBREON-VMAX-SPOT",
  //   interval: "1m",
  //   timestamp: 1706148000000,
  //   open: 3445.50,
  //   high: 3460.25,
  //   low: 3440.00,
  //   close: 3455.00,
  //   volume: 15,
  //   trades: 5,
  //   isClosed: false
  // }
});
```

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `subscribe:candles` | Client → Server | Subscribe to candle updates |
| `unsubscribe:candles` | Client → Server | Unsubscribe from candle updates |
| `candle:update` | Server → Client | Real-time candle data |

---

## TypeScript Interfaces

```typescript
// Candle interval types
type SpotCandleInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

// Single candle
interface SpotCandle {
  timestamp: number;     // Unix milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;        // Base asset volume
  trades: number;        // Number of trades
  isClosed: boolean;     // Is finalized
}

// API response for candles
interface SpotCandlesResponse {
  symbol: string;
  interval: SpotCandleInterval;
  candles: SpotCandle[];
  currentCandle: SpotCandle | null;
  meta: {
    count: number;
    hasEnoughData: boolean;
    available: number;
    required: number;
  };
}

// API response for candle status
interface SpotCandleStatusResponse {
  symbol: string;
  intervals: Record<SpotCandleInterval, {
    hasEnough: boolean;
    count: number;
    required: number;
  }>;
}

// WebSocket candle update
interface SpotCandleUpdate {
  symbol: string;        // With "spot:" prefix
  interval: SpotCandleInterval;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
  isClosed: boolean;
}
```

---

## Client Implementation Example

### React Hook for Candles

```typescript
import { useState, useEffect, useCallback } from "react";
import { io, Socket } from "socket.io-client";

interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export function useSpotCandles(symbol: string, interval: Interval) {
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [currentCandle, setCurrentCandle] = useState<CandleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial candles
  useEffect(() => {
    async function fetchCandles() {
      try {
        setLoading(true);
        const res = await fetch(
          `/spot/candles/${symbol}?interval=${interval}&limit=500`
        );
        const data = await res.json();
        
        if (data.error) {
          throw new Error(data.message);
        }
        
        setCandles(data.candles);
        setCurrentCandle(data.currentCandle);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch candles");
      } finally {
        setLoading(false);
      }
    }
    
    fetchCandles();
  }, [symbol, interval]);

  // Subscribe to real-time updates
  useEffect(() => {
    const socket: Socket = io("ws://localhost:3000");
    
    socket.emit("subscribe:candles", {
      symbol: `spot:${symbol}`,
      interval,
    });
    
    socket.on("candle:update", (data) => {
      if (data.symbol !== `spot:${symbol}` || data.interval !== interval) {
        return;
      }
      
      if (data.isClosed) {
        // Add closed candle to history
        setCandles((prev) => {
          const updated = [...prev];
          // Replace or add
          const existingIdx = updated.findIndex(
            (c) => c.timestamp === data.timestamp
          );
          if (existingIdx >= 0) {
            updated[existingIdx] = data;
          } else {
            updated.push(data);
          }
          return updated;
        });
        setCurrentCandle(null);
      } else {
        // Update current candle
        setCurrentCandle(data);
      }
    });
    
    return () => {
      socket.emit("unsubscribe:candles", {
        symbol: `spot:${symbol}`,
        interval,
      });
      socket.disconnect();
    };
  }, [symbol, interval]);

  return { candles, currentCandle, loading, error };
}
```

### Usage in a Chart Component

```tsx
import { useSpotCandles } from "./useSpotCandles";
import { CandlestickChart } from "./CandlestickChart"; // Your chart library

function SpotPriceChart({ symbol }: { symbol: string }) {
  const [interval, setInterval] = useState<Interval>("1h");
  const { candles, currentCandle, loading, error } = useSpotCandles(
    symbol,
    interval
  );

  if (loading) return <div>Loading chart...</div>;
  if (error) return <div>Error: {error}</div>;

  // Combine historical and current candle
  const allCandles = currentCandle
    ? [...candles, currentCandle]
    : candles;

  return (
    <div>
      <div className="interval-selector">
        {["1m", "5m", "15m", "1h", "4h", "1d"].map((int) => (
          <button
            key={int}
            onClick={() => setInterval(int as Interval)}
            className={interval === int ? "active" : ""}
          >
            {int}
          </button>
        ))}
      </div>
      
      <CandlestickChart
        data={allCandles.map((c) => ({
          time: c.timestamp / 1000, // Convert to seconds for most chart libs
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))}
      />
      
      {currentCandle && (
        <div className="live-indicator">
          Live: ${currentCandle.close.toFixed(2)}
        </div>
      )}
    </div>
  );
}
```

---

## Integration with TradingView Lightweight Charts

```typescript
import { createChart, IChartApi, CandlestickSeriesOptions } from "lightweight-charts";

function initTradingViewChart(container: HTMLElement, symbol: string) {
  const chart = createChart(container, {
    width: 800,
    height: 400,
    layout: {
      background: { color: "#1a1a1a" },
      textColor: "#d1d4dc",
    },
    grid: {
      vertLines: { color: "#2B2B43" },
      horzLines: { color: "#363C4E" },
    },
  });

  const candlestickSeries = chart.addCandlestickSeries({
    upColor: "#26a69a",
    downColor: "#ef5350",
    borderVisible: false,
    wickUpColor: "#26a69a",
    wickDownColor: "#ef5350",
  });

  // Fetch and display candles
  async function loadCandles(interval: string) {
    const res = await fetch(
      `/spot/candles/${symbol}?interval=${interval}&limit=1000`
    );
    const data = await res.json();
    
    const chartData = data.candles.map((c: any) => ({
      time: c.timestamp / 1000,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    
    candlestickSeries.setData(chartData);
    
    // Add current candle if exists
    if (data.currentCandle) {
      candlestickSeries.update({
        time: data.currentCandle.timestamp / 1000,
        open: data.currentCandle.open,
        high: data.currentCandle.high,
        low: data.currentCandle.low,
        close: data.currentCandle.close,
      });
    }
  }

  // Setup WebSocket for real-time updates
  const socket = io("ws://localhost:3000");
  
  socket.emit("subscribe:candles", {
    symbol: `spot:${symbol}`,
    interval: "1h",
  });
  
  socket.on("candle:update", (data) => {
    candlestickSeries.update({
      time: data.timestamp / 1000,
      open: data.open,
      high: data.high,
      low: data.low,
      close: data.close,
    });
  });

  loadCandles("1h");

  return {
    chart,
    series: candlestickSeries,
    changeInterval: loadCandles,
    destroy: () => {
      socket.disconnect();
      chart.remove();
    },
  };
}
```

---

## Error Handling

### Error Responses

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `NOT_FOUND` | 404 | Market not found |
| `INVALID_INTERVAL` | 400 | Invalid interval parameter |
| `INTERNAL_ERROR` | 500 | Server error |

### Example Error Response

```json
{
  "error": "INVALID_INTERVAL",
  "message": "Invalid interval. Must be one of: 1m, 5m, 15m, 1h, 4h, 1d"
}
```

---

## Best Practices

### 1. Initial Load Strategy

```typescript
// Load enough candles for your chart viewport
const CANDLES_PER_VIEWPORT = 100;
const BUFFER_MULTIPLIER = 2; // Load 2x for smooth scrolling

const limit = CANDLES_PER_VIEWPORT * BUFFER_MULTIPLIER;
const candles = await fetchCandles(symbol, interval, limit);
```

### 2. Efficient Updates

```typescript
// Only update the latest candle, don't refetch everything
socket.on("candle:update", (update) => {
  if (update.isClosed) {
    // Append new candle, remove oldest if at limit
    setCandles((prev) => [...prev.slice(-maxCandles + 1), update]);
  } else {
    // Just update the current candle display
    setCurrentCandle(update);
  }
});
```

### 3. Handle Interval Changes

```typescript
// Unsubscribe from old interval, subscribe to new
function changeInterval(newInterval: Interval) {
  socket.emit("unsubscribe:candles", { symbol: currentSymbol, interval: currentInterval });
  socket.emit("subscribe:candles", { symbol: currentSymbol, interval: newInterval });
  
  // Fetch new historical data
  fetchCandles(symbol, newInterval);
  setInterval(newInterval);
}
```

### 4. Reconnection Handling

```typescript
socket.on("disconnect", () => {
  console.log("WebSocket disconnected, attempting reconnect...");
});

socket.on("connect", () => {
  // Resubscribe on reconnect
  socket.emit("subscribe:candles", { symbol, interval });
  
  // Fetch any missed candles
  fetchCandles(symbol, interval);
});
```

---

## Comparison: Spot vs Perpetuals Candles

| Aspect | Spot Candles | Perpetual Candles |
|--------|--------------|-------------------|
| Endpoint | `/spot/candles/:symbol` | `/clob/candles/:symbol` |
| WS Channel | `spot:SYMBOL` | `SYMBOL` |
| Data Source | Spot trades | Perpetual trades |
| Price Range | Market price | Index + funding |
| Use Case | Asset price tracking | Derivatives charting |

---

## Summary

The spot candle API provides:
- **6 intervals**: 1m, 5m, 15m, 1h, 4h, 1d
- **30 days of historical data**: Seeded automatically on startup
- **Real-time updates**: Via WebSocket subscription
- **Chart-ready format**: Compatible with TradingView and other charting libraries

For questions or issues, check the server logs or open an issue on GitHub.
