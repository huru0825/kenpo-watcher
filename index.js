const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios      = require('axios');

puppeteer.use(StealthPlugin());

// === インデックスページの直打ち URL ===
const INDEX_URL            = 'https://as.its-kenpo.or.jp/service_category/index';
const GAS_WEBHOOK_URL      = process.env.GAS_WEBHOOK_URL;
const TARGET_FACILITY_NAME = process.env.TARGET_FACILITY_NAME || '';
const DAY_FILTER_RAW       = process.env.DAY_FILTER || '土曜日';
const DATE_FILTER_RAW      = process.env.DATE_FILTER || '';
const CHROME_PATH          = process.env.PUPPETEER_EXECUTABLE_PATH;

// === env バリデーション ===
if (!GAS_WEBHOOK_URL) throw new Error('GAS_WEBHOOK_URL が設定されていません');
if (!CHROME_PATH)     throw new Error('PUPPETEER_EXECUTABLE_PATH が設定されていません');

// === 日付正規化関数 ===
function normalizeDates(raw) {
  return raw.replace(/、/g, ',').split(',')
    .map(d => d.trim()).filter(Boolean)
    .map(date => {
      const m = date.match(/^(\d{1,2})月(\d{1,2})日$/);
      return m
        ? m[1].padStart(2,'0') + '月' + m[2].padStart(2,'0') + '日'
        : null;
    })
    .filter(Boolean);
}

// === 日本語→英語曜マップ ===
const DAY_MAP = {
  '日曜日':'Sunday','月曜日':'Monday','火曜日':'Tuesday',
  '水曜日':'Wednesday','木曜日':'Thursday',
  '金曜日':'Friday','土曜日':'Saturday'
};

const DATE_FILTER_LIST = normalizeDates(DATE_FILTER_RAW);
const DAY_FILTER       = DAY_MAP[DAY_FILTER_RAW] || null;
const TARGET_DAY_RAW   = DAY_FILTER_RAW;

// ===== 月訪問ロジック =====
async function visitMonth(page, includeDateFilter) {
  // reCAPTCHA 検知（challenge が来たら中断）
  const anchor    = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout:1000 }).catch(()=>null);
  const challenge = await page.waitForSelector('iframe[src*="/recaptcha/api2/bframe"], .rc-imageselect', { timeout:1000 }).catch(()=>null);
  if (challenge && !anchor) return [];

  // ○アイコンのある日リンクを取得
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
      await page.goto(href, { waitUntil:'networkidle2', timeout:60000 });
      // 詳細ページでの reCAPTCHA 検知
      const ia = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout:1000 }).catch(()=>null);
      const ii = await page.waitForSelector('iframe[src*="/recaptcha/api2/bframe"], .rc-imageselect', { timeout:1000 }).catch(()=>null);
      if (ii && !ia) { await page.goBack({ waitUntil:'networkidle2' }); continue; }

      // 施設名チェック
      const found = await page.evaluate(name =>
        Array.from(document.querySelectorAll('a')).some(a => a.textContent.includes(name)),
        TARGET_FACILITY_NAME
      );
      if (found) hits.push(label);
      await page.goBack({ waitUntil:'networkidle2' });
    }
  }
  return hits;
}

// ===== navigation helpers =====
async function clickNext(page) {
  await page.click('input[id=nextMonth]');
  await page.waitForResponse(r => r.url().includes('/calendar_apply/calendar_select'));
}
async function clickPrev(page) {
  await page.click('input[id=prevMonth]');
  await page.waitForResponse(r => r.url().includes('/calendar_apply/calendar_select'));
}

// ===== main =====
module.exports.run = async function() {
  let browser;
  try {
    // 1) ステルス＆偽装起動
    browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROME_PATH,
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-blink-features=AutomationControlled'],
      env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD:'true' }
    });
    const page = await browser.newPage();
    // ヘッダー偽装
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/115.0.0.0 Safari/537.36'
    );

    // 2) インデックス→カレンダー入口
    await page.goto(INDEX_URL, { waitUntil:'networkidle2' });
    await page.click('a[href*="/calendar_apply"]');
    await page.waitForNavigation({ waitUntil:'networkidle2', timeout:60000 });

    // 3) reCAPTCHA チェック
    const frames = page.frames();
    const anchorFrame = frames.find(f=>f.url().includes('/recaptcha/api2/anchor'));
    if (anchorFrame) {
      await anchorFrame.click('.recaptcha-checkbox-border');
      await page.waitForTimeout(2000);
    }

    // 4) 「次へ」フォーム送信
    await page.click('input.button-select.button-primary[value="次へ"]');
    await page.waitForNavigation({ waitUntil:'networkidle2', timeout:60000 });

    // 5) 巡回シーケンス（7月→8月→9月→8月→7月）
    const sequence = [
      { action:null,      includeDate:true  },
      { action:clickNext, includeDate:false },
      { action:clickNext, includeDate:false },
      { action:clickPrev, includeDate:false },
      { action:clickPrev, includeDate:true  }
    ];

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
            `詳細はこちら▶︎ ${INDEX_URL}`;
          await axios.post(GAS_WEBHOOK_URL, { message: msg });
        }
      }
    }

    // 6) ヒットなしテスト通知
    if (notified.size === 0) {
      await axios.post(GAS_WEBHOOK_URL, {
        message: `ℹ️ ${TARGET_FACILITY_NAME} の空きはありませんでした。\n監視URL▶︎ ${INDEX_URL}`
      });
    }

  } catch (err) {
    const text = err.stack||err.message||String(err);
    await axios.post(GAS_WEBHOOK_URL, { message: '⚠️ エラーが発生しました：\n'+text });
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
};
