# Trade History Integration Guide

Quick guide for integrating the user trade history endpoint.

## Endpoint

```
GET /clob/trades/history
Authorization: Bearer <token>
```

## Query Parameters

| Parameter | Type   | Default | Max | Description                      |
|-----------|--------|---------|-----|----------------------------------|
| `market`  | string | -       | -   | Filter by market symbol (optional) |
| `limit`   | number | 50      | 100 | Number of trades to return       |
| `offset`  | number | 0       | -   | Pagination offset                |

## Example Request

```
GET /clob/trades/history?market=AAPL-PERP&limit=20&offset=0
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

## Response

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

## Response Fields

| Field          | Type    | Description                              |
|----------------|---------|------------------------------------------|
| `tradeId`      | string  | Unique trade identifier                  |
| `marketSymbol` | string  | Market symbol (e.g., `AAPL-PERP`)        |
| `side`         | string  | `"buy"` or `"sell"`                      |
| `price`        | number  | Execution price                          |
| `quantity`     | number  | Number of contracts                      |
| `quoteQuantity`| number  | Total value (`price * quantity`)         |
| `fee`          | number  | Fee paid for this trade                  |
| `isMaker`      | boolean | `true` if user was maker                 |
| `timestamp`    | string  | ISO 8601 timestamp                       |

## TypeScript

```typescript
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

interface TradeHistoryResponse {
  trades: UserTrade[];
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

async function getTradeHistory(
  token: string,
  options: { market?: string; limit?: number; offset?: number } = {}
): Promise<TradeHistoryResponse> {
  const params = new URLSearchParams();
  if (options.market) params.set("market", options.market);
  if (options.limit) params.set("limit", options.limit.toString());
  if (options.offset) params.set("offset", options.offset.toString());

  const response = await fetch(`${API_BASE}/clob/trades/history?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch trade history: ${response.statusText}`);
  }

  return response.json();
}
```

## Usage

```typescript
// Fetch all trade history
const allTrades = await getTradeHistory(authToken);

// Fetch trades for specific market
const aaplTrades = await getTradeHistory(authToken, { market: "AAPL-PERP" });

// Paginated fetch
const page1 = await getTradeHistory(authToken, { limit: 25, offset: 0 });
const page2 = await getTradeHistory(authToken, { limit: 25, offset: 25 });
```

## Errors

| Error Code       | HTTP Status | Description                |
|------------------|-------------|----------------------------|
| `UNAUTHORIZED`   | 401         | Missing or invalid token   |
| `INTERNAL_ERROR` | 500         | Server error               |
