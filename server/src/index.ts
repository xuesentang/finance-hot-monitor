import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import cron from 'node-cron';

import { prisma } from './db.js';
import keywordsRouter from './routes/keywords.js';
import hotspotsRouter from './routes/hotspots.js';
import notificationsRouter from './routes/notifications.js';
import {
  checkFastSources,
  checkAnnouncementSources,
  checkMacroSources,
  runHotspotCheck,
} from './jobs/hotspotChecker.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

// 中间件
app.use(cors());
app.use(express.json());

// 路由
app.use('/api/keywords', keywordsRouter);
app.use('/api/hotspots', hotspotsRouter);
app.use('/api/notifications', notificationsRouter);

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 手动触发全源热点检查
app.post('/api/check-hotspots', async (_req, res) => {
  try {
    await runHotspotCheck(io);
    res.json({ message: 'Hotspot check completed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to run hotspot check' });
  }
});

// WebSocket 连接
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('subscribe', (keywords: string[]) => {
    keywords.forEach((kw) => socket.join(`keyword:${kw}`));
  });

  socket.on('unsubscribe', (keywords: string[]) => {
    keywords.forEach((kw) => socket.leave(`keyword:${kw}`));
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// 定时任务：按信源类型独立频率
// 快讯类（财联社 + 东财）：每 2 分钟
cron.schedule('*/2 * * * *', async () => {
  try {
    await checkFastSources(io);
  } catch (error) {
    console.error('Fast-source cron failed:', error);
  }
});

// 公告类（SEC EDGAR + 巨潮）：每 10 分钟
cron.schedule('*/10 * * * *', async () => {
  try {
    await checkAnnouncementSources(io);
  } catch (error) {
    console.error('Announcement cron failed:', error);
  }
});

// 宏观类（FRED + NBS）：每小时
cron.schedule('0 * * * *', async () => {
  try {
    await checkMacroSources(io);
  } catch (error) {
    console.error('Macro cron failed:', error);
  }
});

export { io };

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`
  🔥 金融热点监控服务启动
  📡 http://localhost:${PORT}
  🔌 WebSocket ready
  ⏱  快讯: */2min | 公告: */10min | 宏观: hourly
  `);
});

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await prisma.$disconnect();
  process.exit(0);
});
