# Faucet Frontend Integration Guide

This guide shows how to integrate the faucet and balance system into your frontend application.

## Prerequisites

- Completed authentication integration (see `frontend-integration.md`)
- User must be authenticated with a valid JWT token

## React Integration

### 1. Create Faucet Hook

```typescript
// hooks/useFaucet.ts
import { useState, useCallback } from 'react';

const API_BASE = 'http://localhost:3000';

interface Balance {
  free: number;
  locked: number;
  total: number;
  totalCredits: number;
  totalDebits: number;
}

interface FaucetStats {
  totalRequests: number;
  totalAmountReceived: number;
  lastRequestAt: string | null;
  nextRequestAt: string | null;
  canRequest: boolean;
}

interface FaucetState {
  balance: Balance | null;
  stats: FaucetStats | null;
  isLoading: boolean;
  error: string | null;
}

function getAuthHeaders() {
  const token = localStorage.getItem('auth_token');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export function useFaucet() {
  const [state, setState] = useState<FaucetState>({
    balance: null,
    stats: null,
    isLoading: false,
    error: null,
  });

  const fetchBalance = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const res = await fetch(`${API_BASE}/faucet/balance`, {
        headers: getAuthHeaders(),
      });
      
      if (!res.ok) {
        throw new Error('Failed to fetch balance');
      }
      
      const balance = await res.json();
      setState(prev => ({ ...prev, balance, isLoading: false }));
      return balance;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setState(prev => ({ ...prev, error: message, isLoading: false }));
      return null;
    }
  }, []);

  const fetchStats = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const res = await fetch(`${API_BASE}/faucet/stats`, {
        headers: getAuthHeaders(),
      });
      
      if (!res.ok) {
        throw new Error('Failed to fetch stats');
      }
      
      const stats = await res.json();
      setState(prev => ({ ...prev, stats, isLoading: false }));
      return stats;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setState(prev => ({ ...prev, error: message, isLoading: false }));
      return null;
    }
  }, []);

  const requestFromFaucet = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const res = await fetch(`${API_BASE}/faucet/request`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        if (res.status === 429) {
          setState(prev => ({
            ...prev,
            error: data.message,
            stats: prev.stats ? {
              ...prev.stats,
              canRequest: false,
              nextRequestAt: data.nextRequestAt,
            } : null,
            isLoading: false,
          }));
          return { success: false, nextRequestAt: data.nextRequestAt };
        }
        throw new Error(data.message);
      }
      
      setState(prev => ({
        ...prev,
        balance: {
          ...prev.balance!,
          free: data.balance.free,
          locked: data.balance.locked,
          total: data.balance.total,
        },
        stats: prev.stats ? {
          ...prev.stats,
          totalRequests: prev.stats.totalRequests + 1,
          totalAmountReceived: prev.stats.totalAmountReceived + data.amount,
          canRequest: false,
          nextRequestAt: data.nextRequestAt,
        } : null,
        isLoading: false,
      }));
      
      return { success: true, amount: data.amount };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setState(prev => ({ ...prev, error: message, isLoading: false }));
      return { success: false, error: message };
    }
  }, []);

  const lockBalance = useCallback(async (amount: number, reason?: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const res = await fetch(`${API_BASE}/faucet/lock`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ amount, reason }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.message);
      }
      
      setState(prev => ({
        ...prev,
        balance: prev.balance ? {
          ...prev.balance,
          free: data.balance.free,
          locked: data.balance.locked,
          total: data.balance.total,
        } : null,
        isLoading: false,
      }));
      
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setState(prev => ({ ...prev, error: message, isLoading: false }));
      return { success: false, error: message };
    }
  }, []);

  const unlockBalance = useCallback(async (amount: number, reason?: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const res = await fetch(`${API_BASE}/faucet/unlock`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ amount, reason }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.message);
      }
      
      setState(prev => ({
        ...prev,
        balance: prev.balance ? {
          ...prev.balance,
          free: data.balance.free,
          locked: data.balance.locked,
          total: data.balance.total,
        } : null,
        isLoading: false,
      }));
      
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setState(prev => ({ ...prev, error: message, isLoading: false }));
      return { success: false, error: message };
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([fetchBalance(), fetchStats()]);
  }, [fetchBalance, fetchStats]);

  return {
    ...state,
    fetchBalance,
    fetchStats,
    requestFromFaucet,
    lockBalance,
    unlockBalance,
    refresh,
  };
}
```

### 2. Create Balance Display Component

```tsx
// components/BalanceCard.tsx
import { useEffect } from 'react';
import { useFaucet } from '../hooks/useFaucet';

export function BalanceCard() {
  const { balance, isLoading, fetchBalance } = useFaucet();

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  if (isLoading && !balance) {
    return <div className="balance-card">Loading...</div>;
  }

  if (!balance) {
    return null;
  }

  return (
    <div className="balance-card">
      <h3>Your Balance</h3>
      <div className="balance-row">
        <span>Available:</span>
        <span className="amount">{balance.free} tokens</span>
      </div>
      <div className="balance-row">
        <span>Locked:</span>
        <span className="amount">{balance.locked} tokens</span>
      </div>
      <div className="balance-row total">
        <span>Total:</span>
        <span className="amount">{balance.total} tokens</span>
      </div>
    </div>
  );
}
```

### 3. Create Faucet Request Component

```tsx
// components/FaucetButton.tsx
import { useEffect, useState } from 'react';
import { useFaucet } from '../hooks/useFaucet';

export function FaucetButton() {
  const { stats, isLoading, error, fetchStats, requestFromFaucet } = useFaucet();
  const [countdown, setCountdown] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Update countdown timer
  useEffect(() => {
    if (!stats?.nextRequestAt || stats.canRequest) {
      setCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const now = new Date().getTime();
      const next = new Date(stats.nextRequestAt!).getTime();
      const diff = next - now;

      if (diff <= 0) {
        setCountdown(null);
        fetchStats(); // Refresh to update canRequest
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setCountdown(`${hours}h ${minutes}m ${seconds}s`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [stats, fetchStats]);

  const handleRequest = async () => {
    const result = await requestFromFaucet();
    if (result.success) {
      alert(`Received ${result.amount} tokens!`);
    }
  };

  return (
    <div className="faucet-section">
      <h3>Daily Faucet</h3>
      
      {stats && (
        <p className="stats">
          Total claimed: {stats.totalAmountReceived} tokens 
          ({stats.totalRequests} requests)
        </p>
      )}

      {error && <p className="error">{error}</p>}

      <button
        onClick={handleRequest}
        disabled={isLoading || !stats?.canRequest}
        className="faucet-button"
      >
        {isLoading ? 'Loading...' : 
         stats?.canRequest ? 'Claim 100 Tokens' : 
         `Next claim in ${countdown || '...'}`}
      </button>
    </div>
  );
}
```

### 4. Create Balance History Component

```tsx
// components/BalanceHistory.tsx
import { useEffect, useState } from 'react';

const API_BASE = 'http://localhost:3000';

interface BalanceChange {
  amount: number;
  type: 'credit' | 'debit' | 'lock' | 'unlock';
  reason: string;
  timestamp: string;
}

export function BalanceHistory() {
  const [history, setHistory] = useState<BalanceChange[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE}/faucet/balance/history?limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setHistory(data.history);
      setIsLoading(false);
    };

    fetchHistory();
  }, []);

  if (isLoading) {
    return <div>Loading history...</div>;
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'credit': return '➕';
      case 'debit': return '➖';
      case 'lock': return '🔒';
      case 'unlock': return '🔓';
      default: return '•';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'credit': return 'green';
      case 'debit': return 'red';
      case 'lock': return 'orange';
      case 'unlock': return 'blue';
      default: return 'gray';
    }
  };

  return (
    <div className="balance-history">
      <h3>Recent Activity</h3>
      <ul>
        {history.map((change, index) => (
          <li key={index} className="history-item">
            <span className="icon">{getTypeIcon(change.type)}</span>
            <span className="details">
              <span className="reason">{change.reason}</span>
              <span className="time">
                {new Date(change.timestamp).toLocaleString()}
              </span>
            </span>
            <span 
              className="amount"
              style={{ color: getTypeColor(change.type) }}
            >
              {change.type === 'debit' ? '-' : '+'}{change.amount}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### 5. Complete Wallet Dashboard

```tsx
// components/WalletDashboard.tsx
import { useEffect } from 'react';
import { useFaucet } from '../hooks/useFaucet';
import { BalanceCard } from './BalanceCard';
import { FaucetButton } from './FaucetButton';
import { BalanceHistory } from './BalanceHistory';

export function WalletDashboard() {
  const { refresh } = useFaucet();

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="wallet-dashboard">
      <BalanceCard />
      <FaucetButton />
      <BalanceHistory />
    </div>
  );
}
```

## Vanilla JavaScript Integration

```javascript
// faucet.js
const API_BASE = 'http://localhost:3000';

function getToken() {
  return localStorage.getItem('auth_token');
}

async function getBalance() {
  const res = await fetch(`${API_BASE}/faucet/balance`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  return res.json();
}

async function getFaucetStats() {
  const res = await fetch(`${API_BASE}/faucet/stats`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  return res.json();
}

async function requestFromFaucet() {
  const res = await fetch(`${API_BASE}/faucet/request`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  
  const data = await res.json();
  
  if (res.status === 429) {
    return { 
      success: false, 
      rateLimited: true,
      nextRequestAt: data.nextRequestAt,
      message: data.message,
    };
  }
  
  if (!res.ok) {
    return { success: false, error: data.message };
  }
  
  return { success: true, ...data };
}

async function lockBalance(amount, reason = 'Manual lock') {
  const res = await fetch(`${API_BASE}/faucet/lock`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount, reason }),
  });
  return res.json();
}

async function unlockBalance(amount, reason = 'Manual unlock') {
  const res = await fetch(`${API_BASE}/faucet/unlock`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount, reason }),
  });
  return res.json();
}

// Usage
document.getElementById('claim-btn').addEventListener('click', async () => {
  const result = await requestFromFaucet();
  
  if (result.success) {
    alert(`Claimed ${result.amount} tokens!`);
    updateBalanceDisplay(result.balance);
  } else if (result.rateLimited) {
    const nextTime = new Date(result.nextRequestAt).toLocaleString();
    alert(`Rate limited. Try again after ${nextTime}`);
  } else {
    alert(`Error: ${result.error}`);
  }
});
```

## Countdown Timer Utility

```typescript
// utils/countdown.ts
export function formatCountdown(targetDate: string | Date): string {
  const now = new Date().getTime();
  const target = new Date(targetDate).getTime();
  const diff = target - now;

  if (diff <= 0) {
    return 'Available now';
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

export function useCountdown(targetDate: string | null): string | null {
  const [countdown, setCountdown] = useState<string | null>(null);

  useEffect(() => {
    if (!targetDate) {
      setCountdown(null);
      return;
    }

    const update = () => {
      const diff = new Date(targetDate).getTime() - Date.now();
      if (diff <= 0) {
        setCountdown(null);
        return;
      }
      setCountdown(formatCountdown(targetDate));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  return countdown;
}
```

## Best Practices

1. **Optimistic Updates**: Update UI immediately, then sync with server
2. **Error Handling**: Always handle rate limit (429) responses gracefully
3. **Countdown Display**: Show users exactly when they can claim again
4. **Refresh After Actions**: Refresh balance after lock/unlock operations
5. **Loading States**: Disable buttons while requests are in flight
6. **Token Expiry**: Handle 401 errors by redirecting to login

## CSS Example

```css
.balance-card {
  background: #f5f5f5;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
}

.balance-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #e0e0e0;
}

.balance-row.total {
  font-weight: bold;
  border-bottom: none;
  margin-top: 8px;
}

.faucet-button {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 16px 32px;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  width: 100%;
  transition: opacity 0.2s;
}

.faucet-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.faucet-button:hover:not(:disabled) {
  opacity: 0.9;
}

.history-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid #eee;
}

.history-item .icon {
  font-size: 20px;
  margin-right: 12px;
}

.history-item .details {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.history-item .reason {
  font-weight: 500;
}

.history-item .time {
  font-size: 12px;
  color: #888;
}

.history-item .amount {
  font-weight: bold;
  font-size: 16px;
}
```
