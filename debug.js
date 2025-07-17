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

  const cookies = [
    { name: 'AWSALBTG', value: 'SzOE9jw352s6uxWUBodYEL6pNxbuIAFSKEbH91LEHdiLCgdlrtkQJcbtIE/c1j/UKqtrOwOzC6eYES3bTfxNMKse0rFAi/3NGaFEfDSNHoOXlnM84FGauet80Db65s61hlOFTwJmrGedyB+NjiL1126VouHYgkHlPemq6+DEJeehC0pW5EU=', domain: 'as.its-kenpo.or.jp', path: '/', secure: false, httpOnly: false },
    { name: '_ga', value: 'GA1.1.581626692.1752773516', domain: '.its-kenpo.or.jp', path: '/', secure: false, httpOnly: false },
    { name: '_src_session', value: 'bea2f3a9e75dd7edff404854b3679dbc', domain: 'as.its-kenpo.or.jp', path: '/', secure: true, httpOnly: true },
    { name: '_ga_YHTH3JM9GY', value: 'GS2.1.s1752773516$o1$g1$t1752776845$j60$l0$h0', domain: '.its-kenpo.or.jp', path: '/', secure: false, httpOnly: false },
    { name: '_ga_R7KBSKLL21', value: 'GS2.1.s1752773516$o1$g1$t1752776856$j49$l0$h0', domain: '.its-kenpo.or.jp', path: '/', secure: false, httpOnly: false },
    { name: 'AWSALB', value: 'QgetHs0jtOE1LjZxlr5uc71lDX7rQ7E7onED1evqaelv2BCzDCcLM0xJr9I6lABs/ztj0yBi/LUAaTQ1Q0AnHLtrZGNKCetkrSXcDgzKX7w16upHVMjvzAdnVcp/', domain: 'as.its-kenpo.or.jp', path: '/', secure: false, httpOnly: false },
    { name: 'AWSALBCORS', value: 'QgetHs0jtOE1LjZxlr5uc71lDX7rQ7E7onED1evqaelv2BCzDCcLM0xJr9I6lABs/ztj0yBi/LUAaTQ1Q0AnHLtrZGNKCetkrSXcDgzKX7w16upHVMjvzAdnVcp/', domain: 'as.its-kenpo.or.jp', path: '/', secure: true, httpOnly: false },
    { name: 'AWSALBTGCORS', value: 'SzOE9jw352s6uxWUBodYEL6pNxbuIAFSKEbH91LEHdiLCgdlrtkQJcbtIE/c1j/UKqtrOwOzC6eYES3bTfxNMKse0rFAi/3NGaFEfDSNHoOXlnM84FGauet80Db65s61hlOFTwJmrGedyB+NjiL1126VouHYgkHlPemq6+DEJeehC0pW5EU=', domain: 'as.its-kenpo.or.jp', path: '/', secure: true, httpOnly: false }
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

  console.log('🧠 CAPTCHAチェック開始');
  const hasCaptcha = await page.$('iframe[src*="recaptcha"]');
  if (hasCaptcha) {
    console.warn('⚠️ CAPTCHAが検出されました');
  } else {
    console.log('✅ CAPTCHAは表示されていません（Cookie回避成功の可能性）');
  }

  // カレンダー表示リンクが存在するかチェック（画面遷移確認）
  const calendarLink = await page.$('a[href*="calendar"]');
  if (calendarLink) {
    console.log('📅 カレンダーへのリンクが見つかりました');
  } else {
    console.warn('❌ カレンダーへのリンクが見つかりませんでした（失敗の可能性）');
  }

  await browser.close();
})();
