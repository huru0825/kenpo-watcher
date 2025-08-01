// modules/launch.js

let puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

let launchOptions = {
  headless: false,
    // これは間違い
  // executablePath: '/usr/local/bin/google-chrome',
  
  // ✅ 明示的に実在する Chrome パスを指定
  executablePath: '/opt/google/chrome/google-chrome',
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
