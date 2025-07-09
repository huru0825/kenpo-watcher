const puppeteer = require('puppeteer');
const axios = require('axios');

// 健保カレンダーの監視対象URL（セッション付き）
const TARGET_URL = "https://as.its-kenpo.or.jp/calendar_apply/calendar_select?s=PVFETTNZVE53RVROM0VUUHpWbWNwQkhlbDlWZW1sbWNsWm5KeDBEWnA5VmV5OTJabFJYWWo5VlpqbG1keVYyYw%3D%3D";

// 通知先（GAS Webhook URL）
const GAS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxRlqe34OLKXLIeRhwwKZchDupvPTq9hA54f5mb2MKvJ0BMdBdjHGAmWoHYn3rgAhWZ/exec";

// メイン処理（即時実行関数）
(async () => {
  try {
    const browser = await puppeteer.launch({
      headless: "new", // Puppeteer v20以降の新しいheadlessモード
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process'
      ]
    });

    const page = await browser.newPage();
    await page.goto(TARGET_URL, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // icon_circle.png を含む画像があるか確認
    const hasCircle = await page.evaluate(() => {
      return Array.from(document.images).some(img => img.src.includes("icon_circle.png"));
    });

    if (hasCircle) {
      // 空きあり → GASへ通知
      await axios.post(GAS_WEBHOOK_URL, {
        message: "✅ 健保のカレンダーに空き枠（○）があります！\n\n" + location.href
      });
    }

    await browser.close();
  } catch (e) {
    console.error("❌ 実行時エラー:", e.message);
    try {
      await axios.post(GAS_WEBHOOK_URL, {
        message: "⚠️ Render側でエラー発生: " + e.message
      });
    } catch (err) {
      console.error("⚠️ GAS通知にも失敗:", err.message);
    }
  }
})();
