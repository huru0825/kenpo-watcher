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

# Puppeteerの自動Chrome DLをスキップ
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV DISPLAY=:99

# 作業ディレクトリ作成
WORKDIR /app

# パッケージ定義をコピー
COPY package*.json ./

# 権限あるうちに install
RUN npm install && npx puppeteer install

# 残りのファイルをコピー
COPY . .

# 実行権限を付与
RUN chmod +x ./start.sh

# 最後に node ユーザーへ切替（← ここ！）
USER node

# 起動スクリプト実行
CMD ["./start.sh"]
