# Faucet Service

The faucet service allows authenticated users to request tokens once every 24 hours. It includes balance management with support for free and locked funds.

## Overview

- **Daily Limit**: Users can request tokens once per 24-hour period
- **Faucet Amount**: 100 tokens per request
- **Balance Types**: Free (available) and Locked (reserved)
- **History Tracking**: All balance changes are recorded

## Balance Model

```typescript
interface Balance {
  address: string;      // User's wallet address
  free: number;         // Available balance
  locked: number;       // Reserved balance
  total: number;        // free + locked (virtual field)
  totalCredits: number; // Lifetime credits received
  totalDebits: number;  // Lifetime debits spent
  changes: BalanceChange[]; // Full transaction history
}

interface BalanceChange {
  amount: number;
  type: "credit" | "debit" | "lock" | "unlock";
  reason: string;
  timestamp: Date;
  referenceId?: string;
}
```

## API Endpoints

All endpoints (except global-stats) require authentication via Bearer token.

### Get Balance

Returns the current user's balance.

**Request:**
```
GET /faucet/balance
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "address": "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  "free": 100,
  "locked": 0,
  "total": 100,
  "totalCredits": 100,
  "totalDebits": 0
}
```

---

### Get Balance History

Returns the user's balance change history.

**Request:**
```
GET /faucet/balance/history?limit=50&offset=0
Authorization: Bearer <token>
```

| Parameter | Type   | Default | Description                    |
|-----------|--------|---------|--------------------------------|
| limit     | number | 50      | Max results (capped at 100)    |
| offset    | number | 0       | Pagination offset              |

**Response (200):**
```json
{
  "history": [
    {
      "amount": 100,
      "type": "credit",
      "reason": "Faucet request",
      "timestamp": "2026-01-15T09:09:19.899Z",
      "referenceId": "faucet_1736935759899"
    }
  ],
  "limit": 50,
  "offset": 0
}
```

---

### Request from Faucet

Request tokens from the faucet. Limited to once per 24 hours.

**Request:**
```
POST /faucet/request
Authorization: Bearer <token>
```

**Success Response (200):**
```json
{
  "success": true,
  "amount": 100,
  "balance": {
    "free": 100,
    "locked": 0,
    "total": 100
  },
  "nextRequestAt": "2026-01-16T09:09:19.899Z"
}
```

**Rate Limited Response (429):**
```json
{
  "error": "RATE_LIMITED",
  "message": "You can only request once every 24 hours",
  "nextRequestAt": "2026-01-16T09:09:19.899Z"
}
```

---

### Get Faucet Stats

Returns the user's faucet usage statistics.

**Request:**
```
GET /faucet/stats
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "totalRequests": 5,
  "totalAmountReceived": 500,
  "lastRequestAt": "2026-01-15T09:09:19.899Z",
  "nextRequestAt": "2026-01-16T09:09:19.899Z",
  "canRequest": false
}
```

---

### Get Faucet History

Returns the user's faucet request history.

**Request:**
```
GET /faucet/history?limit=50&offset=0
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "history": [
    {
      "amount": 100,
      "createdAt": "2026-01-15T09:09:19.899Z"
    }
  ],
  "limit": 50,
  "offset": 0
}
```

---

### Lock Balance

Move tokens from free to locked balance.

**Request:**
```
POST /faucet/lock
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 50,
  "reason": "Reserved for game entry"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "balance": {
    "free": 50,
    "locked": 50,
    "total": 100
  }
}
```

**Error Response (400):**
```json
{
  "error": "LOCK_FAILED",
  "message": "Insufficient free balance to lock"
}
```

---

### Unlock Balance

Move tokens from locked back to free balance.

**Request:**
```
POST /faucet/unlock
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 50,
  "reason": "Game completed - releasing funds"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "balance": {
    "free": 100,
    "locked": 0,
    "total": 100
  }
}
```

**Error Response (400):**
```json
{
  "error": "UNLOCK_FAILED",
  "message": "Insufficient locked balance to unlock"
}
```

---

### Get Global Stats (Public)

Returns global faucet statistics. No authentication required.

**Request:**
```
GET /faucet/global-stats
```

**Response (200):**
```json
{
  "totalRequests": 1250,
  "totalAmountDistributed": 125000,
  "uniqueUsers": 342
}
```

## Balance Operations

### Operation Types

| Type     | Description                              |
|----------|------------------------------------------|
| `credit` | Add tokens to free balance               |
| `debit`  | Remove tokens from free balance          |
| `lock`   | Move tokens from free to locked          |
| `unlock` | Move tokens from locked back to free     |

### Balance Flow

```
                    ┌─────────────┐
    Faucet ────────>│    FREE     │<──── Unlock
    Credit          │   Balance   │
                    └──────┬──────┘
                           │
                         Lock
                           │
                           v
                    ┌─────────────┐
                    │   LOCKED    │
                    │   Balance   │
                    └─────────────┘
```

## Rate Limiting

- **Cooldown Period**: 24 hours between requests
- **Per-User Limit**: Tracked by user ID in database
- **Concurrent Requests**: Multiple simultaneous requests are safely rejected
- **IP Tracking**: IP address logged for security auditing

## Error Codes

| Code          | HTTP Status | Description                          |
|---------------|-------------|--------------------------------------|
| `RATE_LIMITED`| 429         | Faucet cooldown not expired          |
| `LOCK_FAILED` | 400         | Insufficient free balance            |
| `UNLOCK_FAILED`| 400        | Insufficient locked balance          |
| `NOT_FOUND`   | 404         | User not found                       |
| `UNAUTHORIZED`| 401         | Missing or invalid auth token        |
