const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// Puppeteerの実行オプションを定義
let launchOptions = {
  headless: false, // 👁️ ブラウザ可視化（headful）
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/opt/google/chrome/google-chrome',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-blink-features=AutomationControlled',
    '--disable-gpu',
    '--window-size=1024,768',
    '--lang=ja-JP,ja',
    '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
    '--start-maximized',
    '--display=:99'
  ]
};

// 外部から puppeteer や launchOptions を差し替え可能にする
function setSharedContext(context) {
  if (context.puppeteer) puppeteer = context.puppeteer;
  if (context.launchOptions) launchOptions = context.launchOptions;
}

// ブラウザを起動する関数（+ プロファイル初期設定）
async function launchBrowser() {
  const browser = await puppeteer.launch(launchOptions);
  const [page] = await browser.pages();

  // 必要な偽装ヘッダーなどを設定（基本共通）
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'ja-JP,ja;q=0.9'
  });

  // WebDriver偽装
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  return browser;
}

module.exports = { launchBrowser, setSharedContext };
