# CLOB Frontend Integration Guide

This guide shows how to integrate the perpetuals CLOB trading system into your frontend application.

## Prerequisites

- Completed authentication integration (see `frontend-integration.md`)
- User must be authenticated with a valid JWT token
- User must have balance (from faucet) to place orders

## React Integration

### 1. Create CLOB Types

```typescript
// types/clob.ts

export interface Market {
  symbol: string;
  name: string;
  baseAsset: string;
  quoteAsset: string;
  oraclePrice: number | null;
  indexPrice: number | null; // Index price (same as oracle price, spot reference)
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  tickSize: number;
  lotSize: number;
  minOrderSize: number;
  maxOrderSize: number;
  maxLeverage: number;
  initialMarginRate?: number;
  maintenanceMarginRate?: number;
  fundingRate: number;
  volume24h: number;
  status: 'active' | 'paused' | 'settlement';
}

export interface OrderBookEntry {
  price: number;
  quantity: number;
  total: number;
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  oraclePrice: number | null;
  timestamp: number;
}

export interface Trade {
  id: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  timestamp: string;
}

export interface Order {
  orderId: string;
  marketSymbol: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  price: number;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  averagePrice: number;
  status: 'pending' | 'open' | 'partial' | 'filled' | 'cancelled';
  createdAt: string;
  filledAt?: string;
  cancelledAt?: string;
}

export interface PlaceOrderParams {
  marketSymbol: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  price?: number;
  quantity: number;
  postOnly?: boolean;
  reduceOnly?: boolean;
}
```

### 2. Create Markets Hook

```typescript
// hooks/useMarkets.ts
import { useState, useEffect, useCallback } from 'react';
import { Market } from '../types/clob';

const API_BASE = 'http://localhost:3000';

export function useMarkets() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMarkets = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`${API_BASE}/clob/markets`);
      
      if (!res.ok) {
        throw new Error('Failed to fetch markets');
      }
      
      const data = await res.json();
      setMarkets(data.markets);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarkets();
    
    // Refresh every 5 seconds
    const interval = setInterval(fetchMarkets, 5000);
    return () => clearInterval(interval);
  }, [fetchMarkets]);

  return {
    markets,
    isLoading,
    error,
    refresh: fetchMarkets,
  };
}
```

### 3. Create Order Book Hook

```typescript
// hooks/useOrderBook.ts
import { useState, useEffect, useCallback } from 'react';
import { OrderBook } from '../types/clob';

const API_BASE = 'http://localhost:3000';

interface UseOrderBookOptions {
  depth?: number;
  refreshInterval?: number;
}

export function useOrderBook(
  symbol: string,
  options: UseOrderBookOptions = {}
) {
  const { depth = 15, refreshInterval = 1000 } = options;
  
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrderBook = useCallback(async () => {
    if (!symbol) return;
    
    try {
      const res = await fetch(
        `${API_BASE}/clob/orderbook/${symbol}?depth=${depth}`
      );
      
      if (!res.ok) {
        throw new Error('Failed to fetch order book');
      }
      
      const data = await res.json();
      setOrderBook(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [symbol, depth]);

  useEffect(() => {
    fetchOrderBook();
    
    const interval = setInterval(fetchOrderBook, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchOrderBook, refreshInterval]);

  // Calculate spread
  const spread = orderBook?.bids[0] && orderBook?.asks[0]
    ? orderBook.asks[0].price - orderBook.bids[0].price
    : null;

  const spreadPercent = spread && orderBook?.oraclePrice
    ? (spread / orderBook.oraclePrice) * 100
    : null;

  return {
    orderBook,
    spread,
    spreadPercent,
    isLoading,
    error,
    refresh: fetchOrderBook,
  };
}
```

### 4. Create Trading Hook

```typescript
// hooks/useTrading.ts
import { useState, useCallback } from 'react';
import { Order, PlaceOrderParams, Trade } from '../types/clob';

const API_BASE = 'http://localhost:3000';

function getAuthHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

interface PlaceOrderResult {
  success: boolean;
  order?: Order;
  trades?: Trade[];
  error?: string;
}

export function useTrading() {
  const [isPlacing, setIsPlacing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeOrder = useCallback(async (
    params: PlaceOrderParams
  ): Promise<PlaceOrderResult> => {
    setIsPlacing(true);
    setError(null);
    
    try {
      const res = await fetch(`${API_BASE}/clob/orders`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(params),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.message || 'Failed to place order');
        return { success: false, error: data.message };
      }
      
      return {
        success: true,
        order: data.order,
        trades: data.trades,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsPlacing(false);
    }
  }, []);

  const cancelOrder = useCallback(async (orderId: string): Promise<boolean> => {
    setIsCancelling(true);
    setError(null);
    
    try {
      const res = await fetch(`${API_BASE}/clob/orders/${orderId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.message || 'Failed to cancel order');
        return false;
      }
      
      return data.success;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return false;
    } finally {
      setIsCancelling(false);
    }
  }, []);

  const cancelAllOrders = useCallback(async (
    orders: Order[]
  ): Promise<number> => {
    let cancelled = 0;
    
    for (const order of orders) {
      if (['open', 'partial', 'pending'].includes(order.status)) {
        const success = await cancelOrder(order.orderId);
        if (success) cancelled++;
      }
    }
    
    return cancelled;
  }, [cancelOrder]);

  return {
    placeOrder,
    cancelOrder,
    cancelAllOrders,
    isPlacing,
    isCancelling,
    error,
  };
}
```

### 5. Create Orders Hook

```typescript
// hooks/useOrders.ts
import { useState, useEffect, useCallback } from 'react';
import { Order } from '../types/clob';

const API_BASE = 'http://localhost:3000';

function getAuthHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

interface UseOrdersOptions {
  market?: string;
  refreshInterval?: number;
}

export function useOrders(options: UseOrdersOptions = {}) {
  const { market, refreshInterval = 2000 } = options;
  
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const url = market
        ? `${API_BASE}/clob/orders?market=${market}`
        : `${API_BASE}/clob/orders`;
      
      const res = await fetch(url, {
        headers: getAuthHeaders(),
      });
      
      if (!res.ok) {
        throw new Error('Failed to fetch orders');
      }
      
      const data = await res.json();
      setOpenOrders(data.orders);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [market]);

  useEffect(() => {
    fetchOrders();
    
    const interval = setInterval(fetchOrders, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchOrders, refreshInterval]);

  return {
    openOrders,
    isLoading,
    error,
    refresh: fetchOrders,
  };
}

export function useOrderHistory(options: UseOrdersOptions = {}) {
  const { market } = options;
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const fetchHistory = useCallback(async (offset: number = 0, limit: number = 50) => {
    try {
      setIsLoading(true);
      
      let url = `${API_BASE}/clob/orders/history?limit=${limit}&offset=${offset}`;
      if (market) url += `&market=${market}`;
      
      const res = await fetch(url, {
        headers: getAuthHeaders(),
      });
      
      if (!res.ok) {
        throw new Error('Failed to fetch order history');
      }
      
      const data = await res.json();
      
      if (offset === 0) {
        setOrders(data.orders);
      } else {
        setOrders((prev) => [...prev, ...data.orders]);
      }
      
      setHasMore(data.pagination.hasMore);
    } catch (err) {
      console.error('Error fetching order history:', err);
    } finally {
      setIsLoading(false);
    }
  }, [market]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      fetchHistory(orders.length);
    }
  }, [fetchHistory, isLoading, hasMore, orders.length]);

  return {
    orders,
    isLoading,
    hasMore,
    loadMore,
    refresh: () => fetchHistory(0),
  };
}
```

### 6. Create React Components

#### Market Selector Component

```tsx
// components/MarketSelector.tsx
import { useMarkets } from '../hooks/useMarkets';
import { Market } from '../types/clob';

interface MarketSelectorProps {
  selectedMarket: string;
  onSelectMarket: (symbol: string) => void;
}

export function MarketSelector({
  selectedMarket,
  onSelectMarket,
}: MarketSelectorProps) {
  const { markets, isLoading } = useMarkets();

  if (isLoading) {
    return <div className="market-selector loading">Loading markets...</div>;
  }

  return (
    <div className="market-selector">
      {markets.map((market) => (
        <button
          key={market.symbol}
          className={`market-button ${
            selectedMarket === market.symbol ? 'selected' : ''
          }`}
          onClick={() => onSelectMarket(market.symbol)}
        >
          <span className="market-name">{market.baseAsset}</span>
          <span className="market-price">
            ${market.oraclePrice?.toFixed(2) || '--'}
          </span>
          <span
            className={`market-change ${
              (market.fundingRate || 0) >= 0 ? 'positive' : 'negative'
            }`}
          >
            {market.maxLeverage}x
          </span>
        </button>
      ))}
    </div>
  );
}
```

#### Order Book Component

```tsx
// components/OrderBookDisplay.tsx
import { useOrderBook } from '../hooks/useOrderBook';
import { OrderBookEntry } from '../types/clob';

interface OrderBookDisplayProps {
  symbol: string;
  onPriceClick?: (price: number) => void;
}

export function OrderBookDisplay({
  symbol,
  onPriceClick,
}: OrderBookDisplayProps) {
  const { orderBook, spread, spreadPercent, isLoading } = useOrderBook(symbol, {
    depth: 10,
    refreshInterval: 500,
  });

  if (isLoading || !orderBook) {
    return <div className="orderbook loading">Loading order book...</div>;
  }

  const maxTotal = Math.max(
    ...orderBook.bids.map((b) => b.total),
    ...orderBook.asks.map((a) => a.total)
  );

  const renderLevel = (entry: OrderBookEntry, side: 'bid' | 'ask') => {
    const depthPercent = (entry.total / maxTotal) * 100;

    return (
      <div
        key={entry.price}
        className={`orderbook-row ${side}`}
        onClick={() => onPriceClick?.(entry.price)}
      >
        <div
          className="depth-bar"
          style={{ width: `${depthPercent}%` }}
        />
        <span className="price">${entry.price.toFixed(2)}</span>
        <span className="quantity">{entry.quantity.toFixed(4)}</span>
        <span className="total">${entry.total.toFixed(2)}</span>
      </div>
    );
  };

  return (
    <div className="orderbook">
      <div className="orderbook-header">
        <span>Price</span>
        <span>Size</span>
        <span>Total</span>
      </div>

      <div className="asks">
        {orderBook.asks
          .slice(0, 10)
          .reverse()
          .map((ask) => renderLevel(ask, 'ask'))}
      </div>

      <div className="spread-row">
        <span className="oracle-price">
          Oracle: ${orderBook.oraclePrice?.toFixed(2)}
        </span>
        <span className="spread">
          Spread: ${spread?.toFixed(2)} ({spreadPercent?.toFixed(3)}%)
        </span>
      </div>

      <div className="bids">
        {orderBook.bids
          .slice(0, 10)
          .map((bid) => renderLevel(bid, 'bid'))}
      </div>
    </div>
  );
}
```

#### Order Form Component

```tsx
// components/OrderForm.tsx
import { useState, useMemo } from 'react';
import { useTrading } from '../hooks/useTrading';
import { useOrderBook } from '../hooks/useOrderBook';
import { Market } from '../types/clob';

interface OrderFormProps {
  market: Market;
  onOrderPlaced?: () => void;
}

export function OrderForm({ market, onOrderPlaced }: OrderFormProps) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'limit' | 'market'>('limit');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [postOnly, setPostOnly] = useState(false);

  const { placeOrder, isPlacing, error } = useTrading();
  const { orderBook } = useOrderBook(market.symbol);

  // Calculate order value and required margin
  const orderValue = useMemo(() => {
    const p = orderType === 'market'
      ? (orderBook?.oraclePrice || 0)
      : parseFloat(price) || 0;
    const q = parseFloat(quantity) || 0;
    return p * q;
  }, [orderType, price, quantity, orderBook?.oraclePrice]);

  const requiredMargin = useMemo(() => {
    return orderValue * (market.initialMarginRate || 0.05);
  }, [orderValue, market.initialMarginRate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = await placeOrder({
      marketSymbol: market.symbol,
      side,
      type: orderType,
      price: orderType === 'limit' ? parseFloat(price) : undefined,
      quantity: parseFloat(quantity),
      postOnly: orderType === 'limit' ? postOnly : undefined,
    });

    if (result.success) {
      setPrice('');
      setQuantity('');
      onOrderPlaced?.();
    }
  };

  const setMarketPrice = (type: 'bid' | 'ask') => {
    if (!orderBook) return;
    
    const price = type === 'bid'
      ? orderBook.bids[0]?.price
      : orderBook.asks[0]?.price;
    
    if (price) setPrice(price.toFixed(2));
  };

  return (
    <form className="order-form" onSubmit={handleSubmit}>
      <div className="side-selector">
        <button
          type="button"
          className={`side-btn buy ${side === 'buy' ? 'active' : ''}`}
          onClick={() => setSide('buy')}
        >
          Buy / Long
        </button>
        <button
          type="button"
          className={`side-btn sell ${side === 'sell' ? 'active' : ''}`}
          onClick={() => setSide('sell')}
        >
          Sell / Short
        </button>
      </div>

      <div className="type-selector">
        <button
          type="button"
          className={orderType === 'limit' ? 'active' : ''}
          onClick={() => setOrderType('limit')}
        >
          Limit
        </button>
        <button
          type="button"
          className={orderType === 'market' ? 'active' : ''}
          onClick={() => setOrderType('market')}
        >
          Market
        </button>
      </div>

      {orderType === 'limit' && (
        <div className="input-group">
          <label>Price</label>
          <div className="price-input">
            <input
              type="number"
              step={market.tickSize}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
            />
            <div className="quick-buttons">
              <button type="button" onClick={() => setMarketPrice('bid')}>
                Bid
              </button>
              <button type="button" onClick={() => setMarketPrice('ask')}>
                Ask
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="input-group">
        <label>Quantity</label>
        <input
          type="number"
          step={market.lotSize}
          min={market.minOrderSize}
          max={market.maxOrderSize}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="0.00"
        />
        <span className="hint">
          Min: {market.minOrderSize} | Max: {market.maxOrderSize}
        </span>
      </div>

      {orderType === 'limit' && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={postOnly}
            onChange={(e) => setPostOnly(e.target.checked)}
          />
          Post Only (maker only)
        </label>
      )}

      <div className="order-summary">
        <div className="summary-row">
          <span>Order Value</span>
          <span>${orderValue.toFixed(2)}</span>
        </div>
        <div className="summary-row">
          <span>Required Margin ({(market.initialMarginRate || 0.05) * 100}%)</span>
          <span>${requiredMargin.toFixed(2)}</span>
        </div>
        <div className="summary-row">
          <span>Leverage</span>
          <span>{market.maxLeverage}x max</span>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <button
        type="submit"
        className={`submit-btn ${side}`}
        disabled={isPlacing || !quantity}
      >
        {isPlacing
          ? 'Placing Order...'
          : `${side === 'buy' ? 'Buy' : 'Sell'} ${market.baseAsset}`}
      </button>
    </form>
  );
}
```

#### Open Orders Component

```tsx
// components/OpenOrders.tsx
import { useOrders } from '../hooks/useOrders';
import { useTrading } from '../hooks/useTrading';
import { Order } from '../types/clob';

interface OpenOrdersProps {
  market?: string;
}

export function OpenOrders({ market }: OpenOrdersProps) {
  const { openOrders, isLoading, refresh } = useOrders({ market });
  const { cancelOrder, cancelAllOrders, isCancelling } = useTrading();

  const handleCancel = async (orderId: string) => {
    const success = await cancelOrder(orderId);
    if (success) refresh();
  };

  const handleCancelAll = async () => {
    await cancelAllOrders(openOrders);
    refresh();
  };

  if (isLoading) {
    return <div className="open-orders loading">Loading orders...</div>;
  }

  if (openOrders.length === 0) {
    return (
      <div className="open-orders empty">
        No open orders
      </div>
    );
  }

  return (
    <div className="open-orders">
      <div className="orders-header">
        <h3>Open Orders ({openOrders.length})</h3>
        <button
          className="cancel-all-btn"
          onClick={handleCancelAll}
          disabled={isCancelling}
        >
          Cancel All
        </button>
      </div>

      <table className="orders-table">
        <thead>
          <tr>
            <th>Market</th>
            <th>Side</th>
            <th>Type</th>
            <th>Price</th>
            <th>Qty</th>
            <th>Filled</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {openOrders.map((order) => (
            <tr key={order.orderId}>
              <td>{order.marketSymbol}</td>
              <td className={order.side}>{order.side.toUpperCase()}</td>
              <td>{order.type}</td>
              <td>${order.price.toFixed(2)}</td>
              <td>{order.quantity.toFixed(4)}</td>
              <td>
                {order.filledQuantity.toFixed(4)} / {order.quantity.toFixed(4)}
              </td>
              <td>
                <span className={`status ${order.status}`}>
                  {order.status}
                </span>
              </td>
              <td>
                <button
                  className="cancel-btn"
                  onClick={() => handleCancel(order.orderId)}
                  disabled={isCancelling}
                >
                  Cancel
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### 7. CSS Styles

```css
/* styles/clob.css */

/* Market Selector */
.market-selector {
  display: flex;
  gap: 8px;
  padding: 12px;
  background: #1a1a2e;
  border-radius: 8px;
  overflow-x: auto;
}

.market-button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 12px 16px;
  background: #16213e;
  border: 1px solid #333;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.market-button:hover {
  background: #1f3460;
}

.market-button.selected {
  border-color: #4a9eff;
  background: #1f3460;
}

.market-name {
  font-weight: 600;
  color: #fff;
}

.market-price {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  margin: 4px 0;
}

/* Order Book */
.orderbook {
  background: #1a1a2e;
  border-radius: 8px;
  padding: 16px;
  font-family: 'JetBrains Mono', monospace;
}

.orderbook-header {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  padding: 8px 0;
  border-bottom: 1px solid #333;
  color: #888;
  font-size: 12px;
}

.orderbook-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  padding: 4px 0;
  position: relative;
  cursor: pointer;
}

.orderbook-row:hover {
  background: rgba(255, 255, 255, 0.05);
}

.orderbook-row .depth-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  opacity: 0.15;
}

.orderbook-row.bid .depth-bar {
  background: #00c853;
}

.orderbook-row.ask .depth-bar {
  background: #ff5252;
}

.orderbook-row.bid .price {
  color: #00c853;
}

.orderbook-row.ask .price {
  color: #ff5252;
}

.spread-row {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-top: 1px solid #333;
  border-bottom: 1px solid #333;
  margin: 8px 0;
  color: #888;
  font-size: 12px;
}

/* Order Form */
.order-form {
  background: #1a1a2e;
  border-radius: 8px;
  padding: 20px;
}

.side-selector {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 16px;
}

.side-btn {
  padding: 12px;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.side-btn.buy {
  background: rgba(0, 200, 83, 0.2);
  color: #00c853;
}

.side-btn.buy.active {
  background: #00c853;
  color: #fff;
}

.side-btn.sell {
  background: rgba(255, 82, 82, 0.2);
  color: #ff5252;
}

.side-btn.sell.active {
  background: #ff5252;
  color: #fff;
}

.type-selector {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.type-selector button {
  flex: 1;
  padding: 8px;
  background: #16213e;
  border: 1px solid #333;
  border-radius: 4px;
  color: #888;
  cursor: pointer;
}

.type-selector button.active {
  border-color: #4a9eff;
  color: #fff;
}

.input-group {
  margin-bottom: 16px;
}

.input-group label {
  display: block;
  margin-bottom: 8px;
  color: #888;
  font-size: 14px;
}

.input-group input {
  width: 100%;
  padding: 12px;
  background: #16213e;
  border: 1px solid #333;
  border-radius: 6px;
  color: #fff;
  font-size: 16px;
}

.input-group input:focus {
  outline: none;
  border-color: #4a9eff;
}

.price-input {
  display: flex;
  gap: 8px;
}

.price-input input {
  flex: 1;
}

.quick-buttons {
  display: flex;
  gap: 4px;
}

.quick-buttons button {
  padding: 8px 12px;
  background: #16213e;
  border: 1px solid #333;
  border-radius: 4px;
  color: #888;
  cursor: pointer;
}

.order-summary {
  background: #16213e;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  color: #888;
  font-size: 14px;
}

.summary-row span:last-child {
  color: #fff;
}

.submit-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.submit-btn.buy {
  background: #00c853;
  color: #fff;
}

.submit-btn.sell {
  background: #ff5252;
  color: #fff;
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Open Orders */
.open-orders {
  background: #1a1a2e;
  border-radius: 8px;
  padding: 16px;
}

.orders-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.orders-header h3 {
  margin: 0;
  color: #fff;
}

.cancel-all-btn {
  padding: 8px 16px;
  background: transparent;
  border: 1px solid #ff5252;
  border-radius: 4px;
  color: #ff5252;
  cursor: pointer;
}

.orders-table {
  width: 100%;
  border-collapse: collapse;
}

.orders-table th {
  text-align: left;
  padding: 8px;
  color: #888;
  font-size: 12px;
  border-bottom: 1px solid #333;
}

.orders-table td {
  padding: 12px 8px;
  color: #fff;
  font-size: 14px;
  border-bottom: 1px solid #222;
}

.orders-table .buy {
  color: #00c853;
}

.orders-table .sell {
  color: #ff5252;
}

.status {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.status.open {
  background: rgba(74, 158, 255, 0.2);
  color: #4a9eff;
}

.status.partial {
  background: rgba(255, 193, 7, 0.2);
  color: #ffc107;
}

.cancel-btn {
  padding: 6px 12px;
  background: transparent;
  border: 1px solid #666;
  border-radius: 4px;
  color: #888;
  cursor: pointer;
}

.cancel-btn:hover {
  border-color: #ff5252;
  color: #ff5252;
}
```

## Vanilla JavaScript Integration

### Fetch Markets

```javascript
async function getMarkets() {
  const res = await fetch('http://localhost:3000/clob/markets');
  const data = await res.json();
  return data.markets;
}
```

### Place Order

```javascript
async function placeOrder(params) {
  const token = localStorage.getItem('auth_token');
  
  const res = await fetch('http://localhost:3000/clob/orders', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  
  return res.json();
}

// Example: Buy limit order
const result = await placeOrder({
  marketSymbol: 'SP500-PERP',
  side: 'buy',
  type: 'limit',
  price: 589.50,
  quantity: 1.0,
});
```

### Cancel Order

```javascript
async function cancelOrder(orderId) {
  const token = localStorage.getItem('auth_token');
  
  const res = await fetch(`http://localhost:3000/clob/orders/${orderId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  
  return res.json();
}
```

## Real-Time Updates with WebSocket

Combine REST API with WebSocket for real-time updates:

```typescript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:3000', {
  auth: { token: localStorage.getItem('auth_token') },
});

// Subscribe to order book updates
socket.emit('subscribe:orderbook', 'SP500-PERP');

socket.on('orderbook:update', (update) => {
  console.log('Order book update:', update);
  // Update your local order book state
});

// Listen for your order updates
socket.on('order:filled', (order) => {
  console.log('Order filled:', order);
  // Show notification, refresh orders
});

socket.on('balance:updated', (balance) => {
  console.log('Balance updated:', balance);
  // Refresh balance display
});
```

## Best Practices

### 1. Optimistic Updates

Update UI immediately, then confirm with server:

```typescript
const handlePlaceOrder = async (params) => {
  // Optimistically add to pending orders
  setOrders((prev) => [...prev, { ...params, status: 'pending' }]);
  
  const result = await placeOrder(params);
  
  if (!result.success) {
    // Revert on failure
    setOrders((prev) => prev.filter((o) => o.status !== 'pending'));
    showError(result.error);
  }
};
```

### 2. Debounce Order Book Updates

Prevent UI thrashing with rapid updates:

```typescript
const debouncedUpdate = useMemo(
  () => debounce((data) => setOrderBook(data), 100),
  []
);

socket.on('orderbook:update', debouncedUpdate);
```

### 3. Validate Before Submit

Check margin requirements client-side:

```typescript
const canPlaceOrder = useMemo(() => {
  const margin = orderValue * initialMarginRate;
  return balance.free >= margin && quantity >= minOrderSize;
}, [orderValue, balance, quantity]);
```

### 4. Handle Network Errors

Retry failed requests with exponential backoff:

```typescript
async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(Math.pow(2, i) * 1000);
    }
  }
}
```

## Testing

Run the CLOB test:

```bash
npm run test:clob
```

This tests markets, order book, order placement, and cancellation.
