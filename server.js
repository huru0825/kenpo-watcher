// server.js
const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, 'kenpo-watcher.env'),
  debug: true
});

process.on('unhandledRejection', (reason) => {
  console.error('UnhandledRejection captured:', reason);
  process.exit(1);
});
process.on('uncaughtException', (error) => {
  console.error('UncaughtException captured:', error);
  process.exit(1);
});

const express = require('express');
const fs = require('fs');

const { run, warmup, setSharedContext } = require('./index');
const {
  CHROME_PATH,
  GAS_WEBHOOK_URL,
  INDEX_URL,
  BASE_URL
} = require('./modules/constants');
const { selectCookies } = require('./modules/cookieSelector');

// puppeteer-extra + stealth plugin 導入
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const stealth = StealthPlugin();
stealth.enabledEvasions.delete('iframe.contentWindow'); // reCAPTCHA安定化用
puppeteer.use(stealth);

const app = express();
app.use(express.json());

// /tmp を静的ファイルとして提供
app.use('/tmp', express.static(path.join(__dirname, 'tmp')));

// 生存確認用エンドポイント
app.get('/', (req, res) => {
  res.send('Kenpo Watcher is alive! 🚀');
});

// ヘルスチェック
app.get('/health', (req, res) => res.send('OK'));

// /run エンドポイント定義
const handleRun = async (req, res) => {
  try {
    const result = await run();

    if (result && Array.isArray(result.screenshotPaths)) {
      result.screenshotPaths.forEach(fullPath => {
        const fileName = path.basename(fullPath);
        const publicUrl = `${BASE_URL}/tmp/${fileName}`;
        console.log(`[server] Screenshot URL: ${publicUrl}`);
      });
    }

    res.sendStatus(204);
  } catch (err) {
    console.error('💥 /run error:', err.message);
    console.error(err.stack);
    res.sendStatus(500);
  }
};

app.get('/run', handleRun);
app.post('/run', handleRun);

// メイン関数
async function main() {
  const selectedCookies = await selectCookies();

  setSharedContext({
    puppeteer,
    launchOptions: {
      executablePath: CHROME_PATH,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1024,768'
      ]
    },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0 Safari/537.36',
    headers: { 'Accept-Language': 'ja-JP,ja;q=0.9' },
    cookies: selectedCookies,
    url: INDEX_URL,
    webhookUrl: GAS_WEBHOOK_URL
  });

  const port = process.env.PORT || 10000;
  app.listen(port, async () => {
    console.log(`✅ Server listening on port ${port}`);
    try {
      console.log('✨ Warmup: launching browser to avoid cold start...');
      if (typeof warmup === 'function') {
        await warmup();
        console.log('✨ Warmup completed');
      } else {
        console.warn('⚠️ Warmup is not defined as function → skip');
      }
    } catch (e) {
      console.error('⚠️ Warmup failed (ignored):', e);
    }
  });
}

main();
