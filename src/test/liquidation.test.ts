/**
 * Liquidation Engine Test
 * 
 * Tests the liquidation engine functionality.
 * Run with: yarn tsx src/test/liquidation.test.ts
 * 
 * Prerequisites:
 * - Server should be running (yarn dev)
 * - User should have positions open (run position.test.ts first)
 */

export {};

const BASE_URL = "http://localhost:3000";

interface LiquidationStats {
  totalLiquidations: number;
  totalValueLiquidated: number;
  lastLiquidationAt: string | null;
}

interface AtRiskResponse {
  threshold: string;
  count: number;
  positions: Array<{
    marketSymbol: string;
    side: string;
    size: number;
    entryPrice: number;
    currentPrice: number;
    liquidationPrice: number;
    distanceToLiquidation: number;
    distancePercent: string;
    margin: number;
  }>;
}

interface HealthResponse {
  status: string;
  timestamp: string;
  liquidation: {
    engineRunning: boolean;
    totalLiquidations: number;
    totalValueLiquidated: number;
    lastLiquidationAt: string | null;
  };
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }
  return response.json();
}

async function testHealthCheck(): Promise<void> {
  console.log("1. Testing health check (liquidation status)...");
  
  const health = await fetchJson<HealthResponse>(`${BASE_URL}/health`);
  
  console.log(`   ✅ Liquidation engine running: ${health.liquidation.engineRunning}`);
  console.log(`   Total liquidations: ${health.liquidation.totalLiquidations}`);
  console.log(`   Total value liquidated: $${health.liquidation.totalValueLiquidated.toFixed(2)}`);
  console.log(`   Last liquidation: ${health.liquidation.lastLiquidationAt || "Never"}\n`);
}

async function testLiquidationStats(): Promise<void> {
  console.log("2. Testing liquidation stats endpoint...");
  
  const stats = await fetchJson<LiquidationStats>(`${BASE_URL}/clob/liquidation/stats`);
  
  console.log(`   ✅ Total liquidations: ${stats.totalLiquidations}`);
  console.log(`   Total value liquidated: $${stats.totalValueLiquidated.toFixed(2)}`);
  console.log(`   Last liquidation: ${stats.lastLiquidationAt || "Never"}\n`);
}

async function testAtRiskPositions(): Promise<void> {
  console.log("3. Testing at-risk positions endpoint...");
  
  // Test with different thresholds
  const thresholds = [5, 10, 20];
  
  for (const threshold of thresholds) {
    const atRisk = await fetchJson<AtRiskResponse>(
      `${BASE_URL}/clob/liquidation/at-risk?threshold=${threshold}`
    );
    
    console.log(`   📊 Threshold ${threshold}%: ${atRisk.count} positions at risk`);
    
    if (atRisk.positions.length > 0) {
      for (const pos of atRisk.positions.slice(0, 3)) {
        console.log(`      - ${pos.side.toUpperCase()} ${pos.size} ${pos.marketSymbol}`);
        console.log(`        Current: $${pos.currentPrice.toFixed(2)} | Liq: $${pos.liquidationPrice.toFixed(2)} | Distance: ${pos.distancePercent}`);
      }
      if (atRisk.positions.length > 3) {
        console.log(`      ... and ${atRisk.positions.length - 3} more`);
      }
    }
  }
  
  console.log("");
}

async function testLiquidationRiskWithAuth(token: string): Promise<void> {
  console.log("4. Testing liquidation risk for authenticated user...");
  
  const markets = ["AAPL-PERP", "GOOGL-PERP", "MSFT-PERP"];
  
  for (const market of markets) {
    try {
      const response = await fetch(`${BASE_URL}/clob/positions/${market}/liquidation-risk`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        console.log(`   ⚠️ ${market}: Could not check risk (${response.status})`);
        continue;
      }
      
      const risk = await response.json();
      
      if (!risk.hasPosition) {
        console.log(`   ${market}: No position`);
      } else {
        const emoji = risk.riskLevel === "critical" ? "🔴" : risk.riskLevel === "warning" ? "🟡" : "🟢";
        console.log(`   ${emoji} ${market}: ${risk.riskLevel.toUpperCase()}`);
        console.log(`      ${risk.side} ${risk.size} @ $${risk.entryPrice.toFixed(2)}`);
        console.log(`      Current: $${risk.currentPrice.toFixed(2)} | Liq: $${risk.liquidationPrice.toFixed(2)}`);
        console.log(`      Distance: ${risk.distancePercent}`);
      }
    } catch (error) {
      console.log(`   ⚠️ ${market}: Error checking risk`);
    }
  }
  
  console.log("");
}

async function main() {
  console.log("=".repeat(60));
  console.log("Liquidation Engine Test");
  console.log("=".repeat(60) + "\n");
  
  try {
    await testHealthCheck();
    await testLiquidationStats();
    await testAtRiskPositions();
    
    // Optional: Test with auth token if provided
    const token = process.env.AUTH_TOKEN;
    if (token) {
      await testLiquidationRiskWithAuth(token);
    } else {
      console.log("4. Skipping authenticated tests (no AUTH_TOKEN env var)\n");
      console.log("   To test authenticated endpoints, run:");
      console.log("   AUTH_TOKEN=<your-jwt> yarn tsx src/test/liquidation.test.ts\n");
    }
    
    console.log("=".repeat(60));
    console.log("All tests completed!");
    console.log("=".repeat(60));
    
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

main();
