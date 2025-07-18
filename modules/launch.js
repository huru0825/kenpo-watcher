const { CHROME_PATH } = require('./constants');
const puppeteer = require('puppeteer-extra');

function launchBrowser() {
  return puppeteer.launch({
    headless: 'new',
    executablePath: CHROME_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-blink-features=AutomationControlled'
    ]
  });
}

module.exports = { launchBrowser };
