// modules/spreadsheet.js

const axios = require('axios');
const { GAS_WEBHOOK_URL } = require('./constants');
const { reportError } = require('./kw-error');

/**
 * GAS上のエンドポイントからスプレッドシートのCookie配列を取得
 * @returns {Promise<Array>} Cookieオブジェクト配列
 */
async function readCookiesFromSpreadsheet() {
  if (!GAS_WEBHOOK_URL) {
    reportError('E037');
    return [];
  }

  try {
    const res = await axios.get(GAS_WEBHOOK_URL);
    if (!Array.isArray(res.data)) throw new Error('スプレッドシート応答が配列ではありません');
    return res.data;
  } catch (err) {
    reportError('E038', err, { replace: { message: err.message } });
    return [];
  }
}

/**
 * 新しいCookie配列をスプレッドシートに送信して上書き保存
 * @param {Array} cookies Cookieオブジェクト配列
 */
async function saveCookiesToSpreadsheet(cookies) {
  if (!GAS_WEBHOOK_URL) {
    reportError('E040');
    return;
  }

  try {
    await axios.post(GAS_WEBHOOK_URL, cookies);
    console.log('✅ Cookie情報をスプレッドシートに送信しました');
  } catch (err) {
    reportError('E041', err, { replace: { message: err.message } });
  }
}

module.exports = { readCookiesFromSpreadsheet, saveCookiesToSpreadsheet };
