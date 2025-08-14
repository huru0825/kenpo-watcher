// index.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, 'kenpo-watcher.env') });
const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { launchBrowser } = require('./modules/launch');
const { waitCalendar, nextMonth, prevMonth } = require('./modules/navigate');
const { visitMonth } = require('./modules/visitMonth');
const { sendNotification, sendNoVacancyNotice, sendErrorNotification } = require('./modules/notifier');
const { updateCookiesIfValid, saveCookies } = require('./modules/cookieUpdater');
const { solveRecaptcha } = require('./modules/recaptchaSolver');
const { reportError } = require('./modules/kw-error');
const { INDEX_URL } = require('./modules/constants');

puppeteer.use(StealthPlugin());

let sharedContext = {};
function setSharedContext(context) {
  sharedContext = context;
}

let isRunning = false;

async function run() {
  if (isRunning) return;
  isRunning = true;
  let browserA = null, browserB = null;

  try {
    console.log('[run] 実行開始');
    browserA = await launchBrowser();
    const pageA = await browserA.newPage();
    await pageA.setViewport({ width: 1280, height: 800 });
    await pageA.setUserAgent(sharedContext.userAgent);
    await pageA.setExtraHTTPHeaders(sharedContext.headers);

    if (sharedContext.cookies?.length) {
      console.log('[run] スプレッドシートから Cookie 注入');
      await pageA.setCookie(...sharedContext.cookies);
    } else if (fs.existsSync('./Cookie.json')) {
      console.log('[run] ローカル Cookie.json から Cookie 注入');
      const raw = fs.readFileSync('./Cookie.json', 'utf8');
      const cookies = JSON.parse(raw);
      const clean = cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires || c.expirationDate || 0,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite
      }));
      await pageA.setCookie(...clean);
    }

    console.log('[run] TOPページアクセス');
    await pageA.goto(sharedContext.url, { waitUntil: 'networkidle2', timeout: 0 });

    console.log('[run] カレンダーリンククリック');
    await Promise.all([
      pageA.click('a[href*="/calendar_apply"]'),
      pageA.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 60000 })
    ]);

    console.log('[run] reCAPTCHA 突破開始');
    const ok = await solveRecaptcha(pageA);
    if (!ok) {
      reportError('E002', new Error('reCAPTCHA突破失敗'));
      const tmp = process.env.LOCAL_SCREENSHOT_DIR || '/tmp/screenshots';
      fs.mkdirSync(tmp, { recursive: true });
      const screenshotPath = path.join(tmp, 'recaptcha-fail.png');
      await pageA.screenshot({ path: screenshotPath, fullPage: true });
      throw new Error('reCAPTCHA突破失敗');
    }
    console.log('[run] ✅ reCAPTCHA bypass succeeded');

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
      fs.writeFileSync('Cookie.json', JSON.stringify(current, null, 2));
      console.log('[run] ✅ Cookie.json に保存完了');
    }

    await browserA.close();
    browserA = null;

    browserB = await launchBrowser();
    const pageB = await browserB.newPage();
    await pageB.setViewport({ width: 1280, height: 800 });
    await pageB.setUserAgent(sharedContext.userAgent);
    await pageB.setExtraHTTPHeaders(sharedContext.headers);
    if (sharedContext.cookies?.length) await pageB.setCookie(...sharedContext.cookies);
    await pageB.goto(sharedContext.url, { waitUntil: 'networkidle2', timeout: 0 });
    await updateCookiesIfValid(pageB);
    console.log('[run] 全処理完了');

  } catch (err) {
    reportError('E003', err);
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
