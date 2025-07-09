const puppeteer = require('puppeteer');
const axios = require('axios');

// ✅ 埋め込み型（環境変数ではなく直書き）
const TARGET_URL = 'https://as.its-kenpo.or.jp/calendar_apply/calendar_select?s=PVV6TTFVVE53RVROM0VUUHpWbWNwQkhlbDlWZW1sbWNsWm5KeDBEWnA5VmV5OTJabFJYWWo5VlpqbG1keVYyYw%3D%3D'; // ← 最新のセッション付きURLに差し替え
const GAS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbxRlqe34OLKXLIeRhwwKZchDupvPTq9hA54f5mb2MKvJ0BMdBdjHGAmWoHYn3rgAhWZ/exec';

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
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: '/usr/bin/google-chrome' // ✅ Render環境でのChrome実行パス
  });

  const page = await browser.newPage();

  try {
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // ✅ reCAPTCHAチェックボックス突破（画像選択はスキップ）
    const isRecaptcha = await page.$('iframe[src*="recaptcha"]');
    if (isRecaptcha) {
      const frame = (await page.frames()).find(f => f.url().includes('recaptcha'));
      const checkbox = await frame.$('.recaptcha-checkbox-border');
      if (checkbox) {
        await checkbox.click();
        console.log('✅ reCAPTCHAチェックボックスクリック完了');
        await page.waitForTimeout(3000);
      } else {
        console.log('⚠️ 画像選択付きreCAPTCHA → スキップ＆終了');
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
