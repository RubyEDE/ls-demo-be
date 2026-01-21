/**
 * Steam Community Market Oracle Service
 * 
 * Fetches CS:GO item prices from Steam Community Market API
 */

import { CSGO_ITEMS, CSGOItem, getSteamPriceUrl } from "../config/csgo-markets.config";
import { broadcastPriceUpdate } from "./websocket.service";
import { Market } from "../models/market.model";
import { updateOraclePrice } from "./market.service";

// Steam API response type
interface SteamPriceResponse {
  success: boolean;
  lowest_price?: string;   // e.g., "$1.23"
  volume?: string;         // e.g., "1,234"
  median_price?: string;   // e.g., "$1.20"
}

// Parsed price data
export interface SteamPrice {
  symbol: string;
  lowestPrice: number;
  medianPrice: number;
  volume: number;
  success: boolean;
  timestamp: number;
}

// In-memory price cache
const priceCache = new Map<string, SteamPrice>();

// Active polling intervals
const pollingIntervals = new Map<string, NodeJS.Timeout>();

// Rate limiting - Steam API has rate limits, so we need to be careful
const STEAM_API_DELAY_MS = 3000; // 3 seconds between requests to avoid rate limiting
let lastRequestTime = 0;

/**
 * Parse price string from Steam API (e.g., "$1.23" -> 1.23)
 */
function parseSteamPrice(priceStr: string | undefined): number {
  if (!priceStr) return 0;
  // Remove currency symbols and commas, then parse
  const cleaned = priceStr.replace(/[^0-9.]/g, "");
  return parseFloat(cleaned) || 0;
}

/**
 * Parse volume string from Steam API (e.g., "1,234" -> 1234)
 */
function parseSteamVolume(volumeStr: string | undefined): number {
  if (!volumeStr) return 0;
  const cleaned = volumeStr.replace(/[^0-9]/g, "");
  return parseInt(cleaned, 10) || 0;
}

/**
 * Rate-limited fetch to avoid Steam API throttling
 */
async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < STEAM_API_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, STEAM_API_DELAY_MS - timeSinceLastRequest));
  }
  
  lastRequestTime = Date.now();
  return fetch(url);
}

/**
 * Fetch price from Steam Community Market API
 */
export async function fetchSteamPrice(item: CSGOItem): Promise<SteamPrice> {
  const url = getSteamPriceUrl(item.steamMarketHashName);
  
  try {
    const response = await rateLimitedFetch(url);
    
    if (!response.ok) {
      console.error(`Steam API error for ${item.symbol}: ${response.status} ${response.statusText}`);
      return {
        symbol: item.symbol,
        lowestPrice: 0,
        medianPrice: 0,
        volume: 0,
        success: false,
        timestamp: Date.now(),
      };
    }
    
    const data: SteamPriceResponse = await response.json();
    
    if (!data.success) {
      console.error(`Steam API returned success=false for ${item.symbol}`);
      return {
        symbol: item.symbol,
        lowestPrice: 0,
        medianPrice: 0,
        volume: 0,
        success: false,
        timestamp: Date.now(),
      };
    }
    
    const steamPrice: SteamPrice = {
      symbol: item.symbol,
      lowestPrice: parseSteamPrice(data.lowest_price),
      medianPrice: parseSteamPrice(data.median_price),
      volume: parseSteamVolume(data.volume),
      success: true,
      timestamp: Date.now(),
    };
    
    // Cache the price
    priceCache.set(item.symbol, steamPrice);
    
    return steamPrice;
  } catch (error) {
    console.error(`Failed to fetch Steam price for ${item.symbol}:`, error);
    return {
      symbol: item.symbol,
      lowestPrice: 0,
      medianPrice: 0,
      volume: 0,
      success: false,
      timestamp: Date.now(),
    };
  }
}

/**
 * Get item config by symbol
 */
export function getItemBySymbol(symbol: string): CSGOItem | undefined {
  return CSGO_ITEMS.find(item => item.symbol === symbol.toUpperCase());
}

/**
 * Fetch and update oracle price for a market
 */
export async function fetchAndUpdateSteamPrice(symbol: string): Promise<number | null> {
  const item = getItemBySymbol(symbol);
  if (!item) {
    console.error(`Unknown CS:GO item symbol: ${symbol}`);
    return null;
  }
  
  const steamPrice = await fetchSteamPrice(item);
  
  if (!steamPrice.success || steamPrice.lowestPrice === 0) {
    // Return cached price if available
    const cached = priceCache.get(symbol);
    return cached?.lowestPrice ?? null;
  }
  
  // Update market oracle price in database AND in-memory cache
  const market = await updateOraclePrice(symbol, steamPrice.lowestPrice);
  
  if (market) {
    // Broadcast price update via WebSocket
    broadcastPriceUpdate(symbol, {
      symbol: symbol,
      price: steamPrice.lowestPrice,
      change: 0,  // Steam doesn't provide change data
      changePercent: 0,
      high: steamPrice.lowestPrice,
      low: steamPrice.medianPrice || steamPrice.lowestPrice,
      timestamp: steamPrice.timestamp,
    });
  }
  
  console.log(`📦 ${item.name}: $${steamPrice.lowestPrice.toFixed(2)} (vol: ${steamPrice.volume})`);
  
  return steamPrice.lowestPrice;
}

/**
 * Get cached price for a symbol
 */
export function getCachedSteamPrice(symbol: string): SteamPrice | undefined {
  return priceCache.get(symbol.toUpperCase());
}

/**
 * Get all cached prices
 */
export function getAllCachedPrices(): Map<string, SteamPrice> {
  return new Map(priceCache);
}

/**
 * Start price polling for a symbol
 */
export function startSteamPricePolling(symbol: string, intervalMs: number = 60000): void {
  const upperSymbol = symbol.toUpperCase();
  
  if (pollingIntervals.has(upperSymbol)) {
    return;
  }
  
  const item = getItemBySymbol(upperSymbol);
  if (!item) {
    console.error(`Cannot start polling for unknown symbol: ${symbol}`);
    return;
  }
  
  console.log(`🎮 Starting Steam price polling for ${item.name}`);
  
  // Fetch immediately
  fetchAndUpdateSteamPrice(upperSymbol);
  
  // Set up interval (default 60s to respect Steam rate limits)
  const interval = setInterval(() => {
    fetchAndUpdateSteamPrice(upperSymbol);
  }, intervalMs);
  
  pollingIntervals.set(upperSymbol, interval);
}

/**
 * Stop price polling for a symbol
 */
export function stopSteamPricePolling(symbol: string): void {
  const upperSymbol = symbol.toUpperCase();
  const interval = pollingIntervals.get(upperSymbol);
  
  if (interval) {
    clearInterval(interval);
    pollingIntervals.delete(upperSymbol);
    console.log(`🛑 Stopped Steam price polling for ${upperSymbol}`);
  }
}

/**
 * Start polling for all configured CS:GO items
 */
export async function startAllSteamPricePolling(intervalMs: number = 60000): Promise<void> {
  console.log("🎮 Starting Steam price polling for all CS:GO items...");
  
  // Stagger the initial fetches to avoid rate limiting
  for (let i = 0; i < CSGO_ITEMS.length; i++) {
    const item = CSGO_ITEMS[i];
    
    // Delay each item start to avoid hitting rate limits
    setTimeout(() => {
      startSteamPricePolling(item.symbol, intervalMs);
    }, i * STEAM_API_DELAY_MS);
  }
}

/**
 * Stop all price polling
 */
export function stopAllSteamPricePolling(): void {
  pollingIntervals.forEach((interval, symbol) => {
    clearInterval(interval);
    console.log(`🛑 Stopped Steam price polling for ${symbol}`);
  });
  pollingIntervals.clear();
}

/**
 * Initialize CS:GO markets in database
 */
export async function initializeCSGOMarkets(): Promise<void> {
  console.log("🎮 Initializing CS:GO markets...");
  
  for (const item of CSGO_ITEMS) {
    const existing = await Market.findOne({ symbol: item.symbol });
    
    if (!existing) {
      const market = new Market({
        symbol: item.symbol,
        name: item.name,
        baseAsset: item.baseAsset,
        quoteAsset: "USD",
        steamMarketHashName: item.steamMarketHashName,
        tickSize: item.tickSize ?? 0.01,
        lotSize: item.lotSize ?? 1,
        minOrderSize: item.minOrderSize ?? 1,
        maxLeverage: item.maxLeverage ?? 10,
        initialMarginRate: item.initialMarginRate ?? 0.1,
        maintenanceMarginRate: item.maintenanceMarginRate ?? 0.05,
        status: "active",
      });
      
      await market.save();
      console.log(`   ✅ Created CS:GO market: ${market.symbol}`);
    } else {
      console.log(`   ✓ CS:GO market exists: ${existing.symbol}`);
    }
  }
  
  const activeMarkets = await Market.find({ status: "active" });
  console.log(`🎮 ${activeMarkets.length} active CS:GO markets ready: ${activeMarkets.map(m => m.symbol).join(", ")}`);
}

/**
 * Fetch all prices once (useful for initial load)
 */
export async function fetchAllSteamPrices(): Promise<Map<string, SteamPrice>> {
  console.log("🎮 Fetching all CS:GO item prices...");
  
  const results = new Map<string, SteamPrice>();
  
  for (const item of CSGO_ITEMS) {
    const price = await fetchSteamPrice(item);
    results.set(item.symbol, price);
    
    if (price.success) {
      console.log(`   📦 ${item.name}: $${price.lowestPrice.toFixed(2)}`);
    } else {
      console.log(`   ❌ ${item.name}: Failed to fetch price`);
    }
  }
  
  return results;
}

/**
 * Get all configured CS:GO items
 */
export function getConfiguredItems(): CSGOItem[] {
  return [...CSGO_ITEMS];
}
