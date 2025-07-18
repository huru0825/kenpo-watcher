const express = require('express');
const fs = require('fs');
const path = require('path');
const { run, warmup, setSharedContext } = require('./index');
const {
  CHROME_PATH,
  fixedCookies,
  GAS_WEBHOOK_URL,
  INDEX_URL
} = require('./modules/constants');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

// Puppeteer起動コンテキストを設定
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
  cookies: fixedCookies,
  url: INDEX_URL,
  webhookUrl: GAS_WEBHOOK_URL
});

// ヘルスチェック
app.get('/health', (req, res) => res.send('OK'));

// CRONトリガー（GETでもPOSTでもOK）
app.get('/run', async (req, res) => {
  try {
    await run();
    res.sendStatus(204);
  } catch (err) {
    console.error('💥 /run error:', err);
    res.sendStatus(500);
  }
});
app.post('/run', async (req, res) => {
  try {
    await run();
    res.sendStatus(204);
  } catch (err) {
    console.error('💥 /run error:', err);
    res.sendStatus(500);
  }
});

// ポートバインド＋Warmup
const port = process.env.PORT || 10000;
app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);
  try {
    console.log('✨ Warmup: launching browser to avoid cold start...');
    await warmup();
    console.log('✨ Warmup completed');
  } catch (e) {
    console.error('⚠️ Warmup failed (ignored):', e);
  }
});
