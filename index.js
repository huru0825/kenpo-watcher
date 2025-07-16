/***********************************************************************************
 * ターゲットURLはカレンダーに遷移するTOPページを指定のためハードコード。
 * 対象ページのリンクを変えたい場合は INDEX_URL を変更してください。
 ***********************************************************************************/

const puppeteer      = require('puppeteer-extra');
const StealthPlugin  = require('puppeteer-extra-plugin-stealth');
const axios          = require('axios');

puppeteer.use(StealthPlugin());

const INDEX_URL            = 'https://as.its-kenpo.or.jp/service_category/index';
const GAS_WEBHOOK_URL      = process.env.GAS_WEBHOOK_URL;
const TARGET_FACILITY_NAME = process.env.TARGET_FACILITY_NAME || '';
const DAY_FILTER_RAW       = process.env.DAY_FILTER || '土曜日';
const DATE_FILTER_RAW      = process.env.DATE_FILTER || '';
const CHROME_PATH          = process.env.PUPPETEER_EXECUTABLE_PATH;

// --- 実行中フラグ ---
let isRunning = false;

// === env バリデーション ===
if (!GAS_WEBHOOK_URL) throw new Error('GAS_WEBHOOK_URL が設定されていません');
if (!CHROME_PATH)     throw new Error('PUPPETEER_EXECUTABLE_PATH が設定されていません');

// === 日付正規化／曜日マップは省略（既存どおり） ===
// …

// ===== 月訪問ロジック =====
async function visitMonth(page, includeDateFilter) {
  // … （既存どおり） …
}

// ===== navigation helpers =====
async function clickNext(page) { /* … */ }
async function clickPrev(page) { /* … */ }

// ===== main =====
module.exports.run = async function() {
  if (isRunning) {
    console.log('▶️ すでに実行中のためスキップ');
    return;
  }
  isRunning = true;

  let browser;
  try {
    console.log('🔄 ブラウザ 起動中...', CHROME_PATH);
    browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROME_PATH,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ],
      env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD:'true' }
    });
    console.log('✅ ブラウザを起動');

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/115.0.0.0 Safari/537.36'
    );

    // 2) インデックス→カレンダー入口
    console.log('→ Navigating to INDEX page');
    await page.goto(INDEX_URL, { waitUntil:'networkidle2' });
    console.log('→ Clicking into calendar entry');
    await Promise.all([
      page.click('a[href*="/calendar_apply"]'),
      page.waitForSelector('#calendarContent', { timeout: 90000 })
        .catch(() => console.warn('⚠️ #calendarContent タイムアウト'))
    ]);
    console.log('→ Calendar page ready');

    // 3) reCAPTCHA チェック
    const frames = page.frames();
    const anchorFrame = frames.find(f => f.url().includes('/recaptcha/api2/anchor'));
    if (anchorFrame) {
      console.log('→ Solving reCAPTCHA checkbox');
      await anchorFrame.click('.recaptcha-checkbox-border');
      await page.waitForTimeout(2000);
    }
    console.log('🟢 reCAPTCHA 通過または無し');

    // 4) 「次へ」フォーム送信
    console.log('→ Submitting "次へ"');
    await Promise.all([
      page.click('input.button-select.button-primary[value="次へ"]'),
      page.waitForResponse(r => r.url().includes('/calendar_apply/calendar_select'))
    ]);
    console.log('→ Moved to calendar view');

    // 5) 巡回シーケンス
    const sequence = [
      { action:null,      includeDate:true  },
      { action:clickNext, includeDate:false },
      { action:clickNext, includeDate:false },
      { action:clickPrev, includeDate:false },
      { action:clickPrev, includeDate:true  }
    ];
    const notified = new Set();

    for (const step of sequence) {
      if (step.action) {
        console.log(`→ Navigation step: ${step.action.name}`);
        await step.action(page);
      }
      const hits = await visitMonth(page, step.includeDate);
      for (const label of hits) {
        if (!notified.has(label)) {
          notified.add(label);
          console.log('→ Notify:', label);
          await axios.post(GAS_WEBHOOK_URL, {
            message: `【${TARGET_FACILITY_NAME}】予約状況更新\n日付：${label}\n詳細▶︎ ${INDEX_URL}`
          });
        }
      }
    }

    // 6) ヒットなしテスト通知
    if (notified.size === 0) {
      console.log('→ No hits found, sending empty notification');
      await axios.post(GAS_WEBHOOK_URL, {
        message: `ℹ️ ${TARGET_FACILITY_NAME} の空きはありませんでした。\n監視URL▶︎ ${INDEX_URL}`
      });
    }

  } catch (err) {
    console.error('⚠️ 例外をキャッチ:', err);
    await axios.post(GAS_WEBHOOK_URL, {
      message: '⚠️ エラーが発生しました：\n' + (err.stack||err.message)
    });
  } finally {
    if (browser) {
      console.log('→ Closing browser');
      await browser.close();
    }
    isRunning = false;
  }
};
