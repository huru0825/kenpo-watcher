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
    await pageA.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0 Safari/537.36'
    );
    await pageA.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });
    await pageA.setCookie(...fixedCookies);

    console.log('[run] 施設TOPページへアクセス');
    await pageA.goto(INDEX_URL, { waitUntil: 'networkidle2', timeout: 0 });

    console.log('[run] カレンダーリンククリック＆reCAPTCHA iframe待機');
    // カレンダーリンクを押して、iframe 要素が現れるのを待つ
    await Promise.all([
      pageA.click('a[href*="/calendar_apply"]'),
      pageA.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 60000 })
    ]);

    // iframe 要素を取得→そのコンテンツフレームを取得
    console.log('[run] reCAPTCHA iframe 要素取得');
    const iframeHandle = await pageA.$('iframe[src*="/recaptcha/api2/anchor"]');
    if (!iframeHandle) {
      throw new Error('reCAPTCHA iframe 要素が取得できませんでした');
    }
    console.log('[run] reCAPTCHA iframe 要素取得成功 → contentFrame() 実行');
    const anchorFrame = await iframeHandle.contentFrame();
    if (!anchorFrame) {
      throw new Error('reCAPTCHA iframe の contentFrame() が取得できませんでした');
    }
    console.log('[run] reCAPTCHA iframe コンテキスト取得成功');

    // 1) チェックボックス型 reCAPTCHA をクリック
    console.log('[run] チェックボックス型 reCAPTCHA 判定');
    const checkbox = await anchorFrame
      .waitForSelector('.recaptcha-checkbox-border', { timeout: 10000 })
      .catch(() => null);

    if (checkbox) {
      console.log('[run] チェックボックス型検出 → クリック');
      await checkbox.click();
      // チェック完了を待機（aria-checked 属性変化 or チェック済みクラス）
      await anchorFrame.waitForFunction(
        el => el.getAttribute('aria-checked') === 'true' || el.classList.contains('recaptcha-checkbox-checked'),
        { timeout: 15000 },
        await anchorFrame.$('.recaptcha-checkbox-border')
      );
      console.log('[run] reCAPTCHA チェック完了確認');
    } else {
      console.error('[run] 画像認証型 reCAPTCHA 検出 → 非対応');
      throw new Error('画像認証型 reCAPTCHA は未対応です');
    }

    // 2) 「次へ」押下 → レスポンス待ち → カレンダー描画待機
    console.log('[run] 次へ押下 → カレンダー画面へ遷移リクエスト');
    await Promise.all([
      pageA.waitForResponse(r =>
        r.url().includes('/calendar_apply/calendar_select') && r.status() === 200
      ),
      pageA.click('input.button-select.button-primary[value="次へ"]')
    ]);
    console.log('[run] カレンダー画面遷移完了 → カレンダー表示待機開始');
    await waitCalendar(pageA);

    // 月巡回シーケンス
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
      console.log(`[run] visitMonth(includeDate=${includeDate}) 実行`);
      const hits = await visitMonth(pageA, includeDate);
      if (hits.length) {
        console.log(`[run] 空き検出: ${hits.join(', ')}`);
        for (const label of hits) {
          if (!notified.has(label)) {
            notified.add(label);
            console.log(`[run] 通知: ${label}`);
            await sendNotification(label);
          }
        }
      } else {
        console.log('[run] 空きなし');
      }
    }
    if (!notified.size) {
      console.log('[run] 空きなし通知送信');
      await sendNoVacancyNotice();
    }

    await browserA.close();
    browserA = null;

    // B: Cookie 更新
    console.log('[run] Puppeteer起動 (Cookie更新用ブラウザ)');
    browserB = await launchBrowser();
    const pageB = await browserB.newPage();
    await pageB.setUserAgent(await pageA.userAgent());
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
