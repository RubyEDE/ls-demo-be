import { getQuote } from "./finnhub.service";
import { broadcastPriceUpdate, getSubscriptionCount, getActiveChannels, PriceUpdate } from "./websocket.service";

// Store last known prices
const lastPrices = new Map<string, PriceUpdate>();

// Active polling intervals
const pollingIntervals = new Map<string, NodeJS.Timeout>();

// Default polling interval (in ms) - longer to avoid API spam
// Note: Required markets (AAPL, GOOGL, MSFT) are already polled by market.service.ts
const POLLING_INTERVAL = 30000; // 30 seconds

// Markets that are already being polled by market.service.ts
const REQUIRED_MARKET_SYMBOLS = ["AAPL-PERP", "GOOGL-PERP", "MSFT-PERP"];

/**
 * Start polling prices for a symbol
 * Note: Required markets (AAPL-PERP, etc.) are already polled by market.service.ts
 */
export function startPricePolling(symbol: string, intervalMs: number = POLLING_INTERVAL): void {
  const upperSymbol = symbol.toUpperCase();
  
  // Skip if this is a required market - already being polled by market.service.ts
  if (REQUIRED_MARKET_SYMBOLS.includes(upperSymbol)) {
    console.log(`📈 ${upperSymbol} already polled by market service, skipping`);
    return;
  }
  
  // Already polling this symbol
  if (pollingIntervals.has(upperSymbol)) {
    return;
  }
  
  console.log(`📈 Starting price polling for ${upperSymbol}`);
  
  // Fetch immediately
  fetchAndBroadcastPrice(upperSymbol);
  
  // Set up interval
  const interval = setInterval(() => {
    // Check if anyone is still subscribed
    const subscriberCount = getSubscriptionCount(`price:${upperSymbol}`);
    if (subscriberCount === 0) {
      stopPricePolling(upperSymbol);
      return;
    }
    
    fetchAndBroadcastPrice(upperSymbol);
  }, intervalMs);
  
  pollingIntervals.set(upperSymbol, interval);
}

/**
 * Stop polling prices for a symbol
 */
export function stopPricePolling(symbol: string): void {
  const upperSymbol = symbol.toUpperCase();
  const interval = pollingIntervals.get(upperSymbol);
  
  if (interval) {
    clearInterval(interval);
    pollingIntervals.delete(upperSymbol);
    console.log(`📉 Stopped price polling for ${upperSymbol}`);
  }
}

/**
 * Fetch price from Finnhub and broadcast to subscribers
 */
async function fetchAndBroadcastPrice(symbol: string): Promise<void> {
  try {
    const quote = await getQuote(symbol);
    
    const priceUpdate: PriceUpdate = {
      symbol: quote.symbol,
      price: quote.currentPrice,
      change: quote.change,
      changePercent: quote.percentChange,
      high: quote.highPrice,
      low: quote.lowPrice,
      timestamp: quote.timestamp * 1000, // Convert to ms
    };
    
    // Store last price
    lastPrices.set(symbol, priceUpdate);
    
    // Broadcast to subscribers
    broadcastPriceUpdate(symbol, priceUpdate);
  } catch (error) {
    console.error(`Failed to fetch price for ${symbol}:`, error);
  }
}

/**
 * Get last known price for a symbol
 */
export function getLastPrice(symbol: string): PriceUpdate | undefined {
  return lastPrices.get(symbol.toUpperCase());
}

/**
 * Get all last known prices
 */
export function getAllLastPrices(): Map<string, PriceUpdate> {
  return new Map(lastPrices);
}

/**
 * Check which symbols are being polled
 */
export function getPollingSymbols(): string[] {
  return Array.from(pollingIntervals.keys());
}

/**
 * Auto-manage polling based on subscriptions
 * Call this periodically to start/stop polling as needed
 */
export function managePricePolling(): void {
  const activeChannels = getActiveChannels();
  const priceChannels = activeChannels.filter((c) => c.startsWith("price:"));
  
  // Start polling for new subscriptions
  priceChannels.forEach((channel) => {
    const symbol = channel.replace("price:", "");
    if (!pollingIntervals.has(symbol)) {
      startPricePolling(symbol);
    }
  });
  
  // Stop polling for symbols with no subscribers
  pollingIntervals.forEach((_, symbol) => {
    const subscriberCount = getSubscriptionCount(`price:${symbol}`);
    if (subscriberCount === 0) {
      stopPricePolling(symbol);
    }
  });
}

/**
 * Start the price feed manager (checks subscriptions periodically)
 */
let managerInterval: NodeJS.Timeout | null = null;

export function startPriceFeedManager(checkIntervalMs: number = 10000): void {
  if (managerInterval) return;
  
  managerInterval = setInterval(managePricePolling, checkIntervalMs);
  console.log("📊 Price feed manager started");
}

export function stopPriceFeedManager(): void {
  if (managerInterval) {
    clearInterval(managerInterval);
    managerInterval = null;
  }
  
  // Stop all polling
  pollingIntervals.forEach((interval) => clearInterval(interval));
  pollingIntervals.clear();
  console.log("📊 Price feed manager stopped");
}
