// puppeteer.config.cjs
const path = require('path');

module.exports = {
  // Puppeteer がダウンロードした Chrome を置くディレクトリを
  // プロジェクト直下の .cache/puppeteer に固定する
  cacheDirectory: path.resolve(__dirname, '.cache/puppeteer')
};
