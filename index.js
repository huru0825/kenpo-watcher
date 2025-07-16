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
        ? m[1].padStart(2, '0') + '月' + m[2].padStart(2, '0') + '日'
        : null;
    })
    .filter(Boolean);
}

// === 日本語→英語曜マップ ===
const DAY_MAP = {
  '日曜日': 'Sunday','月曜日': 'Monday','火曜日': 'Tuesday',
  '水曜日': 'Wednesday','木曜日': 'Thursday',
  '金曜日': 'Friday','土曜日': 'Saturday'
};
const DATE_FILTER_LIST = normalizeDates(DATE_FILTER_RAW);
const DAY_FILTER       = DAY_MAP[DAY_FILTER_RAW] || null;
const TARGET_DAY_RAW   = DAY_FILTER_RAW;

// ===== 月訪問ロジック =====
async function visitMonth(page, includeDateFilter) {
  // reCAPTCHA 検知
  const anchor    = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 1000 }).catch(() => null);
  const challenge = await page.waitForSelector('iframe[src*="/recaptcha/api2/bframe"], .rc-imageselect', { timeout: 1000 }).catch(() => null);
  if (challenge && !anchor) return []; // 画像認証チャレンジが来たら中断

  // ○アイコンのある日リンクを全部拾う
  const available = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .filter(a => a.querySelector('img[src*="icon_circle.png"]'))
      .map(a => ({ href: a.href, label: a.textContent.trim() }));
  });

  const hits = [];
  for (const { href, label } of available) {
    const byDate = includeDateFilter && DATE_FILTER_LIST.some(d => label.includes(d));
    const byDay  = !DATE_FILTER_LIST.length && DAY_FILTER && label.includes(TARGET_DAY_RAW);
    if (byDate || byDay) {
      await page.goto(href, { waitUntil: 'networkidle2', timeout: 60000 });
      // 詳細ページの reCAPTCHA 検知
      const ia = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 1000 }).catch(() => null);
      const ii = await page.waitForSelector('iframe[src*="/recaptcha/api2/bframe"], .rc-imageselect', { timeout: 1000 }).catch(() => null);
      if (ii && !ia) {
        await page.goBack({ waitUntil: 'networkidle2', timeout: 60000 });
        continue;
      }
      // 施設名チェック
      const found = await page.evaluate(name =>
        Array.from(document.querySelectorAll('a')).some(a => a.textContent.includes(name)),
        TARGET_FACILITY_NAME
      );
      if (found) hits.push(label);
      await page.goBack({ waitUntil: 'networkidle2', timeout: 60000 });
    }
  }
  return hits;
}

// ===== navigation helpers =====
async function clickNext(page) {
  await page.click('input[id=nextMonth]');
  await page.waitForResponse(resp => resp.url().includes('/calendar_apply/calendar_select'));
}
async function clickPrev(page) {
  await page.click('input[id=prevMonth]');
  await page.waitForResponse(resp => resp.url().includes('/calendar_apply/calendar_select'));
}

// ===== メイン処理 =====
module.exports.run = async function() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_PATH,
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'],
      env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: 'true' }
    });

    const page = await browser.newPage();
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // セッション切れ対応
    if (page.url().endsWith('/service_category/index')) {
      console.warn('⚠️ セッション切れ検知 → カレンダーリンクをクリック');
      await page.click('a[href*="/calendar_apply"]');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
    }

    // 巡回シーケンス（7月→8月→9月→8月→7月）
    const sequence = [
      { action: null,      includeDate: true  }, // 当月：日付＋曜日フィルタ
      { action: clickNext, includeDate: false }, // 翌月：曜日のみ
      { action: clickNext, includeDate: false }, // +2月：曜日のみ
      { action: clickPrev, includeDate: false }, // +1月：曜日のみ
      { action: clickPrev, includeDate: true  }  // 当月に戻って日付＋曜日フィルタ
    ];

    // 重複排除しつつ集約
    const notified = new Set();
    for (const step of sequence) {
      if (step.action) await step.action(page);
      const hits = await visitMonth(page, step.includeDate);
      for (const label of hits) {
        if (!notified.has(label)) {
          notified.add(label);
          const msg =
            `【${TARGET_FACILITY_NAME}】予約状況更新\n` +
            `日付：${label}\n` +
            `詳細はこちら▶︎ ${TARGET_URL}`;
          await axios.post(GAS_WEBHOOK_URL, { message: msg });
        }
      }
    }

    // ヒットなしならテスト通知
    if (notified.size === 0) {
      await axios.post(GAS_WEBHOOK_URL, {
        message: `ℹ️ ${TARGET_FACILITY_NAME} の空きはありませんでした。\n監視URL▶︎ ${TARGET_URL}`
      });
    }

  } catch (err) {
    // 例外も一つの通知にまとめる
    const text = err.stack || err.message || String(err);
    await axios.post(GAS_WEBHOOK_URL, { message: '⚠️ エラーが発生しました：\n' + text });
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
};
