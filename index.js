const puppeteer = require('puppeteer');
const axios       = require('axios');

// === 環境変数の取得（RenderのGUIで設定）===
const TARGET_URL           = process.env.TARGET_URL;
const GAS_WEBHOOK_URL      = process.env.GAS_WEBHOOK_URL;
const TARGET_FACILITY_NAME = process.env.TARGET_FACILITY_NAME || '';
const DAY_FILTER_RAW       = process.env.DAY_FILTER || '土曜日';
const DATE_FILTER_RAW      = process.env.DATE_FILTER || '';
const CHROME_PATH          = process.env.PUPPETEER_EXECUTABLE_PATH;

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

;(async () => {
  console.log('🔄 Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME_PATH,
    args: ['--no-sandbox','--disable-setuid-sandbox']
  });
  console.log('✅ Browser launched');

  const page = await browser.newPage();

  // --- トップページ到達後、reCAPTCHA widget のチェック ---
  await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  // ページ内にreCAPTCHAウィジェット要素があれば即終了
  const recaptchaWidget = await page.$('.g-recaptcha, #recaptcha, iframe[src*="recaptcha"]');
  if (recaptchaWidget) {
    console.log('⚠️ 画像認証フォーム（reCAPTCHA）が検出されたため、即終了します。');
    await browser.close();
    process.exit(0);
  }

  // --- ○アイコンがあるリンクを抽出 (serialize-able function literal) ---
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
      await page.goto(href, { waitUntil: 'networkidle2', timeout: 60000 });

      // 施設名検索 (serialize-able function literal)
      const facilityFound = await page.evaluate(name => {
        return Array.from(document.querySelectorAll('a'))
          .some(a => a.textContent.includes(name));
      }, TARGET_FACILITY_NAME);

      if (facilityFound) matched.push(label);
      await page.goBack({ waitUntil: 'networkidle2', timeout: 60000 });
    }
  }

  // --- マッチした日付ごとに通知 ---
  for (const hit of matched) {
    const message = `✅ ${DAY_FILTER_RAW}：空きあり「${TARGET_FACILITY_NAME}」\n${hit}\n\n${TARGET_URL}`;
    await axios.post(GAS_WEBHOOK_URL, { message });
  }

  await browser.close();
})();
