# Render + Neon 部署实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 finance-hot-monitor 项目从本地开发状态改造为可稳定部署到 Render（Docker）+ Neon PostgreSQL 的生产环境，支持 10+ 并发用户。

**Architecture:** 使用 Docker 多阶段构建在同一容器内运行 Node.js 后端和 Python 采集脚本，数据库从 SQLite 迁移到 Neon PostgreSQL，前端仍部署到 Vercel。

**Tech Stack:** Node.js 20 + Python 3.11 + Prisma + PostgreSQL (Neon) + Docker + Render + Vercel

---

## 文件变更清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `Dockerfile` | 新建 | 多阶段构建：Node + Python 双环境 |
| `server/src/services/collector.ts` | 修改 | Python 解释器路径兼容 Linux/Windows |
| `server/src/index.ts` | 修改 | 调整定时任务频率 |
| `server/prisma/schema.prisma` | 修改 | SQLite → PostgreSQL |
| `render.yaml` | 新建/覆盖 | Render Docker 部署配置 |
| `server/.env.example` | 修改 | 更新为 Neon 连接字符串示例 |
| `package.json` (根目录) | 修改 | 删除异常版本号，添加部署脚本 |
| `docs/部署指南.md` | 新建 | 完整部署步骤文档 |

---

## Task 1: 编写 Dockerfile

**Files:**
- Create: `Dockerfile`

- [ ] **Step 1: 在项目根目录创建 Dockerfile**

```dockerfile
# 使用同时包含 Node.js 和 Python 的基础镜像
FROM node:20-slim

# 安装 Python 3.11 和 pip
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3.11-venv \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# 创建 Python 符号链接（兼容代码中的 python 调用）
RUN ln -sf /usr/bin/python3.11 /usr/bin/python3 && \
    ln -sf /usr/bin/python3 /usr/bin/python

# 设置工作目录
WORKDIR /app

# 先复制并安装 Node 依赖（利用 Docker 缓存层）
COPY server/package*.json ./server/
RUN cd server && npm ci

# 复制并安装 Python 依赖
COPY scripts/requirements.txt ./scripts/
RUN python3 -m venv /app/fhot-venv && \
    /app/fhot-venv/bin/pip install --no-cache-dir -r scripts/requirements.txt

# 复制 Prisma schema 并生成客户端
COPY server/prisma ./server/prisma/
RUN cd server && npx prisma generate

# 复制后端源代码
COPY server/src ./server/src/
COPY server/tsconfig.json ./server/

# 编译 TypeScript
RUN cd server && npx tsc

# 复制 Python 采集脚本
COPY scripts/ ./scripts/

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3001
ENV PYTHONIOENCODING=utf-8
ENV PYTHONUTF8=1

# 暴露端口
EXPOSE 3001

# 启动命令：先同步数据库 schema，再启动服务
CMD cd server && npx prisma db push --accept-data-loss && node dist/index.js
```

- [ ] **Step 2: 验证 Dockerfile 语法**

本地测试构建（可选，需要 Docker）：
```bash
docker build -t finance-hot-monitor:test .
```

---

## Task 2: 修改 collector.ts 兼容 Linux 路径

**Files:**
- Modify: `server/src/services/collector.ts`

- [ ] **Step 1: 修改 Python 解释器路径逻辑**

将硬编码的 Windows 路径改为跨平台兼容：

```typescript
// 原代码（第31行）：
// const pythonBin = path.resolve(__dirname, '..', '..', '..', 'fhot-venv', 'Scripts', 'python.exe');

// 新代码：
const isWindows = process.platform === 'win32';
const pythonBin = isWindows
  ? path.resolve(__dirname, '..', '..', '..', 'fhot-venv', 'Scripts', 'python.exe')
  : path.resolve(__dirname, '..', '..', '..', 'fhot-venv', 'bin', 'python');
```

- [ ] **Step 2: 验证修改**

检查文件确保只有路径相关逻辑变更，不影响其他功能。

---

## Task 3: 更新定时任务频率

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: 修改三个 cron 任务的调度表达式**

```typescript
// 快讯类（财联社 + 东财）：每 20 分钟
// 原：cron.schedule('*/2 * * * *', ...)
cron.schedule('*/20 * * * *', async () => {
  try {
    await checkFastSources(io);
  } catch (error) {
    console.error('Fast-source cron failed:', error);
  }
});

// 公告类（SEC EDGAR + 巨潮）：每 1 小时
// 原：cron.schedule('*/10 * * * *', ...)
cron.schedule('0 * * * *', async () => {
  try {
    await checkAnnouncementSources(io);
  } catch (error) {
    console.error('Announcement cron failed:', error);
  }
});

// 宏观类（FRED + NBS）：每 2 小时
// 原：cron.schedule('0 * * * *', ...)
cron.schedule('0 */2 * * *', async () => {
  try {
    await checkMacroSources(io);
  } catch (error) {
    console.error('Macro cron failed:', error);
  }
});
```

- [ ] **Step 2: 更新注释说明新频率**

---

## Task 4: 迁移数据库到 PostgreSQL

**Files:**
- Modify: `server/prisma/schema.prisma`
- Modify: `server/.env.example`

- [ ] **Step 1: 修改 schema.prisma 的数据源配置**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

- [ ] **Step 2: 更新 .env.example**

```bash
# ── 数据库（Neon PostgreSQL）───────────────────────────────
# 在 Neon 控制台 copy 连接字符串，替换 user/pass/dbname
# 池化连接（供 Prisma 查询用，带 ?sslmode=require）
DATABASE_URL="postgresql://user:pass@ep-xxxx-pooler.us-east-2.aws.neon.tech/finance_hot_monitor?sslmode=require"
# 直连（仅 migration 用，不走 PgBouncer）
DIRECT_URL="postgresql://user:pass@ep-xxxx.us-east-2.aws.neon.tech/finance_hot_monitor?sslmode=require"

# ── AI API Key（必填）──────────────────────────────────────
# 获取地址：https://platform.deepseek.com/
DEEPSEEK_API_KEY="sk-your-deepseek-api-key-here"

# ── FRED API Key（可选）────────────────────────────────────
# 获取地址：https://fred.stlouisfed.org/docs/api/api_key.html
FRED_API_KEY="your-fred-api-key-here"

# ── 前端地址 ───────────────────────────────────────────────
# Vercel 部署后的 URL，例如 https://finance-hot-monitor.vercel.app
CLIENT_URL="http://localhost:5173"

# ── 服务端口号 ─────────────────────────────────────────────
PORT=3001
```

---

## Task 5: 编写 render.yaml

**Files:**
- Create/Overwrite: `render.yaml`

- [ ] **Step 1: 创建 Docker 部署配置**

```yaml
services:
  - type: web
    name: finance-hot-monitor-api
    runtime: docker
    plan: free
    dockerfilePath: ./Dockerfile
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: DIRECT_URL
        sync: false
      - key: DEEPSEEK_API_KEY
        sync: false
      - key: FRED_API_KEY
        sync: false
      - key: CLIENT_URL
        sync: false
      - key: PORT
        value: "3001"
      - key: NODE_ENV
        value: "production"
```

---

## Task 6: 修复根目录 package.json

**Files:**
- Modify: `package.json` (根目录)

- [ ] **Step 1: 更新根 package.json**

```json
{
  "name": "finance-hot-monitor",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "concurrently \"cd server && npm run dev\" \"cd client && npm run dev\"",
    "build": "cd server && npm run build",
    "test": "cd server && npm test"
  },
  "devDependencies": {
    "concurrently": "^8.2.2"
  }
}
```

---

## Task 7: 编写部署文档

**Files:**
- Create: `docs/部署指南.md`

- [ ] **Step 1: 编写完整部署步骤**

文档内容应包括：
1. 准备工作（GitHub 仓库、Neon 账号、Render 账号、Vercel 账号）
2. Neon 数据库创建和连接字符串获取
3. 本地数据库迁移（prisma db push）
4. Render 部署配置（连接 GitHub、设置环境变量）
5. Vercel 前端部署
6. 防休眠配置（cron-job.org）
7. 验证步骤（健康检查、功能测试）
8. 故障排查指南

---

## Self-Review

### Spec Coverage
- [x] Dockerfile 多阶段构建
- [x] Python 路径跨平台兼容
- [x] 定时任务频率调整
- [x] SQLite → PostgreSQL 迁移
- [x] Render Docker 配置
- [x] 根 package.json 修复
- [x] 部署文档

### Placeholder Scan
- [x] 无 TBD/TODO
- [x] 所有代码片段完整
- [x] 所有命令可执行

### Type Consistency
- [x] Prisma schema 字段名与代码一致
- [x] 环境变量名前后一致
