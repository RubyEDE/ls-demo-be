# Trades API Frontend Integration Guide

This guide covers integrating the trades API and WebSocket events into your frontend application.

## Overview

The trades system provides:

- **Recent Trades** - Public feed of executed trades for any market
- **User Trade History** - Personal trade history with fees and PnL
- **Real-time Trade Feed** - WebSocket subscription for live trade updates

## API Endpoints

### Get Recent Trades (Public)

Fetch the most recent trades for a market. No authentication required.

```
GET /clob/trades/:symbol
```

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `symbol` | string | Market symbol (e.g., `AAPL-PERP`) |

**Query Parameters:**

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `limit` | number | 50 | 100 | Number of trades to return |

**Example Request:**

```
GET /clob/trades/AAPL-PERP?limit=25
```

**Response:**

```json
{
  "trades": [
    {
      "id": "TRD-550e8400-e29b-41d4-a716-446655440000",
      "price": 230.50,
      "quantity": 1.5,
      "side": "buy",
      "timestamp": "2026-01-15T10:30:00.000Z"
    },
    {
      "id": "TRD-6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "price": 230.45,
      "quantity": 0.75,
      "side": "sell",
      "timestamp": "2026-01-15T10:29:55.000Z"
    }
  ]
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique trade identifier |
| `price` | number | Execution price |
| `quantity` | number | Number of contracts traded |
| `side` | string | `"buy"` or `"sell"` (taker side) |
| `timestamp` | string | ISO 8601 timestamp |

---

### Get User Trade History (Authenticated)

Fetch the authenticated user's trade history.

```
GET /clob/trades/history
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `market` | string | - | - | Filter by market symbol (optional) |
| `limit` | number | 50 | 100 | Number of trades to return |
| `offset` | number | 0 | - | Pagination offset |

**Example Request:**

```
GET /clob/trades/history?market=AAPL-PERP&limit=20&offset=0
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response:**

```json
{
  "trades": [
    {
      "tradeId": "TRD-550e8400-e29b-41d4-a716-446655440000",
      "marketSymbol": "AAPL-PERP",
      "side": "buy",
      "price": 230.50,
      "quantity": 1.5,
      "quoteQuantity": 345.75,
      "fee": 0.35,
      "isMaker": false,
      "timestamp": "2026-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `tradeId` | string | Unique trade identifier |
| `marketSymbol` | string | Market symbol (e.g., `AAPL-PERP`) |
| `side` | string | `"buy"` or `"sell"` |
| `price` | number | Execution price |
| `quantity` | number | Number of contracts |
| `quoteQuantity` | number | Total value (`price * quantity`) |
| `fee` | number | Fee paid for this trade |
| `isMaker` | boolean | `true` if user was maker, `false` if taker |
| `timestamp` | string | ISO 8601 timestamp |

---

## WebSocket Integration

### Connecting

```typescript
import { io } from "socket.io-client";

const socket = io("ws://localhost:3000", {
  // Optional: include auth token for user-specific events
  auth: { token: authToken }
});

socket.on("connect", () => {
  console.log("Connected to WebSocket");
});

socket.on("disconnect", (reason) => {
  console.log("Disconnected:", reason);
});
```

### Subscribe to Trade Feed

Subscribe to real-time trade updates for a market.

```typescript
// Subscribe
socket.emit("subscribe:trades", "AAPL-PERP");

// Confirmation
socket.on("subscribed", (data) => {
  if (data.channel === "trades") {
    console.log(`Subscribed to trades for ${data.symbol}`);
  }
});

// Unsubscribe
socket.emit("unsubscribe:trades", "AAPL-PERP");
```

### Trade Executed Event

Received when a trade is executed in a subscribed market.

```typescript
socket.on("trade:executed", (data) => {
  console.log(`Trade: ${data.side} ${data.quantity} @ $${data.price}`);
});
```

**Event Data:**

```typescript
interface TradeExecuted {
  id: string;        // Trade ID
  symbol: string;    // Market symbol
  price: number;     // Execution price
  quantity: number;  // Contracts traded
  side: "buy" | "sell";  // Taker side
  timestamp: number; // Unix timestamp (ms)
}
```

**Example Event:**

```json
{
  "id": "TRD-550e8400-e29b-41d4-a716-446655440000",
  "symbol": "AAPL-PERP",
  "price": 230.50,
  "quantity": 1.5,
  "side": "buy",
  "timestamp": 1736937000000
}
```

---

## TypeScript Interfaces

```typescript
// REST API Types
interface Trade {
  id: string;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  timestamp: string;
}

interface UserTrade {
  tradeId: string;
  marketSymbol: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  quoteQuantity: number;
  fee: number;
  isMaker: boolean;
  timestamp: string;
}

interface TradesResponse {
  trades: Trade[];
}

interface UserTradesResponse {
  trades: UserTrade[];
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// WebSocket Types
interface TradeExecutedEvent {
  id: string;
  symbol: string;
  price: number;
  quantity: number;
  side: "buy" | "sell";
  timestamp: number;
}
```

---

## Example: Fetch Functions

### Fetch Recent Trades

```typescript
async function getRecentTrades(
  symbol: string,
  limit: number = 50
): Promise<Trade[]> {
  const response = await fetch(
    `${API_BASE}/clob/trades/${symbol}?limit=${limit}`
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch trades: ${response.statusText}`);
  }
  
  const data: TradesResponse = await response.json();
  return data.trades;
}

// Usage
const trades = await getRecentTrades("AAPL-PERP", 25);
```

### Fetch User Trade History

```typescript
async function getUserTradeHistory(
  token: string,
  options: {
    market?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<UserTradesResponse> {
  const params = new URLSearchParams();
  if (options.market) params.set("market", options.market);
  if (options.limit) params.set("limit", options.limit.toString());
  if (options.offset) params.set("offset", options.offset.toString());
  
  const response = await fetch(
    `${API_BASE}/clob/trades/history?${params}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch trade history: ${response.statusText}`);
  }
  
  return response.json();
}

// Usage
const history = await getUserTradeHistory(authToken, {
  market: "AAPL-PERP",
  limit: 50,
});
```

---

## Example: Real-time Trade Feed

```typescript
class TradeFeed {
  private socket: Socket;
  private subscribers: Map<string, Set<(trade: TradeExecutedEvent) => void>>;

  constructor(socketUrl: string) {
    this.socket = io(socketUrl);
    this.subscribers = new Map();

    this.socket.on("trade:executed", (data: TradeExecutedEvent) => {
      const callbacks = this.subscribers.get(data.symbol);
      if (callbacks) {
        callbacks.forEach((cb) => cb(data));
      }
    });
  }

  subscribe(symbol: string, callback: (trade: TradeExecutedEvent) => void): () => void {
    const upperSymbol = symbol.toUpperCase();
    
    if (!this.subscribers.has(upperSymbol)) {
      this.subscribers.set(upperSymbol, new Set());
      this.socket.emit("subscribe:trades", upperSymbol);
    }
    
    this.subscribers.get(upperSymbol)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.subscribers.get(upperSymbol);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscribers.delete(upperSymbol);
          this.socket.emit("unsubscribe:trades", upperSymbol);
        }
      }
    };
  }
}

// Usage
const feed = new TradeFeed("ws://localhost:3000");

const unsubscribe = feed.subscribe("AAPL-PERP", (trade) => {
  console.log(`New trade: ${trade.side} ${trade.quantity} @ $${trade.price}`);
});

// Later: unsubscribe()
```

---

## Example: Trade History Table with Pagination

```typescript
interface TradeHistoryState {
  trades: UserTrade[];
  loading: boolean;
  hasMore: boolean;
  offset: number;
}

class TradeHistoryManager {
  private state: TradeHistoryState = {
    trades: [],
    loading: false,
    hasMore: true,
    offset: 0,
  };
  private readonly limit = 25;
  private token: string;
  private market?: string;

  constructor(token: string, market?: string) {
    this.token = token;
    this.market = market;
  }

  async loadMore(): Promise<UserTrade[]> {
    if (this.state.loading || !this.state.hasMore) {
      return this.state.trades;
    }

    this.state.loading = true;

    try {
      const response = await getUserTradeHistory(this.token, {
        market: this.market,
        limit: this.limit,
        offset: this.state.offset,
      });

      this.state.trades = [...this.state.trades, ...response.trades];
      this.state.offset += response.trades.length;
      this.state.hasMore = response.pagination.hasMore;

      return this.state.trades;
    } finally {
      this.state.loading = false;
    }
  }

  reset(): void {
    this.state = {
      trades: [],
      loading: false,
      hasMore: true,
      offset: 0,
    };
  }
}

// Usage
const historyManager = new TradeHistoryManager(authToken, "AAPL-PERP");
const trades = await historyManager.loadMore();
// Load more on scroll...
const moreTrades = await historyManager.loadMore();
```

---

## Error Handling

### REST API Errors

```json
{
  "error": "NOT_FOUND",
  "message": "Market not found"
}
```

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `NOT_FOUND` | 404 | Market symbol not found |
| `UNAUTHORIZED` | 401 | Missing or invalid auth token |
| `INTERNAL_ERROR` | 500 | Server error |

### WebSocket Errors

```typescript
socket.on("error", (data) => {
  console.error(`WebSocket error: ${data.code} - ${data.message}`);
});
```

---

## Best Practices

1. **Debounce Updates** - When displaying real-time trades, batch UI updates to avoid excessive re-renders

2. **Limit History Fetches** - Use pagination instead of fetching all trades at once

3. **Reconnection Handling** - Re-subscribe to trade feeds after WebSocket reconnection

4. **Cache Recent Trades** - Cache recent trades locally and merge with WebSocket updates

5. **Time Formatting** - Convert timestamps to user's local timezone for display

```typescript
function formatTradeTime(timestamp: string | number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
```

---

## Related Documentation

- [Position Integration](./position-integration.md) - Position management
- [Candles Integration](./candles-integration.md) - Chart data
- [Authentication](./frontend-integration.md) - Auth flow
