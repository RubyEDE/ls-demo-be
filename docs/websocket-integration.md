# WebSocket Integration Guide

This guide shows how to integrate real-time WebSocket data feeds into your frontend application.

## Overview

The WebSocket server provides real-time streaming data for:

- **Price Updates** - Live stock prices from Finnhub
- **Order Book** - Bid/ask levels for CLOB trading
- **Trade Feed** - Executed trades stream
- **User Events** - Personal order and balance updates (requires authentication)

## Connection

### Server URL

**Production:**
```
WebSocket: wss://api.longsword.io
```

**Development:**
```
WebSocket: ws://localhost:3000
```

### Authentication

Authentication is **optional** for public data (prices, order book, trades).

Authentication is **required** for user-specific events (orders, balance updates).

## React Integration

### 1. Create WebSocket Hook

```typescript
// hooks/useWebSocket.ts
import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';

// Production: 'wss://api.longsword.io'
const WS_URL = 'ws://localhost:3000';

interface PriceUpdate {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume?: number;
  timestamp: number;
}

interface OrderBookEntry {
  price: number;
  quantity: number;
  total: number;
}

interface OrderBookSnapshot {
  symbol: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  timestamp: number;
}

interface OrderBookUpdate {
  symbol: string;
  side: 'bid' | 'ask';
  price: number;
  quantity: number;
  timestamp: number;
}

interface TradeExecuted {
  id: string;
  symbol: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  timestamp: number;
}

interface UseWebSocketOptions {
  autoConnect?: boolean;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { autoConnect = true } = options;
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback((token?: string) => {
    if (socketRef.current?.connected) return;

    const socket = io(WS_URL, {
      auth: token ? { token } : undefined,
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);
      console.log('WebSocket connected');
    });

    socket.on('disconnect', (reason) => {
      setIsConnected(false);
      console.log('WebSocket disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      setError(err.message);
      console.error('WebSocket connection error:', err);
    });

    socketRef.current = socket;
  }, []);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    if (autoConnect) {
      const token = localStorage.getItem('auth_token');
      connect(token || undefined);
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    socket: socketRef.current,
    isConnected,
    error,
    connect,
    disconnect,
  };
}
```

### 2. Create Price Feed Hook

```typescript
// hooks/usePriceFeed.ts
import { useEffect, useState, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';

interface PriceUpdate {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume?: number;
  timestamp: number;
}

export function usePriceFeed(symbols: string[]) {
  const { socket, isConnected } = useWebSocket();
  const [prices, setPrices] = useState<Map<string, PriceUpdate>>(new Map());

  const handlePriceUpdate = useCallback((data: PriceUpdate) => {
    setPrices((prev) => {
      const next = new Map(prev);
      next.set(data.symbol, data);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!socket || !isConnected) return;

    // Subscribe to all symbols
    symbols.forEach((symbol) => {
      socket.emit('subscribe:price', symbol);
    });

    // Listen for updates
    socket.on('price:update', handlePriceUpdate);

    // Cleanup
    return () => {
      symbols.forEach((symbol) => {
        socket.emit('unsubscribe:price', symbol);
      });
      socket.off('price:update', handlePriceUpdate);
    };
  }, [socket, isConnected, symbols, handlePriceUpdate]);

  const getPrice = useCallback(
    (symbol: string) => prices.get(symbol.toUpperCase()),
    [prices]
  );

  return {
    prices,
    getPrice,
    isConnected,
  };
}
```

### 3. Create Order Book Hook

```typescript
// hooks/useOrderBook.ts
import { useEffect, useState, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';

interface OrderBookEntry {
  price: number;
  quantity: number;
  total: number;
}

interface OrderBook {
  symbol: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  timestamp: number;
}

export function useOrderBook(symbol: string) {
  const { socket, isConnected } = useWebSocket();
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);

  useEffect(() => {
    if (!socket || !isConnected || !symbol) return;

    // Subscribe to order book
    socket.emit('subscribe:orderbook', symbol);

    // Handle full snapshot
    socket.on('orderbook:snapshot', (data: OrderBook) => {
      if (data.symbol === symbol.toUpperCase()) {
        setOrderBook(data);
      }
    });

    // Handle incremental updates
    socket.on('orderbook:update', (update) => {
      if (update.symbol !== symbol.toUpperCase()) return;

      setOrderBook((prev) => {
        if (!prev) return prev;

        const side = update.side === 'bid' ? 'bids' : 'asks';
        const entries = [...prev[side]];

        // Find and update or insert the price level
        const index = entries.findIndex((e) => e.price === update.price);

        if (update.quantity === 0) {
          // Remove level
          if (index !== -1) {
            entries.splice(index, 1);
          }
        } else if (index !== -1) {
          // Update existing level
          entries[index] = {
            price: update.price,
            quantity: update.quantity,
            total: update.price * update.quantity,
          };
        } else {
          // Insert new level
          entries.push({
            price: update.price,
            quantity: update.quantity,
            total: update.price * update.quantity,
          });
          // Sort bids descending, asks ascending
          entries.sort((a, b) =>
            side === 'bids' ? b.price - a.price : a.price - b.price
          );
        }

        return {
          ...prev,
          [side]: entries,
          timestamp: update.timestamp,
        };
      });
    });

    return () => {
      socket.emit('unsubscribe:orderbook', symbol);
      socket.off('orderbook:snapshot');
      socket.off('orderbook:update');
    };
  }, [socket, isConnected, symbol]);

  return {
    orderBook,
    isConnected,
  };
}
```

### 4. Create Trade Feed Hook

```typescript
// hooks/useTradeFeed.ts
import { useEffect, useState, useCallback, useRef } from 'react';
import { useWebSocket } from './useWebSocket';

interface Trade {
  id: string;
  symbol: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  timestamp: number;
}

interface UseTradeFeedOptions {
  maxTrades?: number;
}

export function useTradeFeed(
  symbol: string,
  options: UseTradeFeedOptions = {}
) {
  const { maxTrades = 100 } = options;
  const { socket, isConnected } = useWebSocket();
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    if (!socket || !isConnected || !symbol) return;

    socket.emit('subscribe:trades', symbol);

    socket.on('trade:executed', (trade: Trade) => {
      if (trade.symbol !== symbol.toUpperCase()) return;

      setTrades((prev) => {
        const next = [trade, ...prev];
        return next.slice(0, maxTrades);
      });
    });

    return () => {
      socket.emit('unsubscribe:trades', symbol);
      socket.off('trade:executed');
    };
  }, [socket, isConnected, symbol, maxTrades]);

  const clearTrades = useCallback(() => {
    setTrades([]);
  }, []);

  return {
    trades,
    clearTrades,
    isConnected,
  };
}
```

### 5. Create User Events Hook (Authenticated)

```typescript
// hooks/useUserEvents.ts
import { useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';

interface OrderEvent {
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  price?: number;
  quantity: number;
  filledQuantity: number;
  status: 'pending' | 'partial' | 'filled' | 'cancelled';
  timestamp: number;
}

interface BalanceUpdate {
  free: number;
  locked: number;
  total: number;
  timestamp: number;
}

interface UseUserEventsCallbacks {
  onOrderCreated?: (order: OrderEvent) => void;
  onOrderFilled?: (order: OrderEvent) => void;
  onOrderCancelled?: (order: OrderEvent) => void;
  onBalanceUpdated?: (balance: BalanceUpdate) => void;
}

export function useUserEvents(callbacks: UseUserEventsCallbacks) {
  const { socket, isConnected } = useWebSocket();

  useEffect(() => {
    if (!socket || !isConnected) return;

    if (callbacks.onOrderCreated) {
      socket.on('order:created', callbacks.onOrderCreated);
    }
    if (callbacks.onOrderFilled) {
      socket.on('order:filled', callbacks.onOrderFilled);
    }
    if (callbacks.onOrderCancelled) {
      socket.on('order:cancelled', callbacks.onOrderCancelled);
    }
    if (callbacks.onBalanceUpdated) {
      socket.on('balance:updated', callbacks.onBalanceUpdated);
    }

    return () => {
      socket.off('order:created');
      socket.off('order:filled');
      socket.off('order:cancelled');
      socket.off('balance:updated');
    };
  }, [socket, isConnected, callbacks]);

  return { isConnected };
}
```

### 6. React Components

#### Price Ticker Component

```tsx
// components/PriceTicker.tsx
import { usePriceFeed } from '../hooks/usePriceFeed';

interface PriceTickerProps {
  symbols: string[];
}

export function PriceTicker({ symbols }: PriceTickerProps) {
  const { prices, isConnected } = usePriceFeed(symbols);

  if (!isConnected) {
    return <div className="price-ticker disconnected">Connecting...</div>;
  }

  return (
    <div className="price-ticker">
      {symbols.map((symbol) => {
        const price = prices.get(symbol);
        if (!price) {
          return (
            <div key={symbol} className="ticker-item loading">
              <span className="symbol">{symbol}</span>
              <span className="price">--</span>
            </div>
          );
        }

        const isPositive = price.change >= 0;

        return (
          <div key={symbol} className="ticker-item">
            <span className="symbol">{price.symbol}</span>
            <span className="price">${price.price.toFixed(2)}</span>
            <span className={`change ${isPositive ? 'positive' : 'negative'}`}>
              {isPositive ? '+' : ''}
              {price.change.toFixed(2)} ({price.changePercent.toFixed(2)}%)
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

#### Order Book Component

```tsx
// components/OrderBook.tsx
import { useOrderBook } from '../hooks/useOrderBook';

interface OrderBookProps {
  symbol: string;
  depth?: number;
}

export function OrderBook({ symbol, depth = 10 }: OrderBookProps) {
  const { orderBook, isConnected } = useOrderBook(symbol);

  if (!isConnected) {
    return <div className="order-book disconnected">Connecting...</div>;
  }

  if (!orderBook) {
    return <div className="order-book loading">Loading order book...</div>;
  }

  const asks = orderBook.asks.slice(0, depth).reverse();
  const bids = orderBook.bids.slice(0, depth);

  return (
    <div className="order-book">
      <div className="order-book-header">
        <span>Price</span>
        <span>Quantity</span>
        <span>Total</span>
      </div>

      <div className="asks">
        {asks.map((ask, i) => (
          <div key={i} className="order-row ask">
            <span className="price">${ask.price.toFixed(2)}</span>
            <span className="quantity">{ask.quantity.toFixed(4)}</span>
            <span className="total">${ask.total.toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="spread">
        Spread: $
        {orderBook.asks[0] && orderBook.bids[0]
          ? (orderBook.asks[0].price - orderBook.bids[0].price).toFixed(2)
          : '--'}
      </div>

      <div className="bids">
        {bids.map((bid, i) => (
          <div key={i} className="order-row bid">
            <span className="price">${bid.price.toFixed(2)}</span>
            <span className="quantity">{bid.quantity.toFixed(4)}</span>
            <span className="total">${bid.total.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

#### Trade Feed Component

```tsx
// components/TradeFeed.tsx
import { useTradeFeed } from '../hooks/useTradeFeed';

interface TradeFeedProps {
  symbol: string;
}

export function TradeFeed({ symbol }: TradeFeedProps) {
  const { trades, isConnected } = useTradeFeed(symbol, { maxTrades: 50 });

  if (!isConnected) {
    return <div className="trade-feed disconnected">Connecting...</div>;
  }

  return (
    <div className="trade-feed">
      <div className="trade-feed-header">
        <span>Price</span>
        <span>Quantity</span>
        <span>Time</span>
      </div>

      <div className="trades">
        {trades.length === 0 ? (
          <div className="no-trades">Waiting for trades...</div>
        ) : (
          trades.map((trade) => (
            <div
              key={trade.id}
              className={`trade-row ${trade.side}`}
            >
              <span className="price">${trade.price.toFixed(2)}</span>
              <span className="quantity">{trade.quantity.toFixed(4)}</span>
              <span className="time">
                {new Date(trade.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

### 7. CSS Styles

```css
/* styles/websocket.css */

/* Connection Status */
.disconnected {
  opacity: 0.5;
  background: #fee;
}

.loading {
  opacity: 0.7;
}

/* Price Ticker */
.price-ticker {
  display: flex;
  gap: 24px;
  padding: 12px;
  background: #1a1a2e;
  border-radius: 8px;
}

.ticker-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ticker-item .symbol {
  font-weight: 600;
  color: #fff;
}

.ticker-item .price {
  font-family: monospace;
  font-size: 18px;
  color: #fff;
}

.ticker-item .change {
  font-family: monospace;
  font-size: 14px;
}

.ticker-item .change.positive {
  color: #00c853;
}

.ticker-item .change.negative {
  color: #ff5252;
}

/* Order Book */
.order-book {
  background: #1a1a2e;
  border-radius: 8px;
  padding: 16px;
  font-family: monospace;
}

.order-book-header {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  padding: 8px 0;
  border-bottom: 1px solid #333;
  color: #888;
  font-size: 12px;
}

.order-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  padding: 4px 0;
}

.order-row.ask .price {
  color: #ff5252;
}

.order-row.bid .price {
  color: #00c853;
}

.spread {
  padding: 8px 0;
  text-align: center;
  color: #888;
  border-top: 1px solid #333;
  border-bottom: 1px solid #333;
}

/* Trade Feed */
.trade-feed {
  background: #1a1a2e;
  border-radius: 8px;
  padding: 16px;
  font-family: monospace;
  max-height: 400px;
  overflow-y: auto;
}

.trade-feed-header {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  padding: 8px 0;
  border-bottom: 1px solid #333;
  color: #888;
  font-size: 12px;
}

.trade-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  padding: 4px 0;
}

.trade-row.buy .price {
  color: #00c853;
}

.trade-row.sell .price {
  color: #ff5252;
}

.no-trades {
  text-align: center;
  color: #888;
  padding: 20px;
}
```

## Vanilla JavaScript Integration

### Basic Connection

```javascript
// No authentication (public data only)
const socket = io('ws://localhost:3000', {
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('Connected to WebSocket');
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});
```

### Authenticated Connection

```javascript
const token = localStorage.getItem('auth_token');

const socket = io('ws://localhost:3000', {
  auth: { token },
  transports: ['websocket'],
});
```

### Subscribe to Price Updates

```javascript
// Subscribe
socket.emit('subscribe:price', 'AAPL');

// Confirmation
socket.on('subscribed', (data) => {
  console.log(`Subscribed to ${data.channel}:${data.symbol}`);
});

// Receive updates
socket.on('price:update', (data) => {
  console.log(`${data.symbol}: $${data.price} (${data.changePercent}%)`);
});

// Unsubscribe
socket.emit('unsubscribe:price', 'AAPL');
```

### Subscribe to Order Book

```javascript
socket.emit('subscribe:orderbook', 'AAPL');

// Full snapshot
socket.on('orderbook:snapshot', (data) => {
  console.log('Order book snapshot:', data);
  console.log('Best bid:', data.bids[0]);
  console.log('Best ask:', data.asks[0]);
});

// Incremental updates
socket.on('orderbook:update', (update) => {
  console.log(`${update.side} update: ${update.price} x ${update.quantity}`);
});
```

### Subscribe to Trade Feed

```javascript
socket.emit('subscribe:trades', 'AAPL');

socket.on('trade:executed', (trade) => {
  console.log(`Trade: ${trade.side} ${trade.quantity} @ $${trade.price}`);
});
```

### User Events (Authenticated)

```javascript
// These events are automatically sent to authenticated users

socket.on('order:created', (order) => {
  console.log('Order created:', order.orderId);
});

socket.on('order:filled', (order) => {
  console.log('Order filled:', order.orderId);
});

socket.on('order:cancelled', (order) => {
  console.log('Order cancelled:', order.orderId);
});

socket.on('balance:updated', (balance) => {
  console.log('Balance updated:', balance.free, 'free,', balance.locked, 'locked');
});
```

## Event Reference

### Client to Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `subscribe:price` | `symbol: string` | Subscribe to price updates for a symbol |
| `unsubscribe:price` | `symbol: string` | Unsubscribe from price updates |
| `subscribe:orderbook` | `symbol: string` | Subscribe to order book for a symbol |
| `unsubscribe:orderbook` | `symbol: string` | Unsubscribe from order book |
| `subscribe:trades` | `symbol: string` | Subscribe to trade feed for a symbol |
| `unsubscribe:trades` | `symbol: string` | Unsubscribe from trade feed |

### Server to Client Events

#### Public Events (No Auth Required)

| Event | Payload | Description |
|-------|---------|-------------|
| `subscribed` | `{ channel, symbol }` | Confirmation of subscription |
| `unsubscribed` | `{ channel, symbol }` | Confirmation of unsubscription |
| `price:update` | `PriceUpdate` | Real-time price update |
| `price:batch` | `PriceUpdate[]` | Batch of price updates |
| `orderbook:snapshot` | `OrderBookSnapshot` | Full order book state |
| `orderbook:update` | `OrderBookUpdate` | Incremental order book change |
| `trade:executed` | `TradeExecuted` | New trade executed |
| `trade:batch` | `TradeExecuted[]` | Batch of trades |
| `error` | `{ code, message }` | Error message |

#### Private Events (Auth Required)

| Event | Payload | Description |
|-------|---------|-------------|
| `order:created` | `OrderEvent` | User's order was created |
| `order:filled` | `OrderEvent` | User's order was filled |
| `order:cancelled` | `OrderEvent` | User's order was cancelled |
| `balance:updated` | `BalanceUpdate` | User's balance changed |

## Data Types

### PriceUpdate

```typescript
interface PriceUpdate {
  symbol: string;      // e.g., "AAPL"
  price: number;       // Current price
  change: number;      // Price change
  changePercent: number; // Percentage change
  high: number;        // Day high
  low: number;         // Day low
  volume?: number;     // Trading volume
  timestamp: number;   // Unix timestamp (ms)
}
```

### OrderBookSnapshot

```typescript
interface OrderBookSnapshot {
  symbol: string;
  bids: OrderBookEntry[];  // Sorted descending by price
  asks: OrderBookEntry[];  // Sorted ascending by price
  timestamp: number;
}

interface OrderBookEntry {
  price: number;
  quantity: number;
  total: number;  // price * quantity
}
```

### OrderBookUpdate

```typescript
interface OrderBookUpdate {
  symbol: string;
  side: 'bid' | 'ask';
  price: number;
  quantity: number;  // 0 means remove level
  timestamp: number;
}
```

### TradeExecuted

```typescript
interface TradeExecuted {
  id: string;
  symbol: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  timestamp: number;
}
```

### OrderEvent

```typescript
interface OrderEvent {
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  price?: number;         // Only for limit orders
  quantity: number;
  filledQuantity: number;
  status: 'pending' | 'partial' | 'filled' | 'cancelled';
  timestamp: number;
}
```

### BalanceUpdate

```typescript
interface BalanceUpdate {
  free: number;
  locked: number;
  total: number;
  timestamp: number;
}
```

## Best Practices

### 1. Connection Management

```typescript
// Reconnect on visibility change
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !socket.connected) {
    socket.connect();
  }
});
```

### 2. Subscription Cleanup

Always unsubscribe when components unmount to prevent memory leaks and unnecessary server load.

```typescript
useEffect(() => {
  socket.emit('subscribe:price', symbol);
  
  return () => {
    socket.emit('unsubscribe:price', symbol);
  };
}, [symbol]);
```

### 3. Throttle UI Updates

For high-frequency updates, consider throttling UI renders:

```typescript
import { throttle } from 'lodash';

const throttledSetPrice = useCallback(
  throttle((price) => setPrice(price), 100),
  []
);

socket.on('price:update', throttledSetPrice);
```

### 4. Handle Reconnection

Re-subscribe to channels after reconnection:

```typescript
socket.on('connect', () => {
  // Re-subscribe to previously subscribed channels
  subscribedSymbols.forEach((symbol) => {
    socket.emit('subscribe:price', symbol);
  });
});
```

### 5. Error Handling

```typescript
socket.on('error', (error) => {
  console.error('WebSocket error:', error.code, error.message);
  
  // Handle specific errors
  if (error.code === 'RATE_LIMITED') {
    // Back off and retry
  }
});
```

## Testing

Run the WebSocket test:

```bash
npm run test:websocket
```

This tests:
- Unauthenticated connections
- Price subscriptions
- Authenticated connections
- Multiple channel subscriptions
- Health endpoint WebSocket stats
