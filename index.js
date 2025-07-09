const puppeteer = require('puppeteer');
const axios = require('axios');

// ✅ GAS通知用エンドポイント（Render側の環境変数名：GAS_WEBHOOK_URL）
const GAS_WEBHOOK_URL = process.env.GAS_WEBHOOK_URL;

// ✅ 健保カレンダーのセッション付きURL（埋め込み済み）
const TARGET_URL = "https://as.its-kenpo.or.jp/calendar_apply/calendar_select?s=PVVqTnlJak53RVROM0VUUHpWbWNwQkhlbDlWZW1sbWNsWm5KeDBEWnA5VmV5OTJabFJYWWo5VlpqbG1keVYyYw%3D%3D";

// ✅ GASのトリガーが1分間隔でも、5分おきに実行されるように内部待機で制御
const waitFiveMinutes = () => new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    executablePath: process.env.CHROME_PATH || undefined
  });

  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(60000);

  try {
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });

    const html = await page.content();

    // ❌ サービスカテゴリなどにリダイレクトされたらセッション切れ
    if (html.includes("サービスカテゴリ") || html.includes("ログイン") || html.includes("エラー")) {
      await axios.post(GAS_WEBHOOK_URL, {
        message: "❌ セッション切れ。リンク貼り直して！"
      });
      await browser.close();
      return;
    }

    // ✅ reCAPTCHAチェックボックスだけの場合 → 自動クリック
    const frames = await page.frames();
    const recaptchaFrame = frames.find(f => f.url().includes("https://www.google.com/recaptcha/api2/anchor"));

    if (recaptchaFrame) {
      const checkbox = await recaptchaFrame.$('#recaptcha-anchor');
      if (checkbox) {
        await checkbox.click();
        await page.waitForTimeout(3000);
      } else {
        await axios.post(GAS_WEBHOOK_URL, {
          message: "⚠️ 画像認証付きreCAPTCHAで止まったよ。手動確認して！"
        });
        await browser.close();
        return;
      }
    }

    // ✅ 「○」画像がカレンダー内に存在するか確認
    const hasCircle = await page.evaluate(() => {
      return [...document.images].some(img => img.src.includes("icon_circle.png"));
    });

    if (hasCircle) {
      await axios.post(GAS_WEBHOOK_URL, {
        message: `✅ 空きあり！今すぐ確認！\n\n${TARGET_URL}`
      });
    } else {
      console.log("🔁 空きなし。5分後に再試行予定。");
    }

    // ✅ 5分待って次回に備える（次のトリガーまでスリープ）
    await waitFiveMinutes();
  } catch (e) {
    await axios.post(GAS_WEBHOOK_URL, {
      message: "⚠️ 処理エラー：" + e.message
    });
  } finally {
    await browser.close();
  }
})();
