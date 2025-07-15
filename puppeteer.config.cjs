// puppeteer.config.js
const path = require('path');

module.exports = {
  // プロジェクト直下の .cache/puppeteer を絶対パスで指定
  cacheDirectory: path.join(process.cwd(), '.cache/puppeteer'),
};
