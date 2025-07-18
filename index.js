const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { launchBrowser } = require('./modules/launch');
const { waitCalendar, nextMonth, prevMonth } = require('./modules/navigate');
const { visitMonth } = require('./modules/visitMonth');
const { sendNotification, sendNoVacancyNotice, sendErrorNotification } = require('./modules/notifier');
const { updateCookiesIfValid } = require('./modules/cookieUpdater');
const { INDEX_URL, GAS_WEBHOOK_URL, fixedCookies } = require('./modules/constants');
const { warmup } = require('./modules/warmup');

puppeteer.use(StealthPlugin());

let isRunning = false;

async function run() {
  if (isRunning) return;
  isRunning = true;

  let browserA, browserB;

  try {
    // A: 監視処理
    browserA = await launchBrowser();
    const pageA = await browserA.newPage();
    await pageA.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0 Safari/537.36');
    await pageA.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });
    await pageA.setCookie(...fixedCookies);

    await pageA.goto(INDEX_URL, { waitUntil: 'networkidle2', timeout: 0 });
    await Promise.all([
      pageA.click('a[href*="/calendar_apply"]'),
      pageA.waitForSelector('#calendarContent', { timeout: 0 }).catch(() => {})
    ]);

    const anchorFrame = pageA.frames().find(f => f.url().includes('/recaptcha/api2/anchor'));
    if (anchorFrame) {
      await anchorFrame.click('.recaptcha-checkbox-border');
      await pageA.waitForTimeout(2000);
    }

    await nextMonth(pageA);

    const sequence = [
      { action: null,       includeDate: true },
      { action: nextMonth,  includeDate: false },
      { action: nextMonth,  includeDate: false },
      { action: prevMonth,  includeDate: false },
      { action: prevMonth,  includeDate: true }
    ];

    const notified = new Set();

    for (const { action, includeDate } of sequence) {
      if (action) await action(pageA);
      const hits = await visitMonth(pageA, includeDate);
      for (const label of hits) {
        if (!notified.has(label)) {
          notified.add(label);
          await sendNotification(label);
        }
      }
    }

    if (notified.size === 0) {
      await sendNoVacancyNotice();
    }

    // B: Cookie更新
    browserB = await launchBrowser();
    const pageB = await browserB.newPage();
    await pageB.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0 Safari/537.36');
    await pageB.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });
    await pageB.setCookie(...fixedCookies);
    await pageB.goto(INDEX_URL, { waitUntil: 'networkidle2', timeout: 0 });
    await updateCookiesIfValid(pageB);

  } catch (err) {
    console.error('⚠️ 例外発生:', err);
    await sendErrorNotification(err);
  } finally {
    if (browserA) await browserA.close();
    if (browserB) await browserB.close();
    isRunning = false;
  }
}

module.exports = { run, warmup };
