FROM node:18-slim

# Puppeteer に必要な依存パッケージと Chrome をインストール
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
  gnupg && \
  wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - && \
  echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list && \
  apt-get update && apt-get install -y google-chrome-stable && \
  rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
ENV DISPLAY=:99

# 作業ディレクトリ
WORKDIR /app

# 依存関係
COPY package*.json ./
RUN npm install

# アプリ本体
COPY . .

# tmp ディレクトリ作成＆権限付与（ここが重要）
RUN mkdir -p /app/tmp && chown node:node /app/tmp && chmod 700 /app/tmp

# スクリプト実行権限
RUN chmod +x ./start.sh

# nodeユーザーに切り替え
USER node

ENTRYPOINT ["bash"]
CMD ["./start.sh"]
