const puppeteer = require('puppeteer');
const axios = require('axios');

// === 環境変数の取得（RenderのGUIで設定）===
const TARGET_URL             = process.env.TARGET_URL;
const GAS_WEBHOOK_URL        = process.env.GAS_WEBHOOK_URL;
const TARGET_FACILITY_NAME   = process.env.TARGET_FACILITY_NAME || '';
const DAY_FILTER_RAW         = process.env.DAY_FILTER || '土曜日';
const DATE_FILTER_RAW        = process.env.DATE_FILTER || '';
const CHROME_PATH            = process.env.PUPPETEER_EXECUTABLE_PATH;

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
function normalizeDates(raw) {
  return raw
    .replace(/、/g, ',')
    .split(',')
    .map(function(d) { return d.trim(); })
    .filter(Boolean)
    .map(function(date) {
      const match = date.match(/^(\d{1,2})月(\d{1,2})日$/);
      if (!match) return null;
      const month = match[1].padStart(2, '0');
      const day   = match[2].padStart(2, '0');
      return `${month}月${day}日`;
    })
    .filter(Boolean);
}

const DATE_FILTER_LIST = normalizeDates(DATE_FILTER_RAW);
// 英語に変換した曜日フィルタ（該当がなければ null）
const DAY_FILTER = DAY_MAP[DAY_FILTER_RAW] || null;

(async () => {
  console.log('🔄 Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  console.log('✅ Browser launched');

  const page = await browser.newPage();
  await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

  // ○アイコンがあるリンクを抽出（シリアライズ可能な関数で実装）
  const availableDates = await page.$$eval('img', function(imgs) {
    return imgs
      .filter(function(img) { return img.src.includes('icon_circle.png'); })
      .map(function(img) {
        const link = img.closest('a');
        return {
          href: link ? link.href : '',
          label: link ? link.textContent.trim() : ''
        };
      });
  });

  const matched = [];

  for (const dateInfo of availableDates) {
    const href  = dateInfo.href;
    const label = dateInfo.label;
    const byDate = DATE_FILTER_LIST.some(function(d) { return label.includes(d); });
    const byDay  = DAY_FILTER && label.includes(DAY_FILTER);

    // 日付フィルタ or 曜日フィルタに一致するものだけ処理
    if (
      (DATE_FILTER_LIST.length > 0 && byDate) ||
      (DATE_FILTER_LIST.length === 0 && byDay)
    ) {
      await page.goto(href, { waitUntil: 'networkidle2', timeout: 60000 });

      // 施設名がリンクに含まれているかチェック
      const facilityFound = await page.evaluate(function(name) {
        return Array.from(document.querySelectorAll('a')).some(function(a) {
          return a.textContent.includes(name);
        });
      }, TARGET_FACILITY_NAME);

      if (facilityFound) {
        matched.push(label);
      }

      await page.goBack({ waitUntil: 'networkidle2', timeout: 60000 });
    }
  }

  // 一致した日程を通知
  for (const hit of matched) {
    const message = `✅ ${DAY_FILTER_RAW}：空きあり「${TARGET_FACILITY_NAME}」\n${hit}\n\n${TARGET_URL}`;
    await axios.post(GAS_WEBHOOK_URL, { message });
  }

  await browser.close();
})();
