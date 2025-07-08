const puppeteer = require('puppeteer');
const axios = require('axios');

// ✅ Renderの環境変数から読み込み
const TARGET_URL = process.env.TARGET_URL;           // セッション付きカレンダーURL
const GAS_WEBHOOK_URL = process.env.GAS_WEBHOOK_URL; // GASのdoPost() URL

// ✅ GASへ通知を送る関数
async function notifyToGAS(message) {
  try {
    await axios.post(GAS_WEBHOOK_URL, { message });
    console.log('✅ GASへ通知送信:', message);
  } catch (e) {
    console.error('⚠️ GAS通知失敗:', e.message);
  }
}

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // ✅ reCAPTCHAチェックボックスだけなら突破（画像選択はスキップ）
    const isRecaptcha = await page.$('iframe[src*="recaptcha"]');
    if (isRecaptcha) {
      const frame = (await page.frames()).find(f => f.url().includes('recaptcha'));
      const checkbox = await frame.$('.recaptcha-checkbox-border');
      if (checkbox) {
        await checkbox.click();
        console.log('✅ reCAPTCHAチェックボックスクリック完了');
        await page.waitForTimeout(3000);
      } else {
        console.log('⚠️ 画像選択付きreCAPTCHA → スキップ');
        await browser.close();
        return;
      }
    }

    const foundCircle = await page.evaluate(() => {
      return [...document.images].some(img => img.src.includes('icon_circle.png'));
    });

    if (foundCircle) {
      await notifyToGAS('✅ 健保予約カレンダーに空き（◯）があります！\n' + TARGET_URL);
    } else {
      console.log('🔁 ◯なし。空きなし or 満席');
    }

  } catch (e) {
    console.error('⚠️ カレンダー監視失敗:', e.message);
    if (e.message.includes('net::ERR') || e.message.includes('timeout')) {
      await notifyToGAS('⚠️ カレンダー取得失敗（セッション切れの可能性）\nURL更新してね → ' + TARGET_URL);
    }
  } finally {
    await browser.close();
  }
})();
