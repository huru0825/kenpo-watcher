// debug-calendar.js

const puppeteer      = require('puppeteer-extra');
const StealthPlugin  = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

(async () => {
  const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (!CHROME_PATH) {
    console.error('PUPPETEER_EXECUTABLE_PATH が未設定です');
    process.exit(1);
  }

  const INDEX_URL = 'https://as.its-kenpo.or.jp/service_category/index';

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });
  const page = await browser.newPage();

  // 全ログをキャプチャ
  page.on('console', msg => console.log('PAGE LOG ▶', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR ▶', err));
  page.on('requestfailed', req => console.warn('REQUEST FAILED ▶', req.url(), req.failure()));
  page.on('response', async res => {
    if (res.url().includes('calendar_apply')) {
      console.log(`XHR ▶ ${res.status()} ${res.url()}`);
      try {
        console.log(
          '  response body snippet:',
          (await res.text()).slice(0, 200).replace(/\n/g, ' '),
          '…'
        );
      } catch {}
    }
  });

  console.log('🔄 INDEXページへ移動');
  await page.goto(INDEX_URL, { waitUntil: 'networkidle2', timeout: 0 });

  console.log('→ カレンダー入口クリック');
  await Promise.all([
    page.click('a[href*="/calendar_apply"]'),
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 })
      .catch(() => console.warn('⚠️ 入口ナビ待機タイムアウト'))
  ]);

  console.log('→ reCAPTCHA iframe 検出を試み');
  const anchorFrame = page
    .frames()
    .find(f => f.url().includes('/recaptcha/api2/anchor'));
  if (anchorFrame) {
    console.log('→ reCAPTCHA チェックボックスをクリック');
    await anchorFrame.click('.recaptcha-checkbox-border');
    await page.waitForTimeout(3000);
  } else {
    console.log('→ reCAPTCHA iframe が見つかりませんでした');
  }

  console.log('→ 「次へ」ボタン（submit）をクリック');
  await page.click('input.button-select.button-primary[value="次へ"]');

  console.log('→ カレンダー領域の検出待機 (#calendarContent)');
  try {
    await page.waitForSelector('#calendarContent', { timeout: 60000 });
    console.log('✅ #calendarContent が DOM に現れました');
  } catch (err) {
    console.error('❌ #calendarContent 待機タイムアウト');
    console.log('現時点での page.content():');
    console.log((await page.content()).slice(0, 1000).replace(/\n/g, ' '), '…');
  }

  console.log('→ カレンダー table.tb-calendar の検出待機');
  try {
    await page.waitForSelector('#calendarContent table.tb-calendar', { timeout: 60000 });
    console.log('✅ カレンダー表が検出できました');
    // 日セル数をログ
    const cellCount = await page.$$eval(
      '#calendarContent table.tb-calendar tbody td',
      tds => tds.length
    );
    console.log(`→ カレンダーセル数: ${cellCount}`);
  } catch {
    console.error('❌ カレンダー表待機タイムアウト');
  }

  console.log('→ カレンダーセルテキストサンプル');
  try {
    const sample = await page.$$eval(
      '#calendarContent table.tb-calendar tbody td',
      tds => tds.slice(0, 10).map(td => td.textContent.trim())
    );
    console.log(sample);
  } catch {}

  console.log('▶ ブラウザを閉じます');
  await browser.close();
})();
