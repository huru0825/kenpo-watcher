const { launchBrowser } = require('./launch');

async function warmup() {
  console.log('✨ Warmup: launching browser to avoid cold start...');
  const browser = await launchBrowser();
  await browser.close();
  console.log('✨ Warmup completed');
}

module.exports = { warmup };
