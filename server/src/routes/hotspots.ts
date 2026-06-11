import { Router } from 'express';
import { prisma } from '../db.js';
import { sortHotspots } from '../utils/sortHotspots.js';

const router = Router();

// GET /api/hotspots — 获取热点列表
router.get('/', async (req, res) => {
  try {
    const {
      page = '1',
      limit = '20',
      source,
      importance,
      keywordId,
      sourceType,
      isSubstantial,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {};
    if (source) where.source = (source as string).toLowerCase();
    if (importance) where.importance = (importance as string).toLowerCase();
    if (keywordId) where.keywordId = keywordId;
    if (sourceType) where.sourceType = sourceType;
    if (isSubstantial !== undefined) {
      where.isSubstantial = isSubstantial === 'true';
    }

    const needsMemorySort = sortBy === 'importance';

    const orderBy: any = needsMemorySort
      ? { createdAt: 'desc' }
      : sortBy === 'publishedAt'
        ? [{ publishedAt: sortOrder as 'asc' | 'desc' }, { createdAt: 'desc' }]
        : sortBy === 'relevance'
          ? { relevance: sortOrder as 'asc' | 'desc' }
          : { createdAt: sortOrder as 'asc' | 'desc' };

    const [rawHotspots, total] = await Promise.all([
      prisma.hotspot.findMany({
        where,
        orderBy,
        ...(needsMemorySort ? {} : { skip, take: limitNum }),
        include: {
          keyword: { select: { id: true, text: true, type: true } },
        },
      }),
      prisma.hotspot.count({ where }),
    ]);

    let hotspots;
    if (needsMemorySort) {
      const sorted = sortHotspots(rawHotspots, sortBy as string, sortOrder as 'asc' | 'desc');
      hotspots = sorted.slice(skip, skip + limitNum);
    } else {
      hotspots = rawHotspots;
    }

    res.json({
      data: hotspots,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Error fetching hotspots:', error);
    res.status(500).json({ error: 'Failed to fetch hotspots' });
  }
});

// GET /api/hotspots/stats — 热点统计
router.get('/stats', async (_req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalHotspots, todayHotspots, highHotspots, sourceStats] = await Promise.all([
      prisma.hotspot.count(),
      prisma.hotspot.count({ where: { createdAt: { gte: today } } }),
      prisma.hotspot.count({ where: { importance: 'high' } }),
      prisma.hotspot.groupBy({
        by: ['source'],
        _count: { source: true },
      }),
    ]);

    const bySource: Record<string, number> = {};
    for (const item of sourceStats) {
      bySource[item.source] = item._count.source;
    }

    res.json({
      total: totalHotspots,
      today: todayHotspots,
      high: highHotspots,
      bySource,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/hotspots/:id — 获取单个热点
router.get('/:id', async (req, res) => {
  try {
    const hotspot = await prisma.hotspot.findUnique({
      where: { id: req.params.id },
      include: { keyword: true },
    });

    if (!hotspot) {
      return res.status(404).json({ error: 'Hotspot not found' });
    }

    res.json(hotspot);
  } catch (error) {
    console.error('Error fetching hotspot:', error);
    res.status(500).json({ error: 'Failed to fetch hotspot' });
  }
});

// DELETE /api/hotspots/:id — 删除热点
router.delete('/:id', async (req, res) => {
  try {
    await prisma.hotspot.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Hotspot not found' });
    }
    console.error('Error deleting hotspot:', error);
    res.status(500).json({ error: 'Failed to delete hotspot' });
  }
});

export default router;
