const { readCookiesFromSpreadsheet } = require('./spreadsheet');
const { fixedCookies } = require('./constants');

/**
 * スプレッドシートにクッキーが存在すればそちらを返し、
 * なければ固定Cookie（Cookie.json）を返す。
 */
async function selectCookies() {
  try {
    const cookies = await readCookiesFromSpreadsheet();

    const hasHeader = Array.isArray(cookies) && cookies.length > 0;
    const hasCookieData = hasHeader && cookies.some(c => typeof c.name === 'string' && c.value);

    if (hasCookieData) {
      console.log('✅ スプレッドシートからCookieを取得');
      return cookies;
    } else {
      console.warn('⚠️ スプレッドシートに有効なCookieが見つかりません → 固定Cookieを使用します');
      return fixedCookies;
    }
  } catch (e) {
    console.error('❌ Cookie読み込み中にエラー → 固定Cookieにフォールバック:', e.message);
    return fixedCookies;
  }
}

module.exports = { selectCookies };
