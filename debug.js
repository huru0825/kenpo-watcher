const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

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

  page.on('console', msg => console.log('PAGE ▶', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR ▶', err));
  page.on('requestfailed', req => console.warn('REQUEST FAILED ▶', req.url(), req.failure()));
  page.on('response', async res => {
    if (res.url().includes('calendar_apply')) {
      console.log(`XHR ▶ [${res.status()}] ${res.url()}`);
      try {
        const text = await res.text();
        console.log('  body snippet:', text.slice(0, 200).replace(/\n/g, ' '), '…');
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

  console.log('→ reCAPTCHA iframe の出現を最大30秒待機');
  try {
    await page.waitForFunction(() => {
      return [...document.querySelectorAll('iframe')].some(f => f.src.includes('/recaptcha/api2/anchor'));
    }, { timeout: 30000 });

    const frame = page.frames().find(f => f.url().includes('/recaptcha/api2/anchor'));
    if (frame) {
      console.log('✅ reCAPTCHA iframe 検出');

      let checkbox = await frame.$('.recaptcha-checkbox-border');
      if (!checkbox) {
        console.log('→ checkbox 再取得を最大10秒試み');
        await page.waitForFunction(() => {
          const iframe = document.querySelector('iframe[src*="/recaptcha/api2/anchor"]');
          if (!iframe) return false;
          const checkboxElement = iframe.contentWindow && iframe.contentDocument && iframe.contentDocument.querySelector('.recaptcha-checkbox-border');
          return !!checkboxElement;
        }, { timeout: 10000 }).catch(() => console.warn('⚠️ checkbox 再取得失敗'));

        checkbox = await frame.$('.recaptcha-checkbox-border');
      }

      if (checkbox) {
        console.log('→ checkbox を再クリック');
        await frame.evaluate(el => el.click(), checkbox);
        await page.waitForTimeout(3000);
      } else {
        console.warn('❌ checkbox 最終的にも取得できず');
      }
    }
  } catch {
    console.warn('❌ reCAPTCHA iframe 出現しなかった');
  }

  console.log('→ 「次へ」ボタンをクリック');
  await page.click('input.button-select.button-primary[value="次へ"]');

  console.log('→ navigation 完了待機');
  await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 })
    .catch(() => console.warn('⚠️ navigation networkidle0 タイムアウト'));

  console.log('→ カレンダー取得XHR待機');
  await page.waitForResponse(
    r => r.url().includes('/calendar_apply/calendar_select') && r.status() === 200,
    { timeout: 60000 }
  ).catch(() => console.warn('⚠️ カレンダーXHR タイムアウト'));

  console.log('→ カレンダー表セルが描画されるまで待機');
  await page.waitForFunction(
    () => document.querySelectorAll('#calendarContent table.tb-calendar tbody td').length > 0,
    { timeout: 60000 }
  ).catch(() => console.error('❌ カレンダーセル描画タイムアウト'));

  const cellCount = await page.$$eval(
    '#calendarContent table.tb-calendar tbody td',
    tds => tds.length
  );
  console.log(`✅ カレンダーセル数: ${cellCount}`);

  const sampleTexts = await page.$$eval(
    '#calendarContent table.tb-calendar tbody td',
    tds => tds.slice(0, 10).map(td => td.textContent.trim())
  );
  console.log('→ セルテキストサンプル:', sampleTexts);

  console.log('▶ ブラウザを閉じます');
  await browser.close();
})();
