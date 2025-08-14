// server.js

const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, 'kenpo-watcher.env'),
  debug: true
});

const express = require('express');
const fs = require('fs');
const { run, warmup, setSharedContext } = require('./index');
const {
  CHROME_PATH,
  GAS_WEBHOOK_URL,
  INDEX_URL,
  BASE_URL
} = require('./constants');
const { selectCookies } = require('./cookieSelector');
const { reportError } = require('./kw-error');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());
app.use('/tmp', express.static(path.join(__dirname, 'tmp')));

app.get('/', (req, res) => {
  res.send('Kenpo Watcher is alive! 🚀');
});

app.get('/health', (req, res) => res.send('OK'));

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
    reportError('SVE003', err);
    res.sendStatus(500);
  }
};

app.get('/run', handleRun);
app.post('/run', handleRun);

async function main() {
  try {
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
      console.log('✨ Warmup: launching browser to avoid cold start...');
      try {
        if (typeof warmup === 'function') {
          await warmup();
          console.log('✨ Warmup completed');
        } else {
          reportError('SVE004');
        }
      } catch (e) {
        reportError('SVE005', e);
      }
    });
  } catch (err) {
    reportError('SVE001', err);
  }
}

process.on('unhandledRejection', (reason) => {
  reportError('SVE001', new Error(String(reason)));
});

process.on('uncaughtException', (error) => {
  reportError('SVE002', error);
});

main();
