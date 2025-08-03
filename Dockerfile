FROM node:18-slim

# Puppeteerに必要な依存パッケージとChromeをインストール
RUN apt-get update && apt-get install -y \
  wget ca-certificates fonts-liberation libappindicator3-1 \
  libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 \
  libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 \
  libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 \
  libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 \
  libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 \
  libxi6 libxrandr2 libxrender1 libxss1 libxtst6 xdg-utils xvfb xauth \
  curl gnupg && \
  wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - && \
  echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list && \
  apt-get update && apt-get install -y google-chrome-stable && \
  rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome
ENV DISPLAY=:99

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# ✅ ここが重要：/app/tmp を作成し、node ユーザーに所有権を渡す
RUN mkdir -p /app/tmp && chown node:node /app/tmp

RUN chmod +x ./start.sh

USER node

ENTRYPOINT ["bash"]
CMD ["./start.sh"]
