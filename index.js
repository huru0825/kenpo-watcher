/***********************************************************************************
 * ターゲットURLはカレンダーに遷移するTOPページを指定のためハードコード。
 * 対象ページのリンクを変えたい場合は INDEX_URL を変更してください。
 ***********************************************************************************/

const puppeteer      = require('puppeteer-extra');
const StealthPlugin  = require('puppeteer-extra-plugin-stealth');
const axios          = require('axios');

puppeteer.use(StealthPlugin());

const INDEX_URL            = 'https://as.its-kenpo.or.jp/service_category/index';
const GAS_WEBHOOK_URL      = process.env.GAS_WEBHOOK_URL;
const TARGET_FACILITY_NAME = process.env.TARGET_FACILITY_NAME || '';
const DAY_FILTER_RAW       = process.env.DAY_FILTER || '土曜日';
const DATE_FILTER_RAW      = process.env.DATE_FILTER || '';
const CHROME_PATH          = process.env.PUPPETEER_EXECUTABLE_PATH;

// --- 実行中フラグ ---
let isRunning = false;

// === env バリデーション ===
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
        ? m[1].padStart(2,'0') + '月' + m[2].padStart(2,'0') + '日'
        : null;
    })
    .filter(Boolean);
}

// === 日本語→英語曜日マップ ===
const DAY_MAP = {
  '日曜日': 'Sunday',   '月曜日': 'Monday',
  '火曜日': 'Tuesday',  '水曜日': 'Wednesday',
  '木曜日': 'Thursday', '金曜日': 'Friday',
  '土曜日': 'Saturday'
};

const DATE_FILTER_LIST = normalizeDates(DATE_FILTER_RAW);
const DAY_FILTER       = DAY_MAP[DAY_FILTER_RAW] || null;
const TARGET_DAY_RAW   = DAY_FILTER_RAW;

// ===== cold-start 対策用 warmup =====
module.exports.warmup = async function() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-blink-features=AutomationControlled'],
    env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD:'true' }
  });
  await browser.close();
};

// ===== 月訪問ロジック =====
async function visitMonth(page, includeDateFilter) {
  // reCAPTCHA 検知
  const anchor    = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout:1000 }).catch(() => null);
  const challenge = await page.waitForSelector('iframe[src*="/recaptcha/api2/bframe"], .rc-imageselect', { timeout:1000 }).catch(() => null);
  if (challenge && !anchor) return [];

  // ○アイコンのある日リンクを取得
  const available = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a'))
      .filter(a => a.querySelector('img[src*="icon_circle.png"]'))
      .map(a => ({ href: a.href, label: a.textContent.trim() }))
  );

  const hits = [];
  for (const { href, label } of available) {
    const byDate = includeDateFilter && DATE_FILTER_LIST.some(d => label.includes(d));
    const byDay  = !DATE_FILTER_LIST.length && DAY_FILTER && label.includes(TARGET_DAY_RAW);
    if (byDate || byDay) {
      console.log(`→ [visitMonth] Navigating to detail for ${label}`);
      // カレンダー詳細ページに遷移（無制限タイムアウト）
      await page.goto(href, { waitUntil:'networkidle2', timeout: 0 });

      console.log('→ [visitMonth] Waiting for calendar cells...');
      // カレンダーセル描画待機（無制限タイムアウト）
      await page.waitForFunction(
        () => document.querySelectorAll('.tb-calendar tbody td').length > 0,
        { timeout: 0 }
      );
      console.log('→ [visitMonth] Calendar cells detected');

      // 詳細ページでの reCAPTCHA 検知
      const ia = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout:1000 }).catch(() => null);
      const ii = await page.waitForSelector('iframe[src*="/recaptcha/api2/bframe"], .rc-imageselect', { timeout:1000 }).catch(() => null);
      if (ii && !ia) {
        console.warn('⚠️ [visitMonth] reCAPTCHA challenge detected, skipping');
        await page.goBack({ waitUntil:'networkidle2' }).catch(() => {});
        continue;
      }

      // 施設名チェック
      const found = await page.evaluate(name =>
        Array.from(document.querySelectorAll('a')).some(a => a.textContent.includes(name)),
        TARGET_FACILITY_NAME
      );
      if (found) {
        console.log(`→ [visitMonth] Hit found on ${label}`);
        hits.push(label);
      }

      await page.goBack({ waitUntil:'networkidle2' }).catch(() => {});
    }
  }
  return hits;
}

// ===== navigation helpers =====
// インデックス→カレンダー（reCAPTCHA 画面）の submit ボタン
async function submitNext(page) {
  console.log('→ [submitNext] Clicking "次へ"');
  await Promise.all([
    page.click('input.button-select.button-primary[value="次へ"]'),
    // networkidle2 まで無制限タイムアウトに変更
    page.waitForNavigation({ waitUntil:'networkidle2', timeout: 0 })
  ]);
  console.log('→ [submitNext] Calendar screen loaded');
}

// カレンダー表示後の月移動ボタン
async function nextMonth(page) {
  console.log('→ [nextMonth] Clicking "翌月"');
  await Promise.all([
    page.click('input.button-select.button-primary[value="次へ"]'),
    page.waitForNavigation({ waitUntil:'networkidle2', timeout: 120_000 })
  ]);
  console.log('→ [nextMonth] Moved to next month');
}
async function prevMonth(page) {
  console.log('→ [prevMonth] Clicking "前へ"');
  await Promise.all([
    page.click('input.button-select.button-primary[value="前へ"]'),
    page.waitForNavigation({ waitUntil:'networkidle2', timeout: 120_000 })
  ]);
  console.log('→ [prevMonth] Moved to previous month');
}

// ===== main =====
module.exports.run = async function() {
  if (isRunning) {
    console.log('▶️ Already running, skip');
    return;
  }
  isRunning = true;

  let browser;
  try {
    console.log('🔄 Launching browser...', CHROME_PATH);
    browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROME_PATH,
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-blink-features=AutomationControlled'],
      env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD:'true' }
    });
    console.log('✅ Browser launched');

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/115.0.0.0 Safari/537.36'
    );

    // 1) INDEX → カレンダー入口
    console.log('→ [main] Navigating to INDEX page');
    await page.goto(INDEX_URL, { waitUntil:'networkidle2', timeout: 0 });
    console.log('→ [main] Clicking into calendar entry');
    await Promise.all([
      page.click('a[href*="/calendar_apply"]'),
      // カレンダー入口表示待機（無制限タイムアウト）
      page.waitForSelector('#calendarContent', { timeout: 0 }).catch(() => console.warn('⚠️ [main] #calendarContent not found'))
    ]);
    console.log('→ [main] Calendar entry loaded');

    // 2) reCAPTCHA
    const frames = page.frames();
    const anchorFrame = frames.find(f => f.url().includes('/recaptcha/api2/anchor'));
    if (anchorFrame) {
      console.log('→ [main] Solving reCAPTCHA...');
      await anchorFrame.click('.recaptcha-checkbox-border');
      await page.waitForTimeout(2000);
    }
    console.log('🟢 reCAPTCHA passed or not present');

    // 3) インデックス→カレンダー画面への submit
    console.log('→ [main] Submitting "次へ"');
    await submitNext(page);

    // 4) 月巡回シーケンス
    const sequence = [
      { action: null,       includeDate: true  },
      { action: nextMonth,  includeDate: false },
      { action: nextMonth,  includeDate: false },
      { action: prevMonth,  includeDate: false },
      { action: prevMonth,  includeDate: true  }
    ];
    const notified = new Set();

    for (const step of sequence) {
      if (step.action) await step.action(page);
      const hits = await visitMonth(page, step.includeDate);
      for (const label of hits) {
        if (!notified.has(label)) {
          notified.add(label);
          console.log('→ [main] Notify:', label);
          await axios.post(GAS_WEBHOOK_URL, {
            message: `【${TARGET_FACILITY_NAME}】予約状況更新\n日付：${label}\n詳細▶︎${INDEX_URL}`
          });
        }
      }
    }

    // 5) ヒットなし通知
    if (notified.size === 0) {
      console.log('→ [main] No hits, sending empty notification');
      await axios.post(GAS_WEBHOOK_URL, {
        message: `ℹ️ ${TARGET_FACILITY_NAME} の空きはありませんでした。\n監視URL▶︎${INDEX_URL}`
      });
    }

  } catch (err) {
    console.error('⚠️ Exception caught:', err);
    await axios.post(GAS_WEBHOOK_URL, {
      message: '⚠️ エラーが発生しました：\n' + (err.stack || err.message)
    });
  } finally {
    if (browser) {
      console.log('→ Closing browser');
      await browser.close();
    }
    isRunning = false;
  }
};
