let puppeteer = require('puppeteer-extra');
let launchOptions = {
  headless: 'new',
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
