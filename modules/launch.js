// modules/launch.js

let puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

let launchOptions = {
  headless: true,
  // ✅ 明示的に実在する Chrome パスを指定
  executablePath: '/usr/local/bin/google-chrome',
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
