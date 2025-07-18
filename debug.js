const puppeteer     = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios         = require('axios');
const fs            = require('fs');

puppeteer.use(StealthPlugin());

const INDEX_URL            = 'https://as.its-kenpo.or.jp/service_category/index';
const GAS_WEBHOOK_URL      = process.env.GAS_WEBHOOK_URL;
const TARGET_FACILITY_NAME = process.env.TARGET_FACILITY_NAME || '';
const CHROME_PATH          = process.env.PUPPETEER_EXECUTABLE_PATH;

let isRunning = false;

if (!CHROME_PATH)     throw new Error('PUPPETEER_EXECUTABLE_PATH が未設定です');
if (!GAS_WEBHOOK_URL) console.warn('※ GAS_WEBHOOK_URL が未設定です（本番通知はAブラウザのみ）');

const fixedCookies = [
  { name: 'AWSALBTG', value: 'ggKYGeug3qPUPf5LB3rDc3IfKTOdNFyJHN6wLJKOZ5ikvhqa3xpMElRBAubX3t9r+TcZoTQe9zfnajmesKytasd+I/ll/bXZ7mtZbXbcd8mHNPM3Oq/narjOh8iYnL7rS49Ii7F7fgzv5CGChwXUhR6L3A4Zi33AOvB+nJHKAN+l1TYlcp4=', domain: 'as.its-kenpo.or.jp', path: '/', sameSite: 'no_restriction', secure: false, httpOnly: false, session: false },
  { name: '_ga', value: 'GA1.1.581626692.1752773516', domain: '.its-kenpo.or.jp', path: '/', sameSite: 'no_restriction', secure: false, httpOnly: false, session: false },
  { name: '_src_session', value: '7a494990d8e0787ea2685d834b4c11c9', domain: 'as.its-kenpo.or.jp', path: '/', sameSite: 'no_restriction', secure: true, httpOnly: true, session: true },
  { name: '_ga_YHTH3JM9GY', value: 'GS2.1.s1752801973$o3$g1$t1752803331$j41$l0$h0', domain: '.its-kenpo.or.jp', path: '/', sameSite: 'no_restriction', secure: false, httpOnly: false, session: false },
  { name: '_ga_R7KBSKLL21', value: 'GS2.1.s1752801973$o3$g1$t1752803331$j41$l0$h0', domain: '.its-kenpo.or.jp', path: '/', sameSite: 'no_restriction', secure: false, httpOnly: false, session: false },
  { name: 'AWSALB', value: 'o/cA46FL5Xtgr7L1pBUnF0UnKq/SDFrwFAh2xaTyg0jrp3gb3kOztRJN8ZnIJrftBN2BZ9b3vamXjJA2PhAsmIahgJV5V+05maZMBkHtjnD1bhDn91ZoNZ2MUitM', domain: 'as.its-kenpo.or.jp', path: '/', sameSite: 'no_restriction', secure: false, httpOnly: false, session: false },
  { name: 'AWSALBCORS', value: 'o/cA46FL5Xtgr7L1pBUnF0UnKq/SDFrwFAh2xaTyg0jrp3gb3kOztRJN8ZnIJrftBN2BZ9b3vamXjJA2PhAsmIahgJV5V+05maZMBkHtjnD1bhDn91ZoNZ2MUitM', domain: 'as.its-kenpo.or.jp', path: '/', sameSite: 'no_restriction', secure: true, httpOnly: false, session: false },
  { name: 'AWSALBTGCORS', value: 'ggKYGeug3qPUPf5LB3rDc3IfKTOdNFyJHN6wLJKOZ5ikvhqa3xpMElRBAubX3t9r+TcZoTQe9zfnajmesKytasd+I/ll/bXZ7mtZbXbcd8mHNPM3Oq/narjOh8iYnL7rS49Ii7F7fgzv5CGChwXUhR6L3A4Zi33AOvB+nJHKAN+l1TYlcp4=', domain: 'as.its-kenpo.or.jp', path: '/', sameSite: 'no_restriction', secure: true, httpOnly: false, session: false }
];

module.exports.run = async function () {
  if (isRunning) return;
  isRunning = true;

  const launchOptions = {
    headless: 'new',
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--disable-blink-features=AutomationControlled']
  };

  let browserA, browserB;
  try {
    console.log('🅰️ Aブラウザ 起動');
    browserA = await puppeteer.launch(launchOptions);
    const pageA = await browserA.newPage();
    await pageA.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0 Safari/537.36');
    await pageA.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });
    await pageA.setCookie(...fixedCookies);
    await pageA.goto(INDEX_URL, { waitUntil: 'networkidle2', timeout: 0 });
    console.log('🅰️ Aブラウザ処理完了');

    console.log('🆕 Bブラウザ 起動（Cookie更新）');
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
      console.log('✅ Bブラウザ: Cookie保存完了 (updated_cookies.json)');
    }

  } catch (err) {
    console.error('⚠️ エラー発生:', err);
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
