FROM node:18-slim

# Chrome & XVFBに必要な依存パッケージを導入
RUN apt-get update && apt-get install -y \
  wget \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgcc1 \
  libgconf-2-4 \
  libgdk-pixbuf2.0-0 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  xdg-utils \
  xvfb \
  xauth \
  curl \
  && rm -rf /var/lib/apt/lists/*

# Puppeteer用Chromeの自動DLはスキップ
ENV PUPPETEER_SKIP_DOWNLOAD=true

# 作業ディレクトリ作成
WORKDIR /app

# パッケージファイルコピー＆依存インストール
COPY package*.json ./
RUN npm install

# アプリ全体をコピー
COPY . .

# XVFB 経由で npm start を実行（server.js 起動）
CMD ["xvfb-run", "--server-args=-screen 0 1024x768x24", "npm", "start"]
