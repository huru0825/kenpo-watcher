// modules/launch.js

// puppeteer を再代入できるよう let で宣言
let puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// ステルスプラグインを有効化
puppeteer.use(StealthPlugin());

// Puppeteer 起動オプション
let launchOptions = {
  headless: true,
  // 環境変数がなければデフォルトパスにある Chrome を使用
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-web-security',
    '--disable-blink-features=AutomationControlled'
  ]
};

// 外部から puppeteer や launchOptions を注入できるようにする関数
function setSharedContext(context) {
  if (context.puppeteer) puppeteer = context.puppeteer;
  if (context.launchOptions) launchOptions = context.launchOptions;
}

// 実際にブラウザを起動する関数
function launchBrowser() {
  return puppeteer.launch(launchOptions);
}

module.exports = { launchBrowser, setSharedContext };
