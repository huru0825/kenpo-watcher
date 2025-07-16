const puppeteer = require('puppeteer');
const axios     = require('axios');

// === 環境変数の取得（RenderのGUIで設定）===
const TARGET_URL           = process.env.TARGET_URL;
const GAS_WEBHOOK_URL      = process.env.GAS_WEBHOOK_URL;
const TARGET_FACILITY_NAME = process.env.TARGET_FACILITY_NAME || '';
const DAY_FILTER_RAW       = process.env.DAY_FILTER || '土曜日';
const DATE_FILTER_RAW      = process.env.DATE_FILTER || '';
const CHROME_PATH          = process.env.PUPPETEER_EXECUTABLE_PATH;

// === env バリデーション ===
if (!TARGET_URL)      throw new Error('TARGET_URL が設定されていません');
if (!GAS_WEBHOOK_URL) throw new Error('GAS_WEBHOOK_URL が設定されていません');
if (!CHROME_PATH)     throw new Error('PUPPETEER_EXECUTABLE_PATH が設定されていません');

// === 日付正規化関数 ===
function normalizeDates(raw) {
  return raw
    .replace(/、/g, ',')
    .split(',')
    .map(function(d) { return d.trim(); })
    .filter(Boolean)
    .map(function(date) {
      var m = date.match(/^(\d{1,2})月(\d{1,2})日$/);
      return m ? m[1].padStart(2, '0') + '月' + m[2].padStart(2, '0') + '日' : null;
    })
    .filter(Boolean);
}

// === 日本語→英語曜マップ ===
var DAY_MAP = {
  '日曜日': 'Sunday','月曜日': 'Monday','火曜日': 'Tuesday',
  '水曜日': 'Wednesday','木曜日': 'Thursday',
  '金曜日': 'Friday','土曜日': 'Saturday'
};

var DATE_FILTER_LIST = normalizeDates(DATE_FILTER_RAW);
var DAY_FILTER       = DAY_MAP[DAY_FILTER_RAW] || null;
var TARGET_DAY_RAW   = DAY_FILTER_RAW;

;(async function() {
  var browser;
  try {
    console.log('🔄 Launching browser...', CHROME_PATH);
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: CHROME_PATH,
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'],
      env: Object.assign({}, process.env, { PUPPETEER_SKIP_DOWNLOAD: 'true' })
    });
    console.log('✅ Browser launched');

    var page = await browser.newPage();
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // --- reCAPTCHA（画像認証）検知 ---
    var anchorFrame = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 1000 }).catch(function() { return null; });
    var imageFrame  = await page.waitForSelector('iframe[src*="/recaptcha/api2/bframe"], .rc-imageselect', { timeout: 1000 }).catch(function() { return null; });
    if (imageFrame && !anchorFrame) {
      console.warn('🔴 画像認証チャレンジ検知 → 即終了');
      return;
    }
    console.log('🟢 reCAPTCHA チェックボックスのみ or none → 続行');

    // ○アイコンがあるリンクを取得（page.evaluate 内で DOM 操作）
    var availableDates = await page.evaluate(function() {
      var arr = [];
      var anchors = Array.prototype.slice.call(document.querySelectorAll('a'));
      for (var i = 0; i < anchors.length; i++) {
        var a = anchors[i];
        if (a.querySelector('img[src*="icon_circle.png"]') !== null) {
          arr.push({ href: a.href, label: a.textContent.trim() });
        }
      }
      return arr;
    });

    var matched = [];
    for (var idx = 0; idx < availableDates.length; idx++) {
      var href  = availableDates[idx].href;
      var label = availableDates[idx].label;

      // 日付フィルタ判定
      var byDate = false;
      if (DATE_FILTER_LIST.length > 0) {
        for (var j = 0; j < DATE_FILTER_LIST.length; j++) {
          if (label.indexOf(DATE_FILTER_LIST[j]) !== -1) {
            byDate = true;
            break;
          }
        }
      }

      // 曜日フィルタ判定
      var byDay = false;
      if (DATE_FILTER_LIST.length === 0 && DAY_FILTER) {
        byDay = (label.indexOf(TARGET_DAY_RAW) !== -1);
      }

      if (byDate || byDay) {
        await page.goto(href, { waitUntil: 'networkidle2', timeout: 60000 });

        // 詳細ページでの reCAPTCHA 検知
        var innerAnchor = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 1000 }).catch(function() { return null; });
        var innerImage  = await page.waitForSelector('iframe[src*="/recaptcha/api2/bframe"], .rc-imageselect', { timeout: 1000 }).catch(function() { return null; });
        if (innerImage && !innerAnchor) {
          console.warn('🔴 詳細ページで画像認証検知 → スキップ');
          await page.goBack({ waitUntil: 'networkidle2', timeout: 60000 });
          continue;
        }

        // 施設名リンクの有無判定（page.evaluate で引数渡し）
        var found = await page.evaluate(function(facilityName) {
          var anchors2 = Array.prototype.slice.call(document.querySelectorAll('a'));
          for (var k = 0; k < anchors2.length; k++) {
            if (anchors2[k].textContent.indexOf(facilityName) !== -1) {
              return true;
            }
          }
          return false;
        }, TARGET_FACILITY_NAME);

        if (found) {
          matched.push(label);
        }
        await page.goBack({ waitUntil: 'networkidle2', timeout: 60000 });
      }
    }

    // マッチあれば Webhook 送信
    for (var m = 0; m < matched.length; m++) {
      var hit = matched[m];
      var message = '✅ ' + TARGET_DAY_RAW + '：空きあり「' + TARGET_FACILITY_NAME + '」\n' +
                    hit + '\n\n' + TARGET_URL;
      await axios.post(GAS_WEBHOOK_URL, { message: message });
    }

  } catch (err) {
    console.error('❌ Exception caught:', err);
    var text = err.stack || err.message || String(err);
    await axios.post(GAS_WEBHOOK_URL, { message: '⚠️ Error occurred:\n' + text });
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
