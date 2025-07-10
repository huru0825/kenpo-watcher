const puppeteer = require('puppeteer');
const axios = require('axios');

// === 環境変数の取得（RenderのGUIで設定）===
const TARGET_URL = process.env.TARGET_URL;
const GAS_WEBHOOK_URL = process.env.GAS_WEBHOOK_URL;
const TARGET_FACILITY_NAME = process.env.TARGET_FACILITY_NAME || '';
const DAY_FILTER_RAW = process.env.DAY_FILTER || '土曜日';
const DATE_FILTER_RAW = process.env.DATE_FILTER || '';

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

// === 日付正規化関数 ===
const normalizeDates = (raw) => {
  return raw
    .replace(/、/g, ',') // 全角カンマを半角に変換
    .split(',')
    .map(d => d.trim())
    .filter(Boolean)
    .map(date => {
      const match = date.match(/^(\d{1,2})月(\d{1,2})日$/);
      if (!match) return null;
      const [, month, day] = match;
      return `${month.padStart(2, '0')}月${day.padStart(2, '0')}日`;
    })
    .filter(Boolean);
};

const DATE_FILTER_LIST = normalizeDates(DATE_FILTER_RAW);
const DAY_FILTER = DAY_MAP[DAY_FILTER_RAW] || null;

(async () => {
  console.log('🔄 Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
    // executablePath は未指定：Puppeteerの内蔵Chromiumを使用する
  });
  console.log('✅ Browser launched');

  const page = await browser.newPage();
  await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

  // ○アイコンがあるリンクを抽出
  const availableDates = await page.$$eval('img', imgs =>
    imgs
      .filter(img => img.src.includes('icon_circle.png'))
      .map(img => {
        const link = img.closest('a');
        const text = link ? link.textContent.trim() : '';
        return { href: link.href, label: text };
      })
  );

  const matched = [];

  for (const date of availableDates) {
    const { href, label } = date;
    const matchedByDate = DATE_FILTER_LIST.some(d => label.includes(d));
    const matchedByDay = DAY_FILTER && label.includes(DAY_FILTER_RAW);

    if (
      (DATE_FILTER_LIST.length > 0 && matchedByDate) ||
      (DATE_FILTER_LIST.length === 0 && matchedByDay)
    ) {
      await page.goto(href, { waitUntil: 'networkidle2', timeout: 60000 });

      const facilityFound = await page.evaluate((facilityName) => {
        return Array.from(document.querySelectorAll('a')).some(a =>
          a.textContent.includes(facilityName)
        );
      }, TARGET_FACILITY_NAME);

      if (facilityFound) matched.push(label);

      await page.goBack({ waitUntil: 'networkidle2', timeout: 60000 });
    }
  }

  // GASに通知送信
  for (const hit of matched) {
    const message = `✅ ${DAY_FILTER_RAW}：空きあり「${TARGET_FACILITY_NAME}」\n${hit}\n\n${TARGET_URL}`;
    await axios.post(GAS_WEBHOOK_URL, { message });
  }

  await browser.close();
})();
