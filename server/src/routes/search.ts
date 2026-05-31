import { Router } from 'express';
import { searchContent } from '../services/search.js';
import type { SearchParams } from '../types.js';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { query, sources, dateRange, limit } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    if (query.trim().length > 100) {
      return res.status(400).json({ error: 'Query too long (max 100 characters)' });
    }

    const validDateRanges = ['7d', '30d', '90d', 'all'];
    const validSources = ['sec_edgar', 'juchao', 'cailianshe', 'eastmoney', 'fred', 'nbs'];

    let filteredSources: string[] | undefined;
    if (Array.isArray(sources) && sources.length > 0) {
      filteredSources = sources.filter((s: string) => validSources.includes(s));
      if (filteredSources.length === 0) {
        return res.status(400).json({ error: 'No valid sources specified' });
      }
    }

    const params: SearchParams = {
      query: query.trim(),
      sources: filteredSources as SearchParams['sources'],
      dateRange: validDateRanges.includes(dateRange) ? dateRange as SearchParams['dateRange'] : '30d',
      limit: Math.min(Math.max(Number(limit) || 50, 1), 100),
    };

    const timeoutMs = 120_000;
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({ error: 'Search timed out' });
      }
    }, timeoutMs);

    try {
      const result = await searchContent(params);
      clearTimeout(timer);
      if (!res.headersSent) {
        res.json(result);
      }
    } catch (searchError) {
      clearTimeout(timer);
      throw searchError;
    }
  } catch (error) {
    console.error('Search error:', error);
    const message = error instanceof Error ? error.message : 'Search failed';
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  }
});

export default router;
