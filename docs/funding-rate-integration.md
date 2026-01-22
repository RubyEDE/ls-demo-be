# Funding Rate System Integration Guide

## Overview

The funding rate system keeps perpetual futures prices aligned with the spot price by periodically transferring payments between long and short position holders.

**How it works:**
- **Positive funding rate**: Longs pay shorts (perp is trading above spot)
- **Negative funding rate**: Shorts pay longs (perp is trading below spot)
- Funding is settled every **8 hours** by default (00:00, 08:00, 16:00 UTC)

## Key Concepts

| Term | Description |
|------|-------------|
| **Mark Price** | Weighted average of orderbook mid-price and oracle price |
| **Index Price** | Oracle price from Finnhub (spot reference) |
| **Premium** | (Mark Price - Index Price) / Index Price |
| **Funding Rate** | Clamped premium × dampening factor |
| **Funding Payment** | Position Value × Funding Rate |

## API Endpoints

### Get Funding Rate Info

```http
GET /clob/funding/:symbol
```

**Response:**
```json
{
  "marketSymbol": "AAPL-PERP",
  "fundingRate": 0.0001,
  "fundingRatePercent": "0.0100%",
  "predictedFundingRate": 0.00012,
  "predictedFundingRatePercent": "0.0120%",
  "annualizedRate": 0.1095,
  "annualizedRatePercent": "10.95%",
  "markPrice": 175.50,
  "indexPrice": 175.25,
  "premium": 0.00143,
  "premiumPercent": "0.1428%",
  "nextFundingTime": "2024-01-15T08:00:00.000Z",
  "fundingIntervalHours": 8,
  "lastFunding": {
    "fundingRate": 0.0001,
    "timestamp": "2024-01-15T00:00:00.000Z",
    "positionsProcessed": 45
  }
}
```

---

### Get Funding History

```http
GET /clob/funding/:symbol/history?limit=20
```

**Response:**
```json
{
  "marketSymbol": "AAPL-PERP",
  "fundingHistory": [
    {
      "fundingRate": 0.0001,
      "fundingRatePercent": "0.0100%",
      "timestamp": "2024-01-15T00:00:00.000Z",
      "longPayment": 125.50,
      "shortPayment": -125.50,
      "totalLongSize": 1255000,
      "totalShortSize": 980000,
      "positionsProcessed": 45
    }
  ],
  "count": 1
}
```

---

### Estimate Funding Payment

```http
GET /clob/funding/:symbol/estimate?side=long&size=10
```

**Response:**
```json
{
  "marketSymbol": "AAPL-PERP",
  "side": "long",
  "size": 10,
  "fundingRate": 0.0001,
  "fundingRatePercent": "0.0100%",
  "estimatedPayment": 0.18,
  "paymentDirection": "pay",
  "nextFundingTime": "2024-01-15T08:00:00.000Z",
  "fundingIntervalHours": 8
}
```

---

### Get Global Funding Stats

```http
GET /clob/funding-stats
```

**Response:**
```json
{
  "totalFundingProcessed": 150,
  "totalPaymentsDistributed": 4500,
  "lastFundingAt": "2024-01-15T00:00:00.000Z",
  "isEngineRunning": true
}
```

---

## WebSocket Events

### Subscribe to Funding Updates

```javascript
// Subscribe
socket.emit('subscribe:funding', 'AAPL-PERP');

// Unsubscribe
socket.emit('unsubscribe:funding', 'AAPL-PERP');
```

### Funding Rate Update Event

Real-time funding rate predictions:

```javascript
socket.on('funding:update', (data) => {
  console.log('Funding update:', data);
  // {
  //   symbol: "AAPL-PERP",
  //   fundingRate: 0.0001,
  //   predictedFundingRate: 0.00012,
  //   markPrice: 175.50,
  //   indexPrice: 175.25,
  //   premium: 0.00143,
  //   nextFundingTime: 1705305600000,
  //   timestamp: 1705276800000
  // }
});
```

### Funding Payment Event

When funding is settled:

```javascript
socket.on('funding:payment', (data) => {
  console.log('Funding settled:', data);
  // {
  //   symbol: "AAPL-PERP",
  //   fundingRate: 0.0001,
  //   totalLongPayment: 125.50,
  //   totalShortPayment: -125.50,
  //   positionsProcessed: 45,
  //   timestamp: 1705305600000
  // }
});
```

---

## React Integration

### Types

```typescript
// types/funding.ts

export interface FundingInfo {
  marketSymbol: string;
  fundingRate: number;
  fundingRatePercent: string;
  predictedFundingRate: number;
  predictedFundingRatePercent: string;
  annualizedRate: number;
  annualizedRatePercent: string;
  markPrice: number;
  indexPrice: number;
  premium: number;
  premiumPercent: string;
  nextFundingTime: string;
  fundingIntervalHours: number;
  lastFunding: {
    fundingRate: number;
    timestamp: string;
    positionsProcessed: number;
  } | null;
}

export interface FundingHistoryEntry {
  fundingRate: number;
  fundingRatePercent: string;
  timestamp: string;
  longPayment: number;
  shortPayment: number;
  totalLongSize: number;
  totalShortSize: number;
  positionsProcessed: number;
}

export interface FundingEstimate {
  marketSymbol: string;
  side: 'long' | 'short';
  size: number;
  fundingRate: number;
  fundingRatePercent: string;
  estimatedPayment: number;
  paymentDirection: 'pay' | 'receive';
  nextFundingTime: string;
  fundingIntervalHours: number;
}

export interface FundingUpdate {
  symbol: string;
  fundingRate: number;
  predictedFundingRate: number;
  markPrice: number;
  indexPrice: number;
  premium: number;
  nextFundingTime: number;
  timestamp: number;
}
```

### API Functions

```typescript
// api/funding.ts

// Set VITE_API_URL to 'https://api.longsword.io' for production
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function getFundingInfo(symbol: string): Promise<FundingInfo> {
  const res = await fetch(`${API_BASE}/clob/funding/${symbol}`);
  if (!res.ok) throw new Error('Failed to fetch funding info');
  return res.json();
}

export async function getFundingHistory(
  symbol: string,
  limit = 20
): Promise<{ fundingHistory: FundingHistoryEntry[]; count: number }> {
  const res = await fetch(`${API_BASE}/clob/funding/${symbol}/history?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch funding history');
  return res.json();
}

export async function estimateFunding(
  symbol: string,
  side: 'long' | 'short',
  size: number
): Promise<FundingEstimate> {
  const res = await fetch(
    `${API_BASE}/clob/funding/${symbol}/estimate?side=${side}&size=${size}`
  );
  if (!res.ok) throw new Error('Failed to estimate funding');
  return res.json();
}
```

### React Hooks

```typescript
// hooks/useFunding.ts
import { useQuery } from '@tanstack/react-query';
import { getFundingInfo, getFundingHistory, estimateFunding } from '../api/funding';

export const fundingKeys = {
  all: ['funding'] as const,
  info: (symbol: string) => [...fundingKeys.all, 'info', symbol] as const,
  history: (symbol: string) => [...fundingKeys.all, 'history', symbol] as const,
  estimate: (symbol: string, side: string, size: number) => 
    [...fundingKeys.all, 'estimate', symbol, side, size] as const,
};

export function useFundingInfo(symbol: string) {
  return useQuery({
    queryKey: fundingKeys.info(symbol),
    queryFn: () => getFundingInfo(symbol),
    refetchInterval: 10_000, // Refresh every 10 seconds
    enabled: !!symbol,
  });
}

export function useFundingHistory(symbol: string, limit = 20) {
  return useQuery({
    queryKey: fundingKeys.history(symbol),
    queryFn: () => getFundingHistory(symbol, limit),
    enabled: !!symbol,
  });
}

export function useFundingEstimate(
  symbol: string,
  side: 'long' | 'short',
  size: number
) {
  return useQuery({
    queryKey: fundingKeys.estimate(symbol, side, size),
    queryFn: () => estimateFunding(symbol, side, size),
    enabled: !!symbol && !!side && size > 0,
    refetchInterval: 10_000,
  });
}
```

### WebSocket Hook

```typescript
// hooks/useFundingUpdates.ts
import { useEffect, useCallback, useState } from 'react';
import { useWebSocket } from './useWebSocket';
import { FundingUpdate } from '../types/funding';

export function useFundingUpdates(symbol: string) {
  const { socket, isConnected } = useWebSocket();
  const [fundingData, setFundingData] = useState<FundingUpdate | null>(null);
  
  useEffect(() => {
    if (!socket || !isConnected || !symbol) return;
    
    // Subscribe
    socket.emit('subscribe:funding', symbol);
    
    // Listen for updates
    const handleUpdate = (data: FundingUpdate) => {
      if (data.symbol === symbol) {
        setFundingData(data);
      }
    };
    
    socket.on('funding:update', handleUpdate);
    
    return () => {
      socket.emit('unsubscribe:funding', symbol);
      socket.off('funding:update', handleUpdate);
    };
  }, [socket, isConnected, symbol]);
  
  return { fundingData, isConnected };
}
```

### Components

#### Funding Rate Display

```tsx
// components/FundingRateDisplay.tsx
import { useFundingInfo } from '../hooks/useFunding';

interface FundingRateDisplayProps {
  symbol: string;
}

export function FundingRateDisplay({ symbol }: FundingRateDisplayProps) {
  const { data, isLoading } = useFundingInfo(symbol);
  
  if (isLoading || !data) {
    return <div className="funding-rate loading">--</div>;
  }
  
  const isPositive = data.fundingRate >= 0;
  
  // Calculate time until next funding
  const nextFunding = new Date(data.nextFundingTime);
  const now = new Date();
  const hoursUntil = Math.max(0, (nextFunding.getTime() - now.getTime()) / (1000 * 60 * 60));
  const minutesUntil = Math.floor((hoursUntil % 1) * 60);
  
  return (
    <div className="funding-rate-display">
      <div className="funding-header">
        <span className="label">Funding Rate</span>
        <span className="interval">/ {data.fundingIntervalHours}h</span>
      </div>
      
      <div className={`funding-value ${isPositive ? 'positive' : 'negative'}`}>
        {isPositive ? '+' : ''}{data.fundingRatePercent}
      </div>
      
      <div className="funding-details">
        <div className="detail">
          <span className="label">Predicted</span>
          <span className={data.predictedFundingRate >= 0 ? 'positive' : 'negative'}>
            {data.predictedFundingRate >= 0 ? '+' : ''}{data.predictedFundingRatePercent}
          </span>
        </div>
        
        <div className="detail">
          <span className="label">Next Funding</span>
          <span className="countdown">
            {Math.floor(hoursUntil)}h {minutesUntil}m
          </span>
        </div>
      </div>
      
      <div className="price-info">
        <div className="price-row">
          <span>Mark Price</span>
          <span>${data.markPrice.toFixed(2)}</span>
        </div>
        <div className="price-row">
          <span>Index Price</span>
          <span>${data.indexPrice.toFixed(2)}</span>
        </div>
        <div className="price-row">
          <span>Premium</span>
          <span className={data.premium >= 0 ? 'positive' : 'negative'}>
            {data.premiumPercent}
          </span>
        </div>
      </div>
    </div>
  );
}
```

#### Funding History Chart

```tsx
// components/FundingHistoryChart.tsx
import { useFundingHistory } from '../hooks/useFunding';

interface FundingHistoryChartProps {
  symbol: string;
}

export function FundingHistoryChart({ symbol }: FundingHistoryChartProps) {
  const { data, isLoading } = useFundingHistory(symbol, 50);
  
  if (isLoading || !data) {
    return <div className="funding-history loading">Loading...</div>;
  }
  
  // Reverse for chronological order
  const history = [...data.fundingHistory].reverse();
  
  return (
    <div className="funding-history">
      <h3>Funding Rate History</h3>
      
      <div className="history-chart">
        {history.map((entry, idx) => {
          const height = Math.abs(entry.fundingRate) * 10000; // Scale for visibility
          const isPositive = entry.fundingRate >= 0;
          
          return (
            <div
              key={idx}
              className={`bar ${isPositive ? 'positive' : 'negative'}`}
              style={{ height: `${Math.max(2, height)}px` }}
              title={`${entry.fundingRatePercent} at ${new Date(entry.timestamp).toLocaleString()}`}
            />
          );
        })}
      </div>
      
      <table className="history-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Rate</th>
            <th>Long Pay</th>
            <th>Short Pay</th>
          </tr>
        </thead>
        <tbody>
          {data.fundingHistory.slice(0, 10).map((entry, idx) => (
            <tr key={idx}>
              <td>{new Date(entry.timestamp).toLocaleString()}</td>
              <td className={entry.fundingRate >= 0 ? 'positive' : 'negative'}>
                {entry.fundingRatePercent}
              </td>
              <td>${entry.longPayment.toFixed(2)}</td>
              <td>${entry.shortPayment.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

#### Funding Payment Estimator

```tsx
// components/FundingEstimator.tsx
import { useState } from 'react';
import { useFundingEstimate } from '../hooks/useFunding';

interface FundingEstimatorProps {
  symbol: string;
  defaultSide?: 'long' | 'short';
  defaultSize?: number;
}

export function FundingEstimator({
  symbol,
  defaultSide = 'long',
  defaultSize = 1,
}: FundingEstimatorProps) {
  const [side, setSide] = useState<'long' | 'short'>(defaultSide);
  const [size, setSize] = useState(defaultSize);
  
  const { data, isLoading } = useFundingEstimate(symbol, side, size);
  
  return (
    <div className="funding-estimator">
      <h4>Estimate Funding Payment</h4>
      
      <div className="inputs">
        <div className="input-group">
          <label>Side</label>
          <select value={side} onChange={(e) => setSide(e.target.value as 'long' | 'short')}>
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </div>
        
        <div className="input-group">
          <label>Size</label>
          <input
            type="number"
            value={size}
            onChange={(e) => setSize(parseFloat(e.target.value) || 0)}
            min="0"
            step="0.01"
          />
        </div>
      </div>
      
      {data && !isLoading && (
        <div className="estimate-result">
          <div className="result-row">
            <span>Funding Rate</span>
            <span>{data.fundingRatePercent}</span>
          </div>
          <div className={`result-row main ${data.paymentDirection}`}>
            <span>You will {data.paymentDirection}</span>
            <span className={data.paymentDirection === 'pay' ? 'negative' : 'positive'}>
              ${data.estimatedPayment.toFixed(4)}
            </span>
          </div>
          <div className="result-row">
            <span>Next funding in</span>
            <span>{getTimeUntil(data.nextFundingTime)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function getTimeUntil(isoString: string): string {
  const target = new Date(isoString);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  
  if (diff <= 0) return 'Now';
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${hours}h ${minutes}m`;
}
```

---

## CSS Styles

```css
/* styles/funding.css */

.funding-rate-display {
  background: #1a1a2e;
  border-radius: 8px;
  padding: 16px;
}

.funding-header {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 8px;
}

.funding-header .label {
  color: #888;
  font-size: 14px;
}

.funding-header .interval {
  color: #666;
  font-size: 12px;
}

.funding-value {
  font-size: 24px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  margin-bottom: 12px;
}

.funding-value.positive {
  color: #00c853;
}

.funding-value.negative {
  color: #ff5252;
}

.funding-details {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #333;
}

.funding-details .detail {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.funding-details .label {
  font-size: 11px;
  color: #666;
  text-transform: uppercase;
}

.funding-details .countdown {
  font-family: 'JetBrains Mono', monospace;
  color: #fff;
}

.price-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.price-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.price-row span:first-child {
  color: #888;
}

.price-row span:last-child {
  color: #fff;
  font-family: 'JetBrains Mono', monospace;
}

.positive {
  color: #00c853;
}

.negative {
  color: #ff5252;
}

/* Funding History */
.funding-history {
  background: #12121f;
  border-radius: 12px;
  padding: 20px;
}

.history-chart {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 100px;
  margin-bottom: 20px;
  padding: 10px 0;
  border-bottom: 1px solid #333;
}

.history-chart .bar {
  flex: 1;
  min-width: 4px;
  border-radius: 2px 2px 0 0;
}

.history-chart .bar.positive {
  background: #00c853;
}

.history-chart .bar.negative {
  background: #ff5252;
}

.history-table {
  width: 100%;
  border-collapse: collapse;
}

.history-table th,
.history-table td {
  padding: 10px 8px;
  text-align: left;
  font-size: 13px;
}

.history-table th {
  color: #666;
  border-bottom: 1px solid #333;
}

.history-table td {
  color: #fff;
  border-bottom: 1px solid #222;
}

/* Funding Estimator */
.funding-estimator {
  background: #1a1a2e;
  border-radius: 8px;
  padding: 16px;
}

.funding-estimator h4 {
  margin: 0 0 16px 0;
  color: #fff;
  font-size: 14px;
}

.funding-estimator .inputs {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.funding-estimator .input-group {
  flex: 1;
}

.funding-estimator label {
  display: block;
  font-size: 11px;
  color: #666;
  margin-bottom: 4px;
  text-transform: uppercase;
}

.funding-estimator select,
.funding-estimator input {
  width: 100%;
  padding: 8px 12px;
  background: #16213e;
  border: 1px solid #333;
  border-radius: 4px;
  color: #fff;
  font-size: 14px;
}

.estimate-result {
  background: #16213e;
  border-radius: 6px;
  padding: 12px;
}

.result-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 13px;
}

.result-row span:first-child {
  color: #888;
}

.result-row.main {
  font-size: 16px;
  font-weight: 600;
  border-top: 1px solid #333;
  border-bottom: 1px solid #333;
  margin: 8px 0;
  padding: 12px 0;
}

.result-row.pay span:last-child {
  color: #ff5252;
}

.result-row.receive span:last-child {
  color: #00c853;
}
```

---

## Calculation Details

### Mark Price Calculation

```
Mark Price = (Mid Price × 0.7) + (Oracle Price × 0.3)

Where:
  Mid Price = (Best Bid + Best Ask) / 2
  Oracle Price = Finnhub spot price
```

### Funding Rate Calculation

```
Premium = (Mark Price - Index Price) / Index Price
Funding Rate = clamp(Premium × 0.1, -1%, +1%)
```

### Funding Payment Calculation

```
Position Value = Size × Mark Price

For Longs:
  Payment = Position Value × Funding Rate
  (Positive payment = pay, Negative = receive)

For Shorts:
  Payment = -Position Value × Funding Rate
  (Positive payment = receive, Negative = pay)
```

---

## Best Practices

1. **Display countdown**: Show time until next funding prominently
2. **Color coding**: Use green for earning funding, red for paying
3. **Real-time updates**: Use WebSocket for live funding rate predictions
4. **Position warnings**: Alert users when their position will incur significant funding
5. **History visualization**: Show funding rate history chart for trend analysis
6. **APR calculation**: Display annualized rate for easy comparison

---

## Testing

Trigger funding manually for testing:

```bash
# Via the server (for development)
# The funding engine checks every minute and processes markets where funding is due
```

Note: Funding times are aligned to UTC boundaries (00:00, 08:00, 16:00 for 8-hour intervals).
