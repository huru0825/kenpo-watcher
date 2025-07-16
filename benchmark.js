// benchmark.js
module.exports.runBenchmark = async function() {
  const start = Date.now();

  // ★— ここからベンチマーク処理 —★
  // 例：簡易的に INDEX_URL へのナビゲーション時間を測る
  const puppeteer = require('puppeteer');
  const browser   = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: ['--no-sandbox','--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  const INDEX_URL = 'https://as.its-kenpo.or.jp/service_category/index';
  await page.goto(INDEX_URL, { waitUntil: 'networkidle2', timeout: 60000 });

  await browser.close();
  // ★— ここまでベンチマーク処理 —★

  const duration = Date.now() - start;
  console.log(`🕒 Benchmark completed in ${duration}ms`);
  return { duration };
};
