# Candlestick Charts Frontend Integration Guide

This guide shows how to integrate the perpetuals DEX candlestick/OHLCV data into your frontend application for price charts.

## Overview

The candle system provides:

- **24/7 Price Data** - Continuous candles around the clock
- **Multiple Intervals** - 1m, 5m, 15m, 1h, 4h, 1d timeframes
- **Real-Time Updates** - WebSocket streaming for live candle updates
- **Auto-Backfill** - Automatic historical data generation

## How It Works

The perpetuals DEX market is **always open 24/7**. Price data comes from:

- **Real Finnhub data** when available (during stock market hours)
- **Synthetic price updates** with small variance (~0.05%) when real data is unavailable

This ensures continuous, uninterrupted price charts at all times.

## API Endpoints

### Get Market Status

```
GET /clob/market-status
```

**Response:**

```json
{
  "isOpen": true,
  "currentTime": "2026-01-16T02:47:10.000Z"
}
```

The perpetuals DEX is always open 24/7.

### Get Candles (Primary Endpoint)

```
GET /finnhub/candles/:symbol?interval=1m&limit=100
Authorization: Bearer <token>
```

**Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `symbol` | string | required | Stock symbol (AAPL) or perp symbol (AAPL-PERP) |
| `interval` | string | "1m" | Candle interval: 1m, 5m, 15m, 1h, 4h, 1d |
| `limit` | number | 100 | Number of candles (max 500) |

**Response:**

```json
{
  "symbol": "AAPL-PERP",
  "interval": "1m",
  "marketStatus": {
    "isOpen": true,
    "currentTime": "2026-01-16T02:49:00.000Z"
  },
  
  "t": [1768477620, 1768477680, 1768477740],
  "o": [260.01, 260.17, 259.96],
  "h": [260.01, 260.17, 260.19],
  "l": [259.96, 259.96, 259.96],
  "c": [259.96, 259.96, 259.96],
  "v": [0, 0, 0],

  "candles": [
    {
      "time": 1768477740000,
      "open": 259.96,
      "high": 260.19,
      "low": 259.96,
      "close": 259.96,
      "volume": 0,
      "trades": 0,
      "isClosed": false,
      "isMarketOpen": true
    }
  ],

  "current": {
    "time": 1768477800000,
    "open": 260.01,
    "high": 260.05,
    "low": 259.98,
    "close": 260.02,
    "volume": 0,
    "trades": 0
  },

  "meta": {
    "count": 100,
    "hasEnoughData": true,
    "firstCandle": 1768471800000,
    "lastCandle": 1768477740000
  }
}
```

### Alternative: CLOB Candles Endpoint

```
GET /clob/candles/:symbol?interval=1m&limit=100
```

Same data, different format (no OHLCV arrays).

### Check Candle Data Status

```
GET /clob/candles/:symbol/status
```

**Response:**

```json
{
  "symbol": "AAPL-PERP",
  "marketStatus": {
    "isOpen": true,
    "currentTime": "2026-01-16T02:48:27.000Z"
  },
  "intervals": {
    "1m": { "hasEnough": true, "count": 104, "required": 50 },
    "5m": { "hasEnough": true, "count": 50, "required": 50 },
    "15m": { "hasEnough": true, "count": 51, "required": 50 },
    "1h": { "hasEnough": true, "count": 51, "required": 50 },
    "4h": { "hasEnough": false, "count": 1, "required": 50 },
    "1d": { "hasEnough": false, "count": 1, "required": 50 }
  }
}
```

## WebSocket Integration

### Subscribe to Candle Updates

```typescript
// Subscribe to 1-minute candles for AAPL-PERP
socket.emit("subscribe:candles", { symbol: "AAPL-PERP", interval: "1m" });

// Listen for updates
socket.on("candle:update", (candle) => {
  console.log("Candle update:", candle);
  // {
  //   symbol: "AAPL-PERP",
  //   interval: "1m",
  //   timestamp: 1768477800000,
  //   open: 260.01,
  //   high: 260.05,
  //   low: 259.98,
  //   close: 260.02,
  //   volume: 0,
  //   trades: 0,
  //   isClosed: false
  // }
});

// Unsubscribe
socket.emit("unsubscribe:candles", { symbol: "AAPL-PERP", interval: "1m" });
```

## React Integration

### 1. Create Types

```typescript
// types/candles.ts

export type CandleInterval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
  isClosed: boolean;
  isMarketOpen: boolean;
}

export interface MarketStatus {
  isOpen: boolean;
  currentTime: string;
}

export interface CandleResponse {
  symbol: string;
  interval: CandleInterval;
  marketStatus: MarketStatus;
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
  candles: Candle[];
  current: Candle | null;
  meta: {
    count: number;
    hasEnoughData: boolean;
    firstCandle: number | null;
    lastCandle: number | null;
  };
}
```

### 2. Create Candles Hook

```typescript
// hooks/useCandles.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { Candle, CandleInterval, CandleResponse, MarketStatus } from '../types/candles';

const API_BASE = 'http://localhost:3000';

function getAuthHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

interface UseCandlesOptions {
  symbol: string;
  interval?: CandleInterval;
  limit?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function useCandles(options: UseCandlesOptions) {
  const {
    symbol,
    interval = '1m',
    limit = 100,
    autoRefresh = true,
    refreshInterval = 60000, // 1 minute default
  } = options;

  const [candles, setCandles] = useState<Candle[]>([]);
  const [currentCandle, setCurrentCandle] = useState<Candle | null>(null);
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasEnoughData, setHasEnoughData] = useState(false);

  const fetchCandles = useCallback(async () => {
    try {
      const url = `${API_BASE}/finnhub/candles/${symbol}?interval=${interval}&limit=${limit}`;
      const res = await fetch(url, { headers: getAuthHeaders() });
      
      if (!res.ok) {
        throw new Error('Failed to fetch candles');
      }
      
      const data: CandleResponse = await res.json();
      
      setCandles(data.candles);
      setCurrentCandle(data.current);
      setMarketStatus(data.marketStatus);
      setHasEnoughData(data.meta.hasEnoughData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [symbol, interval, limit]);

  useEffect(() => {
    fetchCandles();
    
    if (autoRefresh) {
      const timer = setInterval(fetchCandles, refreshInterval);
      return () => clearInterval(timer);
    }
  }, [fetchCandles, autoRefresh, refreshInterval]);

  // Update current candle from WebSocket
  const updateCurrentCandle = useCallback((candle: Candle) => {
    if (candle.isClosed) {
      // Add closed candle to history
      setCandles((prev) => {
        const updated = [...prev, candle];
        // Keep only the last `limit` candles
        return updated.slice(-limit);
      });
      setCurrentCandle(null);
    } else {
      setCurrentCandle(candle);
    }
  }, [limit]);

  return {
    candles,
    currentCandle,
    marketStatus,
    isLoading,
    error,
    hasEnoughData,
    refresh: fetchCandles,
    updateCurrentCandle,
  };
}
```

### 3. Create WebSocket Candle Hook

```typescript
// hooks/useCandleUpdates.ts
import { useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { Candle, CandleInterval } from '../types/candles';

interface UseCandleUpdatesOptions {
  symbol: string;
  interval: CandleInterval;
  onUpdate: (candle: Candle) => void;
}

export function useCandleUpdates(options: UseCandleUpdatesOptions) {
  const { symbol, interval, onUpdate } = options;
  const { socket, isConnected } = useWebSocket();

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Subscribe
    socket.emit('subscribe:candles', { symbol, interval });

    // Handle updates
    const handleUpdate = (candle: Candle) => {
      if (candle.symbol === symbol && candle.interval === interval) {
        onUpdate(candle);
      }
    };

    socket.on('candle:update', handleUpdate);

    return () => {
      socket.emit('unsubscribe:candles', { symbol, interval });
      socket.off('candle:update', handleUpdate);
    };
  }, [socket, isConnected, symbol, interval, onUpdate]);

  return { isConnected };
}
```

### 4. Create Combined Hook

```typescript
// hooks/useLiveCandles.ts
import { useCallback } from 'react';
import { useCandles } from './useCandles';
import { useCandleUpdates } from './useCandleUpdates';
import { CandleInterval } from '../types/candles';

interface UseLiveCandlesOptions {
  symbol: string;
  interval?: CandleInterval;
  limit?: number;
}

export function useLiveCandles(options: UseLiveCandlesOptions) {
  const { symbol, interval = '1m', limit = 100 } = options;

  const {
    candles,
    currentCandle,
    marketStatus,
    isLoading,
    error,
    hasEnoughData,
    refresh,
    updateCurrentCandle,
  } = useCandles({
    symbol,
    interval,
    limit,
    autoRefresh: false, // Use WebSocket instead
  });

  // Subscribe to real-time updates
  useCandleUpdates({
    symbol,
    interval,
    onUpdate: updateCurrentCandle,
  });

  // Combine historical and current candle
  const allCandles = currentCandle
    ? [...candles, currentCandle]
    : candles;

  return {
    candles: allCandles,
    currentCandle,
    marketStatus,
    isLoading,
    error,
    hasEnoughData,
    refresh,
  };
}
```

## Chart Library Integration

### Lightweight Charts (TradingView)

```typescript
// components/CandlestickChart.tsx
import { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData } from 'lightweight-charts';
import { useLiveCandles } from '../hooks/useLiveCandles';
import { CandleInterval } from '../types/candles';

interface CandlestickChartProps {
  symbol: string;
  interval?: CandleInterval;
  height?: number;
}

export function CandlestickChart({ symbol, interval = '1m', height = 400 }: CandlestickChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const { candles, marketStatus, isLoading, error } = useLiveCandles({
    symbol,
    interval,
    limit: 200,
  });

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height,
      layout: {
        background: { color: '#1a1a2e' },
        textColor: '#888',
      },
      grid: {
        vertLines: { color: '#2a2a3e' },
        horzLines: { color: '#2a2a3e' },
      },
      crosshair: {
        mode: 1,
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#00c853',
      downColor: '#ff5252',
      borderUpColor: '#00c853',
      borderDownColor: '#ff5252',
      wickUpColor: '#00c853',
      wickDownColor: '#ff5252',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [height]);

  // Update data
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;

    const chartData: CandlestickData[] = candles.map((c) => ({
      time: (c.time / 1000) as any, // Unix seconds
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    seriesRef.current.setData(chartData);
  }, [candles]);

  if (error) {
    return <div className="chart-error">Error: {error}</div>;
  }

  return (
    <div className="candlestick-chart">
      <div className="chart-header">
        <span className="symbol">{symbol}</span>
        <span className="interval">{interval}</span>
        <span className="market-status open">24/7 Market</span>
      </div>
      {isLoading && <div className="chart-loading">Loading...</div>}
      <div ref={chartContainerRef} className="chart-container" />
    </div>
  );
}
```

### Chart.js Integration

```typescript
// components/CandlestickChartJS.tsx
import { useEffect, useRef } from 'react';
import {
  Chart,
  CategoryScale,
  LinearScale,
  TimeScale,
  Tooltip,
} from 'chart.js';
import { CandlestickController, CandlestickElement } from 'chartjs-chart-financial';
import 'chartjs-adapter-date-fns';
import { useLiveCandles } from '../hooks/useLiveCandles';

// Register Chart.js components
Chart.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  Tooltip,
  CandlestickController,
  CandlestickElement
);

interface Props {
  symbol: string;
  interval?: string;
}

export function CandlestickChartJS({ symbol, interval = '1m' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  const { candles, isLoading } = useLiveCandles({ symbol, interval });

  useEffect(() => {
    if (!canvasRef.current || candles.length === 0) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Destroy existing chart
    if (chartRef.current) {
      chartRef.current.destroy();
    }

    const data = candles.map((c) => ({
      x: c.time,
      o: c.open,
      h: c.high,
      l: c.low,
      c: c.close,
    }));

    chartRef.current = new Chart(ctx, {
      type: 'candlestick',
      data: {
        datasets: [{
          label: symbol,
          data,
          borderColor: {
            up: '#00c853',
            down: '#ff5252',
            unchanged: '#888',
          },
          backgroundColor: {
            up: '#00c853',
            down: '#ff5252',
            unchanged: '#888',
          },
        }],
      },
      options: {
        responsive: true,
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'minute',
            },
          },
        },
      },
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [candles, symbol]);

  if (isLoading) return <div>Loading chart...</div>;

  return <canvas ref={canvasRef} />;
}
```

## Candle Styling Utilities

```typescript
// utils/candleUtils.ts

export function getCandleStyle(candle: Candle) {
  const isUp = candle.close >= candle.open;
  
  return {
    color: isUp ? '#00c853' : '#ff5252',
    borderColor: isUp ? '#00c853' : '#ff5252',
    wickColor: isUp ? '#00c853' : '#ff5252',
  };
}

export function formatCandleTime(timestamp: number, interval: string): string {
  const date = new Date(timestamp);
  
  if (interval === '1d') {
    return date.toLocaleDateString();
  }
  
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
```

## Interval Selector Component

```tsx
// components/IntervalSelector.tsx
import { CandleInterval } from '../types/candles';

interface IntervalSelectorProps {
  selected: CandleInterval;
  onChange: (interval: CandleInterval) => void;
}

const INTERVALS: { value: CandleInterval; label: string }[] = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
];

export function IntervalSelector({ selected, onChange }: IntervalSelectorProps) {
  return (
    <div className="interval-selector">
      {INTERVALS.map(({ value, label }) => (
        <button
          key={value}
          className={`interval-btn ${selected === value ? 'active' : ''}`}
          onClick={() => onChange(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
```

## Market Status Indicator

```tsx
// components/MarketStatusIndicator.tsx
import { MarketStatus } from '../types/candles';

interface MarketStatusIndicatorProps {
  status: MarketStatus | null;
}

export function MarketStatusIndicator({ status }: MarketStatusIndicatorProps) {
  if (!status) return null;

  return (
    <div className="market-status-indicator open">
      <span className="status-dot" />
      <span className="status-text">24/7 Market</span>
      <span className="current-time">
        {new Date(status.currentTime).toLocaleTimeString()}
      </span>
    </div>
  );
}
```

## CSS Styles

```css
/* styles/candles.css */

.candlestick-chart {
  background: #12121f;
  border-radius: 12px;
  padding: 16px;
}

.chart-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.chart-header .symbol {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}

.chart-header .interval {
  background: #1a1a2e;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  color: #888;
}

.market-status {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(0, 200, 83, 0.2);
  color: #00c853;
}

.chart-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: #666;
}

.chart-container {
  border-radius: 8px;
  overflow: hidden;
}

/* Interval Selector */
.interval-selector {
  display: flex;
  gap: 4px;
  background: #1a1a2e;
  padding: 4px;
  border-radius: 8px;
}

.interval-btn {
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #888;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.interval-btn:hover {
  color: #fff;
  background: #2a2a3e;
}

.interval-btn.active {
  background: #3a3a4e;
  color: #fff;
}

/* Market Status Indicator */
.market-status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  background: rgba(0, 200, 83, 0.1);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #00c853;
  box-shadow: 0 0 8px #00c853;
}

.status-text {
  font-weight: 600;
  color: #fff;
}

.current-time {
  color: #888;
  margin-left: auto;
}
```

## Vanilla JavaScript Integration

```javascript
// Fetch candles
async function fetchCandles(symbol, interval = '1m', limit = 100) {
  const token = localStorage.getItem('auth_token');
  
  const res = await fetch(
    `http://localhost:3000/finnhub/candles/${symbol}?interval=${interval}&limit=${limit}`,
    {
      headers: { 'Authorization': `Bearer ${token}` },
    }
  );
  
  return res.json();
}

// WebSocket subscription
function subscribeToCandleUpdates(socket, symbol, interval, onUpdate) {
  socket.emit('subscribe:candles', { symbol, interval });
  
  socket.on('candle:update', (candle) => {
    if (candle.symbol === symbol) {
      onUpdate(candle);
    }
  });
  
  return () => {
    socket.emit('unsubscribe:candles', { symbol, interval });
    socket.off('candle:update');
  };
}

// Usage
const data = await fetchCandles('AAPL', '1m', 100);
console.log('Candles:', data.candles);
console.log('Market open:', data.marketStatus.isOpen);
```

## Best Practices

### 1. Handle Loading States

```typescript
if (isLoading) {
  return <ChartSkeleton />;
}

if (!hasEnoughData) {
  return <div>Not enough data. Please wait for more candles to generate.</div>;
}
```

### 2. Efficient Updates

```typescript
// Only update the latest candle, don't re-render entire chart
const handleCandleUpdate = useCallback((candle) => {
  if (candle.isClosed) {
    // Append to data
    chartSeries.update(candle);
  } else {
    // Update last bar
    chartSeries.update(candle);
  }
}, []);
```

### 3. Time Formatting

```typescript
// Convert to local time for display
function formatCandleTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

// Format for different intervals
function formatByInterval(timestamp: number, interval: string): string {
  const date = new Date(timestamp);
  
  switch (interval) {
    case '1d':
      return date.toLocaleDateString();
    case '1h':
    case '4h':
      return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit' });
    default:
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}
```

## Testing

Run the candle-related tests:

```bash
# Test market maker (generates candle data)
npm run test:marketmaker

# Test real-time CLOB (includes candle updates)
npm run test:clob-realtime
```

## Troubleshooting

### Not Enough Candle Data

The system auto-backfills, but if you need more data immediately:

```bash
# Check status
curl http://localhost:3000/clob/candles/AAPL-PERP/status

# Fetch candles (triggers backfill if needed)
curl "http://localhost:3000/finnhub/candles/AAPL?limit=200" -H "Authorization: Bearer $TOKEN"
```

### Candles Not Updating

1. Check WebSocket connection
2. Verify subscription: `socket.emit('subscribe:candles', { symbol: 'AAPL-PERP', interval: '1m' })`
3. Check server logs for candle generation

### Low Volume on Candles

If candles show zero volume, this is expected when no trades are occurring. The price data comes from:
- Real Finnhub data when available
- Synthetic price updates otherwise

Volume only increases when actual trades occur on the perpetuals DEX.
