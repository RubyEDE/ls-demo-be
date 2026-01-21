/**
 * CS:GO Markets Configuration
 * 
 * Add new markets by adding entries to the CSGO_ITEMS array below.
 * Each item needs:
 *   - symbol: Unique trading symbol (e.g., "AK47-REDLINE-PERP")
 *   - name: Display name
 *   - steamMarketHashName: The exact market_hash_name from Steam URL (URL encoded)
 *   - steamUrl: Full Steam Community Market price overview URL
 * 
 * To find the market_hash_name for a new item:
 * 1. Go to Steam Community Market
 * 2. Find the item you want
 * 3. Copy the market_hash_name from the URL
 * 4. The URL format is: https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=YOUR_ITEM_NAME
 */

export interface CSGOItem {
  // Trading identifiers
  symbol: string;
  name: string;
  baseAsset: string;
  
  // Steam Market details
  steamMarketHashName: string;  // URL-encoded name for API calls
  steamUrl: string;             // Full URL for reference
  
  // Market parameters (optional overrides)
  tickSize?: number;
  lotSize?: number;
  minOrderSize?: number;
  maxLeverage?: number;
  initialMarginRate?: number;
  maintenanceMarginRate?: number;
}

/**
 * CS:GO Items for Trading
 * 
 * Add new items here! Just copy an existing entry and modify:
 */
export const CSGO_ITEMS: CSGOItem[] = [
  {
    symbol: "WEAPON-CASE-3-PERP",
    name: "CS:GO Weapon Case 3 Perpetual",
    baseAsset: "WEAPON-CASE-3",
    steamMarketHashName: "CS%3AGO%20Weapon%20Case%203",
    steamUrl: "https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=CS%3AGO%20Weapon%20Case%203",
    tickSize: 0.01,
    lotSize: 1,
    minOrderSize: 1,
    maxLeverage: 10,
    initialMarginRate: 0.1,
    maintenanceMarginRate: 0.05,
  },
  {
    symbol: "AK47-REDLINE-PERP",
    name: "AK-47 Redline (Field-Tested) Perpetual",
    baseAsset: "AK47-REDLINE",
    steamMarketHashName: "AK-47%20%7C%20Redline%20%28Field-Tested%29",
    steamUrl: "https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=AK-47%20%7C%20Redline%20%28Field-Tested%29",
    tickSize: 0.01,
    lotSize: 1,
    minOrderSize: 1,
    maxLeverage: 10,
    initialMarginRate: 0.1,
    maintenanceMarginRate: 0.05,
  },
  {
    symbol: "GLOVE-CASE-PERP",
    name: "Glove Case Perpetual",
    baseAsset: "GLOVE-CASE",
    steamMarketHashName: "Glove%20Case",
    steamUrl: "https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=Glove%20Case",
    tickSize: 0.01,
    lotSize: 1,
    minOrderSize: 1,
    maxLeverage: 10,
    initialMarginRate: 0.1,
    maintenanceMarginRate: 0.05,
  },
];

/**
 * Helper to add a new item quickly
 * 
 * Usage:
 *   import { createCSGOItem } from "./csgo-markets.config";
 *   const newItem = createCSGOItem(
 *     "DRAGON-LORE-PERP",
 *     "AWP Dragon Lore",
 *     "AWP%20%7C%20Dragon%20Lore%20%28Factory%20New%29"
 *   );
 */
export function createCSGOItem(
  symbol: string,
  name: string,
  steamMarketHashName: string,
  overrides?: Partial<CSGOItem>
): CSGOItem {
  return {
    symbol: symbol.toUpperCase(),
    name: `${name} Perpetual`,
    baseAsset: symbol.replace("-PERP", "").toUpperCase(),
    steamMarketHashName,
    steamUrl: `https://steamcommunity.com/market/priceoverview/?appid=730&currency=1&market_hash_name=${steamMarketHashName}`,
    tickSize: 0.01,
    lotSize: 1,
    minOrderSize: 1,
    maxLeverage: 10,
    initialMarginRate: 0.1,
    maintenanceMarginRate: 0.05,
    ...overrides,
  };
}

/**
 * Get Steam price URL for an item
 */
export function getSteamPriceUrl(steamMarketHashName: string, currency: number = 1): string {
  return `https://steamcommunity.com/market/priceoverview/?appid=730&currency=${currency}&market_hash_name=${steamMarketHashName}`;
}
