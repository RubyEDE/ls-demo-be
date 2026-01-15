# EVM Wallet Authentication

This service implements Sign-In with Ethereum (SIWE) authentication, allowing users to authenticate using their EVM-compatible wallet (MetaMask, WalletConnect, Coinbase Wallet, etc.).

## Overview

The authentication flow uses cryptographic signatures to prove wallet ownership without requiring passwords. Users sign a standardized message with their wallet, and the server verifies the signature to issue a JWT token valid for 30 days.

## Authentication Flow

```
┌──────────┐                         ┌──────────┐
│ Frontend │                         │ Backend  │
└────┬─────┘                         └────┬─────┘
     │                                    │
     │  1. GET /auth/nonce?address=0x...  │
     │ ──────────────────────────────────>│
     │                                    │
     │  2. { nonce, message }             │
     │ <──────────────────────────────────│
     │                                    │
     │  3. User signs message with wallet │
     │  ┌─────────────────────────────┐   │
     │  │  Wallet Popup: Sign Message │   │
     │  └─────────────────────────────┘   │
     │                                    │
     │  4. POST /auth/verify              │
     │     { message, signature }         │
     │ ──────────────────────────────────>│
     │                                    │
     │  5. { token, address, expiresAt }  │
     │ <──────────────────────────────────│
     │                                    │
     │  6. Authenticated requests         │
     │     Authorization: Bearer <token>  │
     │ ──────────────────────────────────>│
     │                                    │
```

## API Endpoints

### 1. Request Nonce

Generates a unique nonce and SIWE message for the user to sign.

**Request:**
```
GET /auth/nonce?address=0x...&chainId=1
```

| Parameter | Type   | Required | Description                          |
|-----------|--------|----------|--------------------------------------|
| address   | string | Yes      | User's Ethereum address              |
| chainId   | number | No       | Chain ID (defaults to 1 for mainnet) |

**Response (200):**
```json
{
  "nonce": "PdOkQaCN492IEy26r",
  "message": "localhost wants you to sign in with your Ethereum account:\n0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266\n\nSign in to authenticate your wallet\n\nURI: http://localhost:3000\nVersion: 1\nChain ID: 1\nNonce: PdOkQaCN492IEy26r\nIssued At: 2026-01-15T08:56:11.705Z\nExpiration Time: 2026-01-15T09:01:11.706Z"
}
```

**Error Response (400):**
```json
{
  "error": "INVALID_ADDRESS",
  "message": "Invalid Ethereum address format"
}
```

### 2. Verify Signature

Verifies the signed message and issues a JWT token.

**Request:**
```
POST /auth/verify
Content-Type: application/json

{
  "message": "<the SIWE message from step 1>",
  "signature": "<signature from wallet>"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "address": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "expiresAt": 1739522171751
}
```

**Error Response (401):**
```json
{
  "error": "VERIFICATION_FAILED",
  "message": "Nonce expired. Please request a new nonce."
}
```

### 3. Get Current User (Protected)

Returns the authenticated user's information.

**Request:**
```
GET /auth/me
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "address": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "chainId": 1,
  "authenticatedAt": "2026-01-15T08:56:11.000Z",
  "expiresAt": "2026-02-14T08:56:11.000Z"
}
```

**Error Response (401):**
```json
{
  "error": "INVALID_TOKEN",
  "message": "Token is invalid or expired"
}
```

## Token Details

- **Type:** JWT (JSON Web Token)
- **Algorithm:** HS256
- **Expiration:** 30 days from issuance
- **Payload:**
  - `address`: User's Ethereum address
  - `chainId`: Chain ID used during authentication
  - `iat`: Issued at timestamp
  - `exp`: Expiration timestamp

## Security Considerations

1. **Nonce Expiration:** Nonces expire after 5 minutes to prevent replay attacks
2. **Single Use:** Each nonce can only be used once
3. **Domain Binding:** Messages are bound to a specific domain to prevent phishing
4. **HTTPS:** Always use HTTPS in production
5. **JWT Secret:** Use a strong, unique secret for JWT signing in production
