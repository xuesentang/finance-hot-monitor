import { Router } from 'express';
import { prisma } from '../db.js';
import { detectKeywordType, extractCoreEntity } from '../services/ai.js';

const router = Router();

// GET /api/keywords — 获取所有关键词
router.get('/', async (_req, res) => {
  try {
    const keywords = await prisma.keyword.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { hotspots: true } } },
    });
    res.json(keywords);
  } catch (error) {
    console.error('Error fetching keywords:', error);
    res.status(500).json({ error: 'Failed to fetch keywords' });
  }
});

// GET /api/keywords/:id — 获取单个关键词
router.get('/:id', async (req, res) => {
  try {
    const keyword = await prisma.keyword.findUnique({
      where: { id: req.params.id },
      include: {
        hotspots: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!keyword) {
      return res.status(404).json({ error: 'Keyword not found' });
    }
    res.json(keyword);
  } catch (error) {
    console.error('Error fetching keyword:', error);
    res.status(500).json({ error: 'Failed to fetch keyword' });
  }
});

// POST /api/keywords — 创建关键词
router.post('/', async (req, res) => {
  try {
    const { text, type } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Keyword text is required' });
    }

    const detectedType = detectKeywordType(text.trim());
    const normalizedKey = extractCoreEntity(text.trim(), detectedType);
    const keyword = await prisma.keyword.create({
      data: {
        text: text.trim(),
        type: type?.trim() || detectedType,
        normalizedKey,
      },
    });

    res.status(201).json(keyword);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Keyword already exists' });
    }
    console.error('Error creating keyword:', error);
    res.status(500).json({ error: 'Failed to create keyword' });
  }
});

// PUT /api/keywords/:id — 更新关键词
router.put('/:id', async (req, res) => {
  try {
    const { text, type, isActive } = req.body;

    const updatedText = text !== undefined ? text.trim() : undefined;
    const detectedType = updatedText ? detectKeywordType(updatedText) : undefined;
    const normalizedKey = updatedText && detectedType ? extractCoreEntity(updatedText, detectedType) : undefined;
    const keyword = await prisma.keyword.update({
      where: { id: req.params.id },
      data: {
        ...(updatedText !== undefined && { text: updatedText }),
        ...(type !== undefined && { type: type.trim() || 'generic' }),
        ...(!type && detectedType && { type: detectedType }),
        ...(normalizedKey && { normalizedKey }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    res.json(keyword);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Keyword not found' });
    }
    console.error('Error updating keyword:', error);
    res.status(500).json({ error: 'Failed to update keyword' });
  }
});

// DELETE /api/keywords/:id — 删除关键词
router.delete('/:id', async (req, res) => {
  try {
    await prisma.keyword.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Keyword not found' });
    }
    console.error('Error deleting keyword:', error);
    res.status(500).json({ error: 'Failed to delete keyword' });
  }
});

// PATCH /api/keywords/:id/toggle — 切换关键词状态
router.patch('/:id/toggle', async (req, res) => {
  try {
    const keyword = await prisma.keyword.findUnique({
      where: { id: req.params.id },
    });

    if (!keyword) {
      return res.status(404).json({ error: 'Keyword not found' });
    }

    const updated = await prisma.keyword.update({
      where: { id: req.params.id },
      data: { isActive: !keyword.isActive },
    });

    res.json(updated);
  } catch (error) {
    console.error('Error toggling keyword:', error);
    res.status(500).json({ error: 'Failed to toggle keyword' });
  }
});

export default router;
