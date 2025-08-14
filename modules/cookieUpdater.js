// modules/cookieUpdater.js

const fs = require('fs');
const axios = require('axios');
const { GAS_WEBHOOK_URL } = require('./constants');
const { reportError } = require('./kw-error');

/**
 * ページから取得した Cookie 配列をローカル保存＆スプレッドシートへ書き込む
 * @param {import('puppeteer').Protocol.Network.Cookie[]} cookies
 */
async function saveCookies(cookies) {
  try {
    fs.writeFileSync('updated_cookies.json', JSON.stringify(cookies, null, 2), 'utf-8');
    console.log('💾 Cookie保存完了: updated_cookies.json');
  } catch (err) {
    reportError('E039', err, { replace: { message: err.message } });
  }

  if (!GAS_WEBHOOK_URL) {
    reportError('E040');
    return;
  }

  try {
    await axios.post(GAS_WEBHOOK_URL, cookies);
    console.log('📤 Cookie情報をGASスプレッドシートに送信しました');
  } catch (err) {
    reportError('E041', err, { replace: { message: err.message } });
  }
}

module.exports = { saveCookies };
