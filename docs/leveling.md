# Leveling System

User leveling system with XP tracking, level progression, and real-time WebSocket notifications.

## Overview

Users earn experience points (XP) for various actions. XP accumulates to increase their level (max level 100).

### User Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `level` | Number | 1 | Current level (1-100) |
| `experience` | Number | 0 | XP within current level |
| `totalExperience` | Number | 0 | Lifetime total XP |
| `lastTradeXPAt` | Date | null | Daily trade XP limiter |

---

## REST API Endpoints

Base URL:
- **Production:** `https://api.longsword.io`
- **Development:** `http://localhost:3000`

### Get User Level (Auth Required)

```http
GET /user/level
Authorization: Bearer <token>
```

**Response:**
```json
{
  "level": 2,
  "experience": 15,
  "totalExperience": 115,
  "experienceForNextLevel": 141,
  "experienceToNextLevel": 126,
  "progressPercentage": 10,
  "isMaxLevel": false
}
```

### Get User Level + Rank (Auth Required)

```http
GET /user/level/rank
Authorization: Bearer <token>
```

**Response:**
```json
{
  "level": 2,
  "experience": 15,
  "totalExperience": 115,
  "experienceForNextLevel": 141,
  "experienceToNextLevel": 126,
  "progressPercentage": 10,
  "isMaxLevel": false,
  "rank": 5
}
```

### Get XP Thresholds (Public)

```http
GET /user/level/thresholds
```

**Response:**
```json
{
  "thresholds": [
    { "level": 1, "totalXpRequired": 0, "xpForLevel": 0 },
    { "level": 2, "totalXpRequired": 100, "xpForLevel": 100 },
    { "level": 3, "totalXpRequired": 241, "xpForLevel": 141 },
    ...
  ]
}
```

### Get Level Leaderboard (Public)

```http
GET /user/leaderboard/levels?limit=10
```

**Response:**
```json
{
  "leaderboard": [
    { "address": "0x1234...", "level": 5, "totalExperience": 650 },
    { "address": "0x5678...", "level": 3, "totalExperience": 280 }
  ]
}
```

### Get Any User's Level (Public)

```http
GET /user/:address/level
```

**Response:**
```json
{
  "level": 2,
  "experience": 15,
  "totalExperience": 115,
  "experienceForNextLevel": 141,
  "experienceToNextLevel": 126,
  "progressPercentage": 10,
  "isMaxLevel": false
}
```

---

## XP Rewards

| Action | XP | Limit |
|--------|-----|-------|
| Trade executed | 10 | Once per day |
| Faucet claim | 5 | Once per 24h (faucet cooldown) |
| Achievement unlocked | = points | Per achievement |
| Position opened | 25 | - |
| Position closed (profit) | 50 | - |
| Position closed (loss) | 15 | - |
| High leverage trade (10x+) | 30 | - |
| Referral completed | 100 | - |
| Being referred | 50 | - |
| Daily login | 10 | - |

### Currently Integrated

- **Trade execution** - Awards 10 XP for first trade of the day
- **Faucet claim** - Awards 5 XP per claim
- **Achievement unlocked** - Awards XP equal to the achievement's point value

---

## XP Progression Formula

```
XP_to_next_level = 100 * (level ^ 1.5)
```

| Level | XP to Next | Total XP |
|-------|------------|----------|
| 1 → 2 | 100 | 100 |
| 2 → 3 | 141 | 241 |
| 5 → 6 | 223 | 837 |
| 10 → 11 | 316 | 2,133 |
| 25 → 26 | 500 | 7,351 |
| 50 → 51 | 707 | 23,229 |
| 100 | MAX | 65,455 |

---

## WebSocket Events

### Subscribe to XP Events

```javascript
// Requires authentication
socket.emit("subscribe:xp");
```

### Events

#### `xp:gained`

Emitted when user gains XP.

```json
{
  "amount": 10,
  "reason": "daily trade bonus",
  "currentExperience": 25,
  "totalExperience": 125,
  "level": 2,
  "experienceForNextLevel": 141,
  "progressPercentage": 17,
  "timestamp": 1706000000000
}
```

#### `xp:levelup`

Emitted when user levels up.

```json
{
  "previousLevel": 1,
  "newLevel": 2,
  "levelsGained": 1,
  "currentExperience": 15,
  "totalExperience": 115,
  "experienceForNextLevel": 141,
  "timestamp": 1706000000000
}
```

### Client Example

```javascript
// Production: 'wss://api.longsword.io'
const socket = io("ws://localhost:3000", {
  auth: { token: "your-jwt-token" }
});

socket.emit("subscribe:xp");

socket.on("xp:gained", (data) => {
  console.log(`+${data.amount} XP (${data.reason})`);
  // Update progress bar: data.progressPercentage
});

socket.on("xp:levelup", (data) => {
  console.log(`Level up! ${data.previousLevel} → ${data.newLevel}`);
  // Show celebration animation
});
```

---

## Service API

### Award XP

```typescript
import { 
  awardTradeXP,
  awardFaucetXP,
  awardPositionOpenedXP,
  awardPositionClosedXP,
  addExperience 
} from "./services/leveling.service";

// Daily trade XP (10 XP, once per day)
await awardTradeXP(address);

// Faucet claim XP (5 XP)
await awardFaucetXP(address);

// Custom XP amount
await addExperience(address, 50, "custom reason");
```

### Query Level Info

```typescript
import { 
  getUserLevelInfo, 
  getLevelLeaderboard,
  getUserLevelRank 
} from "./services/leveling.service";

const info = await getUserLevelInfo(address);
// { level, experience, totalExperience, progressPercentage, ... }

const leaderboard = await getLevelLeaderboard(10);
// [{ address, level, totalExperience }, ...]

const rank = await getUserLevelRank(address);
// 42
```

---

## Talent Tree

Users can spend talent points to unlock permanent bonuses. Each level after level 1 grants 1 talent point.

### Talent Points

| Level | Total Points |
|-------|--------------|
| 1 | 0 |
| 2 | 1 |
| 3 | 2 |
| 4 | 3 |
| ... | level - 1 |

### Faucet Talent Tree

The faucet talents form a linear progression - each tier must be maxed before the next unlocks.

| Tier | Talent | Max Points | Effect | Unlock Requirement |
|------|--------|------------|--------|-------------------|
| 1 | **Faucet Fortune** | 3 | +50% faucet amount per point | None |
| 2 | **Quick Refresh** | 2 | -30% faucet cooldown per point | 3 points in Tier 1 |
| 3 | **Double Dip** | 1 | Claim twice per cooldown | 2 points in Tier 2 |

#### Example Progression

| Points Spent | Bonuses |
|--------------|---------|
| 3 in Faucet Fortune | 250 credits (+150%), 24h cooldown, 1 claim |
| +2 in Quick Refresh | 250 credits, 9.6h cooldown (-60%), 1 claim |
| +1 in Double Dip | 250 credits, 9.6h cooldown, 2 claims per cooldown |

**Full tree (6 points = Level 7):** 250 credits, 9.6h cooldown, 2 claims = **500 credits per 9.6h**

### Leverage Talent Tree

The leverage talents also form a linear progression - max each tier to unlock the next.

| Tier | Talent | Max Points | Effect | Unlock Requirement |
|------|--------|------------|--------|-------------------|
| 1 | **Risk Taker** | 4 | +1 max leverage per point | None |
| 2 | **High Roller** | 1 | +6 max leverage | 4 points in Tier 1 |
| 3 | **Second Chance** | 1 | Save one position from liquidation per day | 1 point in Tier 2 |

#### Example Progression

| Points Spent | Bonuses |
|--------------|---------|
| 4 in Risk Taker | 14x max leverage (base 10x + 4) |
| +1 in High Roller | 20x max leverage (10x + 4 + 6) |
| +1 in Second Chance | 20x leverage + daily liquidation save |

**Full tree (6 points = Level 7):** 20x leverage, liquidation save once per day

#### Liquidation Save Mechanic

When a position would be liquidated and the user has the "Second Chance" talent:
- Position size is reduced by 50% instead of full liquidation
- Margin is also reduced by 50%
- Liquidation price is recalculated
- Can only be used **once per day** (resets at UTC midnight)
- Gives the user a chance to manage the position before full liquidation

---

## Talent API Endpoints

### Get Talent Tree (Auth Required)

```http
GET /user/talents
Authorization: Bearer <token>
```

**Response:**
```json
{
  "faucetTree": [
    {
      "id": "faucetAmountBoost",
      "name": "Faucet Fortune",
      "description": "Increase the amount received from the faucet by 50% per point",
      "maxPoints": 3,
      "currentPoints": 3,
      "tier": 1,
      "tree": "faucet",
      "isUnlocked": true,
      "requires": null,
      "requiresPoints": 0,
      "prerequisiteMet": true
    },
    {
      "id": "faucetCooldownReduction",
      "name": "Quick Refresh",
      "maxPoints": 2,
      "currentPoints": 0,
      "tier": 2,
      "tree": "faucet",
      "isUnlocked": true,
      "requires": "faucetAmountBoost",
      "requiresPoints": 3,
      "prerequisiteMet": true
    },
    {
      "id": "faucetDoubleClaim",
      "name": "Double Dip",
      "maxPoints": 1,
      "currentPoints": 0,
      "tier": 3,
      "tree": "faucet",
      "isUnlocked": false,
      "requires": "faucetCooldownReduction",
      "requiresPoints": 2,
      "prerequisiteMet": false
    }
  ],
  "leverageTree": [
    {
      "id": "leverageBoostSmall",
      "name": "Risk Taker",
      "description": "Increase maximum leverage by 1 per point",
      "maxPoints": 4,
      "currentPoints": 2,
      "tier": 1,
      "tree": "leverage",
      "isUnlocked": true,
      "requires": null,
      "requiresPoints": 0,
      "prerequisiteMet": true
    },
    {
      "id": "leverageBoostLarge",
      "name": "High Roller",
      "description": "Increase maximum leverage by 6",
      "maxPoints": 1,
      "currentPoints": 0,
      "tier": 2,
      "tree": "leverage",
      "isUnlocked": false,
      "requires": "leverageBoostSmall",
      "requiresPoints": 4,
      "prerequisiteMet": false
    },
    {
      "id": "liquidationSave",
      "name": "Second Chance",
      "description": "Save one position from liquidation per day",
      "maxPoints": 1,
      "currentPoints": 0,
      "tier": 3,
      "tree": "leverage",
      "isUnlocked": false,
      "requires": "leverageBoostLarge",
      "requiresPoints": 1,
      "prerequisiteMet": false
    }
  ],
  "totalPointsSpent": 5,
  "availablePoints": 3,
  "userLevel": 9
}
```

### Get Talent Config (Public)

```http
GET /user/talents/config
```

**Response:**
```json
{
  "talents": [
    {
      "id": "faucetAmountBoost",
      "name": "Faucet Fortune",
      "description": "Increase the amount received from the faucet by 50% per point",
      "maxPoints": 3,
      "tier": 1,
      "requires": null,
      "requiresPoints": 0,
      "bonusPerPoint": 0.5
    },
    ...
  ]
}
```

### Allocate Talent Point (Auth Required)

```http
POST /user/talents/allocate
Authorization: Bearer <token>
Content-Type: application/json

{
  "talentId": "faucetAmountBoost"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Point allocated to Faucet Fortune",
  "talentTree": { ... }
}
```

**Error Response (locked talent):**
```json
{
  "error": "ALLOCATION_FAILED",
  "message": "Talent locked. Requires 3 points in Faucet Fortune"
}
```

### Reset Talents (Auth Required)

```http
POST /user/talents/reset
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "All talent points have been reset",
  "talentTree": { ... }
}
```

### Get Active Bonuses (Auth Required)

```http
GET /user/talents/bonuses
Authorization: Bearer <token>
```

**Response:**
```json
{
  "faucet": {
    "amountMultiplier": 2.5,
    "amountBonus": "+150%",
    "cooldownMultiplier": 0.4,
    "cooldownReduction": "-60%",
    "claimsPerCooldown": 2
  },
  "leverage": {
    "maxLeverageBonus": 10,
    "maxLeverageBonusDisplay": "+10x",
    "hasLiquidationSave": true,
    "liquidationSaveAvailable": true,
    "lastLiquidationSaveAt": null
  }
}
```

---

## Faucet Stats with Bonuses

The faucet stats endpoint now includes talent bonuses:

```http
GET /faucet/stats
Authorization: Bearer <token>
```

**Response:**
```json
{
  "totalRequests": 5,
  "totalAmountReceived": 1000,
  "lastRequestAt": "2024-01-22T12:00:00.000Z",
  "nextRequestAt": "2024-01-22T21:36:00.000Z",
  "canRequest": false,
  "claimsRemaining": 1,
  "nextClaimAmount": 250,
  "cooldownHours": 9.6,
  "bonuses": {
    "amountMultiplier": 2.5,
    "cooldownMultiplier": 0.4,
    "claimsPerCooldown": 2
  }
}
```

---

## Service API (Talents)

### Get User Bonuses

```typescript
import { 
  getFaucetBonuses,
  getLeverageBonuses,
  getTalentTreeInfo,
  allocateTalentPoint,
  getEffectiveMaxLeverage,
  canUseLiquidationSave,
  useLiquidationSave
} from "./services/talent.service";

// Get faucet bonuses for a user
const faucetBonuses = await getFaucetBonuses(userId);
// { amountMultiplier: 2.5, cooldownMultiplier: 0.4, claimsPerCooldown: 2 }

// Get leverage bonuses for a user
const leverageBonuses = await getLeverageBonuses(userId);
// { maxLeverageBonus: 10, hasLiquidationSave: true, liquidationSaveAvailable: true, ... }

// Get effective max leverage (base 10x + talent bonus)
const maxLeverage = await getEffectiveMaxLeverage(userId, 10);
// 20 (if user has full leverage tree)

// Get full talent tree info
const tree = await getTalentTreeInfo(userId, address);
// { faucetTree: [...], leverageTree: [...], totalPointsSpent, availablePoints, userLevel }

// Allocate a point
const result = await allocateTalentPoint(userId, address, "leverageBoostSmall");
// { success: true, talents: {...}, newPointsSpent: 3 }

// Check if liquidation save can be used
const canSave = await canUseLiquidationSave(userId);
// true if has talent AND hasn't used it today

// Use liquidation save (called by liquidation engine)
const saveResult = await useLiquidationSave(userId);
// { success: true } or { success: false, error: "..." }
```

---

## Files

| File | Description |
|------|-------------|
| `src/models/user.model.ts` | User schema with level fields |
| `src/models/talent.model.ts` | User talents schema |
| `src/services/leveling.service.ts` | Core leveling logic |
| `src/services/talent.service.ts` | Talent tree logic and bonuses |
| `src/routes/leveling.routes.ts` | REST API endpoints (levels + talents) |
| `src/services/websocket.service.ts` | WebSocket XP events |
| `src/services/faucet.service.ts` | Faucet with talent bonuses |
| `src/services/order.service.ts` | Order placement with leverage bonuses |
| `src/services/liquidation.service.ts` | Liquidation with save mechanic |

## Related Documentation

- [Talent Tree Frontend Integration](./talent-tree-integration.md) - React/TypeScript integration guide
