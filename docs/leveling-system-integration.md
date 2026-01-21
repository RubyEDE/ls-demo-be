# Leveling System Integration Guide

This guide explains how to integrate the leveling system into your application. The leveling system tracks user experience points (XP) and levels, with real-time WebSocket notifications.

## Table of Contents

- [Overview](#overview)
- [XP Progression](#xp-progression)
- [XP Rewards](#xp-rewards)
- [Service API](#service-api)
- [WebSocket Integration](#websocket-integration)
- [Integration Examples](#integration-examples)
- [REST API Endpoints](#rest-api-endpoints)

---

## Overview

The leveling system consists of:

1. **User Model Fields** - `level`, `experience`, `totalExperience` stored on user documents
2. **Leveling Service** - Core logic for XP calculations and level progression
3. **WebSocket Events** - Real-time notifications for XP gains and level ups

### User Model Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `level` | Number | 1 | Current level (1-100) |
| `experience` | Number | 0 | XP within current level |
| `totalExperience` | Number | 0 | Lifetime total XP earned |

---

## XP Progression

XP requirements use a polynomial curve formula:

```
XP_for_level = BASE_XP * (level ^ EXPONENT)
```

Where:
- `BASE_XP = 100`
- `EXPONENT = 1.5`
- `MAX_LEVEL = 100`

### XP Requirements Table

| Level | XP to Next Level | Total XP Required |
|-------|------------------|-------------------|
| 1 → 2 | 100 | 100 |
| 2 → 3 | 141 | 241 |
| 3 → 4 | 173 | 414 |
| 4 → 5 | 200 | 614 |
| 5 → 6 | 223 | 837 |
| 10 → 11 | 316 | 2,133 |
| 20 → 21 | 447 | 5,848 |
| 50 → 51 | 707 | 23,229 |
| 99 → 100 | 985 | 65,455 |

---

## XP Rewards

Default XP rewards for various actions:

```typescript
const XP_REWARDS = {
  // Trading actions
  TRADE_EXECUTED: 10,           // Daily trade bonus (once per day)
  POSITION_OPENED: 25,          // Opening a new position
  POSITION_CLOSED_PROFIT: 50,   // Closing with profit
  POSITION_CLOSED_LOSS: 15,     // Closing with loss
  HIGH_LEVERAGE_TRADE: 30,      // Using 10x+ leverage
  FIRST_TRADE_OF_DAY: 25,       // Daily bonus
  
  // Faucet actions
  FAUCET_CLAIM: 5,              // Per faucet claim
  
  // Referral actions
  REFERRAL_COMPLETE: 100,       // Referral completes first trade
  BEING_REFERRED: 50,           // Signup with referral code
  
  // Other
  ACHIEVEMENT_UNLOCKED: 25,     // Achievement bonus
  DAILY_LOGIN: 10,              // Daily login
  WEEKLY_ACTIVE: 75,            // 7-day streak bonus
};
```

### Daily Limits

Some XP rewards have daily limits to prevent abuse:

| Reward | Limit |
|--------|-------|
| `TRADE_EXECUTED` | Once per calendar day |

The `lastTradeXPAt` field on the user model tracks when the user last earned trade XP.

---

## Service API

### Import

```typescript
import {
  // Core functions
  addExperience,
  getUserLevelInfo,
  
  // Helper functions for specific actions
  awardTradeXP,
  awardPositionOpenedXP,
  awardPositionClosedXP,
  awardHighLeverageXP,
  awardFaucetXP,
  awardReferralXP,
  awardReferredBonusXP,
  awardAchievementXP,
  awardDailyLoginXP,
  
  // Utility functions
  getExperienceForLevel,
  getExperienceToNextLevel,
  getLevelFromExperience,
  getLevelLeaderboard,
  getUserLevelRank,
  getAllLevelThresholds,
  
  // Admin functions
  resetUserLevel,
  setUserExperience,
  
  // Types
  XP_REWARDS,
  LevelInfo,
  XPGainResult,
  LevelUpResult,
} from "../services/leveling.service";
```

### Core Functions

#### `addExperience(address, amount, reason?)`

Add XP to a user with automatic level-up handling.

```typescript
const result = await addExperience(
  "0x1234...5678",
  50,
  "position closed with profit"
);

// Result:
{
  experienceGained: 50,
  previousExperience: 75,
  currentExperience: 25,  // Rolled over after level up
  totalExperience: 225,
  levelUp: {
    previousLevel: 2,
    newLevel: 3,
    levelsGained: 1,
    experienceGained: 50,
    currentExperience: 25,
    totalExperience: 225,
  }
}
```

#### `getUserLevelInfo(address)`

Get detailed level information for a user.

```typescript
const info = await getUserLevelInfo("0x1234...5678");

// Result:
{
  level: 5,
  experience: 150,
  totalExperience: 764,
  experienceForNextLevel: 223,
  experienceToNextLevel: 73,
  progressPercentage: 67,
  isMaxLevel: false,
}
```

### Helper Functions

Convenience functions that award predefined XP amounts:

```typescript
// Award XP for trade execution (10 XP)
await awardTradeXP("0x1234...5678");

// Award XP for opening position (25 XP)
await awardPositionOpenedXP("0x1234...5678");

// Award XP for closing position (50 XP profit, 15 XP loss)
await awardPositionClosedXP("0x1234...5678", true);  // profit
await awardPositionClosedXP("0x1234...5678", false); // loss

// Award XP for high leverage trade (30 XP, only if leverage >= 10)
await awardHighLeverageXP("0x1234...5678", 15.5);

// Award XP for faucet claim (5 XP)
await awardFaucetXP("0x1234...5678");

// Award XP for referral completion (100 XP to referrer)
await awardReferralXP("0xReferrerAddress");

// Award XP for being referred (50 XP to new user)
await awardReferredBonusXP("0xNewUserAddress");

// Award XP for achievement unlock (25 XP)
await awardAchievementXP("0x1234...5678");

// Award daily login XP (10 XP)
await awardDailyLoginXP("0x1234...5678");
```

### Utility Functions

```typescript
// Get XP required to reach a level from level 1
const totalXP = getExperienceForLevel(10); // 2133

// Get XP required to go from level N to N+1
const xpNeeded = getExperienceToNextLevel(5); // 223

// Calculate level from total XP
const level = getLevelFromExperience(1500); // 8

// Get top players by level
const leaderboard = await getLevelLeaderboard(10);
// [{ address, level, totalExperience }, ...]

// Get user's rank on leaderboard
const rank = await getUserLevelRank("0x1234...5678"); // 42

// Get all level thresholds (for UI display)
const thresholds = getAllLevelThresholds();
// [{ level: 1, totalXpRequired: 0, xpForLevel: 0 }, ...]
```

---

## WebSocket Integration

### Event Types

#### `xp:gained`

Emitted whenever a user gains XP.

```typescript
interface XPGainedEvent {
  amount: number;              // XP gained
  reason: string;              // Why XP was awarded
  currentExperience: number;   // XP in current level
  totalExperience: number;     // Lifetime XP
  level: number;               // Current level
  experienceForNextLevel: number;
  progressPercentage: number;  // 0-100
  timestamp: number;
}
```

#### `xp:levelup`

Emitted when a user levels up (in addition to `xp:gained`).

```typescript
interface LevelUpEvent {
  previousLevel: number;
  newLevel: number;
  levelsGained: number;        // Usually 1, can be more
  currentExperience: number;
  totalExperience: number;
  experienceForNextLevel: number;
  timestamp: number;
}
```

### Client-Side Integration

```typescript
import { io } from "socket.io-client";

// Connect with authentication
const socket = io("ws://your-server.com", {
  auth: {
    token: "your-jwt-token"
  }
});

// Subscribe to XP events (requires authentication)
socket.emit("subscribe:xp");

// Handle subscription confirmation
socket.on("subscribed", (data) => {
  if (data.channel === "xp") {
    console.log("Subscribed to XP events");
  }
});

// Listen for XP gains
socket.on("xp:gained", (data) => {
  console.log(`+${data.amount} XP: ${data.reason}`);
  
  // Update UI progress bar
  updateProgressBar(data.progressPercentage);
  
  // Show XP popup/toast
  showXPToast(data.amount, data.reason);
});

// Listen for level ups
socket.on("xp:levelup", (data) => {
  console.log(`LEVEL UP! ${data.previousLevel} → ${data.newLevel}`);
  
  // Show level up celebration
  showLevelUpAnimation(data.newLevel);
  
  // Play sound effect
  playLevelUpSound();
});

// Unsubscribe when done
socket.emit("unsubscribe:xp");

// Handle errors
socket.on("error", (error) => {
  if (error.code === "UNAUTHORIZED") {
    console.error("Must be authenticated to subscribe to XP events");
  }
});
```

### React Hook Example

```typescript
import { useEffect, useState } from "react";
import { useSocket } from "./useSocket";

interface LevelInfo {
  level: number;
  experience: number;
  experienceForNextLevel: number;
  progressPercentage: number;
}

export function useLevelSystem() {
  const socket = useSocket();
  const [levelInfo, setLevelInfo] = useState<LevelInfo | null>(null);
  const [recentXP, setRecentXP] = useState<{ amount: number; reason: string } | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);

  useEffect(() => {
    if (!socket) return;

    socket.emit("subscribe:xp");

    socket.on("xp:gained", (data) => {
      setLevelInfo({
        level: data.level,
        experience: data.currentExperience,
        experienceForNextLevel: data.experienceForNextLevel,
        progressPercentage: data.progressPercentage,
      });
      
      setRecentXP({ amount: data.amount, reason: data.reason });
      
      // Clear after animation
      setTimeout(() => setRecentXP(null), 3000);
    });

    socket.on("xp:levelup", (data) => {
      setLevelUp(data.newLevel);
      
      // Clear after animation
      setTimeout(() => setLevelUp(null), 5000);
    });

    return () => {
      socket.emit("unsubscribe:xp");
      socket.off("xp:gained");
      socket.off("xp:levelup");
    };
  }, [socket]);

  return { levelInfo, recentXP, levelUp };
}
```

---

## Integration Examples

### Integrating with Trade Execution

```typescript
// In order.service.ts or trade handler
import { awardTradeXP } from "./leveling.service";

async function executeTrade(trade: Trade) {
  // ... existing trade logic ...
  
  // Award XP to both parties (skip synthetic/bot trades)
  if (!trade.makerIsSynthetic) {
    await awardTradeXP(trade.makerAddress);
  }
  if (!trade.takerIsSynthetic) {
    await awardTradeXP(trade.takerAddress);
  }
}
```

### Integrating with Position Service

```typescript
// In position.service.ts
import { 
  awardPositionOpenedXP, 
  awardPositionClosedXP,
  awardHighLeverageXP 
} from "./leveling.service";

async function openPosition(address: string, leverage: number) {
  // ... existing position logic ...
  
  // Award XP for opening position
  await awardPositionOpenedXP(address);
  
  // Award bonus XP for high leverage
  await awardHighLeverageXP(address, leverage);
}

async function closePosition(address: string, realizedPnl: number) {
  // ... existing close logic ...
  
  // Award XP based on outcome
  const isProfit = realizedPnl > 0;
  await awardPositionClosedXP(address, isProfit);
}
```

### Integrating with Faucet Service

```typescript
// In faucet.service.ts
import { awardFaucetXP } from "./leveling.service";

async function processFaucetClaim(address: string) {
  // ... existing faucet logic ...
  
  // Award XP for faucet claim
  await awardFaucetXP(address);
}
```

### Integrating with Achievement Service

```typescript
// In achievement.service.ts
import { awardAchievementXP } from "./leveling.service";

async function unlockAchievement(address: string, achievementId: string) {
  // ... existing achievement logic ...
  
  // Award bonus XP for unlocking achievement
  await awardAchievementXP(address);
}
```

### Integrating with Referral Service

```typescript
// In referral.service.ts
import { awardReferralXP, awardReferredBonusXP } from "./leveling.service";

async function completeReferral(referrerAddress: string, refereeAddress: string) {
  // ... existing referral logic ...
  
  // Award XP to referrer
  await awardReferralXP(referrerAddress);
  
  // Award bonus XP to new user
  await awardReferredBonusXP(refereeAddress);
}
```

---

## REST API Endpoints

Suggested endpoints to add to your routes:

### GET `/api/user/level`

Get current user's level info.

```typescript
// Response
{
  "level": 5,
  "experience": 150,
  "totalExperience": 764,
  "experienceForNextLevel": 223,
  "experienceToNextLevel": 73,
  "progressPercentage": 67,
  "isMaxLevel": false
}
```

### GET `/api/leaderboard/levels`

Get level leaderboard.

```typescript
// Response
{
  "leaderboard": [
    { "address": "0x...", "level": 42, "totalExperience": 15234 },
    { "address": "0x...", "level": 38, "totalExperience": 12456 },
    // ...
  ]
}
```

### GET `/api/user/level/rank`

Get current user's rank.

```typescript
// Response
{
  "rank": 156,
  "level": 12,
  "totalExperience": 3456
}
```

### Example Route Implementation

```typescript
// In routes/user.routes.ts
import { Router } from "express";
import { getUserLevelInfo, getLevelLeaderboard, getUserLevelRank } from "../services/leveling.service";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.get("/level", authMiddleware, async (req, res) => {
  try {
    const levelInfo = await getUserLevelInfo(req.user.address);
    if (!levelInfo) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(levelInfo);
  } catch (error) {
    res.status(500).json({ error: "Failed to get level info" });
  }
});

router.get("/level/rank", authMiddleware, async (req, res) => {
  try {
    const [levelInfo, rank] = await Promise.all([
      getUserLevelInfo(req.user.address),
      getUserLevelRank(req.user.address),
    ]);
    res.json({ ...levelInfo, rank });
  } catch (error) {
    res.status(500).json({ error: "Failed to get rank" });
  }
});

router.get("/leaderboard/levels", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const leaderboard = await getLevelLeaderboard(limit);
    res.json({ leaderboard });
  } catch (error) {
    res.status(500).json({ error: "Failed to get leaderboard" });
  }
});

export default router;
```

---

## Database Migration

Existing users will have default values:
- `level: 1`
- `experience: 0`
- `totalExperience: 0`

No migration script is needed as Mongoose applies defaults automatically. However, if you want to retroactively award XP based on historical activity, you can create a migration script:

```typescript
import { User } from "../models/user.model";
import { Trade } from "../models/trade.model";
import { setUserExperience, XP_REWARDS } from "../services/leveling.service";

async function migrateExistingUsers() {
  const users = await User.find({});
  
  for (const user of users) {
    // Count historical trades
    const tradeCount = await Trade.countDocuments({
      $or: [
        { makerAddress: user.address, makerIsSynthetic: false },
        { takerAddress: user.address, takerIsSynthetic: false },
      ],
    });
    
    // Calculate retroactive XP
    const retroXP = tradeCount * XP_REWARDS.TRADE_EXECUTED;
    
    if (retroXP > 0) {
      await setUserExperience(user.address, retroXP);
      console.log(`Migrated ${user.address}: ${retroXP} XP`);
    }
  }
}
```

---

## Summary

1. **Import the service** in files where you want to award XP
2. **Call helper functions** (`awardTradeXP`, `awardFaucetXP`, etc.) at appropriate points
3. **Subscribe to WebSocket events** on the frontend to show real-time XP updates
4. **Add REST endpoints** for fetching level info and leaderboards

The system is designed to be non-blocking - XP awards happen asynchronously and won't slow down your main transaction flows.
