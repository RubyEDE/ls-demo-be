# CLOB API Reference

This document describes the Central Limit Order Book (CLOB) API for perpetuals trading.

## Overview

The CLOB provides perpetual futures trading with:

- **Oracle-based pricing** - Prices sourced from Finnhub in real-time
- **Synthetic liquidity** - Market maker generates orders around oracle price
- **Leveraged trading** - Up to 20x leverage depending on market
- **Real-time updates** - WebSocket streams for prices, order book, and trades

## Available Markets

| Symbol | Name | Base Asset | Max Leverage | Initial Margin |
|--------|------|------------|--------------|----------------|
| SP500-PERP | S&P 500 Perpetual | SPY | 20x | 5% |
| AAPL-PERP | Apple Perpetual | AAPL | 10x | 10% |
| TSLA-PERP | Tesla Perpetual | TSLA | 10x | 10% |

## Public Endpoints

### Get All Markets

```
GET /clob/markets
```

Returns all active markets with current prices.

**Response:**

```json
{
  "markets": [
    {
      "symbol": "SP500-PERP",
      "name": "S&P 500 Perpetual",
      "baseAsset": "SP500",
      "quoteAsset": "USD",
      "oraclePrice": 590.25,
      "indexPrice": 590.25,
      "bestBid": 590.10,
      "bestAsk": 590.40,
      "spread": 0.30,
      "tickSize": 0.01,
      "lotSize": 0.01,
      "minOrderSize": 0.01,
      "maxOrderSize": 100,
      "maxLeverage": 20,
      "fundingRate": 0.0001,
      "volume24h": 1250000,
      "status": "active"
    }
  ]
}
```

### Get Market Details

```
GET /clob/markets/:symbol
```

Returns detailed information for a specific market.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| symbol | string | Market symbol (e.g., "SP500-PERP") |

**Response:**

```json
{
  "symbol": "SP500-PERP",
  "name": "S&P 500 Perpetual",
  "baseAsset": "SP500",
  "quoteAsset": "USD",
  "oraclePrice": 590.25,
  "indexPrice": 590.25,
  "oraclePriceUpdatedAt": "2024-01-15T10:30:00.000Z",
  "bestBid": 590.10,
  "bestAsk": 590.40,
  "spread": 0.30,
  "tickSize": 0.01,
  "lotSize": 0.01,
  "minOrderSize": 0.01,
  "maxOrderSize": 100,
  "maxLeverage": 20,
  "initialMarginRate": 0.05,
  "maintenanceMarginRate": 0.025,
  "fundingRate": 0.0001,
  "fundingInterval": 8,
  "nextFundingTime": "2024-01-15T16:00:00.000Z",
  "volume24h": 1250000,
  "high24h": 595.00,
  "low24h": 585.50,
  "openInterest": 50000,
  "syntheticOrders": 30,
  "status": "active"
}
```

### Get Order Book

```
GET /clob/orderbook/:symbol
```

Returns the current order book for a market.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| symbol | string | Market symbol |
| depth | number | Number of levels (default: 20, max: 50) |

**Response:**

```json
{
  "symbol": "SP500-PERP",
  "bids": [
    { "price": 590.10, "quantity": 5.5, "total": 3245.55 },
    { "price": 590.05, "quantity": 8.2, "total": 4838.41 },
    { "price": 590.00, "quantity": 12.0, "total": 7080.00 }
  ],
  "asks": [
    { "price": 590.40, "quantity": 4.8, "total": 2833.92 },
    { "price": 590.45, "quantity": 7.1, "total": 4192.20 },
    { "price": 590.50, "quantity": 10.5, "total": 6200.25 }
  ],
  "oraclePrice": 590.25,
  "timestamp": 1705315800000
}
```

### Get Recent Trades

```
GET /clob/trades/:symbol
```

Returns recent trades for a market.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| symbol | string | Market symbol |
| limit | number | Number of trades (default: 50, max: 100) |

**Response:**

```json
{
  "trades": [
    {
      "id": "TRD-abc123",
      "price": 590.25,
      "quantity": 1.5,
      "side": "buy",
      "timestamp": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

## Authenticated Endpoints

All authenticated endpoints require a valid JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

### Place Order

```
POST /clob/orders
```

Places a new order in the market.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| marketSymbol | string | Yes | Market symbol (e.g., "SP500-PERP") |
| side | string | Yes | "buy" or "sell" |
| type | string | Yes | "limit" or "market" |
| price | number | For limit | Limit price |
| quantity | number | Yes | Order quantity |
| postOnly | boolean | No | Only add to book, don't match (default: false) |
| reduceOnly | boolean | No | Only reduce position (default: false) |

**Example Request:**

```json
{
  "marketSymbol": "SP500-PERP",
  "side": "buy",
  "type": "limit",
  "price": 589.50,
  "quantity": 1.0,
  "postOnly": false
}
```

**Response:**

```json
{
  "order": {
    "orderId": "ORD-abc123",
    "marketSymbol": "SP500-PERP",
    "side": "buy",
    "type": "limit",
    "price": 589.50,
    "quantity": 1.0,
    "filledQuantity": 0,
    "remainingQuantity": 1.0,
    "averagePrice": 0,
    "status": "open",
    "createdAt": "2024-01-15T10:30:00.000Z"
  },
  "trades": []
}
```

**Order Statuses:**

| Status | Description |
|--------|-------------|
| pending | Order is being processed |
| open | Order is on the book |
| partial | Order is partially filled |
| filled | Order is completely filled |
| cancelled | Order was cancelled |

### Cancel Order

```
DELETE /clob/orders/:orderId
```

Cancels an open order.

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| orderId | string | Order ID to cancel |

**Response:**

```json
{
  "success": true,
  "order": {
    "orderId": "ORD-abc123",
    "status": "cancelled",
    "cancelledAt": "2024-01-15T10:35:00.000Z"
  }
}
```

### Get Open Orders

```
GET /clob/orders
```

Returns user's open orders.

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| market | string | Filter by market symbol (optional) |

**Response:**

```json
{
  "orders": [
    {
      "orderId": "ORD-abc123",
      "marketSymbol": "SP500-PERP",
      "side": "buy",
      "type": "limit",
      "price": 589.50,
      "quantity": 1.0,
      "filledQuantity": 0,
      "remainingQuantity": 1.0,
      "averagePrice": 0,
      "status": "open",
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### Get Order History

```
GET /clob/orders/history
```

Returns user's order history.

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| market | string | Filter by market symbol (optional) |
| limit | number | Number of orders (default: 50, max: 100) |
| offset | number | Pagination offset (default: 0) |

**Response:**

```json
{
  "orders": [
    {
      "orderId": "ORD-abc123",
      "marketSymbol": "SP500-PERP",
      "side": "buy",
      "type": "limit",
      "price": 589.50,
      "quantity": 1.0,
      "filledQuantity": 1.0,
      "averagePrice": 589.45,
      "status": "filled",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "filledAt": "2024-01-15T10:30:05.000Z",
      "cancelledAt": null
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

### Get Trade History

```
GET /clob/trades/history
```

Returns user's trade history.

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| market | string | Filter by market symbol (optional) |
| limit | number | Number of trades (default: 50, max: 100) |
| offset | number | Pagination offset (default: 0) |

**Response:**

```json
{
  "trades": [
    {
      "tradeId": "TRD-xyz789",
      "marketSymbol": "SP500-PERP",
      "side": "buy",
      "price": 589.45,
      "quantity": 1.0,
      "quoteQuantity": 589.45,
      "fee": 0.29,
      "isMaker": false,
      "timestamp": "2024-01-15T10:30:05.000Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

## Error Responses

All error responses follow this format:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable error message"
}
```

**Common Error Codes:**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| NOT_FOUND | 404 | Market or order not found |
| INVALID_REQUEST | 400 | Invalid request parameters |
| ORDER_FAILED | 400 | Order placement failed |
| CANCEL_FAILED | 400 | Order cancellation failed |
| UNAUTHORIZED | 401 | Missing or invalid auth token |
| INTERNAL_ERROR | 500 | Server error |

## Margin Calculation

Orders require margin to be locked from your balance:

```
Required Margin = Price × Quantity × Initial Margin Rate
```

**Example:**
- Buy 1 SP500-PERP at $590
- Initial Margin Rate: 5%
- Required Margin: $590 × 1 × 0.05 = $29.50

When an order is cancelled, the locked margin is returned to your free balance.

## WebSocket Events

Subscribe to real-time updates via WebSocket. See [WebSocket Integration](./websocket-integration.md) for details.

**Available Channels:**

| Event | Description |
|-------|-------------|
| `subscribe:price <symbol>` | Price updates |
| `subscribe:orderbook <symbol>` | Order book updates |
| `subscribe:trades <symbol>` | Trade feed |

**User Events (authenticated):**

| Event | Description |
|-------|-------------|
| `order:created` | Your order was placed |
| `order:filled` | Your order was filled |
| `order:cancelled` | Your order was cancelled |
| `balance:updated` | Your balance changed |
