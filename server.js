const express = require('express');
const fs = require('fs');
const path = require('path');
const { run, warmup, setSharedContext } = require('./index');
const {
  CHROME_PATH,
  GAS_WEBHOOK_URL,
  INDEX_URL
} = require('./modules/constants');
const { selectCookies } = require('./modules/cookieSelector');

// puppeteer-extra + stealth plugin 導入
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const stealth = StealthPlugin();
stealth.enabledEvasions.delete('iframe.contentWindow'); // オプション：reCAPTCHA安定化用
puppeteer.use(stealth);

const app = express();
app.use(express.json());

// /tmp 以下のファイルを静的に公開（スクショの画像など）
app.use('/tmp', express.static(path.join(__dirname, 'tmp')));

(async () => {
  // スプレッドシートから Cookie を選択（空なら null）
  const selectedCookies = await selectCookies();

  // Puppeteer 起動コンテキストを設定
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

  // ヘルスチェック
  app.get('/health', (req, res) => res.send('OK'));

  // CRON トリガー（GET/POST 共通）
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
})();
