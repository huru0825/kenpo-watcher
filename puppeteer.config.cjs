// puppeteer.config.cjs
module.exports = {
  // Puppeteer v19+ はデフォルトで ~/.cache/puppeteer を使うが、
  // ここでプロジェクト内に固定する
  cacheDirectory: './.cache/puppeteer',
  // もしその他オプションがあればここに追加
};
