const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { launchBrowser } = require('./modules/launch');
const { waitCalendar, nextMonth, prevMonth } = require('./modules/navigate');
const { visitMonth } = require('./modules/visitMonth');
const { sendNotification, sendNoVacancyNotice, sendErrorNotification } = require('./modules/notifier');
const { updateCookiesIfValid } = require('./modules/cookieUpdater');
const { downloadAudioFromPage } = require('./modules/audioDownloader');
const { transcribeAudio } = require('./modules/whisper');
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
    await pageA.setUserAgent(sharedContext.userAgent);
    await pageA.setExtraHTTPHeaders(sharedContext.headers);
    await pageA.setCookie(...sharedContext.cookies);

    console.log('[run] TOPページアクセス');
    await pageA.goto(sharedContext.url, { waitUntil: 'networkidle2', timeout: 0 });

    console.log('[run] カレンダーリンククリック＆iframe待機');
    await Promise.all([
      pageA.click('a[href*="/calendar_apply"]'),
      pageA.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 60000 })
    ]);

    const iframeHandle = await pageA.$('iframe[src*="/recaptcha/api2/anchor"]');
    const anchorFrame = await iframeHandle?.contentFrame();

    const checkbox = await anchorFrame?.$('.recaptcha-checkbox-border').catch(() => null);

    if (checkbox) {
      console.log('[run] チェックボックス型 reCAPTCHA 検出 → クリック');
      await checkbox.click();
      await anchorFrame.waitForFunction(
        el => el.getAttribute('aria-checked') === 'true' || el.classList.contains('recaptcha-checkbox-checked'),
        { timeout: 15000 },
        await anchorFrame.$('.recaptcha-checkbox-border')
      );
    } else {
      console.log('[run] reCAPTCHA anchor クリックでbframe強制出現 → 音声モードへ切替');

      const anchor = await anchorFrame.$('#recaptcha-anchor');
      if (anchor) {
        await anchor.click();
        await pageA.waitForTimeout(1000);
      }

      let verifyFrame;
      for (let i = 0; i < 30; i++) {
        verifyFrame = pageA.frames().find(f => f.url().includes('bframe'));
        if (verifyFrame) break;
        await pageA.waitForTimeout(500);
      }
      if (!verifyFrame) throw new Error('bframeが見つかりません');

      const findAudioButton = async (frame) => {
        for (let i = 0; i < 10; i++) {
          const btn = await frame.$('#recaptcha-audio-button');
          if (btn) return btn;
          await frame.waitForTimeout(1000);
        }
        throw new Error('#recaptcha-audio-button が出現しませんでした');
      };

      const audioBtn = await findAudioButton(verifyFrame);
      await pageA.waitForTimeout(1000);
      await audioBtn.click();

      const audioPath = await downloadAudioFromPage(verifyFrame);
      const transcript = await transcribeAudio(audioPath);

      await verifyFrame.waitForSelector('#audio-response', { timeout: 10000 });
      await verifyFrame.type('#audio-response', transcript);
      await verifyFrame.waitForSelector('#recaptcha-verify-button', { timeout: 10000 });
      await verifyFrame.click('#recaptcha-verify-button');

      await anchorFrame.waitForFunction(
        el => el.getAttribute('aria-checked') === 'true' || el.classList.contains('recaptcha-checkbox-checked'),
        { timeout: 15000 },
        await anchorFrame.$('.recaptcha-checkbox-border')
      );
      console.log('[run] 音声チャレンジ突破確認完了');
    }

    console.log('[run] 「次へ」押下');
    await Promise.all([
      pageA.waitForResponse(r => r.url().includes('/calendar_apply/calendar_select') && r.status() === 200),
      pageA.click('input.button-select.button-primary[value="次へ"]')
    ]);
    await waitCalendar(pageA);

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

    await browserA.close();
    browserA = null;

    console.log('[run] Bブラウザ起動（Cookie更新）');
    browserB = await launchBrowser();
    const pageB = await browserB.newPage();
    await pageB.setUserAgent(sharedContext.userAgent);
    await pageB.setExtraHTTPHeaders(sharedContext.headers);
    await pageB.setCookie(...sharedContext.cookies);
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
