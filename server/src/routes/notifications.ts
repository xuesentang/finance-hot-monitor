import { Router } from 'express';
import { prisma } from '../db.js';

const router = Router();

// GET /api/notifications — 获取通知列表
router.get('/', async (req, res) => {
  try {
    const { isRead, limit = '20' } = req.query;

    const where: Record<string, unknown> = {};
    if (isRead !== undefined && isRead !== '') {
      where.isRead = isRead === 'true';
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      include: {
        hotspot: {
          select: { id: true, title: true, importance: true },
        },
      },
    });

    res.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// PATCH /api/notifications/:id — 标记通知已读
router.patch('/:id', async (req, res) => {
  try {
    const notification = await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: req.body.isRead ?? true },
    });

    res.json(notification);
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Notification not found' });
    }
    console.error('Error updating notification:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

export default router;
