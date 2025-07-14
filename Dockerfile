FROM node:22-bullseye

# システム依存パッケージのインストール
RUN apt-get update && apt-get install -y \
  google-chrome-stable \
  ca-certificates \
  fonts-liberation \
  libgtk-3-0 \
  libxss1 \
  wget \
  && rm -rf /var/lib/apt/lists/*

# 作業ディレクトリ
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm install --production=false
COPY . .
RUN npm run bundle && npm run build-binary && chmod +x kenpo-watcher

# デフォルト実行コマンド
CMD ["./kenpo-watcher"]
