// modules/launch.js

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// Puppeteerの実行オプションを定義
let launchOptions = {
  headless: false,
  executablePath: '/usr/bin/google-chrome', // Dockerfile で指定したChromeのパスと合わせる
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-web-security',
    '--disable-blink-features=AutomationControlled',
    '--disable-gpu',
    '--window-size=1024,768'
  ]
};

// 外部から puppeteer や launchOptions を差し替え可能にする
function setSharedContext(context) {
  if (context.puppeteer) puppeteer = context.puppeteer;
  if (context.launchOptions) launchOptions = context.launchOptions;
}

// ブラウザを起動する関数
function launchBrowser() {
  return puppeteer.launch(launchOptions);
}

module.exports = { launchBrowser, setSharedContext };
