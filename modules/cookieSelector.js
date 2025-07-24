// modules/cookieSelector.js

const axios = require('axios');
const { GAS_WEBHOOK_URL } = require('./constants');

/**
 * スプレッドシートから Cookie を取得し、空なら空配列を返す
 * @returns {Promise<import('puppeteer').Cookie[]>}
 */
async function selectCookies() {
  if (!GAS_WEBHOOK_URL) {
    console.warn('ℹ️ GAS_WEBHOOK_URL 未設定 → Cookie 取得をスキップ');
    return [];
  }

  try {
    const resp = await axios.get(GAS_WEBHOOK_URL, { timeout: 5000 });
    if (Array.isArray(resp.data) && resp.data.length > 0) {
      console.log(`✅ スプレッドシートから Cookie を取得 (${resp.data.length} 件)`);
      return resp.data;
    } else {
      console.log('ℹ️ スプレッドシートに Cookie が見つかりませんでした → 空配列で進行');
      return [];
    }
  } catch (err) {
    console.warn('⚠️ スプレッドシートから Cookie 取得失敗:', err.message);
    return [];
  }
}

module.exports = { selectCookies };
