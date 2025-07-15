const puppeteer = require('puppeteer');
const axios = require('axios');

// === 日付正規化関数 ===
function normalizeDates(raw) {
  return raw
    .replace(/、/g, ',')
    .split(',')
    .map(d => d.trim())
    .filter(Boolean)
    .map(date => {
      const m = date.match(/^(\d{1,2})月(\d{1,2})日$/);
      return m ? `${m[1].padStart(2, '0')}月${m[2].padStart(2, '0')}日` : null;
    })
    .filter(Boolean);
}

// === 環境変数の取得（RenderのGUIで設定）===
const TARGET_URL = process.env.TARGET_URL;
const GAS_WEBHOOK_URL = process.env.GAS_WEBHOOK_URL;
const TARGET_FACILITY_NAME = process.env.TARGET_FACILITY_NAME || '';
const DAY_FILTER_RAW = process.env.DAY_FILTER || '土曜日';
const DATE_FILTER_RAW = process.env.DATE_FILTER || '';
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH;

// === env バリデーション ===
if (!TARGET_URL) throw new Error('TARGET_URL が設定されていません');
if (!GAS_WEBHOOK_URL) throw new Error('GAS_WEBHOOK_URL が設定されていません');
if (!CHROME_PATH) throw new Error('PUPPETEER_EXECUTABLE_PATH が設定されていません');

// === 曜日マップ（日本語 → 英語）===
const DAY_MAP = {
  '日曜日': 'Sunday',
  '月曜日': 'Monday',
  '火曜日': 'Tuesday',
  '水曜日': 'Wednesday',
  '木曜日': 'Thursday',
  '金曜日': 'Friday',
  '土曜日': 'Saturday'
};

const DATE_FILTER_LIST = normalizeDates(DATE_FILTER_RAW);
const DAY_FILTER = DAY_MAP[DAY_FILTER_RAW] || null;

;(async () => {
  let browser;
  try {
    console.log('🔄 Launching browser...', CHROME_PATH);
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      env: { ...process.env, PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'true' }
    });

    const page = await browser.newPage();
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    async function checkRecaptcha(pg) {
      const anchor = await pg.$('iframe[src*="/recaptcha/api2/anchor"]');
      const challenge = await pg.$('iframe[src*="/recaptcha/api2/bframe"], .rc-imageselect');
      return !(challenge && !anchor);
    }

    if (!await checkRecaptcha(page)) {
      console.warn('🔴 reCAPTCHA challenge detected');
      await browser.close();
      return;
    }

    const availableDates = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img'))
        .filter(img => img.src.includes('icon_circle.png'))
        .map(img => {
          const a = img.closest('a');
          return a && a.href ? { href: a.href, label: a.textContent.trim() } : null;
        })
        .filter(Boolean)
    );

    const matched = [];

    for (const { href, label } of availableDates) {
      const isDateMatch = DATE_FILTER_LIST.length
        ? DATE_FILTER_LIST.some(d => label.includes(d))
        : label.includes(DAY_FILTER_RAW);

      if (isDateMatch) {
        await page.goto(href, { waitUntil: 'networkidle2', timeout: 60000 });

        if (await checkRecaptcha(page)) {
          const facilityFound = await page.evaluate(name =>
            Array.from(document.querySelectorAll('a')).some(a => a.textContent.includes(name))
          , TARGET_FACILITY_NAME);

          if (facilityFound) matched.push(label);
        }

        await page.goBack({ waitUntil: 'networkidle2', timeout: 60000 });
      }
    }

    for (const hit of matched) {
      await axios.post(GAS_WEBHOOK_URL, {
        message: `✅ ${DAY_FILTER_RAW}：空きあり「${TARGET_FACILITY_NAME}」\n${hit}\n\n${TARGET_URL}`
      });
    }

  } catch (err) {
    console.error('❌ Exception caught:', err);
    const text = err.stack || err.message || String(err);
    await axios.post(GAS_WEBHOOK_URL, { message: `⚠️ Error occurred:\n${text}` });
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
