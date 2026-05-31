import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchContent } from '../services/search.js';
import * as collector from '../services/collector.js';
import * as ai from '../services/ai.js';

vi.mock('../services/collector.js');
vi.mock('../services/ai.js');

const mockCollectFromSource = vi.mocked(collector.collectFromSource);
const mockExpandKeyword = vi.mocked(ai.expandKeyword);
const mockSearchStrategy = vi.mocked(ai.searchStrategy);
const mockPreMatchKeyword = vi.mocked(ai.preMatchKeyword);
const mockAnalyzeContent = vi.mocked(ai.analyzeContent);

function mockDefaults() {
  mockSearchStrategy.mockResolvedValue({ reasoning: '', searchTerms: [], targetSources: [] });
  mockCollectFromSource.mockResolvedValue({ items: [], watermark: {} });
}

describe('searchContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDefaults();
  });

  it('should return empty results when no items collected', async () => {
    mockExpandKeyword.mockResolvedValue(['test']);

    const result = await searchContent({ query: 'test' });

    expect(result.query).toBe('test');
    expect(result.totalResults).toBe(0);
    expect(result.items).toEqual([]);
    expect(result.expandedKeywords).toEqual(['test']);
  });

  it('should collect from all 6 sources by default', async () => {
    mockExpandKeyword.mockResolvedValue(['AAPL']);

    await searchContent({ query: 'AAPL' });

    expect(mockCollectFromSource).toHaveBeenCalledTimes(6);
  });

  it('should collect from specified sources only', async () => {
    mockExpandKeyword.mockResolvedValue(['000002']);

    await searchContent({ query: '000002', sources: ['juchao', 'cailianshe'] });

    expect(mockCollectFromSource).toHaveBeenCalledTimes(2);
  });

  it('should use strategy searchTerms as collector keywords when available', async () => {
    mockExpandKeyword.mockResolvedValue(['AAPL', 'Apple', 'AAPL stock']);
    mockSearchStrategy.mockResolvedValue({
      reasoning: 'AAPL is a US stock, search SEC EDGAR',
      searchTerms: ['AAPL'],
      targetSources: ['sec_edgar'],
    });

    await searchContent({ query: 'AAPL' });

    expect(mockCollectFromSource).toHaveBeenCalledWith(
      expect.any(String),
      ['AAPL'],  // strategy searchTerms, not expanded keywords
      {},
      'search',
      '30d'
    );
  });

  it('should filter sources by strategy targetSources', async () => {
    mockExpandKeyword.mockResolvedValue(['CPI']);
    mockSearchStrategy.mockResolvedValue({
      reasoning: 'CPI is macro data',
      searchTerms: ['CPIAUCSL', '居民消费价格指数'],
      targetSources: ['fred', 'nbs'],
    });

    await searchContent({ query: 'CPI' });

    const calledSources = mockCollectFromSource.mock.calls.map(c => c[0]);
    expect(calledSources).toEqual(['fred', 'nbs']);
  });

  it('should fall back to expanded keywords when strategy has no searchTerms', async () => {
    mockExpandKeyword.mockResolvedValue(['test', 'testing', 'exam']);
    mockSearchStrategy.mockResolvedValue({ reasoning: '', searchTerms: [], targetSources: [] });

    await searchContent({ query: 'test', dateRange: '7d' });

    expect(mockCollectFromSource).toHaveBeenCalledWith(
      expect.any(String),
      ['test', 'testing', 'exam'],  // fallback to expanded keywords
      {},
      'search',
      '7d'
    );
  });

  it('should deduplicate items by url+source', async () => {
    mockExpandKeyword.mockResolvedValue(['test']);
    const dupItem = {
      title: 'Test',
      content: 'Content',
      url: 'https://example.com/1',
      source: 'cailianshe' as const,
      sourceType: 'news' as const,
      publishedAt: null,
    };
    mockCollectFromSource.mockResolvedValue({ items: [dupItem, dupItem], watermark: {} });
    mockPreMatchKeyword.mockReturnValue({ matched: false, matchedTerms: [] });
    mockAnalyzeContent.mockResolvedValue({
      eventType: 'other',
      isSubstantial: true,
      relevance: 50,
      relevanceReason: 'test',
      keywordMentioned: false,
      importance: 'low',
      importanceReason: 'test',
      summary: 'test',
      affectedHoldings: false,
      eventFingerprint: '',
    });

    const result = await searchContent({ query: 'test', sources: ['cailianshe'] });

    expect(result.items.length).toBeLessThanOrEqual(1);
  });

  it('should filter out items where relevance is below 20', async () => {
    mockExpandKeyword.mockResolvedValue(['test']);
    mockCollectFromSource.mockResolvedValue({
      items: [{
        title: 'Routine',
        content: 'Routine content',
        url: 'https://example.com/routine',
        source: 'juchao' as const,
        sourceType: 'announcement' as const,
        publishedAt: null,
      }],
      watermark: {},
    });
    mockPreMatchKeyword.mockReturnValue({ matched: false, matchedTerms: [] });
    mockAnalyzeContent.mockResolvedValue({
      eventType: 'other',
      isSubstantial: false,
      relevance: 10,
      relevanceReason: 'routine',
      keywordMentioned: false,
      importance: 'low',
      importanceReason: 'routine',
      summary: 'routine',
      affectedHoldings: false,
      eventFingerprint: '',
    });

    const result = await searchContent({ query: 'test', sources: ['juchao'] });

    expect(result.totalResults).toBe(0);
  });

  it('should keep items where relevance is 20 or above', async () => {
    mockExpandKeyword.mockResolvedValue(['test']);
    mockCollectFromSource.mockResolvedValue({
      items: [{
        title: 'Relevant',
        content: 'Relevant content',
        url: 'https://example.com/relevant',
        source: 'cailianshe' as const,
        sourceType: 'news' as const,
        publishedAt: null,
      }],
      watermark: {},
    });
    mockPreMatchKeyword.mockReturnValue({ matched: true, matchedTerms: ['test'] });
    mockAnalyzeContent.mockResolvedValue({
      eventType: 'other',
      isSubstantial: false,
      relevance: 25,
      relevanceReason: 'somewhat relevant',
      keywordMentioned: true,
      importance: 'low',
      importanceReason: 'low impact',
      summary: 'relevant item',
      affectedHoldings: false,
      eventFingerprint: '',
    });

    const result = await searchContent({ query: 'test', sources: ['cailianshe'] });

    expect(result.totalResults).toBe(1);
  });

  it('should keep items when AI analysis fails', async () => {
    mockExpandKeyword.mockResolvedValue(['test']);
    mockCollectFromSource.mockResolvedValue({
      items: [{
        title: 'Test Item',
        content: 'Content',
        url: 'https://example.com/1',
        source: 'cailianshe' as const,
        sourceType: 'news' as const,
        publishedAt: null,
      }],
      watermark: {},
    });
    mockPreMatchKeyword.mockReturnValue({ matched: true, matchedTerms: ['test'] });
    mockAnalyzeContent.mockRejectedValue(new Error('AI service unavailable'));

    const result = await searchContent({ query: 'test', sources: ['cailianshe'] });

    expect(result.totalResults).toBe(1);
    expect(result.items[0].aiAnalysis).toBeNull();
  });

  it('should sort results by relevance descending', async () => {
    mockExpandKeyword.mockResolvedValue(['test']);
    mockCollectFromSource.mockResolvedValue({
      items: [
        { title: 'Low', content: 'Low', url: 'https://example.com/1', source: 'cailianshe' as const, sourceType: 'news' as const, publishedAt: null },
        { title: 'High', content: 'High', url: 'https://example.com/2', source: 'juchao' as const, sourceType: 'announcement' as const, publishedAt: null },
      ],
      watermark: {},
    });
    mockPreMatchKeyword.mockReturnValue({ matched: true, matchedTerms: ['test'] });
    mockAnalyzeContent
      .mockResolvedValueOnce({
        eventType: 'other', isSubstantial: true, relevance: 30,
        relevanceReason: 'low', keywordMentioned: false, importance: 'low',
        importanceReason: 'low', summary: 'low', affectedHoldings: false, eventFingerprint: '',
      })
      .mockResolvedValueOnce({
        eventType: 'contract', isSubstantial: true, relevance: 90,
        relevanceReason: 'high', keywordMentioned: true, importance: 'high',
        importanceReason: 'high', summary: 'high', affectedHoldings: true, eventFingerprint: '',
      });

    const result = await searchContent({ query: 'test', sources: ['cailianshe', 'juchao'] });

    expect(result.items[0].aiAnalysis!.relevance).toBe(90);
    expect(result.items[1].aiAnalysis!.relevance).toBe(30);
  });

  it('should compute sourceStats correctly', async () => {
    mockExpandKeyword.mockResolvedValue(['test']);
    mockCollectFromSource
      .mockResolvedValueOnce({
        items: [{ title: 'A', content: 'A', url: 'https://a.com', source: 'cailianshe' as const, sourceType: 'news' as const, publishedAt: null }],
        watermark: {},
      })
      .mockResolvedValueOnce({
        items: [
          { title: 'B', content: 'B', url: 'https://b.com', source: 'juchao' as const, sourceType: 'announcement' as const, publishedAt: null },
          { title: 'C', content: 'C', url: 'https://c.com', source: 'juchao' as const, sourceType: 'announcement' as const, publishedAt: null },
        ],
        watermark: {},
      });
    mockPreMatchKeyword.mockReturnValue({ matched: true, matchedTerms: ['test'] });
    mockAnalyzeContent.mockResolvedValue({
      eventType: 'other', isSubstantial: true, relevance: 50,
      relevanceReason: 'test', keywordMentioned: true, importance: 'medium',
      importanceReason: 'test', summary: 'test', affectedHoldings: false, eventFingerprint: '',
    });

    const result = await searchContent({ query: 'test', sources: ['cailianshe', 'juchao'] });

    expect(result.sourceStats['cailianshe']).toBe(1);
    expect(result.sourceStats['juchao']).toBe(2);
  });
});
