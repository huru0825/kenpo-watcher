const puppeteer = require('puppeteer');
const axios    = require('axios');

// === 環境変数の取得（RenderのGUIで設定）===
const TARGET_URL           = process.env.TARGET_URL;
const GAS_WEBHOOK_URL      = process.env.GAS_WEBHOOK_URL;
const TARGET_FACILITY_NAME = process.env.TARGET_FACILITY_NAME || '';
const DAY_FILTER_RAW       = process.env.DAY_FILTER || '土曜日';
const DATE_FILTER_RAW      = process.env.DATE_FILTER || '';
const CHROME_PATH          = process.env.PUPPETEER_EXECUTABLE_PATH;
// リトライ設定（任意、デフォルトは3回・5分）
const MAX_RETRIES          = parseInt(process.env.MAX_RETRIES || '3', 10);
const RETRY_DELAY_MS       = parseInt(process.env.RETRY_DELAY_MINUTES || '5', 10) * 60_000;

// === 曜日マップ（日本語 → 英語）===
const DAY_MAP = {
  '日曜日': 'Sunday',  '月曜日': 'Monday', '火曜日': 'Tuesday',
  '水曜日': 'Wednesday','木曜日': 'Thursday',
  '金曜日': 'Friday',  '土曜日': 'Saturday'
};

// === 日付正規化関数 ===
function normalizeDates(raw) {
  return raw
    .replace(/、/g, ',')
    .split(',')
    .map(d => d.trim())
    .filter(Boolean)
    .map(date => {
      const m = date.match(/^(\d{1,2})月(\d{1,2})日$/);
      if (!m) return null;
      const [, mm, dd] = m;
      return `${mm.padStart(2,'0')}月${dd.padStart(2,'0')}日`;
    })
    .filter(Boolean);
}

const DATE_FILTER_LIST = normalizeDates(DATE_FILTER_RAW);
const DAY_FILTER       = DAY_MAP[DAY_FILTER_RAW] || null;

// === reCAPTCHA 検出＆リトライ付き goto 関数 ===
async function safeGoto(page, url, opts = {}) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    await page.goto(url, opts);
    // ページ上に reCAPTCHA widget があるかチェック
    const captcha = await page.$('iframe[src*="recaptcha"]');
    if (!captcha) return;
    console.warn(`⚠️ reCAPTCHA detected on ${url}, retrying in ${RETRY_DELAY_MS/60000}min (attempt ${attempt}/${MAX_RETRIES})`);
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  console.error(`❌ Unable to bypass reCAPTCHA after ${MAX_RETRIES} attempts`);
}

;(async () => {
  console.log('🔄 Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME_PATH,
    args: ['--no-sandbox','--disable-setuid-sandbox']
  });
  console.log('✅ Browser launched');

  const page = await browser.newPage();
  await safeGoto(page, TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

  // ○アイコンがあるリンクを抽出
  const availableDates = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('img'))
      .filter(img => img.src.includes('icon_circle.png'))
      .map(img => {
        const a = img.closest('a');
        return a
          ? { href: a.href, label: a.textContent.trim() }
          : null;
      })
      .filter(Boolean);
  });

  const matched = [];

  for (const { href, label } of availableDates) {
    const byDate = DATE_FILTER_LIST.some(d => label.includes(d));
    const byDay  = DAY_FILTER && label.includes(DAY_FILTER_RAW);

    if ((DATE_FILTER_LIST.length > 0 && byDate) ||
        (DATE_FILTER_LIST.length === 0 && byDay)) {
      await safeGoto(page, href, { waitUntil: 'networkidle2', timeout: 60000 });

      const facilityFound = await page.evaluate(name => {
        return Array.from(document.querySelectorAll('a'))
          .some(a => a.textContent.includes(name));
      }, TARGET_FACILITY_NAME);

      if (facilityFound) matched.push(label);
      await safeGoto(page, TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    }
  }

  for (const hit of matched) {
    const message = `✅ ${DAY_FILTER_RAW}：空きあり「${TARGET_FACILITY_NAME}」\n${hit}\n\n${TARGET_URL}`;
    await axios.post(GAS_WEBHOOK_URL, { message });
  }

  await browser.close();
})();
