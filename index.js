// index.js

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { launchBrowser } = require('./modules/launch');
const { waitCalendar, nextMonth, prevMonth } = require('./modules/navigate');
const { visitMonth } = require('./modules/visitMonth');
const { sendNotification, sendNoVacancyNotice, sendErrorNotification } = require('./modules/notifier');
const { updateCookiesIfValid } = require('./modules/cookieUpdater');
const { INDEX_URL, fixedCookies } = require('./modules/constants');
const { warmup } = require('./modules/warmup');

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

    // A: 監視処理
    console.log('[run] Puppeteer起動 (監視用ブラウザ)');
    browserA = await launchBrowser();
    const pageA = await browserA.newPage();

    console.log('[run] ヘッダー・UA設定');
    await pageA.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0 Safari/537.36'
    );
    await pageA.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });

    console.log('[run] 固定Cookie注入');
    await pageA.setCookie(...fixedCookies);

    console.log('[run] 施設TOPページへアクセス');
    await pageA.goto(INDEX_URL, { waitUntil: 'networkidle2', timeout: 0 });

    console.log('[run] カレンダーリンククリック＆reCAPTCHA待機');
    await Promise.all([
      pageA.click('a[href*="/calendar_apply"]'),
      pageA.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 60000 })
    ]);

    console.log('[run] reCAPTCHA iframe検出・クリック');
    const anchorFrame = pageA.frames().find(f =>
      f.url().includes('/recaptcha/api2/anchor')
    );

    if (anchorFrame) {
      // 1. チェックボックスクリック
      const checkbox = await anchorFrame.waitForSelector(
        '.recaptcha-checkbox-border', { timeout: 10000 }
      ).catch(() => null);
      if (checkbox) {
        await checkbox.click();
        console.log('[run] reCAPTCHAチェックボックスクリック成功');
      } else {
        console.warn('⚠️ recaptcha-checkbox-border 未検出 → スキップ');
      }

      // 2. チェック完了の検知（checked クラス付与を待つ）
      await anchorFrame.waitForSelector(
        '.recaptcha-checkbox-checked', { timeout: 15000 }
      );
      console.log('[run] reCAPTCHAチェック完了確認');
    } else {
      console.log('[run] reCAPTCHAなし → 初回遷移へ');
    }

    // 3. 次へボタン押下（トークン有効時間内）
    console.log('[run] 次へ押下 → カレンダー画面へ遷移リクエスト');
    await Promise.all([
      pageA.waitForResponse(r =>
        r.url().includes('/calendar_apply/calendar_select') && r.status() === 200
      ),
      pageA.click('input.button-select.button-primary[value="次へ"]')
    ]);
    console.log('[run] カレンダー画面に遷移完了 → 次へレスポンス受信');

    // 4. カレンダー描画待機
    console.log('[run] カレンダー表示待機開始');
    await waitCalendar(pageA);

    // 月巡回シーケンス：まず当月(includeDate=true)をチェック
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
        console.log(`[run] ${action.name} 実行`);
        await action(pageA);
      }

      console.log(`[run] visitMonth(includeDate=${includeDate}) 実行`);
      const hits = await visitMonth(pageA, includeDate);

      if (hits.length > 0) {
        console.log(`[run] 空き検出: ${hits.join(', ')}`);
      } else {
        console.log('[run] 空きなし');
      }

      for (const label of hits) {
        if (!notified.has(label)) {
          notified.add(label);
          console.log(`[run] 通知: ${label}`);
          await sendNotification(label);
        }
      }
    }

    if (notified.size === 0) {
      console.log('[run] 空きなし通知を送信');
      await sendNoVacancyNotice();
    }

    // ブラウザAはここで閉じる
    await browserA.close();
    browserA = null;

    // B: Cookie更新（通知完了後に実行）
    console.log('[run] Puppeteer起動 (Cookie更新用ブラウザ)');
    browserB = await launchBrowser();
    const pageB = await browserB.newPage();

    console.log('[run] ヘッダー・UA設定 (B)');
    await pageB.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0 Safari/537.36'
    );
    await pageB.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });

    console.log('[run] 固定Cookie注入 (B)');
    await pageB.setCookie(...fixedCookies);

    console.log('[run] Cookie更新ページ遷移');
    await pageB.goto(INDEX_URL, { waitUntil: 'networkidle2', timeout: 0 });

    console.log('[run] Cookie更新処理へ');
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

module.exports = { run, warmup, setSharedContext };
