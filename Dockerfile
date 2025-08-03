FROM node:18-slim

# Google Chrome + Puppeteer 依存パッケージをインストール
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
  gnupg \
  && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
  && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list \
  && apt-get update && apt-get install -y google-chrome-stable \
  && rm -rf /var/lib/apt/lists/*

# Puppeteer に Chrome を自動DLさせない + 実行パス指定
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
ENV DISPLAY=:99

# 作業ディレクトリ
WORKDIR /app

# スクリーンショット保存用ディレクトリを作成＋パーミッション許可
RUN mkdir -p /app/tmp && chmod 777 /app/tmp

# 依存関係インストール
COPY package*.json ./
RUN npm install

# アプリ本体と起動スクリプトをコピー
COPY . .

# 起動スクリプトに実行権限付与
RUN chmod +x ./start.sh

# nodeユーザーで動作
USER node

# ENTRYPOINTとCMDの明示指定
ENTRYPOINT ["bash"]
CMD ["./start.sh"]
