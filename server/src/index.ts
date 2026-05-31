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
// 搜索功能已阶段性放弃，路由入口已隔离；后续删除搜索时清理此行
// import searchRouter from './routes/search.js';
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
// 搜索功能已阶段性放弃，路由入口已隔离；后续删除搜索时清理此行
// app.use('/api/search', searchRouter);

// 代理跳转：后端代为请求目标页面，绕过目标 WAF 的跨站导航拦截
app.get('/api/goto', async (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== 'string') {
    return res.status(400).send('Missing url parameter');
  }
  let targetUrl: URL;
  try {
    targetUrl = new URL(url);
  } catch {
    return res.status(400).send('Invalid url');
  }

  // 仅允许白名单域名，防止被用作开放代理
  const allowedHosts = ['data.stats.gov.cn', 'www.stats.gov.cn'];
  if (!allowedHosts.includes(targetUrl.hostname)) {
    return res.status(400).send('Domain not allowed');
  }

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    });
    const contentType = resp.headers.get('content-type') || 'text/html';
    let body = await resp.text();

    // 注入 <base> 使相对路径资源正确加载
    const baseTag = `<base href="${targetUrl.origin}/">`;
    body = body.replace(/<head[^>]*>/i, (match) => match + baseTag);

    res.set('Content-Type', contentType);
    res.send(body);
  } catch (err) {
    console.error('Proxy fetch failed:', err);
    res.status(502).send('Failed to fetch target page');
  }
});

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
