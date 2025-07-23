const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { fixedCookies, GAS_WEBHOOK_URL } = require('./constants');

async function updateCookiesIfValid(page) {
  const captchaDetected = await page.$('iframe[src*="recaptcha"]');
  if (captchaDetected) {
    console.warn('⚠️ Bブラウザ: CAPTCHA出現。Cookie保存スキップ');
    return;
  }

  const updatedCookies = await page.cookies();

  // ローカルログとして保存（Render上でも確認用）
  fs.writeFileSync('updated_cookies.json', JSON.stringify(updatedCookies, null, 2), 'utf-8');
  console.log('💾 Cookie保存完了: updated_cookies.json');

  // GAS Webhook経由でスプレッドシートに送信（後で spreadsheet.js に移すことも可能）
  if (GAS_WEBHOOK_URL) {
    try {
      await axios.post(GAS_WEBHOOK_URL, updatedCookies);
      console.log('📤 Cookie情報をGASスプレッドシートに送信しました');
    } catch (err) {
      console.error('❌ Cookie送信失敗:', err.message);
    }
  }

  // セッション比較ログ（あくまで旧Cookieとの差分チェック）
  const oldSession = fixedCookies.find(c => c.name === '_src_session')?.value;
  const newSession = updatedCookies.find(c => c.name === '_src_session')?.value;
  if (oldSession && newSession && oldSession !== newSession) {
    console.log('✅ セッション更新完了: 新しい _src_session が取得されました');
  } else {
    console.log('ℹ️ セッションIDに変更はありません');
  }
}

module.exports = { updateCookiesIfValid };
