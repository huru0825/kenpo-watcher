const puppeteer = require('puppeteer-core');
const chromium = require('chrome-aws-lambda');
const axios = require('axios');

// ✅ 監視対象のURL（セッション付きURLをここに設定）
const TARGET_URL = 'https://as.its-kenpo.or.jp/calendar_apply/calendar_select?s=PWdETXpBek13RVROM0VUUHpWbWNwQkhlbDlWZW1sbWNsWm5KeDBEWnA5VmV5OTJabFJYWWo5VlpqbG1keVYyYw%3D%3D'; // ← セッション付きURLに更新する

// ✅ 通知先GAS Webhook（doPost URL）
const GAS_POST_URL = 'https://script.google.com/macros/s/AKfycbxRlqe34OLKXLIeRhwwKZchDupvPTq9hA54f5mb2MKvJ0BMdBdjHGAmWoHYn3rgAhWZ/exec'; // ← GASのWeb Apps URLに置き換える

// ✅ メイン処理
(async () => {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath,
    headless: chromium.headless
  });

  const page = await browser.newPage();

  try {
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    const html = await page.content();

    // ✅ reCAPTCHAの存在チェック
    const hasReCAPTCHA = html.includes('recaptcha') || html.includes('g-recaptcha');
    if (hasReCAPTCHA) {
      console.log('⚠️ reCAPTCHA検知 → 通知 & 処理スキップ');
      await axios.post(GAS_POST_URL, {
        message: '⚠️ reCAPTCHAが表示されたよ！セッション切れかも。'
      });
      return;
    }

    // ✅ 空き判定（○アイコン or alt="○" 判定）
    const hasCircle = await page.evaluate(() => {
      return [...document.images].some(img =>
        img.src.includes("icon_circle.png") || img.alt === "○"
      );
    });

    if (hasCircle) {
      console.log('✅ 空きあり → GAS通知');
      await axios.post(GAS_POST_URL, {
        message: `✅ 予約枠に空きが出たよ！いますぐチェック！\n\n${TARGET_URL}`
      });
    } else {
      console.log('🔁 空きなし → 通知せずスルー');
    }

  } catch (error) {
    console.error('❌ 処理中エラー:', error.message);
    await axios.post(GAS_POST_URL, {
      message: `❌ 処理中にエラー発生: ${error.message}`
    });
  } finally {
    await browser.close();
  }
})();
