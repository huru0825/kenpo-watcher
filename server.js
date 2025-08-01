process.on('unhandledRejection', (reason) => {
  console.error('UnhandledRejection captured:', reason);
  process.exit(1);
});
process.on('uncaughtException', (error) => {
  console.error('UncaughtException captured:', error);
  process.exit(1);
});


// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');

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

const app = express(); // ← ここを先に定義

app.use(express.json());

// /tmp 以下のファイルを静的に公開（スクショ画像など）
app.use('/tmp', express.static(path.join(__dirname, 'tmp')));

// 生存確認ルート
app.get('/', (req, res) => {
  res.send('Kenpo Watcher is alive! 🚀');
});

// ヘルスチェック
app.get('/health', (req, res) => res.send('OK'));

// run() を叩くハンドラ（GET / POST 両方対応）
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

// Main関数でPuppeteerとサーバー起動
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
        '--disable-blink-features=AutomationControlled'
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
