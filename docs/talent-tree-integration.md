# Talent Tree Frontend Integration

Guide for integrating the talent tree system into a frontend application.

## TypeScript Types

```typescript
// Talent IDs
type FaucetTalentId = "faucetAmountBoost" | "faucetCooldownReduction" | "faucetDoubleClaim";
type LeverageTalentId = "leverageBoostSmall" | "leverageBoostLarge" | "liquidationSave";
type TalentId = FaucetTalentId | LeverageTalentId;

// Single talent info
interface TalentInfo {
  id: TalentId;
  name: string;
  description: string;
  maxPoints: number;
  currentPoints: number;
  tier: number;
  tree: "faucet" | "leverage";
  isUnlocked: boolean;
  requires: TalentId | null;
  requiresPoints: number;
  prerequisiteMet: boolean;
}

// Full talent tree response
interface TalentTreeResponse {
  faucetTree: TalentInfo[];
  leverageTree: TalentInfo[];
  totalPointsSpent: number;
  availablePoints: number;
  userLevel: number;
}

// Talent config (public endpoint)
interface TalentConfig {
  id: string;
  name: string;
  description: string;
  maxPoints: number;
  tier: number;
  tree: string;
  requires: string | null;
  requiresPoints: number;
  bonusPerPoint: number | null;
}

interface TalentConfigResponse {
  talents: TalentConfig[];
}

// Achievement unlock info
interface AchievementUnlock {
  id: string;
  name: string;
  description: string;
  icon: string;
  points: number;
}

// Allocate talent response
interface AllocateTalentResponse {
  success: boolean;
  message: string;
  talentTree: TalentTreeResponse;
  newAchievements?: AchievementUnlock[];
}

// Reset talents response
interface ResetTalentsResponse {
  success: boolean;
  message: string;
  talentTree: TalentTreeResponse;
}

// Bonuses response
interface TalentBonusesResponse {
  faucet: {
    amountMultiplier: number;
    amountBonus: string;
    cooldownMultiplier: number;
    cooldownReduction: string;
    claimsPerCooldown: number;
  };
  leverage: {
    maxLeverageBonus: number;
    maxLeverageBonusDisplay: string;
    hasLiquidationSave: boolean;
    liquidationSaveAvailable: boolean;
    lastLiquidationSaveAt: string | null;
  };
}

// Error response
interface ErrorResponse {
  error: string;
  message: string;
}
```

---

## API Endpoints

Base URL: 
- **Production:** `https://api.longsword.io`
- **Development:** `http://localhost:3000`

### Get User's Talent Tree (Auth Required)

```typescript
async function getTalentTree(token: string): Promise<TalentTreeResponse> {
  const response = await fetch("/user/talents", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  
  if (!response.ok) {
    const error: ErrorResponse = await response.json();
    throw new Error(error.message);
  }
  
  return response.json();
}
```

### Get Talent Configuration (Public)

```typescript
async function getTalentConfig(): Promise<TalentConfigResponse> {
  const response = await fetch("/user/talents/config");
  return response.json();
}
```

### Allocate a Talent Point (Auth Required)

```typescript
async function allocateTalentPoint(
  token: string,
  talentId: TalentId
): Promise<AllocateTalentResponse> {
  const response = await fetch("/user/talents/allocate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ talentId }),
  });
  
  if (!response.ok) {
    const error: ErrorResponse = await response.json();
    throw new Error(error.message);
  }
  
  return response.json();
}
```

### Reset All Talents (Auth Required)

```typescript
async function resetTalents(token: string): Promise<ResetTalentsResponse> {
  const response = await fetch("/user/talents/reset", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  
  if (!response.ok) {
    const error: ErrorResponse = await response.json();
    throw new Error(error.message);
  }
  
  return response.json();
}
```

### Get Active Bonuses (Auth Required)

```typescript
async function getTalentBonuses(token: string): Promise<TalentBonusesResponse> {
  const response = await fetch("/user/talents/bonuses", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  
  if (!response.ok) {
    const error: ErrorResponse = await response.json();
    throw new Error(error.message);
  }
  
  return response.json();
}
```

---

## React Query Examples

### Setup

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Production: 'https://api.longsword.io'
const API_BASE = "http://localhost:3000";

// Helper to get auth token (implement based on your auth setup)
function useAuthToken(): string | null {
  // Return JWT token from your auth context/store
  return localStorage.getItem("token");
}
```

### useTalentTree Hook

```typescript
function useTalentTree() {
  const token = useAuthToken();
  
  return useQuery({
    queryKey: ["talents"],
    queryFn: async (): Promise<TalentTreeResponse> => {
      const res = await fetch(`${API_BASE}/user/talents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch talents");
      return res.json();
    },
    enabled: !!token,
  });
}
```

### useTalentBonuses Hook

```typescript
function useTalentBonuses() {
  const token = useAuthToken();
  
  return useQuery({
    queryKey: ["talents", "bonuses"],
    queryFn: async (): Promise<TalentBonusesResponse> => {
      const res = await fetch(`${API_BASE}/user/talents/bonuses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch bonuses");
      return res.json();
    },
    enabled: !!token,
  });
}
```

### useAllocateTalent Hook

```typescript
function useAllocateTalent() {
  const token = useAuthToken();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (talentId: TalentId): Promise<AllocateTalentResponse> => {
      const res = await fetch(`${API_BASE}/user/talents/allocate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ talentId }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message);
      }
      
      return res.json();
    },
    onSuccess: (data) => {
      // Invalidate talent queries to refetch
      queryClient.invalidateQueries({ queryKey: ["talents"] });
      // Also invalidate faucet stats if faucet bonuses changed
      queryClient.invalidateQueries({ queryKey: ["faucet"] });
      // Invalidate achievements if new ones were unlocked
      if (data.newAchievements?.length) {
        queryClient.invalidateQueries({ queryKey: ["achievements"] });
      }
    },
  });
}
```

### useResetTalents Hook

```typescript
function useResetTalents() {
  const token = useAuthToken();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (): Promise<ResetTalentsResponse> => {
      const res = await fetch(`${API_BASE}/user/talents/reset`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message);
      }
      
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["talents"] });
      queryClient.invalidateQueries({ queryKey: ["faucet"] });
    },
  });
}
```

---

## Usage Examples

### Basic Talent Tree Component

```typescript
function TalentTreePage() {
  const { data: talentTree, isLoading, error } = useTalentTree();
  const allocateMutation = useAllocateTalent();
  const resetMutation = useResetTalents();
  
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!talentTree) return null;
  
  const handleAllocate = (talentId: TalentId) => {
    allocateMutation.mutate(talentId, {
      onSuccess: (data) => {
        // Show achievement toast if new achievements were unlocked
        if (data.newAchievements?.length) {
          data.newAchievements.forEach((achievement) => {
            toast.success(`Achievement Unlocked: ${achievement.name}! (+${achievement.points} points)`);
          });
        }
      },
      onError: (err) => alert(err.message),
    });
  };
  
  const handleReset = () => {
    if (confirm("Reset all talents?")) {
      resetMutation.mutate();
    }
  };
  
  return (
    <div>
      <h1>Talent Tree</h1>
      <p>Level: {talentTree.userLevel}</p>
      <p>Available Points: {talentTree.availablePoints}</p>
      <p>Points Spent: {talentTree.totalPointsSpent}</p>
      
      <h2>Faucet Tree</h2>
      {talentTree.faucetTree.map((talent) => (
        <TalentNode
          key={talent.id}
          talent={talent}
          canAllocate={talentTree.availablePoints > 0 && talent.isUnlocked && talent.currentPoints < talent.maxPoints}
          onAllocate={() => handleAllocate(talent.id)}
          isAllocating={allocateMutation.isPending}
        />
      ))}
      
      <h2>Leverage Tree</h2>
      {talentTree.leverageTree.map((talent) => (
        <TalentNode
          key={talent.id}
          talent={talent}
          canAllocate={talentTree.availablePoints > 0 && talent.isUnlocked && talent.currentPoints < talent.maxPoints}
          onAllocate={() => handleAllocate(talent.id)}
          isAllocating={allocateMutation.isPending}
        />
      ))}
      
      <button onClick={handleReset} disabled={resetMutation.isPending}>
        Reset All Talents
      </button>
    </div>
  );
}

function TalentNode({
  talent,
  canAllocate,
  onAllocate,
  isAllocating,
}: {
  talent: TalentInfo;
  canAllocate: boolean;
  onAllocate: () => void;
  isAllocating: boolean;
}) {
  return (
    <div style={{ opacity: talent.isUnlocked ? 1 : 0.5, margin: "10px 0" }}>
      <strong>{talent.name}</strong> ({talent.currentPoints}/{talent.maxPoints})
      <p>{talent.description}</p>
      {!talent.isUnlocked && talent.requires && (
        <p style={{ color: "red" }}>
          Requires {talent.requiresPoints} points in previous talent
        </p>
      )}
      <button onClick={onAllocate} disabled={!canAllocate || isAllocating}>
        {isAllocating ? "..." : "+1 Point"}
      </button>
    </div>
  );
}
```

### Display Active Bonuses

```typescript
function BonusesDisplay() {
  const { data: bonuses, isLoading } = useTalentBonuses();
  
  if (isLoading || !bonuses) return null;
  
  return (
    <div>
      <h3>Active Bonuses</h3>
      
      <div>
        <h4>Faucet</h4>
        <ul>
          <li>Amount: {bonuses.faucet.amountBonus}</li>
          <li>Cooldown: {bonuses.faucet.cooldownReduction}</li>
          <li>Claims per cooldown: {bonuses.faucet.claimsPerCooldown}</li>
        </ul>
      </div>
      
      <div>
        <h4>Leverage</h4>
        <ul>
          <li>Max leverage bonus: {bonuses.leverage.maxLeverageBonusDisplay}</li>
          <li>Liquidation save: {bonuses.leverage.hasLiquidationSave ? "Yes" : "No"}</li>
          {bonuses.leverage.hasLiquidationSave && (
            <li>
              Save available today: {bonuses.leverage.liquidationSaveAvailable ? "Yes" : "No"}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
```

### Use Bonuses When Displaying Faucet Info

```typescript
function FaucetCard() {
  const token = useAuthToken();
  const { data: bonuses } = useTalentBonuses();
  
  const { data: faucetStats } = useQuery({
    queryKey: ["faucet", "stats"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/faucet/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },
    enabled: !!token,
  });
  
  if (!faucetStats) return null;
  
  return (
    <div>
      <h3>Faucet</h3>
      <p>Next claim: {faucetStats.nextClaimAmount} credits</p>
      <p>Cooldown: {faucetStats.cooldownHours.toFixed(1)} hours</p>
      <p>Claims remaining: {faucetStats.claimsRemaining}</p>
      <p>Can claim: {faucetStats.canRequest ? "Yes" : "No"}</p>
      {!faucetStats.canRequest && faucetStats.nextRequestAt && (
        <p>Next claim at: {new Date(faucetStats.nextRequestAt).toLocaleString()}</p>
      )}
    </div>
  );
}
```

### Use Max Leverage Bonus in Order Form

```typescript
function OrderForm({ marketSymbol, baseMaxLeverage }: { marketSymbol: string; baseMaxLeverage: number }) {
  const { data: bonuses } = useTalentBonuses();
  const [leverage, setLeverage] = useState(baseMaxLeverage);
  
  // Calculate effective max leverage with talent bonus
  const effectiveMaxLeverage = baseMaxLeverage + (bonuses?.leverage.maxLeverageBonus ?? 0);
  
  return (
    <div>
      <label>
        Leverage: {leverage}x
        <input
          type="range"
          min={1}
          max={effectiveMaxLeverage}
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
        />
      </label>
      <p>
        Max: {effectiveMaxLeverage}x 
        {bonuses?.leverage.maxLeverageBonus ? ` (${baseMaxLeverage}x base + ${bonuses.leverage.maxLeverageBonus}x bonus)` : ""}
      </p>
      {/* rest of order form */}
    </div>
  );
}
```

---

## Talent Tree Structure Reference

### Faucet Tree (6 points total)

| Tier | ID | Name | Max | Effect |
|------|-----|------|-----|--------|
| 1 | `faucetAmountBoost` | Faucet Fortune | 3 | +50% amount per point |
| 2 | `faucetCooldownReduction` | Quick Refresh | 2 | -30% cooldown per point |
| 3 | `faucetDoubleClaim` | Double Dip | 1 | 2 claims per cooldown |

### Leverage Tree (6 points total)

| Tier | ID | Name | Max | Effect |
|------|-----|------|-----|--------|
| 1 | `leverageBoostSmall` | Risk Taker | 4 | +1 max leverage per point |
| 2 | `leverageBoostLarge` | High Roller | 1 | +6 max leverage |
| 3 | `liquidationSave` | Second Chance | 1 | Save from liquidation 1x/day |

---

## Talent Achievements

Achievements are automatically checked when allocating talent points. The response includes any newly unlocked achievements.

| Achievement | Threshold | Points |
|-------------|-----------|--------|
| First Talent | 1 point spent | 15 |
| Budding Potential | 3 points spent | 30 |
| Growing Power | 5 points spent | 50 |
| Talent Master | 10 points spent | 100 |

**Total:** 195 achievement points available from talent tree

---

## Error Handling

Common error responses:

```typescript
// Not authenticated
{ "error": "UNAUTHORIZED", "message": "Not authenticated" }

// User not found
{ "error": "NOT_FOUND", "message": "User not found" }

// No available points
{ "error": "ALLOCATION_FAILED", "message": "No talent points available. You have 5 total points and have spent 5" }

// Talent locked
{ "error": "ALLOCATION_FAILED", "message": "Talent locked. Requires 3 points in Faucet Fortune" }

// Talent maxed
{ "error": "ALLOCATION_FAILED", "message": "Talent already at maximum (3 points)" }

// Invalid talent ID
{ "error": "INVALID_TALENT", "message": "Invalid talent ID" }
```

---

## Optimistic Updates (Optional)

For smoother UX, you can implement optimistic updates:

```typescript
function useAllocateTalentOptimistic() {
  const token = useAuthToken();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (talentId: TalentId) => {
      const res = await fetch(`${API_BASE}/user/talents/allocate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ talentId }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message);
      }
      
      return res.json();
    },
    
    // Optimistically update the cache
    onMutate: async (talentId) => {
      await queryClient.cancelQueries({ queryKey: ["talents"] });
      
      const previous = queryClient.getQueryData<TalentTreeResponse>(["talents"]);
      
      if (previous) {
        queryClient.setQueryData<TalentTreeResponse>(["talents"], {
          ...previous,
          availablePoints: previous.availablePoints - 1,
          totalPointsSpent: previous.totalPointsSpent + 1,
          faucetTree: previous.faucetTree.map((t) =>
            t.id === talentId ? { ...t, currentPoints: t.currentPoints + 1 } : t
          ),
          leverageTree: previous.leverageTree.map((t) =>
            t.id === talentId ? { ...t, currentPoints: t.currentPoints + 1 } : t
          ),
        });
      }
      
      return { previous };
    },
    
    // Rollback on error
    onError: (_err, _talentId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["talents"], context.previous);
      }
    },
    
    // Refetch on success or error
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["talents"] });
    },
  });
}
```
