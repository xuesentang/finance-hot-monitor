import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../services/search.js', () => ({
  searchContent: vi.fn(),
}));

import searchRouter from './search.js';
import { searchContent } from '../services/search.js';

const mockSearchContent = vi.mocked(searchContent);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/search', searchRouter);
  return app;
}

describe('POST /api/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 when query is missing', async () => {
    const app = createApp();
    const res = await request(app).post('/api/search').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Search query is required');
  });

  it('should return 400 when query is empty string', async () => {
    const app = createApp();
    const res = await request(app).post('/api/search').send({ query: '   ' });

    expect(res.status).toBe(400);
  });

  it('should return 400 when query exceeds 100 characters', async () => {
    const app = createApp();
    const res = await request(app).post('/api/search').send({ query: 'a'.repeat(101) });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('100 characters');
  });

  it('should return search results on valid query', async () => {
    mockSearchContent.mockResolvedValue({
      query: 'AAPL',
      totalResults: 1,
      searchTimeMs: 5000,
      items: [{
        title: '[8-K] AAPL',
        content: 'Apple filing',
        url: 'https://sec.gov/1',
        source: 'sec_edgar',
        sourceType: 'announcement',
        publishedAt: '2026-05-28T00:00:00Z',
        aiAnalysis: {
          eventType: 'contract',
          isSubstantial: true,
          relevance: 90,
          relevanceReason: 'Directly about AAPL',
          keywordMentioned: true,
          importance: 'high',
          importanceReason: 'Material event',
          summary: 'Apple filed 8-K',
          affectedHoldings: true,
          eventFingerprint: 'AAPL_8K',
        },
        matchedTerms: ['AAPL'],
      }],
      expandedKeywords: ['AAPL', 'Apple', '苹果'],
      sourceStats: { sec_edgar: 1 },
    });

    const app = createApp();
    const res = await request(app).post('/api/search').send({ query: 'AAPL' });

    expect(res.status).toBe(200);
    expect(res.body.query).toBe('AAPL');
    expect(res.body.totalResults).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.expandedKeywords).toContain('AAPL');
  });

  it('should pass dateRange and sources to searchContent', async () => {
    mockSearchContent.mockResolvedValue({
      query: 'CPI',
      totalResults: 0,
      searchTimeMs: 100,
      items: [],
      expandedKeywords: ['CPI'],
      sourceStats: {},
    });

    const app = createApp();
    await request(app).post('/api/search').send({
      query: 'CPI',
      sources: ['fred', 'nbs'],
      dateRange: '7d',
    });

    expect(mockSearchContent).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'CPI',
        sources: ['fred', 'nbs'],
        dateRange: '7d',
      })
    );
  });

  it('should default dateRange to 30d for invalid values', async () => {
    mockSearchContent.mockResolvedValue({
      query: 'test',
      totalResults: 0,
      searchTimeMs: 100,
      items: [],
      expandedKeywords: ['test'],
      sourceStats: {},
    });

    const app = createApp();
    await request(app).post('/api/search').send({
      query: 'test',
      dateRange: 'invalid',
    });

    expect(mockSearchContent).toHaveBeenCalledWith(
      expect.objectContaining({ dateRange: '30d' })
    );
  });

  it('should return 500 when searchContent throws', async () => {
    mockSearchContent.mockRejectedValue(new Error('AI service down'));

    const app = createApp();
    const res = await request(app).post('/api/search').send({ query: 'test' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('AI service down');
  });

  it('should filter out invalid source names and keep valid ones', async () => {
    mockSearchContent.mockResolvedValue({
      query: 'test',
      totalResults: 0,
      searchTimeMs: 100,
      items: [],
      expandedKeywords: ['test'],
      sourceStats: {},
    });

    const app = createApp();
    await request(app).post('/api/search').send({
      query: 'test',
      sources: ['juchao', 'invalid_source', 'cailianshe'],
    });

    expect(mockSearchContent).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: ['juchao', 'cailianshe'],
      })
    );
  });

  it('should return 400 when all sources are invalid', async () => {
    const app = createApp();
    const res = await request(app).post('/api/search').send({
      query: 'test',
      sources: ['invalid1', 'invalid2'],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No valid sources');
  });
});
