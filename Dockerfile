FROM node:18-slim

# Puppeteer + Chrome + Xvfb + bash を含む依存パッケージをインストール
RUN apt-get update && apt-get install -y \
  wget \
  ca-certificates \
  bash \
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
  curl -fsSL https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google.gpg && \
  echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list && \
  apt-get update && apt-get install -y google-chrome-stable && \
  rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
ENV DISPLAY=:99

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# スクリーンショット保存ディレクトリの作成とパーミッション設定
RUN mkdir -p /mnt/Documents/screenshots && \
    chown -R node:node /mnt/Documents

RUN chmod +x ./start.sh

# 権限切り替え
RUN chown -R node:node /app
USER node

ENTRYPOINT ["bash"]
CMD ["./start.sh"]
