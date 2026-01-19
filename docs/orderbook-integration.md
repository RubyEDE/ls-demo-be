# Orderbook Integration Guide

This guide explains how to integrate the orderbook into your frontend application.

## Overview

The orderbook provides real-time bid/ask liquidity data for perpetual markets. It's populated automatically by the market maker service with synthetic liquidity and updated when users place/cancel orders.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Server Startup                          │
├─────────────────────────────────────────────────────────────────┤
│  1. initializeMarkets()      → Create market records            │
│  2. startRequiredPriceUpdates() → Fetch oracle prices           │
│  3. initializeCandles()      → Load candle history              │
│  4. initializeOrderBooks()   → Load real user orders into memory│
└─────────────────────────────────────────────────────────────────┘
```

The orderbook is populated with **real user orders only** at startup. Synthetic/fake liquidity is not enabled by default.

## HTTP API

### Get Orderbook

```
GET /clob/orderbook/:symbol?depth=20
```

**Parameters:**
- `symbol` (path) - Market symbol (e.g., `AAPL-PERP`, `TSLA-PERP`, `SP500-PERP`)
- `depth` (query, optional) - Number of price levels per side (default: 20)

**Response:**

```typescript
interface OrderBookResponse {
  symbol: string;
  bids: OrderBookEntry[];  // Sorted descending by price (best bid first)
  asks: OrderBookEntry[];  // Sorted ascending by price (best ask first)
  oraclePrice: number;     // Current oracle price
  timestamp: number;       // Last update timestamp
}

interface OrderBookEntry {
  price: number;     // Price level
  quantity: number;  // Total quantity at this level
  total: number;     // price * quantity (notional value)
}
```

**Example:**

```bash
curl http://localhost:3000/clob/orderbook/AAPL-PERP?depth=5
```

```json
{
  "symbol": "AAPL-PERP",
  "bids": [
    { "price": 254.50, "quantity": 0.5, "total": 127.25 },
    { "price": 254.25, "quantity": 0.8, "total": 203.40 },
    { "price": 254.00, "quantity": 1.2, "total": 304.80 }
  ],
  "asks": [
    { "price": 255.00, "quantity": 0.4, "total": 102.00 },
    { "price": 255.25, "quantity": 0.7, "total": 178.68 },
    { "price": 255.50, "quantity": 1.0, "total": 255.50 }
  ],
  "oraclePrice": 254.75,
  "timestamp": 1705500000000
}
```

## WebSocket Integration

### Subscribe to Orderbook

```typescript
// Connect to WebSocket
const socket = io('ws://localhost:3000', {
  transports: ['websocket'],
});

// Subscribe to orderbook for a symbol
socket.emit('subscribe:orderbook', 'AAPL-PERP');

// Confirmation
socket.on('subscribed', (data) => {
  console.log(`Subscribed to ${data.channel}:${data.symbol}`);
  // { channel: 'orderbook', symbol: 'AAPL-PERP' }
});
```

### Handle Orderbook Events

#### Full Snapshot

Received immediately after subscribing and periodically when the market maker refreshes:

```typescript
socket.on('orderbook:snapshot', (data: OrderBookSnapshot) => {
  console.log('Full orderbook:', data);
  // Replace entire local orderbook state
  setOrderBook(data);
});

interface OrderBookSnapshot {
  symbol: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  timestamp: number;
}
```

#### Incremental Updates

Received when individual price levels change (order placed, filled, or cancelled):

```typescript
socket.on('orderbook:update', (update: OrderBookUpdate) => {
  console.log('Orderbook update:', update);
  // Update specific price level
  updateOrderBookLevel(update);
});

interface OrderBookUpdate {
  symbol: string;
  side: 'bid' | 'ask';
  price: number;
  quantity: number;  // 0 means remove this level
  timestamp: number;
}
```

### Unsubscribe

```typescript
socket.emit('unsubscribe:orderbook', 'AAPL-PERP');

socket.on('unsubscribed', (data) => {
  console.log(`Unsubscribed from ${data.channel}:${data.symbol}`);
});
```

## React Hook Implementation

```typescript
// hooks/useOrderBook.ts
import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface OrderBookEntry {
  price: number;
  quantity: number;
  total: number;
}

interface OrderBook {
  symbol: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  oraclePrice?: number;
  timestamp: number;
}

interface OrderBookUpdate {
  symbol: string;
  side: 'bid' | 'ask';
  price: number;
  quantity: number;
  timestamp: number;
}

export function useOrderBook(symbol: string) {
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const newSocket = io('ws://localhost:3000', {
      transports: ['websocket'],
    });

    newSocket.on('connect', () => setIsConnected(true));
    newSocket.on('disconnect', () => setIsConnected(false));

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!socket || !isConnected || !symbol) return;

    // Subscribe to orderbook
    socket.emit('subscribe:orderbook', symbol);

    // Handle full snapshot
    const handleSnapshot = (data: OrderBook) => {
      if (data.symbol === symbol.toUpperCase()) {
        setOrderBook(data);
      }
    };

    // Handle incremental updates
    const handleUpdate = (update: OrderBookUpdate) => {
      if (update.symbol !== symbol.toUpperCase()) return;

      setOrderBook((prev) => {
        if (!prev) return prev;

        const side = update.side === 'bid' ? 'bids' : 'asks';
        const entries = [...prev[side]];

        // Find existing level
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
          // Re-sort: bids descending, asks ascending
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
    };

    socket.on('orderbook:snapshot', handleSnapshot);
    socket.on('orderbook:update', handleUpdate);

    return () => {
      socket.emit('unsubscribe:orderbook', symbol);
      socket.off('orderbook:snapshot', handleSnapshot);
      socket.off('orderbook:update', handleUpdate);
    };
  }, [socket, isConnected, symbol]);

  // Also fetch initial state via HTTP (optional, for faster initial load)
  useEffect(() => {
    if (!symbol) return;

    fetch(`http://localhost:3000/clob/orderbook/${symbol}`)
      .then((res) => res.json())
      .then((data) => {
        if (!orderBook) {
          setOrderBook(data);
        }
      })
      .catch(console.error);
  }, [symbol]);

  return {
    orderBook,
    isConnected,
    bestBid: orderBook?.bids[0] ?? null,
    bestAsk: orderBook?.asks[0] ?? null,
    spread: orderBook?.bids[0] && orderBook?.asks[0]
      ? orderBook.asks[0].price - orderBook.bids[0].price
      : null,
    midPrice: orderBook?.bids[0] && orderBook?.asks[0]
      ? (orderBook.asks[0].price + orderBook.bids[0].price) / 2
      : null,
  };
}
```

## React Component Example

```tsx
// components/OrderBook.tsx
import { useOrderBook } from '../hooks/useOrderBook';

interface OrderBookProps {
  symbol: string;
  depth?: number;
}

export function OrderBook({ symbol, depth = 10 }: OrderBookProps) {
  const { orderBook, isConnected, spread, midPrice } = useOrderBook(symbol);

  if (!isConnected) {
    return <div className="orderbook-loading">Connecting...</div>;
  }

  if (!orderBook) {
    return <div className="orderbook-loading">Loading orderbook...</div>;
  }

  const asks = orderBook.asks.slice(0, depth).reverse(); // Show lowest ask at bottom
  const bids = orderBook.bids.slice(0, depth);

  return (
    <div className="orderbook">
      <div className="orderbook-header">
        <span>Price</span>
        <span>Size</span>
        <span>Total</span>
      </div>

      {/* Asks (sell orders) - shown in reverse so lowest is near spread */}
      <div className="orderbook-asks">
        {asks.map((ask, i) => (
          <div key={`ask-${ask.price}`} className="orderbook-row ask">
            <span className="price">${ask.price.toFixed(2)}</span>
            <span className="size">{ask.quantity.toFixed(4)}</span>
            <span className="total">${ask.total.toFixed(2)}</span>
          </div>
        ))}
      </div>

      {/* Spread indicator */}
      <div className="orderbook-spread">
        <span>Spread: ${spread?.toFixed(2) ?? '--'}</span>
        <span>Mid: ${midPrice?.toFixed(2) ?? '--'}</span>
      </div>

      {/* Bids (buy orders) */}
      <div className="orderbook-bids">
        {bids.map((bid, i) => (
          <div key={`bid-${bid.price}`} className="orderbook-row bid">
            <span className="price">${bid.price.toFixed(2)}</span>
            <span className="size">{bid.quantity.toFixed(4)}</span>
            <span className="total">${bid.total.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Styling

```css
.orderbook {
  font-family: 'SF Mono', 'Monaco', monospace;
  background: #0d1117;
  border-radius: 8px;
  padding: 16px;
  width: 300px;
}

.orderbook-header {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  padding: 8px 0;
  border-bottom: 1px solid #30363d;
  color: #8b949e;
  font-size: 12px;
  text-transform: uppercase;
}

.orderbook-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  padding: 4px 0;
  font-size: 13px;
}

.orderbook-row.ask .price {
  color: #f85149;
}

.orderbook-row.bid .price {
  color: #3fb950;
}

.orderbook-spread {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  margin: 8px 0;
  border-top: 1px solid #30363d;
  border-bottom: 1px solid #30363d;
  color: #8b949e;
  font-size: 12px;
}

.orderbook-loading {
  padding: 40px;
  text-align: center;
  color: #8b949e;
}
```

## Important Notes

### Orderbook Initialization

The orderbook is automatically populated when the server starts:

1. **Markets are initialized** with oracle price feeds
2. **Price data is fetched** from Finnhub for each market
3. **Orderbooks are loaded** from the database with real user orders
4. **Updates are broadcast** via WebSocket when orders are placed/cancelled

If the orderbook appears empty, it means no users have placed limit orders yet. This is expected behavior - the orderbook only shows real liquidity.

Check server logs for:
```
📚 Initializing orderbooks for active markets...
   📖 AAPL-PERP: X real orders loaded
✅ Orderbooks initialized (real orders only)
```

### Best Practices

1. **Use WebSocket for real-time updates** - HTTP polling is inefficient
2. **Fetch initial state via HTTP** - Faster than waiting for WS snapshot
3. **Handle reconnection** - Re-subscribe after disconnect
4. **Throttle UI updates** - For high-frequency updates, batch renders

```typescript
// Throttle updates for performance
import { throttle } from 'lodash';

const throttledUpdate = throttle((update) => {
  setOrderBook(update);
}, 100);
```

## Testing

Run the orderbook test to verify everything works:

```bash
npm run test:orderbook
```

This tests:
- WebSocket subscription
- Order placement → orderbook update
- Order cancellation → orderbook update
- Both bid and ask sides

## Troubleshooting

### Empty Orderbook

An empty orderbook is **normal** if no users have placed limit orders. The system shows only real liquidity.

To test, place a limit order:
```bash
curl -X POST http://localhost:3000/clob/orders \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"marketSymbol":"AAPL-PERP","side":"buy","type":"limit","price":200,"quantity":0.1}'
```

### Stale Data

1. Ensure WebSocket is connected
2. Check for `orderbook:update` events in devtools
3. Verify subscription: look for `subscribed` event

### Missing Updates

1. Make sure you're subscribed to the correct symbol (case-insensitive)
2. Check that the update handler is registered before subscribing
3. Verify the symbol matches in the update handler filter
