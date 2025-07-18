const express       = require('express');
const puppeteer     = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios         = require('axios');
const fs            = require('fs');

puppeteer.use(StealthPlugin());

const app = express();
const INDEX_URL            = 'https://as.its-kenpo.or.jp/service_category/index';
const GAS_WEBHOOK_URL      = process.env.GAS_WEBHOOK_URL;
const TARGET_FACILITY_NAME = process.env.TARGET_FACILITY_NAME || '';
const DAY_FILTER_RAW       = process.env.DAY_FILTER || '土曜日';
const DATE_FILTER_RAW      = process.env.DATE_FILTER || '';
const CHROME_PATH          = process.env.PUPPETEER_EXECUTABLE_PATH;
let isRunning = false;

if (!CHROME_PATH) throw new Error('PUPPETEER_EXECUTABLE_PATH が未設定です');
if (!GAS_WEBHOOK_URL) console.warn('※ GAS_WEBHOOK_URL が未設定です（本番通知はAブラウザのみ）');

const DAY_MAP = {
  '日曜日': 'Sunday', '月曜日': 'Monday', '火曜日': 'Tuesday',
  '水曜日': 'Wednesday', '木曜日': 'Thursday', '金曜日': 'Friday', '土曜日': 'Saturday'
};

function normalizeDates(raw) {
  return raw.replace(/、/g, ',').split(',').map(d => d.trim()).filter(Boolean).map(date => {
    const m = date.match(/^(\d{1,2})月(\d{1,2})日$/);
    return m ? m[1].padStart(2, '0') + '月' + m[2].padStart(2, '0') + '日' : null;
  }).filter(Boolean);
}

const DATE_FILTER_LIST = normalizeDates(DATE_FILTER_RAW);
const DAY_FILTER       = DAY_MAP[DAY_FILTER_RAW] || null;
const TARGET_DAY_RAW   = DAY_FILTER_RAW;

const fixedCookies = [...]; // ※ ここには省略せず、前回の内容そのままコピペで挿入してください（長文のため割愛）

async function waitCalendar(page) {
  console.log('→ カレンダー領域の検出待機…');
  await page.waitForSelector('#calendarContent table.tb-calendar', { timeout: 180000 });
  console.log('→ カレンダー領域検出完了');
  await page.waitForResponse(r => r.url().includes('/calendar_apply/calendar_select') && r.status() === 200);
  console.log('→ カレンダーデータ取得完了');
}

async function visitMonth(page, includeDateFilter) {
  const anchor = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 1000 }).catch(() => null);
  const challenge = await page.waitForSelector('iframe[src*="/recaptcha/api2/bframe"], .rc-imageselect', { timeout: 1000 }).catch(() => null);
  if (challenge && !anchor) return [];

  const available = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a'))
      .filter(a => a.querySelector('img[src*="icon_circle.png"]'))
      .map(a => ({ href: a.href, label: a.textContent.trim() }))
  );

  const hits = [];
  for (const { href, label } of available) {
    const byDate = includeDateFilter && DATE_FILTER_LIST.some(d => label.includes(d));
    const byDay = !DATE_FILTER_LIST.length && DAY_FILTER && label.includes(TARGET_DAY_RAW);
    if (byDate || byDay) {
      await page.goto(href, { waitUntil: 'networkidle2', timeout: 0 });
      await page.waitForFunction(() => document.querySelectorAll('.tb-calendar tbody td').length > 0, { timeout: 0 });

      const ia = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 1000 }).catch(() => null);
      const ii = await page.waitForSelector('iframe[src*="/recaptcha/api2/bframe"], .rc-imageselect', { timeout: 1000 }).catch(() => null);
      if (ii && !ia) {
        await page.goBack({ waitUntil: 'networkidle2' }).catch(() => {});
        continue;
      }

      const found = await page.evaluate(name =>
        Array.from(document.querySelectorAll('a')).some(a => a.textContent.includes(name)),
        TARGET_FACILITY_NAME
      );
      if (found) hits.push(label);
      await page.goBack({ waitUntil: 'networkidle2' }).catch(() => {});
    }
  }
  return hits;
}

async function nextMonth(page) {
  await page.click('input.button-select.button-primary[value="次へ"]');
  await waitCalendar(page);
}

async function prevMonth(page) {
  await page.click('input.button-select.button-primary[value="前へ"]');
  await waitCalendar(page);
}

module.exports.run = async function () {
  if (isRunning) return;
  isRunning = true;

  const launchOptions = {
    headless: 'new',
    executablePath: CHROME_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-blink-features=AutomationControlled'
    ]
  };

  let browserA, browserB;
  try {
    browserA = await puppeteer.launch(launchOptions);
    const pageA = await browserA.newPage();
    await pageA.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0 Safari/537.36');
    await pageA.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });
    await pageA.setCookie(...fixedCookies);
    await pageA.goto(INDEX_URL, { waitUntil: 'networkidle2', timeout: 0 });

    await Promise.all([
      pageA.click('a[href*="/calendar_apply"]'),
      pageA.waitForSelector('#calendarContent', { timeout: 0 }).catch(() => {})
    ]);

    const anchorFrame = pageA.frames().find(f => f.url().includes('/recaptcha/api2/anchor'));
    if (anchorFrame) {
      await anchorFrame.click('.recaptcha-checkbox-border');
      await pageA.waitForTimeout(2000);
    }

    await nextMonth(pageA);
    const sequence = [
      { action: null, includeDate: true },
      { action: nextMonth, includeDate: false },
      { action: nextMonth, includeDate: false },
      { action: prevMonth, includeDate: false },
      { action: prevMonth, includeDate: true }
    ];

    const notified = new Set();
    for (const { action, includeDate } of sequence) {
      if (action) await action(pageA);
      const hits = await visitMonth(pageA, includeDate);
      for (const label of hits) {
        if (!notified.has(label)) {
          notified.add(label);
          if (GAS_WEBHOOK_URL) {
            await axios.post(GAS_WEBHOOK_URL, {
              message: `【${TARGET_FACILITY_NAME}】予約状況更新\n日付：${label}\n詳細▶︎${INDEX_URL}`
            });
          }
        }
      }
    }

    if (notified.size === 0 && GAS_WEBHOOK_URL) {
      await axios.post(GAS_WEBHOOK_URL, {
        message: `ℹ️ ${TARGET_FACILITY_NAME} の空きはありませんでした。\n監視URL▶︎${INDEX_URL}`
      });
    }

    // Cookie更新処理（通知はログのみ）
    browserB = await puppeteer.launch(launchOptions);
    const pageB = await browserB.newPage();
    await pageB.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0 Safari/537.36');
    await pageB.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });
    await pageB.setCookie(...fixedCookies);
    await pageB.goto(INDEX_URL, { waitUntil: 'networkidle2', timeout: 0 });

    const captchaDetected = await pageB.$('iframe[src*="recaptcha"]');
    if (captchaDetected) {
      console.warn('⚠️ Bブラウザ: CAPTCHA出現。Cookie保存スキップ');
    } else {
      const updatedCookies = await pageB.cookies();
      fs.writeFileSync('updated_cookies.json', JSON.stringify(updatedCookies, null, 2), 'utf-8');
      console.log('💾 Cookie保存完了: updated_cookies.json');

      const oldSession = fixedCookies.find(c => c.name === '_src_session')?.value;
      const newSession = updatedCookies.find(c => c.name === '_src_session')?.value;
      if (oldSession && newSession && oldSession !== newSession) {
        console.log('✅ セッション更新完了: 新しい _src_session が取得されました');
      } else {
        console.log('ℹ️ セッションIDに変更はありません');
      }
    }
  } catch (err) {
    console.error('⚠️ 例外発生:', err);
    if (GAS_WEBHOOK_URL) {
      await axios.post(GAS_WEBHOOK_URL, {
        message: '⚠️ エラーが発生しました：\n' + (err.stack || err.message)
      });
    }
  } finally {
    if (browserA) await browserA.close();
    if (browserB) await browserB.close();
    isRunning = false;
  }
};

module.exports.warmup = async function () {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME_PATH,
    args: ['--no-sandbox']
  });
  await browser.close();
};

// Express サーバ（Render Web Service用）
if (require.main === module) {
  const port = process.env.PORT || 3000;

  app.get('/health', (req, res) => {
    res.send('OK');
  });

  app.get('/run', async (req, res) => {
    try {
      await module.exports.run();
      res.sendStatus(204);
    } catch (err) {
      console.error('💥 /run error:', err);
      res.sendStatus(500);
    }
  });

  app.get('/run-once', async (req, res) => {
    const start = Date.now();
    try {
      await module.exports.run();
      const elapsed = ((Date.now() - start) / 1000).toFixed(2);
      res.send(`OK in ${elapsed}s`);
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  (async () => {
    try {
      console.log('✨ Warmup: launching browser to avoid cold start...');
      await module.exports.warmup();
      console.log('✨ Warmup completed');
    } catch (e) {
      console.error('⚠️ Warmup failed (ignored):', e);
    }
  })();

  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
  }
