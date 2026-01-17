# Candlestick API Documentation

The Candlestick API provides OHLCV (Open, High, Low, Close, Volume) data for perpetual futures markets. All candle endpoints are **public** and do not require authentication.

## Base URL

```
/clob/candles
```

## Available Markets

- `AAPL-PERP` - Apple Inc. Perpetual
- `GOOGL-PERP` - Alphabet Inc. Perpetual  
- `MSFT-PERP` - Microsoft Corp. Perpetual

## Supported Intervals

| Interval | Description |
|----------|-------------|
| `1m` | 1 minute |
| `5m` | 5 minutes |
| `15m` | 15 minutes |
| `1h` | 1 hour |
| `4h` | 4 hours |
| `1d` | 1 day |

---

## Endpoints

### Get Candles

Retrieve historical candle data for a market.

```
GET /clob/candles/:symbol
```

#### Parameters

| Parameter | Type | Location | Required | Default | Description |
|-----------|------|----------|----------|---------|-------------|
| `symbol` | string | path | Yes | - | Market symbol (e.g., `AAPL-PERP`) |
| `interval` | string | query | No | `1m` | Candle interval |
| `limit` | number | query | No | `1000` | Number of candles (max: 10000) |

#### Response

```json
{
  "symbol": "AAPL-PERP",
  "interval": "1m",
  "marketStatus": {
    "isOpen": true,
    "nextOpen": null,
    "nextClose": "2026-01-16T21:00:00.000Z"
  },
  "candles": [
    {
      "timestamp": 1737071940000,
      "open": 258.21,
      "high": 258.45,
      "low": 258.10,
      "close": 258.35,
      "volume": 2456,
      "trades": 45,
      "isClosed": true,
      "isMarketOpen": true
    }
  ],
  "currentCandle": {
    "timestamp": 1737072000000,
    "open": 258.35,
    "high": 258.42,
    "low": 258.30,
    "close": 258.38,
    "volume": 1234,
    "trades": 23,
    "isClosed": false
  },
  "meta": {
    "count": 1000,
    "hasEnoughData": true,
    "available": 527040,
    "required": 50
  }
}
```

#### Candle Fields

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | number | Unix timestamp in milliseconds |
| `open` | number | Opening price |
| `high` | number | Highest price |
| `low` | number | Lowest price |
| `close` | number | Closing price |
| `volume` | number | Trading volume |
| `trades` | number | Number of trades |
| `isClosed` | boolean | Whether candle is finalized |
| `isMarketOpen` | boolean | Whether US market was open |

#### Example

```bash
# Get 5000 1-minute candles for AAPL
curl "http://localhost:3000/clob/candles/AAPL-PERP?interval=1m&limit=5000"

# Get daily candles
curl "http://localhost:3000/clob/candles/AAPL-PERP?interval=1d&limit=365"

# Get 4-hour candles
curl "http://localhost:3000/clob/candles/GOOGL-PERP?interval=4h&limit=500"
```

---

### Get Candle Status

Check data availability for all intervals.

```
GET /clob/candles/:symbol/status
```

#### Response

```json
{
  "symbol": "AAPL-PERP",
  "marketStatus": {
    "isOpen": true,
    "nextOpen": null,
    "nextClose": "2026-01-16T21:00:00.000Z"
  },
  "intervals": {
    "1m": { "hasEnough": true, "count": 527040, "required": 50 },
    "5m": { "hasEnough": true, "count": 105408, "required": 50 },
    "15m": { "hasEnough": true, "count": 35136, "required": 50 },
    "1h": { "hasEnough": true, "count": 8784, "required": 50 },
    "4h": { "hasEnough": true, "count": 2196, "required": 50 },
    "1d": { "hasEnough": true, "count": 366, "required": 50 }
  }
}
```

---

### Get Gap Statistics

Get coverage statistics for candle data.

```
GET /clob/candles/:symbol/gaps
```

#### Response

```json
{
  "symbol": "AAPL-PERP",
  "intervals": [
    {
      "interval": "1m",
      "totalCandles": 527040,
      "missingCandles": 0,
      "coveragePercent": "100%",
      "oldestCandle": "2025-01-16T00:00:00.000Z",
      "newestCandle": "2026-01-16T23:59:00.000Z"
    }
  ]
}
```

---

### Get Missing Candles

Get list of missing candle timestamps for a specific interval.

```
GET /clob/candles/:symbol/gaps/:interval
```

#### Parameters

| Parameter | Type | Location | Required | Default | Description |
|-----------|------|----------|----------|---------|-------------|
| `symbol` | string | path | Yes | - | Market symbol |
| `interval` | string | path | Yes | - | Candle interval |
| `limit` | number | query | No | `100` | Max timestamps to return (max: 500) |

#### Response

```json
{
  "symbol": "AAPL-PERP",
  "interval": "1m",
  "totalMissing": 0,
  "missingTimestamps": [],
  "truncated": false
}
```

---

### Fill Missing Candles

Fill gaps with synthetic data. Creates smooth price transitions.

```
POST /clob/candles/:symbol/fill-gaps
```

#### Parameters

| Parameter | Type | Location | Required | Description |
|-----------|------|----------|----------|-------------|
| `symbol` | string | path | Yes | Market symbol |
| `interval` | string | query | No | Specific interval to fill (fills all if omitted) |

#### Response

```json
{
  "success": true,
  "symbol": "AAPL-PERP",
  "totalGapsFound": 0,
  "totalCandlesFilled": 0,
  "byInterval": [
    { "interval": "1m", "gapsFound": 0, "candlesFilled": 0 },
    { "interval": "5m", "gapsFound": 0, "candlesFilled": 0 }
  ]
}
```

---

### Fetch Historical Data

Trigger historical data generation (uses current Finnhub price as anchor).

```
POST /clob/candles/:symbol/fetch-historical
```

#### Parameters

| Parameter | Type | Location | Required | Default | Description |
|-----------|------|----------|----------|---------|-------------|
| `symbol` | string | path | Yes | - | Market symbol |
| `days` | number | query | No | `365` | Days of history (max: 365) |

#### Response

```json
{
  "success": true,
  "symbol": "AAPL-PERP",
  "daysFetched": 365,
  "intervals": [
    { "interval": "1m", "totalCandles": 527040, "missingCandles": 0, "coveragePercent": "100%" }
  ]
}
```

---

## Data Characteristics

### 24/7 Coverage

Perpetual futures trade 24/7. Candle data covers:

- **Pre-market**: 00:00 - 14:30 UTC (lower volatility)
- **Market hours**: 14:30 - 21:00 UTC (9:30 AM - 4:00 PM ET, higher volatility)
- **After-hours**: 21:00 - 24:00 UTC (lower volatility)

### Historical Data

- **Coverage**: 1 year (366 days)
- **1-minute candles**: 527,040 per market
- **Seamless transitions**: No gaps at midnight boundaries
- **Real price anchor**: Today's price from Finnhub, historical generated via GBM

### Candle Generation

Historical candles are generated using:

1. **Geometric Brownian Motion (GBM)** for realistic price paths
2. **25% annual volatility** for daily candles
3. **Reduced weekend volatility** (0.3-0.8% vs 1-2.5% weekdays)
4. **Variable candle ranges** with exponential distribution

---

## Error Responses

| Status | Error Code | Description |
|--------|------------|-------------|
| 400 | `INVALID_INTERVAL` | Invalid interval parameter |
| 404 | `NOT_FOUND` | Market not found |
| 500 | `INTERNAL_ERROR` | Server error |

```json
{
  "error": "INVALID_INTERVAL",
  "message": "Invalid interval. Must be one of: 1m, 5m, 15m, 1h, 4h, 1d"
}
```

---

## Usage Examples

### JavaScript/TypeScript

```typescript
// Fetch 1-minute candles
const response = await fetch(
  'http://localhost:3000/clob/candles/AAPL-PERP?interval=1m&limit=1000'
);
const data = await response.json();

// Access candles
data.candles.forEach(candle => {
  console.log(`${new Date(candle.timestamp)} - O:${candle.open} H:${candle.high} L:${candle.low} C:${candle.close}`);
});

// Check current live candle
if (data.currentCandle) {
  console.log('Live candle:', data.currentCandle);
}
```

### Python

```python
import requests

# Get daily candles for the past year
response = requests.get(
    'http://localhost:3000/clob/candles/AAPL-PERP',
    params={'interval': '1d', 'limit': 365}
)
data = response.json()

for candle in data['candles']:
    print(f"{candle['timestamp']}: {candle['close']}")
```

### Chart Integration

```typescript
// For TradingView or similar charting libraries
const candles = data.candles.map(c => ({
  time: c.timestamp / 1000,  // Convert to seconds for most libraries
  open: c.open,
  high: c.high,
  low: c.low,
  close: c.close,
  volume: c.volume
}));
```
