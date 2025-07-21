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

    // — A: 監視処理
    console.log('[run] Puppeteer起動 (監視用ブラウザ)');
    browserA = await launchBrowser();
    const pageA = await browserA.newPage();
    await pageA.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0 Safari/537.36');
    await pageA.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });
    await pageA.setCookie(...fixedCookies);

    console.log('[run] 施設TOPページへアクセス');
    await pageA.goto(INDEX_URL, { waitUntil: 'networkidle2', timeout: 0 });

    console.log('[run] カレンダーリンククリック＆reCAPTCHA iframe待機');
    await Promise.all([
      pageA.click('a[href*="/calendar_apply"]'),
      pageA.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 60000 })
    ]);

    console.log('[run] reCAPTCHA iframe 検出');
    const anchorFrame = pageA.frames().find(f => f.url().includes('/recaptcha/api2/anchor'));

    // —— reCAPTCHA 解決フェーズ —— 
    if (!anchorFrame) {
      throw new Error('reCAPTCHA iframe が見つかりませんでした');
    }

    // 1) チェックボックス型か試す
    console.log('[run] チェックボックス型 reCAPTCHA かどうか判定');
    const checkbox = await anchorFrame
      .waitForSelector('.recaptcha-checkbox-border', { timeout: 10000 })
      .catch(() => null);

    if (checkbox) {
      // チェックボックス型: クリックして完了を待つ
      console.log('[run] チェックボックス型 reCAPTCHA 検出 → クリック');
      await checkbox.click();
      await anchorFrame.waitForSelector('.recaptcha-checkbox-checked', { timeout: 15000 });
      console.log('[run] reCAPTCHA チェック完了確認');
    } else {
      // 画像認証型: 今回はサポート外とみなしてエラー通知
      console.error('[run] 画像認証型 reCAPTCHA 検出 → 手動対応が必要です');
      throw new Error('画像認証型 reCAPTCHA は未対応');
    }

    // 2) 「次へ」押下 → レスポンス待ち → カレンダー待機
    console.log('[run] 次へ押下 → カレンダー画面へ遷移リクエスト');
    await Promise.all([
      pageA.waitForResponse(r =>
        r.url().includes('/calendar_apply/calendar_select') && r.status() === 200
      ),
      pageA.click('input.button-select.button-primary[value="次へ"]')
    ]);
    console.log('[run] カレンダー画面遷移完了 → カレンダー描画待機開始');
    await waitCalendar(pageA);

    // — 月巡回シーケンス —
    const sequence = [
      { action: null,       includeDate: true },
      { action: nextMonth,  includeDate: false },
      { action: nextMonth,  includeDate: false },
      { action: prevMonth,  includeDate: false },
      { action: prevMonth,  includeDate: true }
    ];
    const notified = new Set();

    for (const { action, includeDate } of sequence) {
      if (action) {
        console.log(`[run] ${action.name} 実行`);
        await action(pageA);
      }
      console.log(`[run] visitMonth(includeDate=${includeDate})`);
      const hits = await visitMonth(pageA, includeDate);
      console.log(hits.length ? `[run] 空き検出: ${hits.join(', ')}` : '[run] 空きなし');
      for (const label of hits) {
        if (!notified.has(label)) {
          notified.add(label);
          console.log(`[run] 通知: ${label}`);
          await sendNotification(label);
        }
      }
    }
    if (!notified.size) {
      console.log('[run] 空きなし通知送信');
      await sendNoVacancyNotice();
    }

    await browserA.close();
    browserA = null;

    // — B: Cookie更新用ブラウザ起動 —
    console.log('[run] Puppeteer起動 (Cookie更新用ブラウザ)');
    browserB = await launchBrowser();
    const pageB = await browserB.newPage();
    await pageB.setUserAgent(pageA._userAgent);
    await pageB.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });
    await pageB.setCookie(...fixedCookies);
    console.log('[run] Cookie更新ページ遷移');
    await pageB.goto(INDEX_URL, { waitUntil: 'networkidle2', timeout: 0 });
    console.log('[run] Cookie更新処理');
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
