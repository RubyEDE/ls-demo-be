import { config } from "../config/env";

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

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
 */
async function finnhubFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${FINNHUB_BASE_URL}${endpoint}`);
  url.searchParams.set("token", config.finnhubApiKey);
  
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  
  const response = await fetch(url.toString());
  
  if (!response.ok) {
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
 * Check if Finnhub is configured
 */
export function isConfigured(): boolean {
  return Boolean(config.finnhubApiKey);
}
