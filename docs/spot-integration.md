# Spot Exchange Integration Guide

Complete guide for integrating the spot trading functionality. Spot trading allows users to exchange assets directly (e.g., buy/sell Pokemon cards for USD) without leverage or margin.

## Overview

| Feature | Description |
|---------|-------------|
| **Trading Type** | Direct asset exchange (no leverage) |
| **Order Types** | Limit, Market |
| **Settlement** | Immediate (assets swap on fill) |
| **USD Balance** | **Shared with perpetuals** (same balance for both) |
| **Item Balances** | Separate per asset (e.g., UMBREON-VMAX) |

### Shared USD Balance

**Important:** Spot and perpetuals trading share the same USD balance. This means:
- Your USD balance from `/faucet/request` works for both spot and perp trading
- USD locked for spot orders is locked in the same balance pool
- Check your USD balance via `/faucet/balance` or `/spot/balances`
- Item balances (like UMBREON-VMAX) are separate and specific to spot trading

## Quick Start

```typescript
// 1. Get test balances
await fetch("/spot/faucet", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ asset: "USD", amount: 1000 }),
});

// 2. Place a limit buy order
await fetch("/spot/orders", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    marketSymbol: "UMBREON-VMAX-SPOT",
    side: "buy",
    type: "limit",
    price: 250.00,
    quantity: 1,
  }),
});
```

---

## Available Markets

| Symbol | Base Asset | Quote Asset | Description |
|--------|------------|-------------|-------------|
| `UMBREON-VMAX-SPOT` | UMBREON-VMAX | USD | Umbreon VMAX 215/203 Pokemon Card |

---

## Endpoints

### Public Endpoints (No Auth Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/spot/markets` | List all spot markets |
| GET | `/spot/markets/:symbol` | Get market details |
| GET | `/spot/orderbook/:symbol` | Get order book |
| GET | `/spot/trades/:symbol` | Get recent trades |

### Authenticated Endpoints (Require Bearer Token)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/spot/orders` | Place an order |
| DELETE | `/spot/orders/:orderId` | Cancel an order |
| GET | `/spot/orders` | Get open orders |
| GET | `/spot/orders/history` | Get order history |
| GET | `/spot/trades/history` | Get trade history |
| GET | `/spot/balances` | Get all balances |
| GET | `/spot/balances/summary` | Get non-zero balances |
| GET | `/spot/balances/:asset` | Get specific asset balance |
| GET | `/spot/balances/:asset/history` | Get balance history |
| POST | `/spot/faucet` | Get test tokens (dev) |

---

## API Reference

### Get Markets

```
GET /spot/markets
```

**Response:**
```json
{
  "markets": [
    {
      "symbol": "UMBREON-VMAX-SPOT",
      "name": "Umbreon VMAX Spot",
      "baseAsset": "UMBREON-VMAX",
      "quoteAsset": "USD",
      "bestBid": 44.50,
      "bestAsk": 45.00,
      "spread": 1.12,
      "tickSize": 0.01,
      "lotSize": 1,
      "minOrderSize": 1,
      "status": "active"
    }
  ]
}
```

### Get Order Book

```
GET /spot/orderbook/:symbol?depth=20
```

**Response:**
```json
{
  "symbol": "UMBREON-VMAX-SPOT",
  "bids": [
    { "price": 44.50, "quantity": 10, "total": 445.00 },
    { "price": 44.00, "quantity": 5, "total": 220.00 }
  ],
  "asks": [
    { "price": 45.00, "quantity": 8, "total": 360.00 },
    { "price": 45.50, "quantity": 12, "total": 546.00 }
  ],
  "timestamp": 1706234567890
}
```

### Place Order

```
POST /spot/orders
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "marketSymbol": "UMBREON-VMAX-SPOT",
  "side": "buy",
  "type": "limit",
  "price": 45.00,
  "quantity": 2,
  "postOnly": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `marketSymbol` | string | Yes | Market to trade |
| `side` | string | Yes | `"buy"` or `"sell"` |
| `type` | string | Yes | `"limit"` or `"market"` |
| `price` | number | For limit | Limit price |
| `quantity` | number | Yes | Base asset quantity |
| `postOnly` | boolean | No | Only add to book, don't match |

**Response (Order Placed):**
```json
{
  "order": {
    "orderId": "SPOT-550e8400-e29b-41d4-a716-446655440000",
    "marketSymbol": "UMBREON-VMAX-SPOT",
    "baseAsset": "UMBREON-VMAX",
    "quoteAsset": "USD",
    "side": "buy",
    "type": "limit",
    "price": 45.00,
    "quantity": 2,
    "filledQuantity": 0,
    "remainingQuantity": 2,
    "averagePrice": 0,
    "status": "open",
    "createdAt": "2026-01-26T10:30:00.000Z"
  },
  "trades": []
}
```

**Response (Order Matched):**
```json
{
  "order": {
    "orderId": "SPOT-550e8400-e29b-41d4-a716-446655440000",
    "status": "filled",
    "filledQuantity": 2,
    "remainingQuantity": 0,
    "averagePrice": 44.50
  },
  "trades": [
    {
      "tradeId": "STRD-660e8400-e29b-41d4-a716-446655440000",
      "price": 44.50,
      "quantity": 2,
      "quoteQuantity": 89.00,
      "side": "buy"
    }
  ]
}
```

### Cancel Order

```
DELETE /spot/orders/:orderId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "order": {
    "orderId": "SPOT-550e8400-e29b-41d4-a716-446655440000",
    "status": "cancelled",
    "cancelledAt": "2026-01-26T10:35:00.000Z"
  }
}
```

### Get Open Orders

```
GET /spot/orders?market=UMBREON-VMAX-SPOT
Authorization: Bearer <token>
```

**Response:**
```json
{
  "orders": [
    {
      "orderId": "SPOT-550e8400-e29b-41d4-a716-446655440000",
      "marketSymbol": "UMBREON-VMAX-SPOT",
      "side": "buy",
      "type": "limit",
      "price": 44.00,
      "quantity": 5,
      "filledQuantity": 0,
      "remainingQuantity": 5,
      "status": "open",
      "createdAt": "2026-01-26T10:30:00.000Z"
    }
  ]
}
```

### Get Balances

```
GET /spot/balances
Authorization: Bearer <token>
```

**Response:**
```json
{
  "balances": [
    {
      "asset": "USD",
      "free": 1000.00,
      "locked": 220.00,
      "total": 1220.00
    },
    {
      "asset": "UMBREON-VMAX",
      "free": 10,
      "locked": 0,
      "total": 10,
      "avgCost": 3400.50,
      "totalCostBasis": 34005.00
    }
  ]
}
```

**Balance Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `asset` | string | Asset symbol |
| `free` | number | Available balance |
| `locked` | number | Balance locked in open orders |
| `total` | number | Total balance (free + locked) |
| `avgCost` | number | Average cost per unit (non-USD assets only) |
| `totalCostBasis` | number | Total cost of all purchases (non-USD assets only) |

**Note:** `avgCost` and `totalCostBasis` are only provided for non-USD assets and are used for P&L calculations.

### Get Trade History

```
GET /spot/trades/history?market=UMBREON-VMAX-SPOT&limit=50&offset=0
Authorization: Bearer <token>
```

**Response:**
```json
{
  "trades": [
    {
      "tradeId": "STRD-660e8400-e29b-41d4-a716-446655440000",
      "marketSymbol": "UMBREON-VMAX-SPOT",
      "baseAsset": "UMBREON-VMAX",
      "quoteAsset": "USD",
      "side": "buy",
      "price": 45.00,
      "quantity": 2,
      "quoteQuantity": 90.00,
      "fee": 0,
      "isMaker": false,
      "timestamp": "2026-01-26T10:30:00.000Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

### Spot Faucet (Dev/Test)

```
POST /spot/faucet
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "asset": "USD",
  "amount": 1000
}
```

**Response:**
```json
{
  "success": true,
  "balance": {
    "asset": "USD",
    "free": 1000,
    "locked": 0,
    "total": 1000
  }
}
```

---

## TypeScript Types

```typescript
// Spot Market
interface SpotMarket {
  symbol: string;
  name: string;
  baseAsset: string;
  quoteAsset: string;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  tickSize: number;
  lotSize: number;
  minOrderSize: number;
  status: "active" | "paused";
}

// Spot Order
interface SpotOrder {
  orderId: string;
  marketSymbol: string;
  baseAsset: string;
  quoteAsset: string;
  side: "buy" | "sell";
  type: "limit" | "market";
  price: number;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  averagePrice: number;
  status: "pending" | "open" | "partial" | "filled" | "cancelled";
  createdAt: string;
  filledAt?: string;
  cancelledAt?: string;
}

// Spot Trade
interface SpotTrade {
  tradeId: string;
  marketSymbol: string;
  baseAsset: string;
  quoteAsset: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  quoteQuantity: number;
  fee: number;
  isMaker: boolean;
  timestamp: string;
}

// Spot Balance
interface SpotBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

// Order Book
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
```

---

## Client Example

```typescript
const API_BASE = "http://localhost:3000";

class SpotClient {
  constructor(private token: string) {}

  private async request<T>(
    method: string,
    path: string,
    body?: object
  ): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // Markets
  async getMarkets(): Promise<{ markets: SpotMarket[] }> {
    return fetch(`${API_BASE}/spot/markets`).then((r) => r.json());
  }

  async getOrderBook(symbol: string, depth = 20): Promise<OrderBook> {
    return fetch(`${API_BASE}/spot/orderbook/${symbol}?depth=${depth}`).then(
      (r) => r.json()
    );
  }

  // Orders
  async placeOrder(params: {
    marketSymbol: string;
    side: "buy" | "sell";
    type: "limit" | "market";
    price?: number;
    quantity: number;
    postOnly?: boolean;
  }): Promise<{ order: SpotOrder; trades: SpotTrade[] }> {
    return this.request("POST", "/spot/orders", params);
  }

  async cancelOrder(orderId: string): Promise<{ success: boolean }> {
    return this.request("DELETE", `/spot/orders/${orderId}`);
  }

  async getOpenOrders(market?: string): Promise<{ orders: SpotOrder[] }> {
    const query = market ? `?market=${market}` : "";
    return this.request("GET", `/spot/orders${query}`);
  }

  // Balances
  async getBalances(): Promise<{ balances: SpotBalance[] }> {
    return this.request("GET", "/spot/balances");
  }

  async getBalance(asset: string): Promise<SpotBalance> {
    return this.request("GET", `/spot/balances/${asset}`);
  }

  // History
  async getTradeHistory(params?: {
    market?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ trades: SpotTrade[] }> {
    const query = new URLSearchParams();
    if (params?.market) query.set("market", params.market);
    if (params?.limit) query.set("limit", params.limit.toString());
    if (params?.offset) query.set("offset", params.offset.toString());
    return this.request("GET", `/spot/trades/history?${query}`);
  }

  // Faucet (dev)
  async faucet(asset: string, amount: number): Promise<{ balance: SpotBalance }> {
    return this.request("POST", "/spot/faucet", { asset, amount });
  }
}
```

---

## Usage Examples

### Buy Items with USD

```typescript
const client = new SpotClient(authToken);

// 1. Check USD balance
const usdBalance = await client.getBalance("USD");
console.log(`Available USD: $${usdBalance.free}`);

// 2. Check current price
const orderbook = await client.getOrderBook("UMBREON-VMAX-SPOT");
const bestAsk = orderbook.asks[0]?.price;
console.log(`Best ask: $${bestAsk}`);

// 3. Place market buy order
const result = await client.placeOrder({
  marketSymbol: "UMBREON-VMAX-SPOT",
  side: "buy",
  type: "market",
  quantity: 1,
});

if (result.trades.length > 0) {
  console.log(`Bought 1 UMBREON-VMAX @ $${result.trades[0].price}`);
}
```

### Sell Items for USD

```typescript
// 1. Check item balance
const itemBalance = await client.getBalance("UMBREON-VMAX");
console.log(`Available items: ${itemBalance.free}`);

// 2. Place limit sell order
const result = await client.placeOrder({
  marketSymbol: "UMBREON-VMAX-SPOT",
  side: "sell",
  type: "limit",
  price: 50.00,
  quantity: 2,
});

console.log(`Order ${result.order.status}: ${result.order.orderId}`);
```

### Monitor and Cancel Orders

```typescript
// Get all open orders
const { orders } = await client.getOpenOrders();

for (const order of orders) {
  console.log(`${order.side} ${order.quantity} @ $${order.price} - ${order.status}`);
  
  // Cancel if unfilled for too long
  if (order.status === "open") {
    await client.cancelOrder(order.orderId);
    console.log(`Cancelled ${order.orderId}`);
  }
}
```

---

## Key Differences from Perpetuals

| Aspect | Spot | Perpetuals |
|--------|------|------------|
| **Leverage** | None (1x only) | Up to 10x |
| **Positions** | No positions, just balances | Long/short positions |
| **Margin** | Full collateral required | Partial margin |
| **Funding** | None | 8-hour funding rate |
| **Liquidation** | None | Auto-liquidation |
| **Settlement** | Immediate asset swap | Mark-to-market |
| **Balance** | Multi-asset (USD, items) | Single USD balance |

---

## Error Codes

| Error | HTTP | Description |
|-------|------|-------------|
| `INVALID_REQUEST` | 400 | Missing or invalid parameters |
| `NOT_FOUND` | 404 | Market or order not found |
| `ORDER_FAILED` | 400 | Insufficient balance or other order error |
| `CANCEL_FAILED` | 400 | Order cannot be cancelled |
| `MARKET_PAUSED` | 400 | Market is not active |
| `UNAUTHORIZED` | 401 | Missing or invalid auth token |
| `INTERNAL_ERROR` | 500 | Server error |

---

## WebSocket Events

Spot trading uses the same WebSocket events as perpetuals:

```typescript
// Subscribe to orderbook updates
socket.emit("subscribe:orderbook", "UMBREON-VMAX-SPOT");

// Subscribe to trade feed
socket.emit("subscribe:trades", "UMBREON-VMAX-SPOT");

// Listen for updates
socket.on("orderbook:update", (data) => { /* ... */ });
socket.on("trade:executed", (data) => { /* ... */ });
socket.on("order:created", (data) => { /* ... */ });
socket.on("order:filled", (data) => { /* ... */ });
socket.on("order:cancelled", (data) => { /* ... */ });
```
