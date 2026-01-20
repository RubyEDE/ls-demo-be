# Achievements API Integration Guide

This guide covers the API endpoints and data types for integrating the achievement system.

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/achievements` | GET | No | Get all available achievements |
| `/achievements/category/:category` | GET | No | Get achievements by category |
| `/achievements/me` | GET | Yes | Get user's achievements with progress (flat list) |
| `/achievements/me/grouped` | GET | Yes | **Get achievements grouped by progression (recommended)** |
| `/achievements/me/stats` | GET | Yes | Get user's achievement statistics |
| `/achievements/me/points` | GET | Yes | Get user's total points |
| `/achievements/leaderboard` | GET | No | Get achievement leaderboard |
| `/achievements/user/:address` | GET | No | Get a user's public achievement profile |

## Data Types

### Achievement

```typescript
interface Achievement {
  id: string;                    // Unique identifier (e.g., "faucet_first_claim")
  name: string;                  // Display name
  description: string;           // Description of how to unlock
  category: string;              // Category (e.g., "faucet", "trading")
  icon: string;                  // Icon identifier for UI
  points: number;                // XP/points value
  isProgression: boolean;        // Whether part of a progression chain
  progressionGroup?: string;     // Group ID for related achievements
  progressionOrder?: number;     // Order in progression chain
  requirement: {
    type: string;                // Requirement type (e.g., "faucet_claims")
    threshold: number;           // Number required to unlock
  };
}
```

### User Achievement (with progress)

```typescript
interface UserAchievementProgress {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  points: number;
  isProgression: boolean;
  progressionGroup?: string;
  progressionOrder?: number;
  requirement: {
    type: string;
    threshold: number;
  };
  isUnlocked: boolean;           // Whether user has unlocked this
  unlockedAt: string | null;     // ISO timestamp when unlocked
  currentProgress: number;       // Current progress toward threshold
  progressPercentage: number;    // 0-100 percentage complete
}
```

### Achievement Stats

```typescript
interface AchievementStats {
  totalUnlocked: number;         // Number of achievements unlocked
  totalAchievements: number;     // Total achievements available
  totalPoints: number;           // User's total points earned
  maxPoints: number;             // Maximum possible points
  completionPercentage: number;  // 0-100 completion percentage
}
```

### Newly Unlocked Achievement (from action responses)

```typescript
interface NewAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  points: number;
}
```

### Leaderboard Entry

```typescript
interface LeaderboardEntry {
  address: string;
  totalPoints: number;
  achievementCount: number;
}
```

### Grouped Progression (for `/me/grouped` endpoint)

```typescript
interface ProgressionStage {
  id: string;                    // Achievement ID for this stage
  name: string;                  // Stage name (e.g., "Regular Customer")
  description: string;           // Stage description
  icon: string;                  // Icon for this stage
  points: number;                // Points for this stage
  threshold: number;             // Threshold to unlock this stage
  order: number;                 // Stage order (1, 2, 3, 4...)
  isUnlocked: boolean;           // Whether user unlocked this stage
  unlockedAt: string | null;     // When unlocked
}

interface GroupedProgression {
  progressionGroup: string;      // Group identifier (e.g., "faucet_claims")
  category: string;              // Category (e.g., "faucet")
  currentProgress: number;       // User's current count
  maxThreshold: number;          // Highest threshold in progression
  totalPoints: number;           // Total points available in progression
  earnedPoints: number;          // Points user has earned
  currentStage: number;          // Current stage (0 = none, 1-4 = stage)
  totalStages: number;           // Total number of stages
  stages: ProgressionStage[];    // All stages with unlock status
}
```

## Current Achievements

### Faucet Achievements (Progression)

| ID | Name | Description | Threshold | Points |
|----|------|-------------|-----------|--------|
| `faucet_first_claim` | First Drops | Claim from the faucet for the first time | 1 | 10 |
| `faucet_5_claims` | Regular Customer | Claim from the faucet 5 times | 5 | 25 |
| `faucet_10_claims` | Thirsty Trader | Claim from the faucet 10 times | 10 | 50 |
| `faucet_30_claims` | Faucet Veteran | Claim from the faucet 30 times | 30 | 100 |

### Trading Achievements (Standalone)

| ID | Name | Description | Points |
|----|------|-------------|--------|
| `first_order` | First Trade | Place your first order | 15 |

### Referral Achievements (Progression)

| ID | Name | Description | Threshold | Points |
|----|------|-------------|-----------|--------|
| `referral_1` | First Friend | Refer your first friend | 1 | 20 |
| `referral_5` | Social Butterfly | Refer 5 friends | 5 | 50 |
| `referral_10` | Community Builder | Refer 10 friends | 10 | 100 |
| `referral_30` | Network King | Refer 30 friends | 30 | 200 |
| `referral_50` | Viral Marketer | Refer 50 friends | 50 | 350 |
| `referral_100` | Legendary Recruiter | Refer 100 friends | 100 | 500 |

## API Examples

### Get All Achievements (Public)

```
GET /achievements
```

Response:
```json
{
  "achievements": [
    {
      "id": "faucet_first_claim",
      "name": "First Drops",
      "description": "Claim from the faucet for the first time",
      "category": "faucet",
      "icon": "droplet",
      "points": 10,
      "isProgression": true,
      "progressionGroup": "faucet_claims",
      "progressionOrder": 1,
      "requirement": {
        "type": "faucet_claims",
        "threshold": 1
      }
    }
  ],
  "total": 4
}
```

### Get User's Achievements (Auth Required)

```
GET /achievements/me
Authorization: Bearer <token>
```

Response:
```json
{
  "achievements": [
    {
      "id": "faucet_first_claim",
      "name": "First Drops",
      "description": "Claim from the faucet for the first time",
      "category": "faucet",
      "icon": "droplet",
      "points": 10,
      "isProgression": true,
      "progressionGroup": "faucet_claims",
      "progressionOrder": 1,
      "requirement": {
        "type": "faucet_claims",
        "threshold": 1
      },
      "isUnlocked": true,
      "unlockedAt": "2026-01-19T12:00:00.000Z",
      "currentProgress": 3,
      "progressPercentage": 100
    },
    {
      "id": "faucet_5_claims",
      "name": "Regular Customer",
      "description": "Claim from the faucet 5 times",
      "category": "faucet",
      "icon": "droplets",
      "points": 25,
      "isProgression": true,
      "progressionGroup": "faucet_claims",
      "progressionOrder": 2,
      "requirement": {
        "type": "faucet_claims",
        "threshold": 5
      },
      "isUnlocked": false,
      "unlockedAt": null,
      "currentProgress": 3,
      "progressPercentage": 60
    }
  ]
}
```

### Get User's Achievements Grouped (Auth Required) - RECOMMENDED

Use this endpoint to display progression achievements as a single card with stages.

```
GET /achievements/me/grouped
Authorization: Bearer <token>
```

Response:
```json
{
  "progressions": [
    {
      "progressionGroup": "faucet_claims",
      "category": "faucet",
      "currentProgress": 7,
      "maxThreshold": 30,
      "totalPoints": 185,
      "earnedPoints": 35,
      "currentStage": 2,
      "totalStages": 4,
      "stages": [
        {
          "id": "faucet_first_claim",
          "name": "First Drops",
          "description": "Claim from the faucet for the first time",
          "icon": "droplet",
          "points": 10,
          "threshold": 1,
          "order": 1,
          "isUnlocked": true,
          "unlockedAt": "2026-01-15T10:00:00.000Z"
        },
        {
          "id": "faucet_5_claims",
          "name": "Regular Customer",
          "description": "Claim from the faucet 5 times",
          "icon": "droplets",
          "points": 25,
          "threshold": 5,
          "order": 2,
          "isUnlocked": true,
          "unlockedAt": "2026-01-19T12:00:00.000Z"
        },
        {
          "id": "faucet_10_claims",
          "name": "Thirsty Trader",
          "description": "Claim from the faucet 10 times",
          "icon": "glass-water",
          "points": 50,
          "threshold": 10,
          "order": 3,
          "isUnlocked": false,
          "unlockedAt": null
        },
        {
          "id": "faucet_30_claims",
          "name": "Faucet Veteran",
          "description": "Claim from the faucet 30 times",
          "icon": "trophy",
          "points": 100,
          "threshold": 30,
          "order": 4,
          "isUnlocked": false,
          "unlockedAt": null
        }
      ]
    }
  ],
  "standalone": []
}
```

**Display Example:**
```
┌─────────────────────────────────────────────────┐
│ 💧 Faucet Claims                    35/185 pts  │
│ ───────────────────────────────────────────────│
│ Progress: 7/30                                  │
│ ████████████████████░░░░░░░░░░░░░░░░░░░░  23%  │
│                                                 │
│ ✅ 1   ✅ 5   ⬜ 10   ⬜ 30                     │
│ Stage 2 of 4 complete                           │
└─────────────────────────────────────────────────┘
```

### Get User's Achievement Stats (Auth Required)

```
GET /achievements/me/stats
Authorization: Bearer <token>
```

Response:
```json
{
  "totalUnlocked": 1,
  "totalAchievements": 4,
  "totalPoints": 10,
  "maxPoints": 185,
  "completionPercentage": 25
}
```

### Get User's Total Points (Auth Required)

```
GET /achievements/me/points
Authorization: Bearer <token>
```

Response:
```json
{
  "totalPoints": 10
}
```

### Get Leaderboard (Public)

```
GET /achievements/leaderboard?limit=10
```

Response:
```json
{
  "leaderboard": [
    {
      "address": "0x1234...abcd",
      "totalPoints": 185,
      "achievementCount": 4
    },
    {
      "address": "0x5678...efgh",
      "totalPoints": 85,
      "achievementCount": 3
    }
  ],
  "total": 2
}
```

### Get User's Public Profile (Public)

```
GET /achievements/user/0x1234567890abcdef
```

Response:
```json
{
  "address": "0x1234567890abcdef",
  "achievements": [
    {
      "id": "faucet_first_claim",
      "name": "First Drops",
      "description": "Claim from the faucet for the first time",
      "category": "faucet",
      "icon": "droplet",
      "points": 10,
      "unlockedAt": "2026-01-19T12:00:00.000Z"
    }
  ],
  "stats": {
    "totalUnlocked": 1,
    "totalPoints": 10,
    "completionPercentage": 25
  }
}
```

### Get Achievements by Category (Public)

```
GET /achievements/category/faucet
```

Response:
```json
{
  "achievements": [
    {
      "id": "faucet_first_claim",
      "name": "First Drops",
      "description": "Claim from the faucet for the first time",
      "category": "faucet",
      "icon": "droplet",
      "points": 10,
      "isProgression": true,
      "progressionGroup": "faucet_claims",
      "progressionOrder": 1,
      "requirement": {
        "type": "faucet_claims",
        "threshold": 1
      }
    }
  ],
  "total": 4
}
```

## Achievement Unlocks from Actions

When performing actions that can unlock achievements, the response will include a `newAchievements` array if any were unlocked.

### Faucet Claim Response with Achievement

```
POST /faucet/request
Authorization: Bearer <token>
```

Response:
```json
{
  "success": true,
  "amount": 100,
  "balance": {
    "free": 100,
    "locked": 0,
    "total": 100
  },
  "nextRequestAt": "2026-01-20T12:00:00.000Z",
  "newAchievements": [
    {
      "id": "faucet_first_claim",
      "name": "First Drops",
      "description": "Claim from the faucet for the first time",
      "icon": "droplet",
      "points": 10
    }
  ]
}
```

### Order Placement Response with Achievement

```
POST /clob/orders
Authorization: Bearer <token>
Content-Type: application/json

{
  "marketSymbol": "AAPL-PERP",
  "side": "buy",
  "type": "limit",
  "price": 150,
  "quantity": 1
}
```

Response (first order):
```json
{
  "order": {
    "orderId": "ORD-xxx",
    "marketSymbol": "AAPL-PERP",
    "side": "buy",
    "type": "limit",
    "price": 150,
    "quantity": 1,
    "filledQuantity": 0,
    "remainingQuantity": 1,
    "averagePrice": 0,
    "status": "open",
    "createdAt": "2026-01-19T12:00:00.000Z"
  },
  "trades": [],
  "newAchievements": [
    {
      "id": "first_order",
      "name": "First Trade",
      "description": "Place your first order",
      "icon": "shopping-cart",
      "points": 15
    }
  ]
}
```

**Note**: `newAchievements` is only present when achievements are unlocked. Check for its existence before processing.

## Icon Mapping

The `icon` field contains a string identifier. Suggested icon mappings:

| Icon ID | Description |
|---------|-------------|
| `droplet` | Single water drop |
| `droplets` | Multiple water drops |
| `glass-water` | Glass of water |
| `trophy` | Trophy/cup |
| `shopping-cart` | Shopping cart (trading) |
| `user-plus` | User with plus (referral) |
| `users` | Multiple users |
| `users-round` | Round users icon |
| `crown` | Crown |
| `megaphone` | Megaphone |
| `star` | Star |

## Sync Achievements

If a user has existing progress but is missing achievements (e.g., after new achievements are added), use the sync endpoint:

### POST /achievements/sync

**Requires Authentication**

Syncs achievements based on current stats (faucet claims, referrals, etc.). This retroactively awards any missing achievements.

```json
// Response
{
  "synced": true,
  "newAchievements": [
    {
      "id": "referral_1",
      "name": "First Referral",
      "description": "Refer your first user",
      "icon": "user-plus",
      "points": 20
    }
  ],
  "stats": {
    "totalUnlocked": 2,
    "totalAchievements": 11,
    "totalPoints": 30,
    "maxPoints": 470,
    "completionPercentage": 18.18
  }
}
```

## Integration Notes

1. **Check for new achievements** after any action that may unlock them (faucet claims, trades, etc.)
2. **Invalidate/refetch** achievement data after unlocks to update progress
3. **Public endpoints** don't require authentication and can be cached
4. **Progression achievements** share a `progressionGroup` and should be displayed together
5. **Sort by `progressionOrder`** when displaying progression chains
6. **Call sync endpoint** on app load or after updates to catch any missing achievements