// modules/cookieUpdater.js

const fs = require('fs');
const axios = require('axios');
const { GAS_WEBHOOK_URL } = require('./constants');

/**
 * ページから取得した Cookie 配列をローカル保存＆スプレッドシートへ書き込む
 * @param {import('puppeteer').Protocol.Network.Cookie[]} cookies
 */
async function saveCookies(cookies) {
  // ローカルにも JSON として出力（デバッグ用）
  fs.writeFileSync('updated_cookies.json', JSON.stringify(cookies, null, 2), 'utf-8');
  console.log('💾 Cookie保存完了: updated_cookies.json');

  // スプレッドシートへの書き込み
  if (!GAS_WEBHOOK_URL) {
    console.warn('⚠️ GAS_WEBHOOK_URL 未設定 → スプレッドシート書き込みをスキップ');
    return;
  }

  try {
    await axios.post(GAS_WEBHOOK_URL, cookies);
    console.log('📤 Cookie情報をGASスプレッドシートに送信しました');
  } catch (err) {
    console.error('❌ Cookie送信失敗:', err.message);
  }
}

module.exports = { saveCookies };
