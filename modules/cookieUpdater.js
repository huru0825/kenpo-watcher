const fs = require('fs');
const path = require('path');
const { fixedCookies } = require('./constants');

async function updateCookiesIfValid(page) {
  const captchaDetected = await page.$('iframe[src*="recaptcha"]');
  if (captchaDetected) {
    console.warn('⚠️ Bブラウザ: CAPTCHA出現。Cookie保存スキップ');
  } else {
    const updatedCookies = await page.cookies();
    fs.writeFileSync('updated_cookies.json', JSON.stringify(updatedCookies, null, 2), 'utf-8');
    console.log('💾 Cookie保存完了: updated_cookies.json');

    const oldSession = fixedCookies.find(c => c.name === '_src_session')?.value;
    const newSession = updatedCookies.find(c => c.name === '_src_session')?.value;
    if (oldSession && newSession && oldSession !== newSession) {
      console.log('✅ セッション更新完了: 新しい _src_session が取得されました');
    } else {
      console.log('ℹ️ セッションIDに変更はありません');
    }
  }
}

module.exports = { updateCookiesIfValid };
