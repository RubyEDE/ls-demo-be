import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { AuthenticatedRequest, ErrorResponse } from "../types";
import {
  getQuote,
  getCompanyProfile,
  getMarketNews,
  getCompanyNews,
  searchSymbols,
  getBasicFinancials,
  getEarningsCalendar,
  isConfigured,
} from "../services/finnhub.service";

const router = Router();

// Middleware to check if Finnhub is configured
function requireFinnhub(req: Request, res: Response, next: () => void) {
  if (!isConfigured()) {
    res.status(503).json({
      error: "SERVICE_UNAVAILABLE",
      message: "Finnhub API key not configured",
    });
    return;
  }
  next();
}

router.use(requireFinnhub);

/**
 * GET /finnhub/quote/:symbol
 * Get real-time stock quote
 */
router.get(
  "/quote/:symbol",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const symbol = req.params.symbol as string;
      const quote = await getQuote(symbol);
      res.json(quote);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch quote";
      res.status(500).json({ error: "FETCH_ERROR", message });
    }
  }
);

/**
 * GET /finnhub/profile/:symbol
 * Get company profile
 */
router.get(
  "/profile/:symbol",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const symbol = req.params.symbol as string;
      const profile = await getCompanyProfile(symbol);
      res.json(profile);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch profile";
      res.status(500).json({ error: "FETCH_ERROR", message });
    }
  }
);

/**
 * GET /finnhub/news/market
 * Get market news
 */
router.get(
  "/news/market",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const category = (req.query.category as string) || "general";
      const news = await getMarketNews(category);
      res.json({ news, count: news.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch news";
      res.status(500).json({ error: "FETCH_ERROR", message });
    }
  }
);

/**
 * GET /finnhub/news/company/:symbol
 * Get company-specific news
 */
router.get(
  "/news/company/:symbol",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const symbol = req.params.symbol as string;
      const from = (req.query.from as string) || getDateDaysAgo(7);
      const to = (req.query.to as string) || getToday();
      
      const news = await getCompanyNews(symbol, from, to);
      res.json({ symbol: symbol.toUpperCase(), news, count: news.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch news";
      res.status(500).json({ error: "FETCH_ERROR", message });
    }
  }
);

/**
 * GET /finnhub/search
 * Search for symbols
 */
router.get(
  "/search",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const query = req.query.q as string;
      
      if (!query) {
        res.status(400).json({
          error: "INVALID_REQUEST",
          message: "Query parameter 'q' is required",
        });
        return;
      }
      
      const results = await searchSymbols(query);
      res.json({ query, results, count: results.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to search";
      res.status(500).json({ error: "FETCH_ERROR", message });
    }
  }
);

/**
 * GET /finnhub/financials/:symbol
 * Get basic financials for a company
 */
router.get(
  "/financials/:symbol",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const symbol = req.params.symbol as string;
      const metric = (req.query.metric as string) || "all";
      const financials = await getBasicFinancials(symbol, metric);
      res.json(financials);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch financials";
      res.status(500).json({ error: "FETCH_ERROR", message });
    }
  }
);

/**
 * GET /finnhub/earnings
 * Get earnings calendar
 */
router.get(
  "/earnings",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const from = (req.query.from as string) || getToday();
      const to = (req.query.to as string) || getDateDaysFromNow(7);
      const symbol = req.query.symbol as string | undefined;
      
      const earnings = await getEarningsCalendar(from, to, symbol);
      res.json({ from, to, earnings, count: earnings.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch earnings";
      res.status(500).json({ error: "FETCH_ERROR", message });
    }
  }
);

/**
 * GET /finnhub/quotes
 * Get multiple quotes at once
 */
router.get(
  "/quotes",
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const symbolsParam = req.query.symbols as string;
      
      if (!symbolsParam) {
        res.status(400).json({
          error: "INVALID_REQUEST",
          message: "Query parameter 'symbols' is required (comma-separated)",
        });
        return;
      }
      
      const symbols = symbolsParam.split(",").map((s) => s.trim().toUpperCase());
      const quotes = await Promise.all(
        symbols.map(async (symbol) => {
          try {
            return await getQuote(symbol);
          } catch {
            return { symbol, error: "Failed to fetch" };
          }
        })
      );
      
      res.json({ quotes, count: quotes.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch quotes";
      res.status(500).json({ error: "FETCH_ERROR", message });
    }
  }
);

// Helper functions
function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
}

function getDateDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

export default router;
