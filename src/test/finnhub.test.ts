import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

const BASE_URL = "http://localhost:3000";

interface NonceResponse {
  nonce: string;
  message: string;
}

interface VerifyResponse {
  token: string;
  address: string;
  expiresAt: number;
}

interface QuoteResponse {
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

interface CompanyProfileResponse {
  symbol: string;
  name: string;
  country: string;
  currency: string;
  exchange: string;
  industry: string;
  logo: string;
  marketCapitalization: number;
  weburl: string;
}

interface SearchResult {
  description: string;
  displaySymbol: string;
  symbol: string;
  type: string;
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
  count: number;
}

interface NewsItem {
  id: number;
  category: string;
  datetime: number;
  headline: string;
  source: string;
  summary: string;
  url: string;
}

interface MarketNewsResponse {
  news: NewsItem[];
  count: number;
}

interface ErrorResponse {
  error: string;
  message: string;
}

// Generate a test wallet
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(TEST_PRIVATE_KEY);

const walletClient = createWalletClient({
  account,
  chain: mainnet,
  transport: http(),
});

async function authenticate(): Promise<string> {
  const nonceResponse = await fetch(
    `${BASE_URL}/auth/nonce?address=${account.address}&chainId=1`
  );
  const { message } = (await nonceResponse.json()) as NonceResponse;
  
  const signature = await walletClient.signMessage({ message });
  
  const verifyResponse = await fetch(`${BASE_URL}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  
  const { token } = (await verifyResponse.json()) as VerifyResponse;
  return token;
}

async function testFinnhubIntegration(): Promise<void> {
  console.log("🧪 Starting Finnhub Integration Test\n");
  console.log(`📍 Test wallet address: ${account.address}\n`);
  
  // Authenticate first
  console.log("1️⃣  Authenticating...");
  const token = await authenticate();
  console.log(`   ✅ Authenticated\n`);
  
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  
  // Test 2: Get stock quote
  console.log("2️⃣  Getting stock quote for AAPL...");
  const quoteResponse = await fetch(`${BASE_URL}/finnhub/quote/AAPL`, {
    headers: authHeaders,
  });
  
  if (quoteResponse.ok) {
    const quote = (await quoteResponse.json()) as QuoteResponse;
    console.log(`   ✅ Quote received:`);
    console.log(`      Symbol: ${quote.symbol}`);
    console.log(`      Current Price: $${quote.currentPrice}`);
    console.log(`      Change: ${quote.change >= 0 ? '+' : ''}${quote.change} (${quote.percentChange}%)`);
    console.log(`      Day Range: $${quote.lowPrice} - $${quote.highPrice}\n`);
  } else {
    const error = (await quoteResponse.json()) as ErrorResponse;
    console.log(`   ⚠️ Quote fetch failed: ${error.message}\n`);
  }
  
  // Test 3: Get multiple quotes
  console.log("3️⃣  Getting multiple quotes (AAPL, GOOGL, MSFT)...");
  const quotesResponse = await fetch(
    `${BASE_URL}/finnhub/quotes?symbols=AAPL,GOOGL,MSFT`,
    { headers: authHeaders }
  );
  
  if (quotesResponse.ok) {
    const data = (await quotesResponse.json()) as { quotes: Array<QuoteResponse | { symbol: string; error: string }>; count: number };
    console.log(`   ✅ Received ${data.count} quotes:`);
    data.quotes.forEach((q) => {
      if ('currentPrice' in q) {
        console.log(`      ${q.symbol}: $${q.currentPrice}`);
      } else {
        console.log(`      ${q.symbol}: Error fetching`);
      }
    });
    console.log();
  } else {
    const error = (await quotesResponse.json()) as ErrorResponse;
    console.log(`   ⚠️ Quotes fetch failed: ${error.message}\n`);
  }
  
  // Test 4: Search for symbols
  console.log("4️⃣  Searching for 'tesla'...");
  const searchResponse = await fetch(
    `${BASE_URL}/finnhub/search?q=tesla`,
    { headers: authHeaders }
  );
  
  if (searchResponse.ok) {
    const data = (await searchResponse.json()) as SearchResponse;
    console.log(`   ✅ Found ${data.count} results:`);
    data.results.slice(0, 5).forEach((r) => {
      console.log(`      ${r.symbol}: ${r.description} (${r.type})`);
    });
    console.log();
  } else {
    const error = (await searchResponse.json()) as ErrorResponse;
    console.log(`   ⚠️ Search failed: ${error.message}\n`);
  }
  
  // Test 5: Get company profile
  console.log("5️⃣  Getting company profile for AAPL...");
  const profileResponse = await fetch(`${BASE_URL}/finnhub/profile/AAPL`, {
    headers: authHeaders,
  });
  
  if (profileResponse.ok) {
    const profile = (await profileResponse.json()) as CompanyProfileResponse;
    console.log(`   ✅ Company Profile:`);
    console.log(`      Name: ${profile.name}`);
    console.log(`      Country: ${profile.country}`);
    console.log(`      Industry: ${profile.industry}`);
    console.log(`      Exchange: ${profile.exchange}`);
    console.log(`      Market Cap: $${(profile.marketCapitalization / 1000).toFixed(2)}B`);
    console.log(`      Website: ${profile.weburl}\n`);
  } else {
    const error = (await profileResponse.json()) as ErrorResponse;
    console.log(`   ⚠️ Profile fetch failed: ${error.message}\n`);
  }
  
  // Test 6: Get market news
  console.log("6️⃣  Getting market news...");
  const newsResponse = await fetch(`${BASE_URL}/finnhub/news/market`, {
    headers: authHeaders,
  });
  
  if (newsResponse.ok) {
    const data = (await newsResponse.json()) as MarketNewsResponse;
    console.log(`   ✅ Received ${data.count} news articles:`);
    data.news.slice(0, 3).forEach((n) => {
      const date = new Date(n.datetime * 1000).toLocaleDateString();
      console.log(`      [${date}] ${n.headline.slice(0, 60)}...`);
      console.log(`         Source: ${n.source}`);
    });
    console.log();
  } else {
    const error = (await newsResponse.json()) as ErrorResponse;
    console.log(`   ⚠️ News fetch failed: ${error.message}\n`);
  }
  
  // Test 7: Get company news
  console.log("7️⃣  Getting company news for TSLA...");
  const companyNewsResponse = await fetch(
    `${BASE_URL}/finnhub/news/company/TSLA`,
    { headers: authHeaders }
  );
  
  if (companyNewsResponse.ok) {
    const data = (await companyNewsResponse.json()) as { symbol: string; news: NewsItem[]; count: number };
    console.log(`   ✅ Found ${data.count} news articles for ${data.symbol}:`);
    data.news.slice(0, 3).forEach((n) => {
      const date = new Date(n.datetime * 1000).toLocaleDateString();
      console.log(`      [${date}] ${n.headline.slice(0, 60)}...`);
    });
    console.log();
  } else {
    const error = (await companyNewsResponse.json()) as ErrorResponse;
    console.log(`   ⚠️ Company news fetch failed: ${error.message}\n`);
  }
  
  // Test 8: Test without authentication (should fail)
  console.log("8️⃣  Testing without authentication (should fail)...");
  const unauthResponse = await fetch(`${BASE_URL}/finnhub/quote/AAPL`);
  
  if (unauthResponse.status === 401) {
    const error = (await unauthResponse.json()) as ErrorResponse;
    console.log(`   ✅ Correctly rejected: ${error.message}\n`);
  } else if (unauthResponse.status === 503) {
    const error = (await unauthResponse.json()) as ErrorResponse;
    console.log(`   ⚠️ Service unavailable: ${error.message}\n`);
  } else {
    console.log(`   ❌ Unexpected status: ${unauthResponse.status}\n`);
  }
  
  console.log("🎉 Finnhub integration tests completed!\n");
}

// Run the test
testFinnhubIntegration().catch((error) => {
  console.error("❌ Test failed:", error.message);
  process.exit(1);
});
