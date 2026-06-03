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
# ⚠️ --accept-data-loss 会静默丢弃不兼容的列，生产环境建议：
#   1. 开发阶段用 prisma db push（快速迭代）
#   2. 上线后改用 prisma migrate deploy（严格校验）
CMD cd server && npx prisma db push --accept-data-loss && node dist/index.js
