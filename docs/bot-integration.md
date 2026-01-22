# Bot Integration Guide

This guide shows how to build automated trading bots that interact with the perpetuals DEX backend using Node.js/TypeScript.

## Table of Contents

1. [Overview](#overview)
2. [Setup](#setup)
3. [Authentication (Wallet Sign-In)](#authentication-wallet-sign-in)
4. [Getting Testnet Funds](#getting-testnet-funds)
5. [Market Data](#market-data)
6. [Placing Orders](#placing-orders)
7. [Managing Positions](#managing-positions)
8. [WebSocket Real-Time Data](#websocket-real-time-data)
9. [Complete Bot Example](#complete-bot-example)
10. [Error Handling](#error-handling)
11. [Rate Limits](#rate-limits)

---

## Overview

The perpetuals DEX provides a REST API and WebSocket server for trading perpetual futures contracts. All trading operations require authentication via Ethereum wallet signatures (SIWE - Sign-In With Ethereum).

### Base URLs

**Production:**
```
REST API:  https://api.longsword.io
WebSocket: wss://api.longsword.io
```

**Development:**
```
REST API:  http://localhost:3000
WebSocket: ws://localhost:3000
```

### API Routes

| Category | Base Path | Description |
|----------|-----------|-------------|
| Auth | `/auth` | Wallet authentication |
| Faucet | `/faucet` | Testnet funds & balance |
| CLOB | `/clob` | Trading & positions |
| Achievements | `/achievements` | Trading achievements |
| Referrals | `/referrals` | Referral system |

---

## Setup

### Dependencies

```bash
npm install viem ethers axios socket.io-client
```

### TypeScript Types

```typescript
// types.ts
export interface AuthToken {
  token: string;
  address: string;
  expiresAt: number;
}

export interface Balance {
  address: string;
  free: number;
  locked: number;
  total: number;
}

export interface Market {
  symbol: string;
  name: string;
  oraclePrice: number;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  tickSize: number;
  lotSize: number;
  minOrderSize: number;
  maxLeverage: number;
  fundingRate: number;
}

export interface Order {
  orderId: string;
  marketSymbol: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  price: number;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  averagePrice: number;
  status: 'pending' | 'partial' | 'filled' | 'cancelled';
  createdAt: string;
}

export interface Position {
  positionId: string;
  marketSymbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  margin: number;
  leverage: number;
  unrealizedPnl: number;
  realizedPnl: number;
  liquidationPrice: number;
  status: 'open' | 'closed' | 'liquidated';
}

export interface OrderBookEntry {
  price: number;
  quantity: number;
  total: number;
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  timestamp: number;
  oraclePrice: number;
}
```

---

## Authentication (Wallet Sign-In)

Authentication uses SIWE (Sign-In With Ethereum). The flow is:

1. Request a nonce from the server
2. Sign the SIWE message with your wallet
3. Verify the signature to receive a JWT token
4. Use the JWT token in the `Authorization` header for authenticated requests

### Using viem (Recommended)

```typescript
// auth.ts
import { createWalletClient, http, type WalletClient, type PrivateKeyAccount } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet } from 'viem/chains';
import axios from 'axios';

// Development
const BASE_URL = 'http://localhost:3000';
// Production
// const BASE_URL = 'https://api.longsword.io';

interface AuthResponse {
  token: string;
  address: string;
  expiresAt: number;
  isNewUser: boolean;
}

export async function authenticate(privateKey: `0x${string}`): Promise<AuthResponse> {
  // Create wallet from private key
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: mainnet,
    transport: http(),
  });

  const address = account.address;

  // Step 1: Get nonce and SIWE message
  const nonceResponse = await axios.get(`${BASE_URL}/auth/nonce`, {
    params: { address, chainId: 1 },
  });

  const { nonce, message } = nonceResponse.data;
  console.log('Got nonce:', nonce);

  // Step 2: Sign the message
  const signature = await walletClient.signMessage({
    account,
    message,
  });
  console.log('Message signed');

  // Step 3: Verify and get JWT token
  const verifyResponse = await axios.post(`${BASE_URL}/auth/verify`, {
    message,
    signature,
  });

  const { token, expiresAt, isNewUser } = verifyResponse.data;
  console.log('Authenticated! Token expires:', new Date(expiresAt).toISOString());

  return { token, address, expiresAt, isNewUser };
}

// Create an authenticated axios instance
export function createAuthenticatedClient(token: string) {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}
```

### Using ethers.js

```typescript
// auth-ethers.ts
import { ethers } from 'ethers';
import axios from 'axios';

// Development
const BASE_URL = 'http://localhost:3000';
// Production
// const BASE_URL = 'https://api.longsword.io';

export async function authenticateWithEthers(privateKey: string): Promise<{
  token: string;
  address: string;
}> {
  const wallet = new ethers.Wallet(privateKey);
  const address = wallet.address;

  // Step 1: Get nonce
  const { data: nonceData } = await axios.get(`${BASE_URL}/auth/nonce`, {
    params: { address, chainId: 1 },
  });

  // Step 2: Sign message
  const signature = await wallet.signMessage(nonceData.message);

  // Step 3: Verify
  const { data: authData } = await axios.post(`${BASE_URL}/auth/verify`, {
    message: nonceData.message,
    signature,
  });

  return { token: authData.token, address };
}
```

### Get Current User

```typescript
async function getCurrentUser(client: axios.AxiosInstance) {
  const response = await client.get('/auth/me');
  return response.data;
  // Returns: { address, chainId, authenticatedAt, expiresAt, user: { id, createdAt, lastLoginAt } }
}
```

---

## Getting Testnet Funds

Before trading, you need testnet funds from the faucet. The faucet allows one request per 24 hours.

### Check Balance

```typescript
async function getBalance(client: axios.AxiosInstance): Promise<Balance> {
  const response = await client.get('/faucet/balance');
  return response.data;
  // Returns: { address, free, locked, total, totalCredits, totalDebits }
}
```

### Request Funds from Faucet

```typescript
interface FaucetResponse {
  success: boolean;
  amount: number;
  balance: Balance;
  nextRequestAt: string;
  newAchievements?: Array<{
    id: string;
    name: string;
    description: string;
  }>;
}

async function requestFaucet(
  client: axios.AxiosInstance,
  referralCode?: string
): Promise<FaucetResponse> {
  const response = await client.post('/faucet/request', {
    referralCode, // Optional: use someone's referral code on first claim
  });
  return response.data;
}

// Check faucet availability
async function getFaucetStats(client: axios.AxiosInstance) {
  const response = await client.get('/faucet/stats');
  return response.data;
  // Returns: { totalRequests, totalAmountReceived, lastRequestAt, nextRequestAt, canRequest }
}
```

### Example: Setup Bot with Funds

```typescript
async function setupBotWallet(privateKey: `0x${string}`) {
  // Authenticate
  const auth = await authenticate(privateKey);
  const client = createAuthenticatedClient(auth.token);

  // Check balance
  let balance = await getBalance(client);
  console.log(`Current balance: ${balance.free} free, ${balance.locked} locked`);

  // Request faucet if needed
  if (balance.free < 1000) {
    const stats = await getFaucetStats(client);
    
    if (stats.canRequest) {
      console.log('Requesting funds from faucet...');
      const result = await requestFaucet(client);
      console.log(`Received ${result.amount} tokens`);
      balance = result.balance;
    } else {
      console.log(`Faucet available at: ${stats.nextRequestAt}`);
    }
  }

  return { client, balance };
}
```

---

## Market Data

### Get All Markets

```typescript
async function getMarkets(client?: axios.AxiosInstance): Promise<Market[]> {
  // Markets endpoint is public (no auth required)
  const response = await axios.get(`${BASE_URL}/clob/markets`);
  return response.data.markets;
}
```

### Get Market Details

```typescript
async function getMarket(symbol: string): Promise<Market> {
  const response = await axios.get(`${BASE_URL}/clob/markets/${symbol}`);
  return response.data;
  // Returns full market info including:
  // - oraclePrice, bestBid, bestAsk, spread
  // - tickSize, lotSize, minOrderSize, maxLeverage
  // - fundingRate, fundingInterval, nextFundingTime
  // - volume24h, high24h, low24h, openInterest
}
```

### Get Order Book

```typescript
async function getOrderBook(symbol: string, depth: number = 20): Promise<OrderBook> {
  const response = await axios.get(`${BASE_URL}/clob/orderbook/${symbol}`, {
    params: { depth },
  });
  return response.data;
  // Returns: { symbol, bids, asks, timestamp, oraclePrice }
}
```

### Get Recent Trades

```typescript
async function getRecentTrades(symbol: string, limit: number = 50) {
  const response = await axios.get(`${BASE_URL}/clob/trades/${symbol}`, {
    params: { limit },
  });
  return response.data.trades;
  // Returns: [{ id, price, quantity, side, timestamp }]
}
```

### Get Candle Data (OHLCV)

```typescript
type CandleInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

async function getCandles(
  symbol: string,
  interval: CandleInterval = '1m',
  limit: number = 400
) {
  const response = await axios.get(`${BASE_URL}/clob/candles/${symbol}`, {
    params: { interval, limit },
  });
  return response.data;
  // Returns: { symbol, interval, candles: [{ timestamp, open, high, low, close, volume, trades }], currentCandle }
}
```

### Get Funding Rate

```typescript
async function getFundingRate(symbol: string) {
  const response = await axios.get(`${BASE_URL}/clob/funding/${symbol}`);
  return response.data;
  // Returns:
  // - fundingRate, fundingRatePercent
  // - predictedFundingRate
  // - annualizedRate, annualizedRatePercent
  // - markPrice, indexPrice, premium
  // - nextFundingTime, fundingIntervalHours
}
```

---

## Placing Orders

### Place a Market Order

```typescript
interface PlaceOrderParams {
  marketSymbol: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  quantity: number;
  price?: number;      // Required for limit orders
  postOnly?: boolean;  // Only for limit orders
  reduceOnly?: boolean; // Only reduce position, don't open new
}

interface PlaceOrderResponse {
  order: Order;
  trades?: Array<{
    tradeId: string;
    price: number;
    quantity: number;
    side: string;
  }>;
  newAchievements?: Array<{
    id: string;
    name: string;
    description: string;
  }>;
}

async function placeOrder(
  client: axios.AxiosInstance,
  params: PlaceOrderParams
): Promise<PlaceOrderResponse> {
  const response = await client.post('/clob/orders', params);
  return response.data;
}

// Example: Buy 0.1 BTC at market price
async function buyMarket(client: axios.AxiosInstance, symbol: string, quantity: number) {
  return placeOrder(client, {
    marketSymbol: symbol,
    side: 'buy',
    type: 'market',
    quantity,
  });
}

// Example: Sell 0.1 BTC at market price
async function sellMarket(client: axios.AxiosInstance, symbol: string, quantity: number) {
  return placeOrder(client, {
    marketSymbol: symbol,
    side: 'sell',
    type: 'market',
    quantity,
  });
}
```

### Place a Limit Order

```typescript
// Example: Place limit buy order
async function placeLimitBuy(
  client: axios.AxiosInstance,
  symbol: string,
  price: number,
  quantity: number,
  postOnly: boolean = false
) {
  return placeOrder(client, {
    marketSymbol: symbol,
    side: 'buy',
    type: 'limit',
    price,
    quantity,
    postOnly,
  });
}

// Example: Place limit sell order
async function placeLimitSell(
  client: axios.AxiosInstance,
  symbol: string,
  price: number,
  quantity: number,
  postOnly: boolean = false
) {
  return placeOrder(client, {
    marketSymbol: symbol,
    side: 'sell',
    type: 'limit',
    price,
    quantity,
    postOnly,
  });
}
```

### Cancel an Order

```typescript
async function cancelOrder(
  client: axios.AxiosInstance,
  orderId: string
): Promise<{ success: boolean; order: { orderId: string; status: string; cancelledAt: string } }> {
  const response = await client.delete(`/clob/orders/${orderId}`);
  return response.data;
}
```

### Get Open Orders

```typescript
async function getOpenOrders(
  client: axios.AxiosInstance,
  marketSymbol?: string
): Promise<Order[]> {
  const response = await client.get('/clob/orders', {
    params: marketSymbol ? { market: marketSymbol } : {},
  });
  return response.data.orders;
}
```

### Get Order History

```typescript
async function getOrderHistory(
  client: axios.AxiosInstance,
  options: { market?: string; limit?: number; offset?: number } = {}
) {
  const response = await client.get('/clob/orders/history', { params: options });
  return response.data;
  // Returns: { orders, pagination: { limit, offset, hasMore } }
}
```

### Get Trade History

```typescript
async function getTradeHistory(
  client: axios.AxiosInstance,
  options: { market?: string; limit?: number; offset?: number } = {}
) {
  const response = await client.get('/clob/trades/history', { params: options });
  return response.data;
  // Returns: { trades, pagination: { limit, offset, hasMore } }
}
```

---

## Managing Positions

### Get All Open Positions

```typescript
async function getPositions(client: axios.AxiosInstance): Promise<Position[]> {
  const response = await client.get('/clob/positions');
  return response.data.positions;
}
```

### Get Position for a Specific Market

```typescript
async function getPosition(
  client: axios.AxiosInstance,
  marketSymbol: string
): Promise<Position | null> {
  const response = await client.get(`/clob/positions/${marketSymbol}`);
  return response.data.position;
}
```

### Get Position Summary

```typescript
async function getPositionSummary(client: axios.AxiosInstance) {
  const response = await client.get('/clob/positions/summary');
  return response.data;
  // Returns: { totalPositions, totalMargin, totalUnrealizedPnl, totalRealizedPnl, totalEquity }
}
```

### Close a Position

```typescript
interface ClosePositionResponse {
  success: boolean;
  closedQuantity: number;
  order: {
    orderId: string;
    averagePrice: number;
    status: string;
  } | null;
  position: Position | null;
}

async function closePosition(
  client: axios.AxiosInstance,
  marketSymbol: string,
  quantity?: number  // Optional: for partial close
): Promise<ClosePositionResponse> {
  const response = await client.post(`/clob/positions/${marketSymbol}/close`, {
    quantity,
  });
  return response.data;
}

// Example: Close entire position
async function closeEntirePosition(client: axios.AxiosInstance, marketSymbol: string) {
  return closePosition(client, marketSymbol);
}

// Example: Partial close (close 50%)
async function closeHalfPosition(client: axios.AxiosInstance, marketSymbol: string) {
  const position = await getPosition(client, marketSymbol);
  if (!position) throw new Error('No position found');
  
  return closePosition(client, marketSymbol, position.size / 2);
}
```

### Get Position History (Closed Positions)

```typescript
async function getPositionHistory(
  client: axios.AxiosInstance,
  options: { market?: string; limit?: number; offset?: number } = {}
) {
  const response = await client.get('/clob/positions/history', { params: options });
  return response.data;
  // Returns: { positions, pagination: { limit, offset, hasMore } }
}
```

---

## WebSocket Real-Time Data

For low-latency trading bots, use WebSocket connections for real-time data.

### Connection Setup

```typescript
// websocket.ts
import { io, Socket } from 'socket.io-client';

const WS_URL = 'ws://localhost:3000';

export function createWebSocket(token?: string): Socket {
  const socket = io(WS_URL, {
    auth: token ? { token } : undefined,
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('WebSocket connected');
  });

  socket.on('disconnect', (reason) => {
    console.log('WebSocket disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('WebSocket connection error:', error.message);
  });

  socket.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  return socket;
}
```

### Subscribe to Price Updates

```typescript
function subscribeToPrices(socket: Socket, symbols: string[]) {
  symbols.forEach((symbol) => {
    socket.emit('subscribe:price', symbol);
  });

  socket.on('price:update', (data) => {
    console.log(`${data.symbol}: $${data.price} (${data.changePercent}%)`);
  });

  socket.on('subscribed', ({ channel, symbol }) => {
    console.log(`Subscribed to ${channel}:${symbol}`);
  });
}
```

### Subscribe to Order Book

```typescript
interface OrderBookUpdate {
  symbol: string;
  side: 'bid' | 'ask';
  price: number;
  quantity: number;
  timestamp: number;
}

function subscribeToOrderBook(
  socket: Socket,
  symbol: string,
  onSnapshot: (data: OrderBook) => void,
  onUpdate: (data: OrderBookUpdate) => void
) {
  socket.emit('subscribe:orderbook', symbol);

  socket.on('orderbook:snapshot', (data) => {
    if (data.symbol === symbol.toUpperCase()) {
      onSnapshot(data);
    }
  });

  socket.on('orderbook:update', (data) => {
    if (data.symbol === symbol.toUpperCase()) {
      onUpdate(data);
    }
  });
}
```

### Subscribe to Trades

```typescript
interface TradeEvent {
  id: string;
  symbol: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  timestamp: number;
}

function subscribeToTrades(
  socket: Socket,
  symbol: string,
  onTrade: (trade: TradeEvent) => void
) {
  socket.emit('subscribe:trades', symbol);

  socket.on('trade:executed', (trade) => {
    if (trade.symbol === symbol.toUpperCase()) {
      onTrade(trade);
    }
  });
}
```

### User Events (Authenticated)

When connected with a valid token, you automatically receive events for your orders and balance:

```typescript
function subscribeToUserEvents(
  socket: Socket,
  callbacks: {
    onOrderCreated?: (order: Order) => void;
    onOrderFilled?: (order: Order) => void;
    onOrderCancelled?: (order: Order) => void;
    onBalanceUpdated?: (balance: Balance) => void;
  }
) {
  if (callbacks.onOrderCreated) {
    socket.on('order:created', callbacks.onOrderCreated);
  }
  if (callbacks.onOrderFilled) {
    socket.on('order:filled', callbacks.onOrderFilled);
  }
  if (callbacks.onOrderCancelled) {
    socket.on('order:cancelled', callbacks.onOrderCancelled);
  }
  if (callbacks.onBalanceUpdated) {
    socket.on('balance:updated', callbacks.onBalanceUpdated);
  }
}
```

### Candle Updates

```typescript
function subscribeToCandles(
  socket: Socket,
  symbol: string,
  interval: CandleInterval,
  onCandle: (candle: any) => void
) {
  socket.emit('subscribe:candles', { symbol, interval });

  socket.on('candle:update', (data) => {
    if (data.symbol === symbol.toUpperCase() && data.interval === interval) {
      onCandle(data);
    }
  });
}
```

---

## Complete Bot Example

Here's a complete example of a simple market-making bot:

```typescript
// bot.ts
import { privateKeyToAccount } from 'viem/accounts';
import axios, { AxiosInstance } from 'axios';
import { io, Socket } from 'socket.io-client';
import { authenticate, createAuthenticatedClient } from './auth';

// Development
const BASE_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000';
// Production
// const BASE_URL = 'https://api.longsword.io';
// const WS_URL = 'wss://api.longsword.io';

interface BotConfig {
  privateKey: `0x${string}`;
  symbol: string;
  spreadPercent: number;
  orderSize: number;
  maxPositionSize: number;
}

class TradingBot {
  private client!: AxiosInstance;
  private socket!: Socket;
  private token!: string;
  private address!: string;
  private config: BotConfig;
  private currentPrice: number = 0;
  private position: Position | null = null;
  private openOrders: Order[] = [];
  private running: boolean = false;

  constructor(config: BotConfig) {
    this.config = config;
  }

  async start() {
    console.log('Starting trading bot...');

    // Authenticate
    const auth = await authenticate(this.config.privateKey);
    this.token = auth.token;
    this.address = auth.address;
    this.client = createAuthenticatedClient(this.token);

    console.log(`Authenticated as ${this.address}`);

    // Check balance
    const balance = await this.getBalance();
    console.log(`Balance: ${balance.free} free, ${balance.locked} locked`);

    if (balance.free < 100) {
      console.log('Low balance, requesting from faucet...');
      await this.requestFaucet();
    }

    // Connect WebSocket
    this.socket = io(WS_URL, {
      auth: { token: this.token },
      transports: ['websocket'],
    });

    await this.setupWebSocket();
    
    // Start trading loop
    this.running = true;
    this.tradingLoop();

    console.log('Bot started!');
  }

  async stop() {
    console.log('Stopping bot...');
    this.running = false;

    // Cancel all orders
    for (const order of this.openOrders) {
      try {
        await this.cancelOrder(order.orderId);
      } catch (e) {
        // Ignore errors during shutdown
      }
    }

    // Disconnect WebSocket
    this.socket?.disconnect();

    console.log('Bot stopped');
  }

  private async setupWebSocket() {
    return new Promise<void>((resolve) => {
      this.socket.on('connect', () => {
        console.log('WebSocket connected');

        // Subscribe to price and orderbook
        this.socket.emit('subscribe:price', this.config.symbol);
        this.socket.emit('subscribe:orderbook', this.config.symbol);

        resolve();
      });

      // Handle price updates
      this.socket.on('price:update', (data) => {
        if (data.symbol === this.config.symbol) {
          this.currentPrice = data.price;
        }
      });

      // Handle user events
      this.socket.on('order:filled', (order) => {
        console.log(`Order filled: ${order.orderId}`);
        this.openOrders = this.openOrders.filter((o) => o.orderId !== order.orderId);
      });

      this.socket.on('order:cancelled', (order) => {
        console.log(`Order cancelled: ${order.orderId}`);
        this.openOrders = this.openOrders.filter((o) => o.orderId !== order.orderId);
      });

      this.socket.on('balance:updated', (balance) => {
        console.log(`Balance updated: ${balance.free} free`);
      });
    });
  }

  private async tradingLoop() {
    while (this.running) {
      try {
        await this.updateState();
        await this.executeStrategy();
      } catch (error) {
        console.error('Trading loop error:', error);
      }

      // Wait before next iteration
      await this.sleep(5000);
    }
  }

  private async updateState() {
    // Get current position
    this.position = await this.getPosition(this.config.symbol);

    // Get open orders
    this.openOrders = await this.getOpenOrders(this.config.symbol);
  }

  private async executeStrategy() {
    if (!this.currentPrice || this.currentPrice === 0) {
      console.log('Waiting for price data...');
      return;
    }

    // Calculate bid/ask prices
    const halfSpread = (this.config.spreadPercent / 100) * this.currentPrice / 2;
    const bidPrice = Math.floor((this.currentPrice - halfSpread) * 100) / 100;
    const askPrice = Math.ceil((this.currentPrice + halfSpread) * 100) / 100;

    console.log(`Price: $${this.currentPrice}, Bid: $${bidPrice}, Ask: $${askPrice}`);

    // Check position size limits
    const positionSize = this.position?.size || 0;
    const canBuy = positionSize < this.config.maxPositionSize;
    const canSell = this.position && positionSize > 0;

    // Cancel stale orders
    for (const order of this.openOrders) {
      const priceDiff = Math.abs(order.price - this.currentPrice);
      const maxDiff = this.currentPrice * 0.02; // 2% max deviation

      if (priceDiff > maxDiff) {
        console.log(`Cancelling stale order ${order.orderId}`);
        await this.cancelOrder(order.orderId);
      }
    }

    // Place new orders if we don't have active ones
    const hasBuyOrder = this.openOrders.some((o) => o.side === 'buy');
    const hasSellOrder = this.openOrders.some((o) => o.side === 'sell');

    if (!hasBuyOrder && canBuy) {
      try {
        const result = await this.placeLimitOrder('buy', bidPrice, this.config.orderSize);
        console.log(`Placed buy order: ${result.order.orderId} @ $${bidPrice}`);
        this.openOrders.push(result.order);
      } catch (error: any) {
        console.error('Failed to place buy order:', error.response?.data?.message || error.message);
      }
    }

    if (!hasSellOrder && canSell) {
      try {
        const result = await this.placeLimitOrder('sell', askPrice, Math.min(this.config.orderSize, positionSize));
        console.log(`Placed sell order: ${result.order.orderId} @ $${askPrice}`);
        this.openOrders.push(result.order);
      } catch (error: any) {
        console.error('Failed to place sell order:', error.response?.data?.message || error.message);
      }
    }
  }

  // Helper methods
  private async getBalance() {
    const response = await this.client.get('/faucet/balance');
    return response.data;
  }

  private async requestFaucet() {
    const response = await this.client.post('/faucet/request');
    return response.data;
  }

  private async getPosition(symbol: string) {
    const response = await this.client.get(`/clob/positions/${symbol}`);
    return response.data.position;
  }

  private async getOpenOrders(symbol: string) {
    const response = await this.client.get('/clob/orders', {
      params: { market: symbol },
    });
    return response.data.orders;
  }

  private async placeLimitOrder(side: 'buy' | 'sell', price: number, quantity: number) {
    const response = await this.client.post('/clob/orders', {
      marketSymbol: this.config.symbol,
      side,
      type: 'limit',
      price,
      quantity,
    });
    return response.data;
  }

  private async cancelOrder(orderId: string) {
    const response = await this.client.delete(`/clob/orders/${orderId}`);
    return response.data;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Run the bot
async function main() {
  const bot = new TradingBot({
    privateKey: process.env.PRIVATE_KEY as `0x${string}`,
    symbol: 'AAPL-PERP',
    spreadPercent: 0.5,
    orderSize: 1,
    maxPositionSize: 10,
  });

  // Handle shutdown
  process.on('SIGINT', async () => {
    await bot.stop();
    process.exit(0);
  });

  await bot.start();
}

main().catch(console.error);
```

---

## Error Handling

### Common Error Codes

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid authorization header |
| `INVALID_TOKEN` | 401 | Token is expired or invalid |
| `INVALID_REQUEST` | 400 | Missing or invalid request parameters |
| `INSUFFICIENT_BALANCE` | 400 | Not enough free balance |
| `ORDER_FAILED` | 400 | Order placement failed |
| `CANCEL_FAILED` | 400 | Order cancellation failed |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

### Error Response Format

```typescript
interface ErrorResponse {
  error: string;      // Error code
  message: string;    // Human-readable message
  nextRequestAt?: string; // For rate-limited responses
}
```

### Handling Errors

```typescript
async function safeApiCall<T>(apiCall: () => Promise<T>): Promise<T | null> {
  try {
    return await apiCall();
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const data = error.response?.data;
      const status = error.response?.status;

      if (status === 401) {
        console.error('Authentication error - need to re-authenticate');
        // Re-authenticate logic here
      } else if (status === 429) {
        console.error(`Rate limited. Retry after: ${data?.nextRequestAt}`);
      } else if (status === 400) {
        console.error(`Bad request: ${data?.message}`);
      } else {
        console.error(`API error: ${data?.message || error.message}`);
      }
    } else {
      console.error('Unexpected error:', error);
    }
    return null;
  }
}
```

---

## Rate Limits

### REST API

- **Faucet requests**: 1 per 24 hours
- **General API**: No strict limits, but avoid excessive polling

### WebSocket

- **Subscriptions**: Reasonable limits apply
- **Messages**: High-frequency updates supported

### Best Practices

1. **Use WebSocket** for real-time data instead of polling REST endpoints
2. **Cache market data** locally and update via WebSocket
3. **Batch operations** where possible
4. **Implement exponential backoff** for retries
5. **Handle disconnections** gracefully and re-subscribe

```typescript
// Example: Exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}
```

---

## API Reference Quick Links

### Public Endpoints (No Auth Required)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/clob/markets` | GET | Get all markets |
| `/clob/markets/:symbol` | GET | Get market details |
| `/clob/orderbook/:symbol` | GET | Get order book |
| `/clob/trades/:symbol` | GET | Get recent trades |
| `/clob/candles/:symbol` | GET | Get candle data |
| `/clob/funding/:symbol` | GET | Get funding rate |
| `/faucet/global-stats` | GET | Global faucet stats |

### Authenticated Endpoints (Auth Required)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/me` | GET | Get current user |
| `/faucet/balance` | GET | Get balance |
| `/faucet/request` | POST | Request faucet funds |
| `/clob/orders` | POST | Place order |
| `/clob/orders` | GET | Get open orders |
| `/clob/orders/:id` | DELETE | Cancel order |
| `/clob/orders/history` | GET | Get order history |
| `/clob/trades/history` | GET | Get trade history |
| `/clob/positions` | GET | Get open positions |
| `/clob/positions/:symbol` | GET | Get position for market |
| `/clob/positions/:symbol/close` | POST | Close position |
| `/clob/positions/summary` | GET | Get position summary |
| `/clob/positions/history` | GET | Get closed positions |

---

## Support

For issues or questions:
1. Check the error response messages
2. Verify your authentication token is valid
3. Ensure you have sufficient balance for trading
4. Review the rate limit guidelines
