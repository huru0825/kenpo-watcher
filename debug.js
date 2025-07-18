const puppeteer     = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios         = require('axios');
const fs            = require('fs');

puppeteer.use(StealthPlugin());

const INDEX_URL            = 'https://as.its-kenpo.or.jp/service_category/index';
const GAS_WEBHOOK_URL      = process.env.GAS_WEBHOOK_URL;
const TARGET_FACILITY_NAME = process.env.TARGET_FACILITY_NAME || '';
const DAY_FILTER_RAW       = process.env.DAY_FILTER || '土曜日';
const DATE_FILTER_RAW      = process.env.DATE_FILTER || '';
const CHROME_PATH          = process.env.PUPPETEER_EXECUTABLE_PATH;

let isRunning = false;

if (!CHROME_PATH)     throw new Error('PUPPETEER_EXECUTABLE_PATH が未設定です');
if (!GAS_WEBHOOK_URL) console.warn('※ GAS_WEBHOOK_URL が未設定です（本番通知はAブラウザのみ）');

const DAY_MAP = {
  '日曜日': 'Sunday', '月曜日': 'Monday', '火曜日': 'Tuesday',
  '水曜日': 'Wednesday', '木曜日': 'Thursday', '金曜日': 'Friday', '土曜日': 'Saturday'
};

function normalizeDates(raw) {
  return raw.replace(/、/g, ',').split(',').map(d => d.trim()).filter(Boolean).map(date => {
    const m = date.match(/^(\d{1,2})月(\d{1,2})日$/);
    return m ? m[1].padStart(2, '0') + '月' + m[2].padStart(2, '0') + '日' : null;
  }).filter(Boolean);
}

const DATE_FILTER_LIST = normalizeDates(DATE_FILTER_RAW);
const DAY_FILTER       = DAY_MAP[DAY_FILTER_RAW] || null;
const TARGET_DAY_RAW   = DAY_FILTER_RAW;

const fixedCookies = [
  {
    name: "AWSALBTG",
    value: "SEVwgQZyXWxk/q+PADIbK7aIDDdMgDvCNQ2w/oe/O9OtehgnJ1CNzKaHEv91U3DFyHXcMDg+00s9JlmnJI//XiyAItLfMcCzSBot+QCVLYcCqlb+lPE5owkdc3WKL2h/8x2fJNeYuPwItR/ie+CNq0arTQ4qP7mngUhcYMY8InJDhC58qe8=",
    domain: "as.its-kenpo.or.jp",
    path: "/"
  },
  {
    name: "_ga",
    value: "GA1.1.581626692.1752773516",
    domain: ".its-kenpo.or.jp",
    path: "/"
  },
  {
    name: "_src_session",
    value: "a46bbd95c59a545ddeface796b3688ec",
    domain: "as.its-kenpo.or.jp",
    path: "/",
    secure: true,
    httpOnly: true,
    session: true
  },
  {
    name: "_ga_YHTH3JM9GY",
    value: "GS2.1.s1752807565$o4$g1$t1752807785$j60$l0$h0",
    domain: ".its-kenpo.or.jp",
    path: "/"
  },
  {
    name: "_ga_R7KBSKLL21",
    value: "GS2.1.s1752807565$o4$g1$t1752807785$j60$l0$h0",
    domain: ".its-kenpo.or.jp",
    path: "/"
  },
  {
    name: "AWSALB",
    value: "50x/ew73rgTdLPGV+ziabQepCvq33bVPYQ09LNX7mPTSm1i8bpVUf5csu23/GiJD/Z5Qv55ca2aDSZcCB8DdkdgkbQ6vegUHnO07r3553E06NWSxU301x8VaugMQ",
    domain: "as.its-kenpo.or.jp",
    path: "/"
  },
  {
    name: "AWSALBCORS",
    value: "50x/ew73rgTdLPGV+ziabQepCvq33bVPYQ09LNX7mPTSm1i8bpVUf5csu23/GiJD/Z5Qv55ca2aDSZcCB8DdkdgkbQ6vegUHnO07r3553E06NWSxU301x8VaugMQ",
    domain: "as.its-kenpo.or.jp",
    path: "/",
    secure: true
  },
  {
    name: "AWSALBTGCORS",
    value: "SEVwgQZyXWxk/q+PADIbK7aIDDdMgDvCNQ2w/oe/O9OtehgnJ1CNzKaHEv91U3DFyHXcMDg+00s9JlmnJI//XiyAItLfMcCzSBot+QCVLYcCqlb+lPE5owkdc3WKL2h/8x2fJNeYuPwItR/ie+CNq0arTQ4qP7mngUhcYMY8InJDhC58qe8=",
    domain: "as.its-kenpo.or.jp",
    path: "/",
    secure: true
  }
];

async function waitCalendar(page) {
  console.log('→ カレンダー領域の検出待機…');
  await page.waitForSelector('#calendarContent table.tb-calendar', { timeout: 180000 }); // タイムアウトを180秒に変更
  console.log('→ カレンダー領域検出完了');
  console.log('→ カレンダー取得XHR待機…');
  await page.waitForResponse(r =>
    r.url().includes('/calendar_apply/calendar_select') && r.status() === 200
  );
  console.log('→ カレンダーデータ取得完了');
}

async function visitMonth(page, includeDateFilter) {
  const anchor = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 1000 }).catch(() => null);
  const challenge = await page.waitForSelector('iframe[src*="/recaptcha/api2/bframe"], .rc-imageselect', { timeout: 1000 }).catch(() => null);
  if (challenge && !anchor) return [];

  const available = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a')).filter(a => a.querySelector('img[src*="icon_circle.png"]')).map(a => ({ href: a.href, label: a.textContent.trim() }))
  );

  const hits = [];
  for (const { href, label } of available) {
    const byDate = includeDateFilter && DATE_FILTER_LIST.some(d => label.includes(d));
    const byDay = !DATE_FILTER_LIST.length && DAY_FILTER && label.includes(TARGET_DAY_RAW);
    if (byDate || byDay) {
      await page.goto(href, { waitUntil: 'networkidle2', timeout: 0 });
      await page.waitForFunction(() => document.querySelectorAll('.tb-calendar tbody td').length > 0, { timeout: 0 });

      const ia = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 1000 }).catch(() => null);
      const ii = await page.waitForSelector('iframe[src*="/recaptcha/api2/bframe"], .rc-imageselect', { timeout: 1000 }).catch(() => null);
      if (ii && !ia) {
        await page.goBack({ waitUntil: 'networkidle2' }).catch(() => {});
        continue;
      }

      const found = await page.evaluate(name => Array.from(document.querySelectorAll('a')).some(a => a.textContent.includes(name)), TARGET_FACILITY_NAME);
      if (found) hits.push(label);
      await page.goBack({ waitUntil: 'networkidle2' }).catch(() => {});
    }
  }
  return hits;
}

async function nextMonth(page) {
  await page.click('input.button-select.button-primary[value="次へ"]');
  await waitCalendar(page);
}

async function prevMonth(page) {
  await page.click('input.button-select.button-primary[value="前へ"]');
  await waitCalendar(page);
}

module.exports.run = async function () {
  if (isRunning) return;
  isRunning = true;

  const launchOptions = {
    headless: 'new',
    executablePath: CHROME_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-blink-features=AutomationControlled'
    ]
  };

  let browserA, browserB;
  try {
    // 🔍 Aブラウザ（監視処理）
    browserA = await puppeteer.launch(launchOptions);
    const pageA = await browserA.newPage();
    await pageA.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0 Safari/537.36');
    await pageA.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });
    await pageA.setCookie(...fixedCookies);
    await pageA.goto(INDEX_URL, { waitUntil: 'networkidle2', timeout: 0 });

    await Promise.all([
      pageA.click('a[href*="/calendar_apply"]'),
      pageA.waitForSelector('#calendarContent', { timeout: 0 }).catch(() => {})
    ]);

    const anchorFrame = pageA.frames().find(f => f.url().includes('/recaptcha/api2/anchor'));
    if (anchorFrame) {
      await anchorFrame.click('.recaptcha-checkbox-border');
      await pageA.waitForTimeout(2000);
    }

    await nextMonth(pageA); // 1つ目へ

    const sequence = [
      { action: null,        includeDate: true  },
      { action: nextMonth,  includeDate: false },
      { action: nextMonth,  includeDate: false },
      { action: prevMonth,  includeDate: false },
      { action: prevMonth,  includeDate: true  }
    ];

    const notified = new Set();

    for (const { action, includeDate } of sequence) {
      if (action) await action(pageA);
      const hits = await visitMonth(pageA, includeDate);
      for (const label of hits) {
        if (!notified.has(label)) {
          notified.add(label);
          if (GAS_WEBHOOK_URL) {
            await axios.post(GAS_WEBHOOK_URL, {
              message: `【${TARGET_FACILITY_NAME}】予約状況更新\n日付：${label}\n詳細▶︎${INDEX_URL}`
            });
          }
        }
      }
    }

    if (notified.size === 0 && GAS_WEBHOOK_URL) {
      await axios.post(GAS_WEBHOOK_URL, {
        message: `ℹ️ ${TARGET_FACILITY_NAME} の空きはありませんでした。\n監視URL▶︎${INDEX_URL}`
      });
    }

    // 🍪 Bブラウザ（Cookie更新のみ・通知はログのみ）
    browserB = await puppeteer.launch(launchOptions);
    const pageB = await browserB.newPage();
    await pageB.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0 Safari/537.36');
    await pageB.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });
    await pageB.setCookie(...fixedCookies);
    await pageB.goto(INDEX_URL, { waitUntil: 'networkidle2', timeout: 0 });

    const captchaDetected = await pageB.$('iframe[src*="recaptcha"]');
    if (captchaDetected) {
      console.warn('⚠️ Bブラウザ: CAPTCHA出現。Cookie保存スキップ');
    } else {
      const updatedCookies = await pageB.cookies();
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

  } catch (err) {
    console.error('⚠️ 例外発生:', err);
    if (GAS_WEBHOOK_URL) {
      await axios.post(GAS_WEBHOOK_URL, {
        message: '⚠️ エラーが発生しました：\n' + (err.stack || err.message)
      });
    }
  } finally {
    if (browserA) await browserA.close();
    if (browserB) await browserB.close();
    isRunning = false;
  }
}
  if (require.main === module) {
  module.exports.run();
  };
