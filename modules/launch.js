// modules/launch.js
// puppeteer を再代入できるよう let で宣言
let puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

let launchOptions = {
  headless: false,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-web-security',
    '--disable-blink-features=AutomationControlled'
  ]
};

function setSharedContext(context) {
  if (context.puppeteer) puppeteer = context.puppeteer;
  if (context.launchOptions) launchOptions = context.launchOptions;
}

function launchBrowser() {
  return puppeteer.launch(launchOptions);
}

module.exports = { launchBrowser, setSharedContext };
