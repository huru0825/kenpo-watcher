// index.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, 'kenpo-watcher.env') }); // 明示パス指定
const fs = require('fs');

function copyToDocuments(srcPath) {
  const documentsDir = '/mnt/Documents/screenshots';
  try {
    fs.mkdirSync(documentsDir, { recursive: true });
    const fileName = path.basename(srcPath);
    const destPath = path.join(documentsDir, fileName);
    fs.copyFileSync(srcPath, destPath);
    console.log(`[copy] 📁 ${srcPath} → ${destPath}`);
  } catch (err) {
    console.warn('[copy] ❌ 転送失敗:', err.message);
  }
}

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { launchBrowser } = require('./modules/launch');
const { waitCalendar, nextMonth, prevMonth } = require('./modules/navigate');
const { visitMonth } = require('./modules/visitMonth');
const { sendNotification, sendNoVacancyNotice, sendErrorNotification } = require('./modules/notifier');
const { updateCookiesIfValid, saveCookies } = require('./modules/cookieUpdater');
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

    browserA = await launchBrowser();
    const pageA = await browserA.newPage();
    await pageA.setViewport({ width: 1280, height: 800 });

    await pageA.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        Object.defineProperty(WebGLRenderingContext.prototype, 'getParameter', {
          value: (parameter) => {
            if (parameter === gl.ALIASED_LINE_WIDTH_RANGE) {
              return [1, 1];
            }
            return WebGLRenderingContext.prototype.getParameter.call(this, parameter);
          }
        });
      }
    });

    await pageA.setUserAgent(sharedContext.userAgent);
    await pageA.setExtraHTTPHeaders(sharedContext.headers);

    if (sharedContext.cookies?.length) {
      console.log('[run] スプレッドシートから Cookie 注入');
      await pageA.setCookie(...sharedContext.cookies);
    }

    console.log('[run] TOPページアクセス');
    await pageA.goto(sharedContext.url, { waitUntil: 'networkidle2', timeout: 0 });

    console.log('[run] カレンダーリンククリック');
    await Promise.all([
      pageA.click('a[href*="/calendar_apply"]'),
      pageA.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 60000 })
    ]);

    console.log('[run] reCAPTCHA 突破開始');
    const success = await solveRecaptcha(pageA);
    if (!success) {
      console.error('[run] ❌ solveRecaptcha failed');
      const tmp = process.env.LOCAL_SCREENSHOT_DIR || '/tmp/screenshots';
      fs.mkdirSync(tmp, { recursive: true });
      const screenshotPath = path.join(tmp, 'recaptcha-fail.png');
      await pageA.screenshot({ path: screenshotPath, fullPage: true });
      copyToDocuments(screenshotPath);
      console.log(`[run] ⚠️ スクリーンショット保存: ${screenshotPath}`);
      throw new Error('reCAPTCHA 突破に失敗したため処理を中断します');
    }
    console.log('[run] ✅ reCAPTCHA bypass succeeded');

    await pageA.waitForFunction(() => {
      const iframe = document.querySelector('iframe[src*="/recaptcha/api2/anchor"]');
      if (!iframe) return false;
      const anchor = iframe.contentDocument?.querySelector('#recaptcha-anchor');
      return anchor?.getAttribute('aria-checked') === 'true';
    }, { timeout: 10000 });

    console.log('[run] reCAPTCHA チェック確認済み');
    console.log('[run] 「次へ」ボタン押下＆カレンダー待機');

    await Promise.all([
      pageA.waitForResponse(r =>
        r.url().includes('/calendar_apply/calendar_select') && r.status() === 200
      ),
      pageA.click('input.button-select.button-primary[value="次へ"]')
    ]);
    await waitCalendar(pageA);

    const sequence = [
      { action: null, includeDate: true },
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

    if (!notified.size) await sendNoVacancyNotice();

    if (!sharedContext.cookies?.length) {
      const current = await pageA.cookies();
      await saveCookies(current);
    }

    await browserA.close();
    browserA = null;

    browserB = await launchBrowser();
    const pageB = await browserB.newPage();

    await pageB.setViewport({ width: 1280, height: 800 });
    await pageB.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        Object.defineProperty(WebGLRenderingContext.prototype, 'getParameter', {
          value: (parameter) => {
            if (parameter === gl.ALIASED_LINE_WIDTH_RANGE) {
              return [1, 1];
            }
            return WebGLRenderingContext.prototype.getParameter.call(this, parameter);
          }
        });
      }
    });

    await pageB.setUserAgent(sharedContext.userAgent);
    await pageB.setExtraHTTPHeaders(sharedContext.headers);

    if (sharedContext.cookies?.length) {
      await pageB.setCookie(...sharedContext.cookies);
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

async function warmup() {
  const browser = await launchBrowser();
  await browser.close();
}

module.exports = { run, setSharedContext, warmup };
