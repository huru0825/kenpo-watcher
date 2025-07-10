// index.js
const puppeteer = require('puppeteer');
const axios = require('axios');

// === 環境変数の取得（Render の GUI で設定） ===
const TARGET_URL             = process.env.TARGET_URL;
const GAS_WEBHOOK_URL        = process.env.GAS_WEBHOOK_URL;
const TARGET_FACILITY_NAME   = process.env.TARGET_FACILITY_NAME || '';
const DAY_FILTER_RAW         = process.env.DAY_FILTER     || '土曜日';
const DATE_FILTER_RAW        = process.env.DATE_FILTER    || '';
const CHROMIUM_PATH          = process.env.CHROMIUM_PATH || puppeteer.executablePath();  // ← 追加

// === Puppeteer がどの実行ファイルを拾っているかログ出力（初回起動用） ===
console.log('▶️ puppeteer.executablePath():', puppeteer.executablePath());

const DAY_MAP = {
  '日曜日': 'Sunday',
  '月曜日': 'Monday',
  '火曜日': 'Tuesday',
  '水曜日': 'Wednesday',
  '木曜日': 'Thursday',
  '金曜日': 'Friday',
  '土曜日': 'Saturday'
};

const normalizeDates = raw =>
  raw
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

const DATE_FILTER_LIST = normalizeDates(DATE_FILTER_RAW);
const DAY_FILTER       = DAY_MAP[DAY_FILTER_RAW] || null;

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROMIUM_PATH,    // ← ここで環境変数またはデフォルトパスを渡す
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

  const availableDates = await page.$$eval('img', imgs =>
    imgs
      .filter(img => img.src.includes('icon_circle.png'))
      .map(img => {
        const a = img.closest('a');
        return { href: a.href, label: a.textContent.trim() };
      })
  );

  const matched = [];
  for (const { href, label } of availableDates) {
    const byDate = DATE_FILTER_LIST.some(d => label.includes(d));
    const byDay  = DAY_FILTER && label.includes(DAY_FILTER_RAW);
    if ((DATE_FILTER_LIST.length && byDate) || (!DATE_FILTER_LIST.length && byDay)) {
      await page.goto(href, { waitUntil: 'networkidle2', timeout: 60000 });
      const ok = await page.evaluate(fn =>
        Array.from(document.querySelectorAll('a')).some(a => a.textContent.includes(fn)),
        TARGET_FACILITY_NAME
      );
      if (ok) matched.push(label);
      await page.goBack({ waitUntil: 'networkidle2', timeout: 60000 });
    }
  }

  for (const hit of matched) {
    const msg = `✅ ${DAY_FILTER_RAW}：空きあり「${TARGET_FACILITY_NAME}」\n${hit}\n\n${TARGET_URL}`;
    await axios.post(GAS_WEBHOOK_URL, { message: msg });
  }

  await browser.close();
})();
