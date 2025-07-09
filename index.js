const puppeteer = require('puppeteer');
const axios = require('axios');

// ✅ 固定URL：セッション付きカレンダー表示画面
const TARGET_URL = 'https://as.its-kenpo.or.jp/calendar_apply/calendar_select?s=PUFqTXpNak53RVROM0VUUHpWbWNwQkhlbDlWZW1sbWNsWm5KeDBEWnA5VmV5OTJabFJYWWo5VlpqbG1keVYyYw%3D%3D';

// ✅ GAS通知先（環境変数から取得）
const GAS_WEBHOOK_URL = process.env.GAS_WEBHOOK_URL;

// ✅ 繰り返し監視の間隔（分）
const INTERVAL_MINUTES = 5;

// ✅ 実行関数（監視処理）
async function runWatcher() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH
      || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    await page.goto(TARGET_URL, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    const html = await page.content();

    // ✅ エラーページ検出（reCAPTCHAや404）
    if (html.includes('時間切れ') || html.includes('確認は') || html.includes('404')) {
      await sendLine(`❌ セッション切れまたはリンク無効：再ログインしてURL更新して！`);
      await browser.close();
      return;
    }

    // ✅ 空き○アイコンの検出
    const hasCircle = await page.evaluate(() => {
      return [...document.images].some(img => img.src.includes("icon_circle.png"));
    });

    if (hasCircle) {
      await sendLine(`✅ 健保の予約枠に空きあり！すぐ確認して！\n\n${TARGET_URL}`);
    } else {
      console.log('🔁 空きなし');
    }

    // ✅ ダミー動作：任意の○リンクをクリックして画面遷移 → 戻る（セッション維持対策）
    const circleSelector = 'img[src*="icon_circle.png"]';
    const circle = await page.$(circleSelector);
    if (circle) {
      await circle.click();
      await page.waitForTimeout(3000); // 画面遷移後にちょっと待つ
      await page.goBack({ waitUntil: 'networkidle2' });
    }

  } catch (err) {
    console.error('⚠️ エラー:', err.message);
    await sendLine(`⚠️ Render実行エラー: ${err.message}`);
  } finally {
    await browser.close();
  }
}

// ✅ LINE通知 → GAS経由で送信
async function sendLine(message) {
  try {
    await axios.post(GAS_WEBHOOK_URL, { message });
  } catch (err) {
    console.error('⚠️ LINE通知エラー:', err.message);
  }
}

// ✅ インターバル監視開始（5分間隔で自動ループ）
(async () => {
  while (true) {
    console.log('🔍 監視ループ開始');
    await runWatcher();
    console.log(`⏳ ${INTERVAL_MINUTES}分待機...`);
    await new Promise(resolve => setTimeout(resolve, INTERVAL_MINUTES * 60 * 1000));
  }
})();
