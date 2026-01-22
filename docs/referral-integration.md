# Referral System Integration Guide

## Overview

The referral system allows users to invite others to the platform. A referral is considered **complete** when the referred user (referee) uses the faucet for the first time. At that point, the referrer receives a reward bonus.

## Key Concepts

| Term | Description |
|------|-------------|
| **Referral Code** | Unique 12-character code per user (e.g., `ABCD1234XY5Z`) |
| **Referrer** | User who shares their referral code |
| **Referee** | User who signs up using a referral code |
| **Referral Reward** | 10 credits given to referrer when referee uses faucet |

## User Flow

### One-Step Flow (Recommended) ⭐

```
┌─────────────────┐     Share Link      ┌─────────────────┐
│   Existing      │ ─────────────────▶  │    New User     │
│     User        │  ?ref=ABCD1234      │   (Referee)     │
└─────────────────┘                     └─────────────────┘
        │                                       │
        │                                       ▼
        │                               ┌───────────────┐
        │                               │ Authenticate  │
        │                               │    (SIWE)     │
        │                               └───────────────┘
        │                                       │
        │                                       ▼
        │                               ┌───────────────────────────┐
        │                               │  POST /faucet/request     │
        │                               │  { "referralCode": "..." }│
        │                               └───────────────────────────┘
        │                                       │
        ▼                                       ▼
┌─────────────────┐                     ┌───────────────┐
│ Receive Reward  │ ◀───────────────── │   Referral    │
│  (+10 Credits)  │     Auto-trigger    │  Completed    │
└─────────────────┘                     └───────────────┘
```

**Frontend Implementation:**
1. Extract `ref` param from URL: `new URLSearchParams(window.location.search).get('ref')`
2. Store it (localStorage or state)
3. When user claims faucet, pass it: `POST /faucet/request { "referralCode": "ABCD1234" }`
4. Done! Referral is applied and completed in one API call

## API Reference

### Public Endpoints

#### Validate Referral Code
```http
GET /referrals/validate/:code
```

Check if a referral code is valid before applying it.

**Response (200 OK):**
```json
{
  "valid": true,
  "referrerAddress": "0x1234...abcd"
}
```

**Response (Invalid Code):**
```json
{
  "valid": false
}
```

---

#### Get Referral Leaderboard
```http
GET /referrals/leaderboard?limit=20
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 20 | Max results (1-100) |

**Response (200 OK):**
```json
{
  "leaderboard": [
    {
      "address": "0x1234...abcd",
      "referralCode": "ABCD1234XY5Z",
      "completedReferrals": 25,
      "totalRewardsEarned": 250
    }
  ]
}
```

---

#### Get Global Referral Stats
```http
GET /referrals/global-stats
```

**Response (200 OK):**
```json
{
  "totalReferrals": 1000,
  "completedReferrals": 750,
  "totalRewardsDistributed": 7500,
  "uniqueReferrers": 200
}
```

---

### Authenticated Endpoints

All authenticated endpoints require:
```http
Authorization: Bearer <token>
```

#### Get My Referral Code
```http
GET /referrals/code
```

**Response (200 OK):**
```json
{
  "referralCode": "ABCD1234XY5Z",
  "referralLink": "http://localhost:3000?ref=ABCD1234XY5Z"
}
```

---

#### Apply a Referral Code
```http
POST /referrals/apply
Content-Type: application/json

{
  "referralCode": "WXYZ5678AB9C"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Referral code applied. Referrer will receive reward when you use the faucet.",
  "referral": {
    "status": "pending",
    "referrerAddress": "0x9876...wxyz"
  }
}
```

**Error Responses:**

| Status | Error Code | Description |
|--------|------------|-------------|
| 400 | `INVALID_CODE` | Referral code not provided |
| 400 | `REFERRAL_FAILED` | Invalid code |
| 400 | `REFERRAL_FAILED` | Cannot refer yourself |
| 400 | `REFERRAL_FAILED` | User already referred |

---

#### Get My Referral Stats
```http
GET /referrals/stats
```

**Response (200 OK):**
```json
{
  "totalReferrals": 10,
  "completedReferrals": 7,
  "pendingReferrals": 3,
  "totalRewardsEarned": 70,
  "referralCode": "ABCD1234XY5Z"
}
```

---

#### Get My Referrals List
```http
GET /referrals/list?limit=50&offset=0
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 50 | Max results (1-100) |
| `offset` | number | 0 | Pagination offset |

**Response (200 OK):**
```json
{
  "referrals": [
    {
      "refereeAddress": "0x5678...efgh",
      "status": "completed",
      "rewardAmount": 10,
      "rewardCredited": true,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "completedAt": "2024-01-15T10:35:00.000Z"
    },
    {
      "refereeAddress": "0x9012...ijkl",
      "status": "pending",
      "rewardAmount": 0,
      "rewardCredited": false,
      "createdAt": "2024-01-16T14:00:00.000Z",
      "completedAt": null
    }
  ],
  "limit": 50,
  "offset": 0
}
```

---

#### Check Who Referred Me
```http
GET /referrals/referred-by
```

**Response (if referred):**
```json
{
  "wasReferred": true,
  "referrerAddress": "0x1234...abcd",
  "referralCode": "ABCD1234XY5Z",
  "status": "completed"
}
```

**Response (if not referred):**
```json
{
  "wasReferred": false
}
```

---

## Faucet with Referral Code (One-Step Flow) ⭐ RECOMMENDED

The simplest way to handle referrals is to pass the referral code directly when claiming from the faucet. This is the **recommended approach** for frontend integration.

```http
POST /faucet/request
Authorization: Bearer <token>
Content-Type: application/json

{
  "referralCode": "ABCD1234XY5Z"
}
```

**Response (200 OK) - First Faucet Use with Referral:**
```json
{
  "success": true,
  "amount": 100,
  "balance": {
    "free": 100,
    "locked": 0,
    "total": 100
  },
  "nextRequestAt": "2024-01-16T10:30:00.000Z",
  "referral": {
    "completed": true,
    "referrerRewarded": 10
  }
}
```

**How it works:**
1. Frontend extracts `?ref=CODE` from URL
2. When user claims faucet, pass the code in the request body
3. Backend automatically applies the referral AND completes it in one step
4. Referrer gets credited immediately

---

## React + TanStack Query Integration

### Types

```typescript
// types/referral.ts
export interface ReferralStats {
  totalReferrals: number;
  completedReferrals: number;
  pendingReferrals: number;
  totalRewardsEarned: number;
  referralCode: string;
}

export interface Referral {
  refereeAddress: string;
  status: 'pending' | 'completed';
  rewardAmount: number;
  rewardCredited: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface ReferralCodeResponse {
  referralCode: string;
  referralLink: string;
}

export interface ReferredByResponse {
  wasReferred: boolean;
  referrerAddress?: string;
  referralCode?: string;
  status?: string;
}

export interface ValidateCodeResponse {
  valid: boolean;
  referrerAddress?: string;
}

export interface ApplyReferralResponse {
  success: boolean;
  message: string;
  referral: {
    status: string;
    referrerAddress: string;
  };
}

export interface LeaderboardEntry {
  address: string;
  referralCode: string;
  completedReferrals: number;
  totalRewardsEarned: number;
}

export interface GlobalReferralStats {
  totalReferrals: number;
  completedReferrals: number;
  totalRewardsDistributed: number;
  uniqueReferrers: number;
}
```

### API Functions

```typescript
// api/referrals.ts
import { fetchWithAuth } from './client';

// Set VITE_API_URL to 'https://api.longsword.io' for production
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Public endpoints
export async function validateReferralCode(code: string): Promise<ValidateCodeResponse> {
  const res = await fetch(`${API_BASE}/referrals/validate/${code}`);
  return res.json();
}

export async function getReferralLeaderboard(limit = 20): Promise<{ leaderboard: LeaderboardEntry[] }> {
  const res = await fetch(`${API_BASE}/referrals/leaderboard?limit=${limit}`);
  return res.json();
}

export async function getGlobalReferralStats(): Promise<GlobalReferralStats> {
  const res = await fetch(`${API_BASE}/referrals/global-stats`);
  return res.json();
}

// Authenticated endpoints
export async function getMyReferralCode(): Promise<ReferralCodeResponse> {
  const res = await fetchWithAuth('/referrals/code');
  if (!res.ok) throw new Error('Failed to get referral code');
  return res.json();
}

export async function applyReferralCode(referralCode: string): Promise<ApplyReferralResponse> {
  const res = await fetchWithAuth('/referrals/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ referralCode }),
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Failed to apply referral code');
  return data;
}

export async function getMyReferralStats(): Promise<ReferralStats> {
  const res = await fetchWithAuth('/referrals/stats');
  if (!res.ok) throw new Error('Failed to get referral stats');
  return res.json();
}

export async function getMyReferrals(limit = 50, offset = 0): Promise<{ referrals: Referral[]; limit: number; offset: number }> {
  const res = await fetchWithAuth(`/referrals/list?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error('Failed to get referrals');
  return res.json();
}

export async function getReferredBy(): Promise<ReferredByResponse> {
  const res = await fetchWithAuth('/referrals/referred-by');
  if (!res.ok) throw new Error('Failed to get referral info');
  return res.json();
}
```

### Query Hooks

```typescript
// hooks/useReferrals.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  validateReferralCode,
  getReferralLeaderboard,
  getGlobalReferralStats,
  getMyReferralCode,
  applyReferralCode,
  getMyReferralStats,
  getMyReferrals,
  getReferredBy,
} from '../api/referrals';

// Query keys
export const referralKeys = {
  all: ['referrals'] as const,
  code: () => [...referralKeys.all, 'code'] as const,
  stats: () => [...referralKeys.all, 'stats'] as const,
  list: (limit?: number, offset?: number) => [...referralKeys.all, 'list', { limit, offset }] as const,
  referredBy: () => [...referralKeys.all, 'referred-by'] as const,
  leaderboard: (limit?: number) => [...referralKeys.all, 'leaderboard', { limit }] as const,
  globalStats: () => [...referralKeys.all, 'global-stats'] as const,
  validate: (code: string) => [...referralKeys.all, 'validate', code] as const,
};

// Get my referral code
export function useMyReferralCode() {
  return useQuery({
    queryKey: referralKeys.code(),
    queryFn: getMyReferralCode,
    staleTime: Infinity, // Code doesn't change
  });
}

// Get my referral stats
export function useMyReferralStats() {
  return useQuery({
    queryKey: referralKeys.stats(),
    queryFn: getMyReferralStats,
    staleTime: 30_000, // 30 seconds
  });
}

// Get my referrals list
export function useMyReferrals(limit = 50, offset = 0) {
  return useQuery({
    queryKey: referralKeys.list(limit, offset),
    queryFn: () => getMyReferrals(limit, offset),
    staleTime: 30_000,
  });
}

// Check who referred me
export function useReferredBy() {
  return useQuery({
    queryKey: referralKeys.referredBy(),
    queryFn: getReferredBy,
    staleTime: Infinity, // Doesn't change
  });
}

// Validate a referral code
export function useValidateReferralCode(code: string) {
  return useQuery({
    queryKey: referralKeys.validate(code),
    queryFn: () => validateReferralCode(code),
    enabled: code.length > 0,
    staleTime: 60_000, // 1 minute
  });
}

// Get leaderboard (public)
export function useReferralLeaderboard(limit = 20) {
  return useQuery({
    queryKey: referralKeys.leaderboard(limit),
    queryFn: () => getReferralLeaderboard(limit),
    staleTime: 60_000,
  });
}

// Get global stats (public)
export function useGlobalReferralStats() {
  return useQuery({
    queryKey: referralKeys.globalStats(),
    queryFn: getGlobalReferralStats,
    staleTime: 60_000,
  });
}

// Apply referral code mutation
export function useApplyReferralCode() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: applyReferralCode,
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: referralKeys.referredBy() });
    },
  });
}
```

### Referral Code Detection Hook

```typescript
// hooks/useReferralCodeFromUrl.ts
import { useEffect, useState } from 'react';
import { useValidateReferralCode } from './useReferrals';

const REFERRAL_CODE_KEY = 'pending_referral_code';

export function useReferralCodeFromUrl() {
  const [pendingCode, setPendingCode] = useState<string | null>(() => {
    // Check localStorage first for previously stored code
    return localStorage.getItem(REFERRAL_CODE_KEY);
  });
  
  // Validate the code
  const { data: validation, isLoading } = useValidateReferralCode(pendingCode || '');
  
  useEffect(() => {
    // Check URL for referral code
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    
    if (refCode) {
      // Store in localStorage for after auth
      localStorage.setItem(REFERRAL_CODE_KEY, refCode.toUpperCase());
      setPendingCode(refCode.toUpperCase());
      
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete('ref');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);
  
  const clearPendingCode = () => {
    localStorage.removeItem(REFERRAL_CODE_KEY);
    setPendingCode(null);
  };
  
  return {
    pendingCode,
    isValid: validation?.valid ?? false,
    referrerAddress: validation?.referrerAddress,
    isLoading,
    clearPendingCode,
  };
}
```

### Components

#### Referral Banner (for new users with pending referral)

```tsx
// components/referrals/ReferralBanner.tsx
import { useReferralCodeFromUrl } from '../../hooks/useReferralCodeFromUrl';
import { useApplyReferralCode } from '../../hooks/useReferrals';
import { useAuth } from '../../context/AuthContext';

export function ReferralBanner() {
  const { isAuthenticated } = useAuth();
  const { pendingCode, isValid, referrerAddress, clearPendingCode } = useReferralCodeFromUrl();
  const applyMutation = useApplyReferralCode();
  
  // Auto-apply when authenticated and have valid pending code
  useEffect(() => {
    if (isAuthenticated && pendingCode && isValid && !applyMutation.isPending) {
      applyMutation.mutate(pendingCode, {
        onSuccess: () => {
          clearPendingCode();
        },
        onError: () => {
          // Code might already be applied or invalid
          clearPendingCode();
        },
      });
    }
  }, [isAuthenticated, pendingCode, isValid]);
  
  if (!pendingCode || !isValid) return null;
  
  return (
    <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-3 rounded-lg">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">You were referred by {referrerAddress}</p>
          <p className="text-sm text-purple-200">
            {isAuthenticated 
              ? 'Use the faucet to complete the referral!' 
              : 'Connect your wallet to claim your referral bonus!'}
          </p>
        </div>
        <button 
          onClick={clearPendingCode}
          className="text-purple-200 hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
```

#### Share Referral Code

```tsx
// components/referrals/ShareReferralCode.tsx
import { useState } from 'react';
import { useMyReferralCode } from '../../hooks/useReferrals';

export function ShareReferralCode() {
  const { data, isLoading, error } = useMyReferralCode();
  const [isCopied, setIsCopied] = useState(false);
  
  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };
  
  if (isLoading) {
    return <div className="animate-pulse h-20 bg-gray-200 rounded-lg" />;
  }
  
  if (error || !data) {
    return <div className="text-red-500">Failed to load referral code</div>;
  }
  
  const shareUrl = `${window.location.origin}?ref=${data.referralCode}`;
  
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
      <h3 className="text-lg font-semibold mb-4">Invite Friends</h3>
      
      <div className="space-y-4">
        {/* Referral Code */}
        <div>
          <label className="text-sm text-gray-500">Your Referral Code</label>
          <div className="flex items-center gap-2 mt-1">
            <code className="flex-1 bg-gray-100 px-4 py-2 rounded-lg font-mono text-lg">
              {data.referralCode}
            </code>
            <button
              onClick={() => copyToClipboard(data.referralCode)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              {isCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
        
        {/* Share Link */}
        <div>
          <label className="text-sm text-gray-500">Share Link</label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 bg-gray-100 px-4 py-2 rounded-lg text-sm"
            />
            <button
              onClick={() => copyToClipboard(shareUrl)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
            >
              Copy Link
            </button>
          </div>
        </div>
        
        {/* Share buttons */}
        <div className="flex gap-2">
          <a
            href={`https://twitter.com/intent/tweet?text=Trade%20perps%20with%20me!&url=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2 bg-[#1DA1F2] text-white rounded-lg text-center hover:bg-[#1a8cd8] transition"
          >
            Share on Twitter
          </a>
          <a
            href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=Trade%20perps%20with%20me!`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2 bg-[#0088cc] text-white rounded-lg text-center hover:bg-[#007ab8] transition"
          >
            Share on Telegram
          </a>
        </div>
      </div>
    </div>
  );
}
```

#### Referral Stats Dashboard

```tsx
// components/referrals/ReferralStatsDashboard.tsx
import { useMyReferralStats, useMyReferrals } from '../../hooks/useReferrals';

export function ReferralStatsDashboard() {
  const { data: stats, isLoading: isLoadingStats } = useMyReferralStats();
  const { data: referralsData, isLoading: isLoadingReferrals } = useMyReferrals();
  
  if (isLoadingStats || isLoadingReferrals) {
    return <div className="animate-pulse space-y-4">
      <div className="h-32 bg-gray-200 rounded-lg" />
      <div className="h-48 bg-gray-200 rounded-lg" />
    </div>;
  }
  
  if (!stats) return null;
  
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Referrals"
          value={stats.totalReferrals}
          icon="👥"
        />
        <StatCard
          label="Completed"
          value={stats.completedReferrals}
          icon="✅"
          color="green"
        />
        <StatCard
          label="Pending"
          value={stats.pendingReferrals}
          icon="⏳"
          color="yellow"
        />
        <StatCard
          label="Rewards Earned"
          value={`${stats.totalRewardsEarned} Credits`}
          icon="💰"
          color="purple"
        />
      </div>
      
      {/* Referrals List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold">Your Referrals</h3>
        </div>
        
        {referralsData?.referrals.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            <p>No referrals yet. Share your code to get started!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {referralsData?.referrals.map((referral, idx) => (
              <div key={idx} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="font-mono">{referral.refereeAddress}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(referral.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                    referral.status === 'completed' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {referral.status}
                  </span>
                  {referral.rewardCredited && (
                    <p className="text-sm text-green-600 mt-1">+{referral.rewardAmount} credits</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ 
  label, 
  value, 
  icon, 
  color = 'gray' 
}: { 
  label: string; 
  value: string | number; 
  icon: string; 
  color?: 'gray' | 'green' | 'yellow' | 'purple';
}) {
  const colorClasses = {
    gray: 'bg-gray-50 text-gray-900',
    green: 'bg-green-50 text-green-900',
    yellow: 'bg-yellow-50 text-yellow-900',
    purple: 'bg-purple-50 text-purple-900',
  };
  
  return (
    <div className={`${colorClasses[color]} rounded-xl p-4`}>
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm opacity-75">{label}</div>
    </div>
  );
}
```

#### Referral Leaderboard

```tsx
// components/referrals/ReferralLeaderboard.tsx
import { useReferralLeaderboard } from '../../hooks/useReferrals';

export function ReferralLeaderboard() {
  const { data, isLoading } = useReferralLeaderboard(10);
  
  if (isLoading) {
    return <div className="animate-pulse h-64 bg-gray-200 rounded-lg" />;
  }
  
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-indigo-600">
        <h3 className="font-semibold text-white">🏆 Top Referrers</h3>
      </div>
      
      <div className="divide-y divide-gray-100">
        {data?.leaderboard.map((entry, idx) => (
          <div key={idx} className="px-6 py-4 flex items-center gap-4">
            <div className="text-2xl font-bold text-gray-300 w-8">
              {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}
            </div>
            <div className="flex-1">
              <p className="font-mono">{entry.address}</p>
              <p className="text-sm text-gray-500">{entry.referralCode}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{entry.completedReferrals} referrals</p>
              <p className="text-sm text-green-600">+{entry.totalRewardsEarned} earned</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Complete Integration Example

### Full Referral Page

```tsx
// pages/ReferralsPage.tsx
import { ShareReferralCode } from '../components/referrals/ShareReferralCode';
import { ReferralStatsDashboard } from '../components/referrals/ReferralStatsDashboard';
import { ReferralLeaderboard } from '../components/referrals/ReferralLeaderboard';
import { useGlobalReferralStats } from '../hooks/useReferrals';

export function ReferralsPage() {
  const { data: globalStats } = useGlobalReferralStats();
  
  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Referral Program</h1>
        <p className="text-gray-600 mt-2">
          Invite friends and earn 10 credits for each user who uses the faucet!
        </p>
      </div>
      
      {/* Global Stats Banner */}
      {globalStats && (
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-6 text-white">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold">{globalStats.completedReferrals}</div>
              <div className="text-sm opacity-80">Successful Referrals</div>
            </div>
            <div>
              <div className="text-3xl font-bold">{globalStats.totalRewardsDistributed}</div>
              <div className="text-sm opacity-80">Credits Distributed</div>
            </div>
            <div>
              <div className="text-3xl font-bold">{globalStats.uniqueReferrers}</div>
              <div className="text-sm opacity-80">Active Referrers</div>
            </div>
          </div>
        </div>
      )}
      
      {/* Share Section */}
      <ShareReferralCode />
      
      {/* User Stats */}
      <ReferralStatsDashboard />
      
      {/* Leaderboard */}
      <ReferralLeaderboard />
    </div>
  );
}
```

---

## Configuration

The referral reward amount is configured in `src/services/referral.service.ts`:

```typescript
const REFERRAL_REWARD_AMOUNT = 10; // Credits given to referrer
```

---

## Database Schema

### Referral Collection

| Field | Type | Description |
|-------|------|-------------|
| `referrerId` | ObjectId | User who referred |
| `refereeId` | ObjectId | User who was referred (unique) |
| `referrerAddress` | string | Referrer's wallet address |
| `refereeAddress` | string | Referee's wallet address (unique) |
| `referralCode` | string | Code used for the referral |
| `status` | enum | `"pending"` or `"completed"` |
| `rewardAmount` | number | Amount credited to referrer |
| `rewardCredited` | boolean | Whether reward was credited |
| `completedAt` | Date | When referral was completed |
| `createdAt` | Date | When referral was created |
| `updatedAt` | Date | Last update timestamp |

### User Collection (Updated Fields)

| Field | Type | Description |
|-------|------|-------------|
| `referralCode` | string | User's unique referral code |
| `referredBy` | string | Referral code used during signup |

---

## Error Handling

| Error Code | HTTP Status | Description | User Action |
|------------|-------------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Not authenticated | Login first |
| `NOT_FOUND` | 404 | User not found | Check authentication |
| `INVALID_CODE` | 400 | Referral code not provided | Provide a code |
| `REFERRAL_FAILED` | 400 | Invalid code | Check code is correct |
| `REFERRAL_FAILED` | 400 | Cannot refer yourself | Use a different code |
| `REFERRAL_FAILED` | 400 | Already referred | User can only be referred once |

---

## Best Practices

1. **URL Parameter Handling:** Extract and store referral codes from URLs immediately on page load, before the user authenticates.

2. **Auto-Apply:** Automatically apply stored referral codes after authentication for the best UX.

3. **Validation First:** Always validate referral codes before applying to show helpful error messages.

4. **Clear Feedback:** Show users who referred them and the referral status (pending → completed).

5. **Share Integration:** Provide easy share buttons for Twitter/Telegram to maximize referral reach.

6. **Leaderboard:** Display the referral leaderboard to gamify the referral experience.
