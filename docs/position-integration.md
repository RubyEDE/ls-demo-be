# Position Management Frontend Integration Guide

This guide shows how to integrate the perpetuals position management system into your frontend application.

## Overview

The position system tracks:

- **Open Positions** - Current long/short positions with real-time PnL
- **Entry Price** - Average entry price (weighted by size)
- **Unrealized PnL** - Current profit/loss based on mark price
- **Realized PnL** - Locked-in profit/loss from closed trades
- **Liquidation Price** - Price at which position is liquidated
- **Margin & Leverage** - Collateral and effective leverage

## Prerequisites

- Completed authentication integration (see `frontend-integration.md`)
- User must be authenticated with a valid JWT token
- User must have balance to open positions

## API Endpoints

### Get All Open Positions

```
GET /clob/positions
Authorization: Bearer <token>
```

**Response:**

```json
{
  "positions": [
    {
      "positionId": "POS-abc123",
      "marketSymbol": "AAPL-PERP",
      "side": "long",
      "size": 1.5,
      "entryPrice": 175.50,
      "markPrice": 178.25,
      "margin": 26.33,
      "leverage": 10.0,
      "unrealizedPnl": 4.13,
      "realizedPnl": 0,
      "liquidationPrice": 158.25,
      "status": "open",
      "openedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### Get Position Summary

```
GET /clob/positions/summary
Authorization: Bearer <token>
```

**Response:**

```json
{
  "totalPositions": 3,
  "totalMargin": 150.00,
  "totalUnrealizedPnl": 25.50,
  "totalRealizedPnl": 100.00,
  "totalEquity": 175.50
}
```

### Get Position for Specific Market

```
GET /clob/positions/:marketSymbol
Authorization: Bearer <token>
```

**Response:**

```json
{
  "position": {
    "positionId": "POS-abc123",
    "marketSymbol": "AAPL-PERP",
    "side": "long",
    "size": 1.5,
    "entryPrice": 175.50,
    "markPrice": 178.25,
    "margin": 26.33,
    "leverage": 10.0,
    "unrealizedPnl": 4.13,
    "realizedPnl": 0,
    "liquidationPrice": 158.25,
    "accumulatedFunding": 0.05,
    "totalFeesPaid": 0.35,
    "status": "open",
    "openedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

Returns `{ "position": null }` if no position exists.

### Close Position

```
POST /clob/positions/:marketSymbol/close
Authorization: Bearer <token>
Content-Type: application/json

{
  "quantity": 0.5  // Optional: partial close. Omit to close entire position
}
```

**Response:**

```json
{
  "success": true,
  "closedQuantity": 0.5,
  "order": {
    "orderId": "ORD-xyz789",
    "averagePrice": 178.25,
    "status": "filled"
  },
  "position": {
    "positionId": "POS-abc123",
    "side": "long",
    "size": 1.0,
    "realizedPnl": 1.38,
    "status": "open"
  }
}
```

### Get Position History

```
GET /clob/positions/history?market=AAPL-PERP&limit=50&offset=0
Authorization: Bearer <token>
```

**Response:**

```json
{
  "positions": [
    {
      "positionId": "POS-old123",
      "marketSymbol": "AAPL-PERP",
      "side": "long",
      "size": 2.0,
      "entryPrice": 170.00,
      "margin": 34.00,
      "realizedPnl": 15.00,
      "totalFeesPaid": 0.68,
      "accumulatedFunding": -0.10,
      "status": "closed",
      "openedAt": "2024-01-10T08:00:00.000Z",
      "closedAt": "2024-01-12T16:30:00.000Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

## React Integration

### 1. Create Position Types

```typescript
// types/position.ts

export type PositionSide = 'long' | 'short';
export type PositionStatus = 'open' | 'closed' | 'liquidated';

export interface Position {
  positionId: string;
  marketSymbol: string;
  side: PositionSide;
  size: number;
  entryPrice: number;
  markPrice: number | null;
  margin: number;
  leverage: number;
  unrealizedPnl: number;
  realizedPnl: number;
  liquidationPrice: number;
  accumulatedFunding?: number;
  totalFeesPaid?: number;
  status: PositionStatus;
  openedAt: string;
  closedAt?: string | null;
}

export interface PositionSummary {
  totalPositions: number;
  totalMargin: number;
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  totalEquity: number;
}

export interface ClosePositionResult {
  success: boolean;
  closedQuantity: number;
  order: {
    orderId: string;
    averagePrice: number;
    status: string;
  } | null;
  position: {
    positionId: string;
    side: PositionSide;
    size: number;
    realizedPnl: number;
    status: PositionStatus;
  } | null;
}
```

### 2. Create Positions Hook

```typescript
// hooks/usePositions.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { Position, PositionSummary } from '../types/position';

const API_BASE = 'http://localhost:3000';

function getAuthHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

interface UsePositionsOptions {
  refreshInterval?: number;
  market?: string;
}

export function usePositions(options: UsePositionsOptions = {}) {
  const { refreshInterval = 2000, market } = options;
  
  const [positions, setPositions] = useState<Position[]>([]);
  const [summary, setSummary] = useState<PositionSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPositions = useCallback(async () => {
    try {
      const [posRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE}/clob/positions`, {
          headers: getAuthHeaders(),
        }),
        fetch(`${API_BASE}/clob/positions/summary`, {
          headers: getAuthHeaders(),
        }),
      ]);
      
      if (!posRes.ok || !summaryRes.ok) {
        throw new Error('Failed to fetch positions');
      }
      
      const posData = await posRes.json();
      const summaryData = await summaryRes.json();
      
      // Filter by market if specified
      let filteredPositions = posData.positions;
      if (market) {
        filteredPositions = posData.positions.filter(
          (p: Position) => p.marketSymbol === market
        );
      }
      
      setPositions(filteredPositions);
      setSummary(summaryData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [market]);

  useEffect(() => {
    fetchPositions();
    
    const interval = setInterval(fetchPositions, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchPositions, refreshInterval]);

  // Get position for a specific market
  const getPosition = useCallback(
    (marketSymbol: string) => 
      positions.find((p) => p.marketSymbol === marketSymbol),
    [positions]
  );

  // Check if user has position in market
  const hasPosition = useCallback(
    (marketSymbol: string) => 
      positions.some((p) => p.marketSymbol === marketSymbol && p.size > 0),
    [positions]
  );

  return {
    positions,
    summary,
    isLoading,
    error,
    getPosition,
    hasPosition,
    refresh: fetchPositions,
  };
}
```

### 3. Create Position Actions Hook

```typescript
// hooks/usePositionActions.ts
import { useState, useCallback } from 'react';
import { Position, ClosePositionResult } from '../types/position';

const API_BASE = 'http://localhost:3000';

function getAuthHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export function usePositionActions() {
  const [isClosing, setIsClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closePosition = useCallback(async (
    marketSymbol: string,
    quantity?: number
  ): Promise<ClosePositionResult | null> => {
    setIsClosing(true);
    setError(null);
    
    try {
      const res = await fetch(`${API_BASE}/clob/positions/${marketSymbol}/close`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(quantity ? { quantity } : {}),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.message || 'Failed to close position');
        return null;
      }
      
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return null;
    } finally {
      setIsClosing(false);
    }
  }, []);

  const closeAllPositions = useCallback(async (
    positions: Position[]
  ): Promise<number> => {
    let closed = 0;
    
    for (const position of positions) {
      if (position.status === 'open' && position.size > 0) {
        const result = await closePosition(position.marketSymbol);
        if (result?.success) closed++;
      }
    }
    
    return closed;
  }, [closePosition]);

  return {
    closePosition,
    closeAllPositions,
    isClosing,
    error,
  };
}
```

### 4. Create Position History Hook

```typescript
// hooks/usePositionHistory.ts
import { useState, useEffect, useCallback } from 'react';
import { Position } from '../types/position';

const API_BASE = 'http://localhost:3000';

function getAuthHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

interface UsePositionHistoryOptions {
  market?: string;
  initialLimit?: number;
}

export function usePositionHistory(options: UsePositionHistoryOptions = {}) {
  const { market, initialLimit = 20 } = options;
  
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const fetchHistory = useCallback(async (offset: number = 0, limit: number = initialLimit) => {
    try {
      setIsLoading(true);
      
      let url = `${API_BASE}/clob/positions/history?limit=${limit}&offset=${offset}`;
      if (market) url += `&market=${market}`;
      
      const res = await fetch(url, {
        headers: getAuthHeaders(),
      });
      
      if (!res.ok) {
        throw new Error('Failed to fetch position history');
      }
      
      const data = await res.json();
      
      if (offset === 0) {
        setPositions(data.positions);
      } else {
        setPositions((prev) => [...prev, ...data.positions]);
      }
      
      setHasMore(data.pagination.hasMore);
    } catch (err) {
      console.error('Error fetching position history:', err);
    } finally {
      setIsLoading(false);
    }
  }, [market, initialLimit]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      fetchHistory(positions.length);
    }
  }, [fetchHistory, isLoading, hasMore, positions.length]);

  return {
    positions,
    isLoading,
    hasMore,
    loadMore,
    refresh: () => fetchHistory(0),
  };
}
```

### 5. Create React Components

#### Position Card Component

```tsx
// components/PositionCard.tsx
import { Position } from '../types/position';
import { usePositionActions } from '../hooks/usePositionActions';

interface PositionCardProps {
  position: Position;
  onClose?: () => void;
}

export function PositionCard({ position, onClose }: PositionCardProps) {
  const { closePosition, isClosing } = usePositionActions();
  
  const isLong = position.side === 'long';
  const isProfitable = position.unrealizedPnl >= 0;
  
  // Calculate ROE (Return on Equity)
  const roe = position.margin > 0
    ? (position.unrealizedPnl / position.margin) * 100
    : 0;

  const handleClose = async () => {
    const result = await closePosition(position.marketSymbol);
    if (result?.success) {
      onClose?.();
    }
  };

  return (
    <div className={`position-card ${position.side}`}>
      <div className="position-header">
        <div className="market-info">
          <span className="market-symbol">{position.marketSymbol}</span>
          <span className={`position-side ${position.side}`}>
            {isLong ? 'LONG' : 'SHORT'}
          </span>
        </div>
        <span className="leverage">{position.leverage.toFixed(1)}x</span>
      </div>

      <div className="position-details">
        <div className="detail-row">
          <span className="label">Size</span>
          <span className="value">{position.size.toFixed(4)}</span>
        </div>
        
        <div className="detail-row">
          <span className="label">Entry Price</span>
          <span className="value">${position.entryPrice.toFixed(2)}</span>
        </div>
        
        <div className="detail-row">
          <span className="label">Mark Price</span>
          <span className="value">
            ${position.markPrice?.toFixed(2) || '--'}
          </span>
        </div>
        
        <div className="detail-row">
          <span className="label">Margin</span>
          <span className="value">${position.margin.toFixed(2)}</span>
        </div>
      </div>

      <div className="position-pnl">
        <div className={`unrealized-pnl ${isProfitable ? 'profit' : 'loss'}`}>
          <span className="label">Unrealized PnL</span>
          <span className="value">
            {isProfitable ? '+' : ''}${position.unrealizedPnl.toFixed(2)}
            <span className="roe">
              ({isProfitable ? '+' : ''}{roe.toFixed(2)}%)
            </span>
          </span>
        </div>
      </div>

      <div className="liquidation-info">
        <span className="label">Liquidation Price</span>
        <span className="value liq-price">
          ${position.liquidationPrice.toFixed(2)}
        </span>
      </div>

      <button
        className="close-position-btn"
        onClick={handleClose}
        disabled={isClosing}
      >
        {isClosing ? 'Closing...' : 'Close Position'}
      </button>
    </div>
  );
}
```

#### Positions List Component

```tsx
// components/PositionsList.tsx
import { usePositions } from '../hooks/usePositions';
import { usePositionActions } from '../hooks/usePositionActions';
import { PositionCard } from './PositionCard';

interface PositionsListProps {
  market?: string;
}

export function PositionsList({ market }: PositionsListProps) {
  const { positions, summary, isLoading, refresh } = usePositions({ market });
  const { closeAllPositions, isClosing } = usePositionActions();

  if (isLoading) {
    return <div className="positions-list loading">Loading positions...</div>;
  }

  if (positions.length === 0) {
    return (
      <div className="positions-list empty">
        <p>No open positions</p>
      </div>
    );
  }

  const handleCloseAll = async () => {
    if (confirm('Are you sure you want to close all positions?')) {
      await closeAllPositions(positions);
      refresh();
    }
  };

  return (
    <div className="positions-list">
      <div className="positions-header">
        <h3>Open Positions ({positions.length})</h3>
        {positions.length > 1 && (
          <button
            className="close-all-btn"
            onClick={handleCloseAll}
            disabled={isClosing}
          >
            Close All
          </button>
        )}
      </div>

      {summary && (
        <div className="positions-summary">
          <div className="summary-item">
            <span className="label">Total Margin</span>
            <span className="value">${summary.totalMargin.toFixed(2)}</span>
          </div>
          <div className="summary-item">
            <span className="label">Unrealized PnL</span>
            <span className={`value ${summary.totalUnrealizedPnl >= 0 ? 'profit' : 'loss'}`}>
              {summary.totalUnrealizedPnl >= 0 ? '+' : ''}
              ${summary.totalUnrealizedPnl.toFixed(2)}
            </span>
          </div>
          <div className="summary-item">
            <span className="label">Total Equity</span>
            <span className="value">${summary.totalEquity.toFixed(2)}</span>
          </div>
        </div>
      )}

      <div className="positions-grid">
        {positions.map((position) => (
          <PositionCard
            key={position.positionId}
            position={position}
            onClose={refresh}
          />
        ))}
      </div>
    </div>
  );
}
```

#### Position History Component

```tsx
// components/PositionHistory.tsx
import { usePositionHistory } from '../hooks/usePositionHistory';
import { Position } from '../types/position';

interface PositionHistoryProps {
  market?: string;
}

export function PositionHistory({ market }: PositionHistoryProps) {
  const { positions, isLoading, hasMore, loadMore } = usePositionHistory({ market });

  if (isLoading && positions.length === 0) {
    return <div className="position-history loading">Loading history...</div>;
  }

  if (positions.length === 0) {
    return (
      <div className="position-history empty">
        No closed positions
      </div>
    );
  }

  return (
    <div className="position-history">
      <h3>Position History</h3>
      
      <table className="history-table">
        <thead>
          <tr>
            <th>Market</th>
            <th>Side</th>
            <th>Size</th>
            <th>Entry</th>
            <th>PnL</th>
            <th>Closed</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => (
            <tr key={pos.positionId}>
              <td>{pos.marketSymbol}</td>
              <td className={pos.side}>{pos.side.toUpperCase()}</td>
              <td>{pos.size.toFixed(4)}</td>
              <td>${pos.entryPrice.toFixed(2)}</td>
              <td className={pos.realizedPnl >= 0 ? 'profit' : 'loss'}>
                {pos.realizedPnl >= 0 ? '+' : ''}${pos.realizedPnl.toFixed(2)}
              </td>
              <td>{pos.closedAt ? new Date(pos.closedAt).toLocaleDateString() : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {hasMore && (
        <button
          className="load-more-btn"
          onClick={loadMore}
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  );
}
```

#### Market Position Widget (Compact)

```tsx
// components/MarketPositionWidget.tsx
import { usePositions } from '../hooks/usePositions';
import { usePositionActions } from '../hooks/usePositionActions';

interface MarketPositionWidgetProps {
  marketSymbol: string;
}

export function MarketPositionWidget({ marketSymbol }: MarketPositionWidgetProps) {
  const { getPosition, refresh } = usePositions();
  const { closePosition, isClosing } = usePositionActions();
  
  const position = getPosition(marketSymbol);
  
  if (!position) {
    return null;
  }

  const isProfitable = position.unrealizedPnl >= 0;
  const roe = position.margin > 0
    ? (position.unrealizedPnl / position.margin) * 100
    : 0;

  const handleClose = async () => {
    await closePosition(marketSymbol);
    refresh();
  };

  return (
    <div className={`market-position-widget ${position.side}`}>
      <div className="widget-row">
        <span className={`side ${position.side}`}>
          {position.side.toUpperCase()}
        </span>
        <span className="size">{position.size}</span>
        <span className="entry">@ ${position.entryPrice.toFixed(2)}</span>
      </div>
      
      <div className="widget-row">
        <span className={`pnl ${isProfitable ? 'profit' : 'loss'}`}>
          {isProfitable ? '+' : ''}${position.unrealizedPnl.toFixed(2)}
          ({isProfitable ? '+' : ''}{roe.toFixed(1)}%)
        </span>
        <button
          className="close-btn"
          onClick={handleClose}
          disabled={isClosing}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
```

### 6. CSS Styles

```css
/* styles/positions.css */

/* Position Card */
.position-card {
  background: #1a1a2e;
  border-radius: 12px;
  padding: 20px;
  border-left: 4px solid;
}

.position-card.long {
  border-left-color: #00c853;
}

.position-card.short {
  border-left-color: #ff5252;
}

.position-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.market-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.market-symbol {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}

.position-side {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.position-side.long {
  background: rgba(0, 200, 83, 0.2);
  color: #00c853;
}

.position-side.short {
  background: rgba(255, 82, 82, 0.2);
  color: #ff5252;
}

.leverage {
  background: #16213e;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 14px;
  color: #888;
}

.position-details {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.detail-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-row .label {
  font-size: 12px;
  color: #666;
}

.detail-row .value {
  font-size: 14px;
  color: #fff;
  font-family: 'JetBrains Mono', monospace;
}

.position-pnl {
  background: #16213e;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
}

.unrealized-pnl {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.unrealized-pnl .label {
  font-size: 14px;
  color: #888;
}

.unrealized-pnl .value {
  font-size: 20px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
}

.unrealized-pnl.profit .value {
  color: #00c853;
}

.unrealized-pnl.loss .value {
  color: #ff5252;
}

.roe {
  font-size: 14px;
  opacity: 0.8;
  margin-left: 8px;
}

.liquidation-info {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-top: 1px solid #333;
  margin-bottom: 16px;
}

.liquidation-info .label {
  color: #666;
  font-size: 12px;
}

.liq-price {
  color: #ff9800;
  font-family: 'JetBrains Mono', monospace;
}

.close-position-btn {
  width: 100%;
  padding: 12px;
  background: transparent;
  border: 1px solid #ff5252;
  border-radius: 6px;
  color: #ff5252;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.close-position-btn:hover {
  background: #ff5252;
  color: #fff;
}

.close-position-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Positions List */
.positions-list {
  background: #12121f;
  border-radius: 12px;
  padding: 20px;
}

.positions-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.positions-header h3 {
  margin: 0;
  color: #fff;
}

.close-all-btn {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid #ff5252;
  border-radius: 4px;
  color: #ff5252;
  cursor: pointer;
  font-size: 12px;
}

.positions-summary {
  display: flex;
  gap: 24px;
  padding: 16px;
  background: #1a1a2e;
  border-radius: 8px;
  margin-bottom: 20px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-item .label {
  font-size: 12px;
  color: #666;
}

.summary-item .value {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.summary-item .value.profit {
  color: #00c853;
}

.summary-item .value.loss {
  color: #ff5252;
}

.positions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

/* Position History */
.position-history {
  background: #12121f;
  border-radius: 12px;
  padding: 20px;
}

.history-table {
  width: 100%;
  border-collapse: collapse;
}

.history-table th {
  text-align: left;
  padding: 12px 8px;
  color: #666;
  font-size: 12px;
  border-bottom: 1px solid #333;
}

.history-table td {
  padding: 12px 8px;
  color: #fff;
  font-size: 14px;
  border-bottom: 1px solid #222;
}

.history-table .long {
  color: #00c853;
}

.history-table .short {
  color: #ff5252;
}

.history-table .profit {
  color: #00c853;
}

.history-table .loss {
  color: #ff5252;
}

.load-more-btn {
  width: 100%;
  padding: 12px;
  margin-top: 16px;
  background: #16213e;
  border: none;
  border-radius: 6px;
  color: #888;
  cursor: pointer;
}

/* Market Position Widget */
.market-position-widget {
  background: #1a1a2e;
  border-radius: 8px;
  padding: 12px;
  border-left: 3px solid;
}

.market-position-widget.long {
  border-left-color: #00c853;
}

.market-position-widget.short {
  border-left-color: #ff5252;
}

.widget-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.widget-row:first-child {
  margin-bottom: 8px;
}

.widget-row .side {
  font-size: 12px;
  font-weight: 600;
}

.widget-row .side.long {
  color: #00c853;
}

.widget-row .side.short {
  color: #ff5252;
}

.widget-row .pnl {
  flex: 1;
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
}

.widget-row .close-btn {
  padding: 4px 8px;
  background: transparent;
  border: 1px solid #666;
  border-radius: 4px;
  color: #888;
  cursor: pointer;
  font-size: 12px;
}

.widget-row .close-btn:hover {
  border-color: #ff5252;
  color: #ff5252;
}
```

## WebSocket Integration

Listen for real-time position updates:

```typescript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:3000', {
  auth: { token: localStorage.getItem('auth_token') },
});

interface PositionUpdate {
  positionId: string;
  marketSymbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  margin: number;
  leverage: number;
  unrealizedPnl: number;
  realizedPnl: number;
  liquidationPrice: number;
  status: 'open' | 'closed' | 'liquidated';
  timestamp: number;
}

// Position opened
socket.on('position:opened', (data: PositionUpdate) => {
  console.log('New position opened:', data);
  // Add to positions list
});

// Position updated (size, PnL changed)
socket.on('position:updated', (data: PositionUpdate) => {
  console.log('Position updated:', data);
  // Update position in state
});

// Position closed
socket.on('position:closed', (data: PositionUpdate) => {
  console.log('Position closed:', data);
  // Remove from open positions, show realized PnL
});

// Position liquidated
socket.on('position:liquidated', (data: PositionUpdate) => {
  console.log('Position liquidated!', data);
  // Show liquidation notification
});
```

### React Hook for WebSocket Position Updates

```typescript
// hooks/usePositionUpdates.ts
import { useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { Position } from '../types/position';

interface PositionUpdateCallbacks {
  onOpened?: (position: Position) => void;
  onUpdated?: (position: Position) => void;
  onClosed?: (position: Position) => void;
  onLiquidated?: (position: Position) => void;
}

export function usePositionUpdates(callbacks: PositionUpdateCallbacks) {
  const { socket, isConnected } = useWebSocket();

  useEffect(() => {
    if (!socket || !isConnected) return;

    if (callbacks.onOpened) {
      socket.on('position:opened', callbacks.onOpened);
    }
    if (callbacks.onUpdated) {
      socket.on('position:updated', callbacks.onUpdated);
    }
    if (callbacks.onClosed) {
      socket.on('position:closed', callbacks.onClosed);
    }
    if (callbacks.onLiquidated) {
      socket.on('position:liquidated', callbacks.onLiquidated);
    }

    return () => {
      socket.off('position:opened');
      socket.off('position:updated');
      socket.off('position:closed');
      socket.off('position:liquidated');
    };
  }, [socket, isConnected, callbacks]);

  return { isConnected };
}
```

## Vanilla JavaScript Integration

### Fetch Positions

```javascript
async function getPositions() {
  const token = localStorage.getItem('auth_token');
  
  const res = await fetch('http://localhost:3000/clob/positions', {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  
  return res.json();
}
```

### Close Position

```javascript
async function closePosition(marketSymbol, quantity = null) {
  const token = localStorage.getItem('auth_token');
  
  const res = await fetch(`http://localhost:3000/clob/positions/${marketSymbol}/close`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(quantity ? { quantity } : {}),
  });
  
  return res.json();
}
```

## PnL Calculation

### Unrealized PnL

```typescript
function calculateUnrealizedPnl(
  side: 'long' | 'short',
  size: number,
  entryPrice: number,
  markPrice: number
): number {
  const priceDiff = markPrice - entryPrice;
  
  if (side === 'long') {
    return priceDiff * size;  // Profit when price goes up
  } else {
    return -priceDiff * size; // Profit when price goes down
  }
}
```

### Return on Equity (ROE)

```typescript
function calculateROE(unrealizedPnl: number, margin: number): number {
  if (margin === 0) return 0;
  return (unrealizedPnl / margin) * 100;
}
```

### Liquidation Price

```typescript
function calculateLiquidationPrice(
  side: 'long' | 'short',
  entryPrice: number,
  margin: number,
  size: number,
  maintenanceMarginRate: number
): number {
  const positionValue = entryPrice * size;
  const maintenanceMargin = positionValue * maintenanceMarginRate;
  const availableForLoss = margin - maintenanceMargin;
  const priceMovement = availableForLoss / size;
  
  if (side === 'long') {
    return Math.max(0, entryPrice - priceMovement);
  } else {
    return entryPrice + priceMovement;
  }
}
```

## Best Practices

### 1. Real-time Updates

Combine polling with WebSocket for reliability:

```typescript
const { positions, refresh } = usePositions({ refreshInterval: 5000 });

usePositionUpdates({
  onUpdated: (updated) => {
    // Immediate update from WebSocket
    setPositions((prev) =>
      prev.map((p) => (p.positionId === updated.positionId ? updated : p))
    );
  },
  onClosed: () => {
    // Refresh full list when position closes
    refresh();
  },
});
```

### 2. Liquidation Warnings

```typescript
function getLiquidationRisk(position: Position): 'safe' | 'warning' | 'danger' {
  if (!position.markPrice) return 'safe';
  
  const distanceToLiq = position.side === 'long'
    ? position.markPrice - position.liquidationPrice
    : position.liquidationPrice - position.markPrice;
  
  const percentToLiq = (distanceToLiq / position.markPrice) * 100;
  
  if (percentToLiq < 2) return 'danger';
  if (percentToLiq < 5) return 'warning';
  return 'safe';
}
```

### 3. Optimistic Updates

```typescript
const handleClosePosition = async () => {
  // Optimistically mark as closing
  setClosingPositions((prev) => [...prev, position.positionId]);
  
  const result = await closePosition(position.marketSymbol);
  
  if (!result?.success) {
    // Revert on failure
    setClosingPositions((prev) => 
      prev.filter((id) => id !== position.positionId)
    );
    showError('Failed to close position');
  }
};
```

## Testing

Run the position management test:

```bash
npm run test:position
```

This tests:
- Opening positions via market orders
- Position tracking (entry, margin, leverage)
- PnL calculation
- Closing positions
- Position history
