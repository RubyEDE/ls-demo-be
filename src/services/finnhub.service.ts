import { config } from "../config/env";

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

// Rate limiting - Finnhub free tier allows 60 calls/minute
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const MAX_CALLS_PER_WINDOW = 50; // Leave some headroom
const MIN_CALL_INTERVAL_MS = 1200; // Minimum 1.2 seconds between calls

// Track API calls for rate limiting
let callTimestamps: number[] = [];
let lastCallTime = 0;

/**
 * Wait if needed to respect rate limits
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  
  // Clean up old timestamps
  callTimestamps = callTimestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  
  // Check if we've hit the rate limit
  if (callTimestamps.length >= MAX_CALLS_PER_WINDOW) {
    const oldestCall = callTimestamps[0];
    const waitTime = RATE_LIMIT_WINDOW_MS - (now - oldestCall) + 100;
    if (waitTime > 0) {
      console.log(`⏳ Rate limit reached, waiting ${Math.round(waitTime/1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  // Ensure minimum interval between calls
  const timeSinceLastCall = now - lastCallTime;
  if (timeSinceLastCall < MIN_CALL_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_CALL_INTERVAL_MS - timeSinceLastCall));
  }
}

/**
 * Record an API call for rate limiting
 */
function recordApiCall(): void {
  const now = Date.now();
  callTimestamps.push(now);
  lastCallTime = now;
}

/**
 * Get current rate limit status
 */
export function getRateLimitStatus(): {
  callsInLastMinute: number;
  maxCallsPerMinute: number;
  canMakeCall: boolean;
} {
  const now = Date.now();
  callTimestamps = callTimestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  return {
    callsInLastMinute: callTimestamps.length,
    maxCallsPerMinute: MAX_CALLS_PER_WINDOW,
    canMakeCall: callTimestamps.length < MAX_CALLS_PER_WINDOW,
  };
}

// Types for Finnhub responses
export interface Quote {
  symbol: string;
  currentPrice: number;
  change: number;
  percentChange: number;
  highPrice: number;
  lowPrice: number;
  openPrice: number;
  previousClose: number;
  timestamp: number;
}

export interface CompanyProfile {
  symbol: string;
  name: string;
  country: string;
  currency: string;
  exchange: string;
  industry: string;
  logo: string;
  marketCapitalization: number;
  weburl: string;
  phone: string;
}

export interface MarketNews {
  id: number;
  category: string;
  datetime: number;
  headline: string;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
}

export interface SymbolSearchResult {
  description: string;
  displaySymbol: string;
  symbol: string;
  type: string;
}

/**
 * Make authenticated request to Finnhub API
 * Includes rate limiting to avoid hitting API limits
 */
async function finnhubFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  // Wait for rate limit if needed
  await waitForRateLimit();
  
  const url = new URL(`${FINNHUB_BASE_URL}${endpoint}`);
  url.searchParams.set("token", config.finnhubApiKey);
  
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  
  // Record this call for rate limiting
  recordApiCall();
  
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    // Handle rate limit response from Finnhub
    if (response.status === 429) {
      console.warn("⚠️ Finnhub rate limit hit, waiting 60 seconds...");
      await new Promise(resolve => setTimeout(resolve, 60000));
      // Retry once
      const retryResponse = await fetch(url.toString());
      if (!retryResponse.ok) {
        throw new Error(`Finnhub API error: ${retryResponse.status} ${retryResponse.statusText}`);
      }
      return retryResponse.json() as Promise<T>;
    }
    throw new Error(`Finnhub API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json() as Promise<T>;
}

/**
 * Get real-time quote for a stock
 */
export async function getQuote(symbol: string): Promise<Quote> {
  interface FinnhubQuote {
    c: number;
    d: number;
    dp: number;
    h: number;
    l: number;
    o: number;
    pc: number;
    t: number;
  }
  
  const data = await finnhubFetch<FinnhubQuote>("/quote", { symbol: symbol.toUpperCase() });
  
  return {
    symbol: symbol.toUpperCase(),
    currentPrice: data.c || 0,
    change: data.d || 0,
    percentChange: data.dp || 0,
    highPrice: data.h || 0,
    lowPrice: data.l || 0,
    openPrice: data.o || 0,
    previousClose: data.pc || 0,
    timestamp: data.t || Math.floor(Date.now() / 1000),
  };
}

/**
 * Get company profile
 */
export async function getCompanyProfile(symbol: string): Promise<CompanyProfile> {
  interface FinnhubProfile {
    country: string;
    currency: string;
    exchange: string;
    finnhubIndustry: string;
    ipo: string;
    logo: string;
    marketCapitalization: number;
    name: string;
    phone: string;
    shareOutstanding: number;
    ticker: string;
    weburl: string;
  }
  
  const data = await finnhubFetch<FinnhubProfile>("/stock/profile2", { symbol: symbol.toUpperCase() });
  
  return {
    symbol: symbol.toUpperCase(),
    name: data.name || "",
    country: data.country || "",
    currency: data.currency || "",
    exchange: data.exchange || "",
    industry: data.finnhubIndustry || "",
    logo: data.logo || "",
    marketCapitalization: data.marketCapitalization || 0,
    weburl: data.weburl || "",
    phone: data.phone || "",
  };
}

/**
 * Get market news
 */
export async function getMarketNews(category: string = "general"): Promise<MarketNews[]> {
  interface FinnhubNews {
    id: number;
    category: string;
    datetime: number;
    headline: string;
    image: string;
    related: string;
    source: string;
    summary: string;
    url: string;
  }
  
  const data = await finnhubFetch<FinnhubNews[]>("/news", { category });
  
  return (data || []).map((item) => ({
    id: item.id || 0,
    category: item.category || "",
    datetime: item.datetime || 0,
    headline: item.headline || "",
    image: item.image || "",
    related: item.related || "",
    source: item.source || "",
    summary: item.summary || "",
    url: item.url || "",
  }));
}

/**
 * Get company news
 */
export async function getCompanyNews(
  symbol: string,
  from: string,
  to: string
): Promise<MarketNews[]> {
  interface FinnhubCompanyNews {
    id: number;
    category: string;
    datetime: number;
    headline: string;
    image: string;
    related: string;
    source: string;
    summary: string;
    url: string;
  }
  
  const data = await finnhubFetch<FinnhubCompanyNews[]>("/company-news", {
    symbol: symbol.toUpperCase(),
    from,
    to,
  });
  
  return (data || []).map((item) => ({
    id: item.id || 0,
    category: item.category || "",
    datetime: item.datetime || 0,
    headline: item.headline || "",
    image: item.image || "",
    related: item.related || "",
    source: item.source || "",
    summary: item.summary || "",
    url: item.url || "",
  }));
}

/**
 * Search for symbols
 */
export async function searchSymbols(query: string): Promise<SymbolSearchResult[]> {
  interface FinnhubSearchResult {
    description: string;
    displaySymbol: string;
    symbol: string;
    type: string;
  }
  
  interface FinnhubSearchResponse {
    count: number;
    result: FinnhubSearchResult[];
  }
  
  const data = await finnhubFetch<FinnhubSearchResponse>("/search", { q: query });
  
  return (data.result || []).map((item) => ({
    description: item.description || "",
    displaySymbol: item.displaySymbol || "",
    symbol: item.symbol || "",
    type: item.type || "",
  }));
}

/**
 * Get basic financials
 */
export async function getBasicFinancials(
  symbol: string,
  metric: string = "all"
): Promise<Record<string, unknown>> {
  interface FinnhubFinancials {
    symbol: string;
    metric: Record<string, unknown>;
    series: Record<string, unknown>;
  }
  
  const data = await finnhubFetch<FinnhubFinancials>("/stock/metric", {
    symbol: symbol.toUpperCase(),
    metric,
  });
  
  return {
    symbol: data.symbol || symbol.toUpperCase(),
    metric: data.metric || {},
    series: data.series || {},
  };
}

/**
 * Get earnings calendar
 */
export async function getEarningsCalendar(
  from: string,
  to: string,
  symbol?: string
): Promise<Array<{ date: string; symbol: string; hour: string; epsEstimate: number; epsActual: number }>> {
  interface FinnhubEarningsItem {
    date: string;
    symbol: string;
    hour: string;
    epsEstimate: number;
    epsActual: number;
  }
  
  interface FinnhubEarningsResponse {
    earningsCalendar: FinnhubEarningsItem[];
  }
  
  const params: Record<string, string> = { from, to };
  if (symbol) {
    params.symbol = symbol.toUpperCase();
  }
  
  const data = await finnhubFetch<FinnhubEarningsResponse>("/calendar/earnings", params);
  
  return (data.earningsCalendar || []).map((item) => ({
    date: item.date || "",
    symbol: item.symbol || "",
    hour: item.hour || "",
    epsEstimate: item.epsEstimate || 0,
    epsActual: item.epsActual || 0,
  }));
}

/**
 * Historical candle data from Finnhub
 */
export interface HistoricalCandle {
  timestamp: number;  // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Finnhub resolution types
 * 1, 5, 15, 30, 60 = minutes
 * D = Daily, W = Weekly, M = Monthly
 */
export type FinnhubResolution = "1" | "5" | "15" | "30" | "60" | "D" | "W" | "M";

/**
 * Get historical stock candles
 * @param symbol Stock symbol (e.g., "AAPL")
 * @param resolution Candle resolution (1, 5, 15, 30, 60 minutes, or D, W, M)
 * @param from Start time (Unix timestamp in seconds)
 * @param to End time (Unix timestamp in seconds)
 */
export async function getHistoricalCandles(
  symbol: string,
  resolution: FinnhubResolution,
  from: number,
  to: number
): Promise<HistoricalCandle[]> {
  interface FinnhubCandleResponse {
    s: string;  // Status: "ok" or "no_data"
    c: number[]; // Close prices
    h: number[]; // High prices
    l: number[]; // Low prices
    o: number[]; // Open prices
    t: number[]; // Timestamps
    v: number[]; // Volumes
  }
  
  const data = await finnhubFetch<FinnhubCandleResponse>("/stock/candle", {
    symbol: symbol.toUpperCase(),
    resolution,
    from: from.toString(),
    to: to.toString(),
  });
  
  // Check if we got data
  if (data.s !== "ok" || !data.t || data.t.length === 0) {
    return [];
  }
  
  // Convert to our format
  const candles: HistoricalCandle[] = [];
  for (let i = 0; i < data.t.length; i++) {
    candles.push({
      timestamp: data.t[i],
      open: data.o[i],
      high: data.h[i],
      low: data.l[i],
      close: data.c[i],
      volume: data.v[i],
    });
  }
  
  return candles;
}

/**
 * Get historical candles for the past N days
 * Convenience wrapper around getHistoricalCandles
 */
export async function getHistoricalCandlesDays(
  symbol: string,
  resolution: FinnhubResolution,
  days: number
): Promise<HistoricalCandle[]> {
  const now = Math.floor(Date.now() / 1000);
  const from = now - (days * 24 * 60 * 60);
  
  return getHistoricalCandles(symbol, resolution, from, now);
}

/**
 * Get historical candles for the past year
 */
export async function getYearlyCandles(
  symbol: string,
  resolution: FinnhubResolution = "D"
): Promise<HistoricalCandle[]> {
  return getHistoricalCandlesDays(symbol, resolution, 365);
}

/**
 * Check if Finnhub is configured
 */
export function isConfigured(): boolean {
  return Boolean(config.finnhubApiKey);
}
