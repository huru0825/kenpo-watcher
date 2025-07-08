const puppeteer = require('puppeteer');
const axios = require('axios');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://as.its-kenpo.or.jp/calendar_apply/calendar_select?s=XXXXX', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  const isCaptcha = await page.evaluate(() => {
    return !!document.querySelector('iframe[src*="recaptcha"]');
  });

  if (isCaptcha) {
    await axios.post('https://script.google.com/macros/s/XXXX/exec', {
      message: "🛑 画像認証が出てるから突破できなかった！"
    });
    await browser.close();
    return;
  }

  const hasCircle = await page.evaluate(() => {
    return [...document.images].some(img => img.src.includes("icon_circle.png"));
  });

  if (hasCircle) {
    await axios.post('https://script.google.com/macros/s/XXXX/exec', {
      message: "✅ 健保の予約枠に空きが出たよ！"
    });
  }

  await browser.close();
})();
