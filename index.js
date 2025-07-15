const puppeteer = require('puppeteer');
const axios     = require('axios');

// === 環境変数の取得（RenderのGUIで設定）===
const TARGET_URL           = process.env.TARGET_URL;
const GAS_WEBHOOK_URL      = process.env.GAS_WEBHOOK_URL;
const TARGET_FACILITY_NAME = process.env.TARGET_FACILITY_NAME || '';
const DAY_FILTER_RAW       = process.env.DAY_FILTER || '土曜日';
const DATE_FILTER_RAW      = process.env.DATE_FILTER || '';
const CHROME_PATH          = process.env.PUPPETEER_EXECUTABLE_PATH;

// === env バリデーション ===
if (!TARGET_URL)      throw new Error('TARGET_URL が設定されていません');
if (!GAS_WEBHOOK_URL) throw new Error('GAS_WEBHOOK_URL が設定されていません');
if (!CHROME_PATH)     throw new Error('PUPPETEER_EXECUTABLE_PATH が設定されていません');

// === 日付正規化関数 ===
function normalizeDates(raw) {
  return raw
    .replace(/、/g, ',')
    .split(',')
    .map(d => d.trim())
    .filter(Boolean)
    .map(date => {
      const m = date.match(/^(\d{1,2})月(\d{1,2})日$/);
      return m
        ? `${m[1].padStart(2,'0')}月${m[2].padStart(2,'0')}日`
        : null;
    })
    .filter(Boolean);
}

// === 日本語→英語曜日マップ ===
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
const DAY_FILTER       = DAY_MAP[DAY_FILTER_RAW] || null;

;(async () => {
  let browser;
  try {
    console.log('🔄 Launching browser...', CHROME_PATH);
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_PATH,
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'],
      env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: 'true' }
    });
    console.log('✅ Browser launched');

    const page = await browser.newPage();
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // --- reCAPTCHA（画像認証）検知 ---
    const hasAnchor         = await page.$('iframe[src*="/recaptcha/api2/anchor"]');
    const hasImageChallenge = await page.$('iframe[src*="/recaptcha/api2/bframe"], .rc-imageselect');
    if (hasImageChallenge && !hasAnchor) {
      console.warn('🔴 画像認証チャレンジ検知 → 即終了');
      return;
    }
    console.log('🟢 reCAPTCHA チェックボックスのみ or none → 続行');

    // ○○アイコンがあるリンクを抽出
    const availableDates = await page.$$eval(
      'img[src*="icon_circle.png"]',
      (imgs) => imgs.map(img => {
        const a = img.closest('a');
        return a && a.href
          ? { href: a.href, label: a.textContent.trim() }
          : null;
      }).filter(Boolean)
    );

    const matched = [];

    for (const { href, label } of availableDates) {
      const byDate = DATE_FILTER_LIST.some(d => label.includes(d));
      const byDay  = DAY_FILTER && label.includes(DAY_FILTER_RAW);

      if ((DATE_FILTER_LIST.length > 0 && byDate) ||
          (DATE_FILTER_LIST.length === 0 && byDay)) {

        await page.goto(href, { waitUntil: 'networkidle2', timeout: 60000 });

        // 詳細ページでの画像認証検知
        const innerAnchor = await page.$('iframe[src*="/recaptcha/api2/anchor"]');
        const innerImage  = await page.$('iframe[src*="/recaptcha/api2/bframe"], .rc-imageselect');
        if (innerImage && !innerAnchor) {
          console.warn('🔴 詳細ページで画像認証検知 → スキップ');
          await page.goBack({ waitUntil: 'networkidle2', timeout: 60000 });
          continue;
        }

        // 施設リンクの有無をチェック
        const facilityFound = await page.$$eval(
          'a',
          (links, name) => links.some(a => a.textContent.includes(name)),
          TARGET_FACILITY_NAME
        );

        if (facilityFound) {
          matched.push(label);
        }
        await page.goBack({ waitUntil: 'networkidle2', timeout: 60000 });
      }
    }

    // マッチがあれば Webhook 送信
    for (const hit of matched) {
      const message =
        `✅ ${DAY_FILTER_RAW}：空きあり「${TARGET_FACILITY_NAME}」\n` +
        `${hit}\n\n${TARGET_URL}`;
      await axios.post(GAS_WEBHOOK_URL, { message });
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
