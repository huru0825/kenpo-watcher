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
    { name: 'AWSALBTG', value: 'ctQMEO7YmBC+s4w2fqp+KFye7Ko4mh4bofSlw9SqaUq+gUTe5Nu6Ek9cWPVrZnFSz0snKWl9PRPtK+6fpH+4BUp1vi4+ffihoOMPOLUiEpho0HS8y1ySac7Vm6338lNLVJ+OHODTsT8mX/oftXe/O1ufueSzl16tFaJRv355wobiQdU9rWc=', domain: 'as.its-kenpo.or.jp', path: '/', secure: false, httpOnly: false },
    { name: '_ga', value: 'GA1.1.581626692.1752773516', domain: '.its-kenpo.or.jp', path: '/', secure: false, httpOnly: false },
    { name: '_src_session', value: 'bea2f3a9e75dd7edff404854b3679dbc', domain: 'as.its-kenpo.or.jp', path: '/', secure: true, httpOnly: true },
    { name: '_ga_YHTH3JM9GY', value: 'GS2.1.s1752773516$o1$g1$t1752776159$j60$l0$h0', domain: '.its-kenpo.or.jp', path: '/', secure: false, httpOnly: false },
    { name: '_ga_R7KBSKLL21', value: 'GS2.1.s1752773516$o1$g1$t1752776159$j60$l0$h0', domain: '.its-kenpo.or.jp', path: '/', secure: false, httpOnly: false },
    { name: 'AWSALB', value: 'e2oUrCfe6HmE5ojHqVJW9kqJuAvj68xlIaNsF9ioVSaZ8v8AsgyLnMteucNiKNjNq4Reeh0iaNLmkoynNfU0x0z++KhAWlOKEVvLYt1nG7ffdsjuL1OHq59zVwis', domain: 'as.its-kenpo.or.jp', path: '/', secure: false, httpOnly: false },
    { name: 'AWSALBCORS', value: 'e2oUrCfe6HmE5ojHqVJW9kqJuAvj68xlIaNsF9ioVSaZ8v8AsgyLnMteucNiKNjNq4Reeh0iaNLmkoynNfU0x0z++KhAWlOKEVvLYt1nG7ffdsjuL1OHq59zVwis', domain: 'as.its-kenpo.or.jp', path: '/', secure: true, httpOnly: false },
    { name: 'AWSALBTGCORS', value: 'ctQMEO7YmBC+s4w2fqp+KFye7Ko4mh4bofSlw9SqaUq+gUTe5Nu6Ek9cWPVrZnFSz0snKWl9PRPtK+6fpH+4BUp1vi4+ffihoOMPOLUiEpho0HS8y1ySac7Vm6338lNLVJ+OHODTsT8mX/oftXe/O1ufueSzl16tFaJRv355wobiQdU9rWc=', domain: 'as.its-kenpo.or.jp', path: '/', secure: true, httpOnly: false }
  ];
  await page.setCookie(...cookies);

  console.log('🔄 INDEXページへ移動');
  await page.goto(INDEX_URL, { waitUntil: 'networkidle2', timeout: 0 });

  console.log('→ 以下省略（CAPTCHAチェックやカレンダー遷移処理）');
})();
