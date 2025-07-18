const { launchBrowser } = require('./launch');

async function warmup() {
  const browser = await launchBrowser();
  await browser.close();
}

module.exports = { warmup };
