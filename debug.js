const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const randomUseragent = require('random-useragent');

puppeteer.use(StealthPlugin());

(async () => {
  const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (!CHROME_PATH) {
    console.error('PUPPETEER_EXECUTABLE_PATH が未設定です');
    process.exit(1);
  }

  const INDEX_URL = 'https://as.its-kenpo.or.jp/service_category/index';

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const page = await browser.newPage();

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'languages', { get: () => ['ja-JP', 'ja'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  });

  await page.setCookie({
    name: 'CONSENT',
    value: 'YES+1',
    domain: '.google.com'
  });

  await page.setViewport({
    width: 1200 + Math.floor(Math.random() * 300),
    height: 700 + Math.floor(Math.random() * 300),
    deviceScaleFactor: 1
  });
  const UA = randomUseragent.getRandom() || 'Mozilla/5.0 (Windows NT 10; Win64; x64)';
  await page.setUserAgent(UA);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });

  // セッションCookieを注入
  const cookies = [
    { name: 'AWSALBTG', value: 'a2V7hg7Bd6rvSRikz2wj/2fqVNAK23eDocKubDJt47f9ys6nWLnXAQ4pmqTiSvVtXMjTDFc528BSvarNapIh0UEwDsxc7UbO88SZFj3fQouU2OKQb1YYD3rmH/2hZpyTCicQWQpCmASxSVNrKJSdlSzaV9yGqewO8SHKjlzbLkhLojj3NmM=', domain: 'as.its-kenpo.or.jp', path: '/', secure: false, httpOnly: false },
    { name: '_ga', value: 'GA1.1.581626692.1752773516', domain: '.its-kenpo.or.jp', path: '/', secure: false, httpOnly: false },
    { name: '_src_session', value: '3f7402f99d6ba399eddcbe570763be7f', domain: 'as.its-kenpo.or.jp', path: '/', secure: true, httpOnly: true },
    { name: '_ga_YHTH3JM9GY', value: 'GS2.1.s1752773516$o1$g1$t1752775066$j60$l0$h0', domain: '.its-kenpo.or.jp', path: '/', secure: false, httpOnly: false },
    { name: '_ga_R7KBSKLL21', value: 'GS2.1.s1752773516$o1$g1$t1752775066$j60$l0$h0', domain: '.its-kenpo.or.jp', path: '/', secure: false, httpOnly: false },
    { name: 'AWSALB', value: '0az/wE2HI8Jual+BWjf+LQPeqnVh4KR2A8E7gAGAEBFe6QfqE3bjBE80255oQ16p9f+ZVY5ZNNq+aD0c0QSWkFwGX7g5WF+WVc9fy+9xn5akt20XX7Y9yekiIBLy', domain: 'as.its-kenpo.or.jp', path: '/', secure: false, httpOnly: false },
    { name: 'AWSALBCORS', value: '0az/wE2HI8Jual+BWjf+LQPeqnVh4KR2A8E7gAGAEBFe6QfqE3bjBE80255oQ16p9f+ZVY5ZNNq+aD0c0QSWkFwGX7g5WF+WVc9fy+9xn5akt20XX7Y9yekiIBLy', domain: 'as.its-kenpo.or.jp', path: '/', secure: true, httpOnly: false },
    { name: 'AWSALBTGCORS', value: 'a2V7hg7Bd6rvSRikz2wj/2fqVNAK23eDocKubDJt47f9ys6nWLnXAQ4pmqTiSvVtXMjTDFc528BSvarNapIh0UEwDsxc7UbO88SZFj3fQouU2OKQb1YYD3rmH/2hZpyTCicQWQpCmASxSVNrKJSdlSzaV9yGqewO8SHKjlzbLkhLojj3NmM=', domain: 'as.its-kenpo.or.jp', path: '/', secure: true, httpOnly: false }
  ];
  await page.setCookie(...cookies);

  page.on('console', msg => console.log('PAGE ▶', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR ▶', err));
  page.on('requestfailed', req => console.warn('REQUEST FAILED ▶', req.url(), req.failure()));
  page.on('response', async res => {
    if (res.url().includes('calendar_apply')) {
      console.log(`XHR ▶ [${res.status()}] ${res.url()}`);
      try {
        const text = await res.text();
        console.log('  body snippet:', text.slice(0, 200).replace(/\n/g, ' '), '…');
      } catch {}
    }
  });

  console.log('🔄 INDEXページへ移動');
  await page.goto(INDEX_URL, { waitUntil: 'networkidle2', timeout: 0 });

  console.log('→ 以下省略（CAPTCHAチェックやカレンダー遷移処理）');
})();
