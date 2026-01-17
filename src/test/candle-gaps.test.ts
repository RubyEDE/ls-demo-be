/**
 * Candle Gap Detection and Filling Test
 * 
 * Tests the candle gap detection and filling functionality.
 * Run with: yarn tsx src/test/candle-gaps.test.ts
 * 
 * Prerequisites:
 * - Server should be running (yarn dev)
 */

const BASE_URL = "http://localhost:3000";

const MARKETS = ["AAPL-PERP", "GOOGL-PERP", "MSFT-PERP"];

interface GapStats {
  symbol: string;
  intervals: Array<{
    interval: string;
    totalCandles: number;
    missingCandles: number;
    coveragePercent: string;
    oldestCandle: string | null;
    newestCandle: string | null;
  }>;
}

interface GapDetails {
  symbol: string;
  interval: string;
  totalMissing: number;
  missingTimestamps: string[];
  truncated: boolean;
}

interface FillResult {
  success: boolean;
  symbol: string;
  totalGapsFound?: number;
  totalCandlesFilled?: number;
  byInterval?: Array<{
    interval: string;
    gapsFound: number;
    candlesFilled: number;
  }>;
  interval?: string;
  gapsFound?: number;
  candlesFilled?: number;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }
  return response.json();
}

async function testGapStatistics(): Promise<void> {
  console.log("1. Testing gap statistics for all markets...\n");
  
  for (const market of MARKETS) {
    const stats = await fetchJson<GapStats>(`${BASE_URL}/clob/candles/${market}/gaps`);
    
    console.log(`   📊 ${stats.symbol}:`);
    
    for (const interval of stats.intervals) {
      const status = interval.missingCandles === 0 ? "✅" : "⚠️";
      console.log(`      ${status} ${interval.interval}: ${interval.totalCandles} candles, ${interval.missingCandles} missing (${interval.coveragePercent} coverage)`);
      
      if (interval.oldestCandle && interval.newestCandle) {
        const oldest = new Date(interval.oldestCandle);
        const newest = new Date(interval.newestCandle);
        const spanHours = (newest.getTime() - oldest.getTime()) / (1000 * 60 * 60);
        console.log(`         Range: ${spanHours.toFixed(1)} hours`);
      }
    }
    console.log("");
  }
}

async function testGapDetails(): Promise<void> {
  console.log("2. Testing detailed gap information...\n");
  
  const market = MARKETS[0];
  const intervals = ["1m", "5m", "1h"];
  
  for (const interval of intervals) {
    const details = await fetchJson<GapDetails>(
      `${BASE_URL}/clob/candles/${market}/gaps/${interval}?limit=10`
    );
    
    console.log(`   📊 ${market} ${interval}: ${details.totalMissing} missing candles`);
    
    if (details.missingTimestamps.length > 0) {
      console.log(`      First few missing:`);
      for (const ts of details.missingTimestamps.slice(0, 3)) {
        console.log(`        - ${ts}`);
      }
      if (details.totalMissing > 3) {
        console.log(`        ... and ${details.totalMissing - 3} more`);
      }
    }
  }
  console.log("");
}

async function testFillGaps(): Promise<void> {
  console.log("3. Testing gap filling...\n");
  
  const market = MARKETS[0];
  
  // First, get current stats
  const beforeStats = await fetchJson<GapStats>(`${BASE_URL}/clob/candles/${market}/gaps`);
  const totalMissingBefore = beforeStats.intervals.reduce((sum, i) => sum + i.missingCandles, 0);
  
  console.log(`   Before: ${totalMissingBefore} total missing candles`);
  
  // Fill gaps for all intervals
  const result = await fetchJson<FillResult>(`${BASE_URL}/clob/candles/${market}/fill-gaps`, {
    method: "POST",
  });
  
  console.log(`   Fill result: ${result.totalCandlesFilled}/${result.totalGapsFound} candles filled`);
  
  if (result.byInterval) {
    for (const interval of result.byInterval) {
      if (interval.candlesFilled > 0) {
        console.log(`      ${interval.interval}: ${interval.candlesFilled} filled`);
      }
    }
  }
  
  // Check stats after
  const afterStats = await fetchJson<GapStats>(`${BASE_URL}/clob/candles/${market}/gaps`);
  const totalMissingAfter = afterStats.intervals.reduce((sum, i) => sum + i.missingCandles, 0);
  
  console.log(`   After: ${totalMissingAfter} total missing candles`);
  console.log("");
}

async function testFillSpecificInterval(): Promise<void> {
  console.log("4. Testing gap filling for specific interval...\n");
  
  const market = MARKETS[1];
  const interval = "1m";
  
  // Get details before
  const before = await fetchJson<GapDetails>(
    `${BASE_URL}/clob/candles/${market}/gaps/${interval}`
  );
  
  console.log(`   ${market} ${interval} before: ${before.totalMissing} missing`);
  
  // Fill only this interval
  const result = await fetchJson<FillResult>(
    `${BASE_URL}/clob/candles/${market}/fill-gaps?interval=${interval}`,
    { method: "POST" }
  );
  
  console.log(`   Filled: ${result.candlesFilled}/${result.gapsFound}`);
  
  // Get details after
  const after = await fetchJson<GapDetails>(
    `${BASE_URL}/clob/candles/${market}/gaps/${interval}`
  );
  
  console.log(`   ${market} ${interval} after: ${after.totalMissing} missing`);
  console.log("");
}

async function testCandleStatusEndpoint(): Promise<void> {
  console.log("5. Testing candle status endpoint...\n");
  
  for (const market of MARKETS) {
    interface StatusResponse {
      symbol: string;
      marketStatus: { isOpen: boolean };
      intervals: Record<string, { hasEnough: boolean; count: number; required: number }>;
    }
    
    const status = await fetchJson<StatusResponse>(`${BASE_URL}/clob/candles/${market}/status`);
    
    console.log(`   📊 ${status.symbol}: (Market ${status.marketStatus.isOpen ? "OPEN" : "CLOSED"})`);
    
    for (const [interval, data] of Object.entries(status.intervals)) {
      const icon = data.hasEnough ? "✅" : "⚠️";
      console.log(`      ${icon} ${interval}: ${data.count}/${data.required}`);
    }
    console.log("");
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("Candle Gap Detection and Filling Test");
  console.log("=".repeat(60) + "\n");
  
  try {
    await testGapStatistics();
    await testGapDetails();
    await testFillGaps();
    await testFillSpecificInterval();
    await testCandleStatusEndpoint();
    
    console.log("=".repeat(60));
    console.log("All tests completed!");
    console.log("=".repeat(60));
    
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

main();
