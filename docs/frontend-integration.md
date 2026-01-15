# Frontend Integration Guide

This guide shows how to integrate EVM wallet authentication into your frontend application.

## Prerequisites

- An EVM wallet library (wagmi, ethers.js, viem, or web3.js)
- A way to connect to user wallets (RainbowKit, ConnectKit, Web3Modal, etc.)

## Installation

```bash
# Using wagmi + viem (recommended)
npm install wagmi viem @tanstack/react-query

# Or using ethers.js
npm install ethers
```

## React + wagmi Integration

### 1. Setup wagmi Config

```typescript
// config/wagmi.ts
import { http, createConfig } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';

export const config = createConfig({
  chains: [mainnet, sepolia],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
});
```

### 2. Create Auth Hook

```typescript
// hooks/useEvmAuth.ts
import { useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';

const API_BASE = 'http://localhost:3000';

interface AuthState {
  token: string | null;
  address: string | null;
  expiresAt: number | null;
  isLoading: boolean;
  error: string | null;
}

export function useEvmAuth() {
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  
  const [authState, setAuthState] = useState<AuthState>({
    token: localStorage.getItem('auth_token'),
    address: localStorage.getItem('auth_address'),
    expiresAt: Number(localStorage.getItem('auth_expires')) || null,
    isLoading: false,
    error: null,
  });

  const login = async () => {
    if (!address) {
      setAuthState(prev => ({ ...prev, error: 'Wallet not connected' }));
      return;
    }

    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Step 1: Get nonce and message
      const nonceRes = await fetch(
        `${API_BASE}/auth/nonce?address=${address}&chainId=${chainId || 1}`
      );
      
      if (!nonceRes.ok) {
        const err = await nonceRes.json();
        throw new Error(err.message);
      }
      
      const { message } = await nonceRes.json();

      // Step 2: Sign the message
      const signature = await signMessageAsync({ message });

      // Step 3: Verify and get token
      const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.message);
      }

      const { token, address: authAddress, expiresAt } = await verifyRes.json();

      // Store in localStorage
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_address', authAddress);
      localStorage.setItem('auth_expires', String(expiresAt));

      setAuthState({
        token,
        address: authAddress,
        expiresAt,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setAuthState(prev => ({ ...prev, isLoading: false, error: message }));
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_address');
    localStorage.removeItem('auth_expires');
    setAuthState({
      token: null,
      address: null,
      expiresAt: null,
      isLoading: false,
      error: null,
    });
  };

  const isAuthenticated = Boolean(
    authState.token && 
    authState.expiresAt && 
    authState.expiresAt > Date.now()
  );

  return {
    ...authState,
    isAuthenticated,
    login,
    logout,
  };
}
```

### 3. Create Auth Context (Optional)

```typescript
// context/AuthContext.tsx
import { createContext, useContext, ReactNode } from 'react';
import { useEvmAuth } from '../hooks/useEvmAuth';

type AuthContextType = ReturnType<typeof useEvmAuth>;

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useEvmAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

### 4. Login Component

```tsx
// components/LoginButton.tsx
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { useAuth } from '../context/AuthContext';

export function LoginButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { isAuthenticated, isLoading, error, login, logout } = useAuth();

  // Not connected to wallet
  if (!isConnected) {
    return (
      <button onClick={() => connect({ connector: connectors[0] })}>
        Connect Wallet
      </button>
    );
  }

  // Connected but not authenticated
  if (!isAuthenticated) {
    return (
      <div>
        <p>Connected: {address?.slice(0, 6)}...{address?.slice(-4)}</p>
        <button onClick={login} disabled={isLoading}>
          {isLoading ? 'Signing...' : 'Sign In'}
        </button>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button onClick={() => disconnect()}>Disconnect</button>
      </div>
    );
  }

  // Authenticated
  return (
    <div>
      <p>Signed in as {address?.slice(0, 6)}...{address?.slice(-4)}</p>
      <button onClick={logout}>Sign Out</button>
      <button onClick={() => disconnect()}>Disconnect</button>
    </div>
  );
}
```

### 5. Making Authenticated Requests

```typescript
// utils/api.ts
const API_BASE = 'http://localhost:3000';

export async function fetchWithAuth(
  endpoint: string,
  options: RequestInit = {}
) {
  const token = localStorage.getItem('auth_token');
  
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });
  
  if (response.status === 401) {
    // Token expired or invalid - clear storage
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_address');
    localStorage.removeItem('auth_expires');
    throw new Error('Session expired. Please sign in again.');
  }
  
  return response;
}

// Usage example
export async function getProfile() {
  const res = await fetchWithAuth('/auth/me');
  if (!res.ok) {
    throw new Error('Failed to fetch profile');
  }
  return res.json();
}
```

## Ethers.js Integration

If you're using ethers.js instead of wagmi:

```typescript
// hooks/useEvmAuthEthers.ts
import { useState } from 'react';
import { BrowserProvider } from 'ethers';

const API_BASE = 'http://localhost:3000';

export function useEvmAuthEthers() {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem('auth_token')
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async () => {
    if (!window.ethereum) {
      setError('No wallet found');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      // Step 1: Get nonce
      const nonceRes = await fetch(
        `${API_BASE}/auth/nonce?address=${address}&chainId=${chainId}`
      );
      const { message } = await nonceRes.json();

      // Step 2: Sign message
      const signature = await signer.signMessage(message);

      // Step 3: Verify
      const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      });

      const { token: newToken } = await verifyRes.json();
      
      localStorage.setItem('auth_token', newToken);
      setToken(newToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setToken(null);
  };

  return { token, isLoading, error, login, logout };
}
```

## Vanilla JavaScript

For non-React applications:

```javascript
// auth.js
const API_BASE = 'http://localhost:3000';

async function loginWithEthereum() {
  if (!window.ethereum) {
    throw new Error('No wallet found');
  }

  // Request accounts
  const accounts = await window.ethereum.request({
    method: 'eth_requestAccounts',
  });
  const address = accounts[0];
  
  // Get chain ID
  const chainId = await window.ethereum.request({
    method: 'eth_chainId',
  });

  // Step 1: Get nonce
  const nonceRes = await fetch(
    `${API_BASE}/auth/nonce?address=${address}&chainId=${parseInt(chainId, 16)}`
  );
  const { message } = await nonceRes.json();

  // Step 2: Sign message
  const signature = await window.ethereum.request({
    method: 'personal_sign',
    params: [message, address],
  });

  // Step 3: Verify
  const verifyRes = await fetch(`${API_BASE}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, signature }),
  });

  const { token, expiresAt } = await verifyRes.json();
  
  localStorage.setItem('auth_token', token);
  localStorage.setItem('auth_expires', expiresAt);
  
  return token;
}

// Usage
document.getElementById('login-btn').addEventListener('click', async () => {
  try {
    const token = await loginWithEthereum();
    console.log('Logged in! Token:', token);
  } catch (err) {
    console.error('Login failed:', err.message);
  }
});
```

## Error Handling

Handle these common errors:

| Error Code | Description | User Action |
|------------|-------------|-------------|
| `INVALID_ADDRESS` | Malformed Ethereum address | Check wallet connection |
| `VERIFICATION_FAILED` | Signature verification failed | Try signing again |
| `INVALID_TOKEN` | JWT is invalid or expired | Re-authenticate |
| `UNAUTHORIZED` | Missing Authorization header | Include Bearer token |

## Best Practices

1. **Token Storage:** Store tokens in `localStorage` for persistence. For higher security, consider `httpOnly` cookies.

2. **Token Refresh:** Check token expiration before requests and prompt re-authentication when needed.

3. **Wallet Switching:** Listen for account changes and clear authentication:
   ```typescript
   window.ethereum?.on('accountsChanged', () => {
     localStorage.removeItem('auth_token');
     // Redirect to login or refresh state
   });
   ```

4. **Chain Switching:** Handle network changes appropriately:
   ```typescript
   window.ethereum?.on('chainChanged', (chainId) => {
     // Optionally require re-authentication on chain change
   });
   ```

5. **Loading States:** Always show loading indicators during signing to prevent duplicate requests.
