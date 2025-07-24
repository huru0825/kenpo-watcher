// index.js
const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { launchBrowser } = require('./modules/launch');
const { waitCalendar, nextMonth, prevMonth } = require('./modules/navigate');
const { visitMonth } = require('./modules/visitMonth');
const { sendNotification, sendNoVacancyNotice, sendErrorNotification } = require('./modules/notifier');
const { updateCookiesIfValid, saveCookies } = require('./modules/cookieUpdater');
// ✏️ CHANGED: recaptchaSolver を読み込み
const { solveRecaptcha } = require('./modules/audioDownloader');
const { INDEX_URL, TARGET_FACILITY_NAME } = require('./modules/constants');

puppeteer.use(StealthPlugin());

let sharedContext = {};
function setSharedContext(context) {
  sharedContext = context;
}

let isRunning = false;

async function run() {
  if (isRunning) return;
  isRunning = true;

  let browserA, browserB;
  try {
    console.log('[run] 実行開始');

    // — Aブラウザ起動・初期設定 —
    browserA = await launchBrowser();
    const pageA = await browserA.newPage();
    await pageA.setUserAgent(sharedContext.userAgent);
    await pageA.setExtraHTTPHeaders(sharedContext.headers);

    // Cookie注入（シートにあれば）
    if (sharedContext.cookies?.length) {
      console.log('[run] スプレッドシートから Cookie 注入');
      await pageA.setCookie(...sharedContext.cookies);
    } else {
      console.log('[run] シートにCookieなし → Cookie注入スキップ');
    }

    // — TOPページアクセス & カレンダー申込ページへの遷移 —
    console.log('[run] TOPページアクセス');
    await pageA.goto(sharedContext.url, { waitUntil: 'networkidle2', timeout: 0 });
    console.log('[run] カレンダーリンククリック');
    await Promise.all([
      pageA.click('a[href*="/calendar_apply"]'),
      pageA.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 60000 })
    ]);

    // — reCAPTCHA 突破開始 —
    console.log('[run] reCAPTCHA 突破開始');
    const bypassed = await solveRecaptcha(pageA);
    if (!bypassed) {
      throw new Error('reCAPTCHA 突破に失敗したため処理を中断します');
    }
    console.log('[run] ✅ reCAPTCHA bypass succeeded');
    // 突破後、チェックボックスにチェックが入るまで待機
    await pageA.waitForFunction(
      () => {
        const frame = document.querySelector('iframe[src*="/recaptcha/api2/anchor"]');
        if (!frame) return false;
        const doc = frame.contentWindow.document;
        return !!doc.querySelector('#recaptcha-anchor[aria-checked="true"], .recaptcha-checkbox-checked');
      },
      { timeout: 10000 }
    );
    console.log('[run] reCAPTCHA チェック確認済み');

    // — 「次へ」ボタン押下＆カレンダー待機 —
    console.log('[run] 「次へ」ボタン押下＆カレンダー待機');
    await Promise.all([
      pageA.waitForResponse(r =>
        r.url().includes('/calendar_apply/calendar_select') && r.status() === 200
      ),
      pageA.click('input.button-select.button-primary[value="次へ"]')
    ]);
    await waitCalendar(pageA);

    // — 月巡回シーケンス & 通知 —
    const sequence = [
      { action: null,      includeDate: true },
      { action: nextMonth, includeDate: false },
      { action: nextMonth, includeDate: false },
      { action: prevMonth, includeDate: false },
      { action: prevMonth, includeDate: true }
    ];
    const notified = new Set();
    for (const { action, includeDate } of sequence) {
      if (action) {
        console.log(`[run] 月移動: ${action.name}`);
        await action(pageA);
      }
      const hits = await visitMonth(pageA, includeDate);
      for (const label of hits) {
        if (!notified.has(label)) {
          notified.add(label);
          await sendNotification(label);
        }
      }
    }
    if (!notified.size) {
      await sendNoVacancyNotice();
    }

    // ✏️ CHANGED: シートが空なら最新Cookieを保存
    if (!sharedContext.cookies?.length) {
      console.log('[run] シート空 → 現行Cookieを保存');
      const current = await pageA.cookies();
      await saveCookies(current);
    }

    await browserA.close();
    browserA = null;

    // — BブラウザでCookie更新 —
    console.log('[run] Bブラウザ起動（Cookie更新）');
    browserB = await launchBrowser();
    const pageB = await browserB.newPage();
    await pageB.setUserAgent(sharedContext.userAgent);
    await pageB.setExtraHTTPHeaders(sharedContext.headers);

    if (sharedContext.cookies?.length) {
      console.log('[run] Bブラウザに Cookie 注入');
      await pageB.setCookie(...sharedContext.cookies);
    } else {
      console.log('[run] Bブラウザ Cookie 注入スキップ');
    }

    await pageB.goto(sharedContext.url, { waitUntil: 'networkidle2', timeout: 0 });
    await updateCookiesIfValid(pageB);

    console.log('[run] 全処理完了');

  } catch (err) {
    console.error('⚠️ 例外発生:', err);
    await sendErrorNotification(err);
  } finally {
    if (browserA) await browserA.close();
    if (browserB) await browserB.close();
    isRunning = false;
  }
}

// Warmup（cold start 回避）
async function warmup() {
  const browser = await launchBrowser();
  await browser.close();
}

module.exports = { run, setSharedContext, warmup };
