const axios = require('axios');
const { GAS_WEBHOOK_URL } = require('./constants');

/**
 * GAS上のエンドポイントからスプレッドシートのCookie配列を取得
 * @returns {Promise<Array>} Cookieオブジェクト配列
 */
async function readCookiesFromSpreadsheet() {
  if (!GAS_WEBHOOK_URL) {
    console.warn('⚠️ GAS_WEBHOOK_URL が未設定のため、固定Cookieを使用します');
    return [];
  }

  try {
    const res = await axios.get(GAS_WEBHOOK_URL); // GETでCookie JSON取得
    if (!Array.isArray(res.data)) throw new Error('スプレッドシート応答が配列ではありません');
    return res.data;
  } catch (err) {
    console.error('❌ スプレッドシートからのCookie取得失敗:', err.message);
    return [];
  }
}

/**
 * 新しいCookie配列をスプレッドシートに送信して上書き保存
 * @param {Array} cookies Cookieオブジェクト配列
 */
async function saveCookiesToSpreadsheet(cookies) {
  if (!GAS_WEBHOOK_URL) {
    console.warn('⚠️ GAS_WEBHOOK_URL が未設定のため、スプレッドシート保存をスキップします');
    return;
  }

  try {
    await axios.post(GAS_WEBHOOK_URL, cookies); // POSTで保存
    console.log('✅ Cookie情報をスプレッドシートに送信しました');
  } catch (err) {
    console.error('❌ Cookie送信失敗:', err.message);
  }
}

module.exports = { readCookiesFromSpreadsheet, saveCookiesToSpreadsheet };
