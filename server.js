const express = require('express');
const { run, warmup } = require('./index.js');
const app = express();

// ヘルスチェック
app.get('/health', (req, res) => {
  res.send('OK');
});

// サービス起動時にだけ実行する warmup
(async () => {
  try {
    console.log('✨ Warmup: launching browser to avoid cold start...');
    await warmup();
    console.log('✨ Warmup completed');
  } catch (e) {
    console.error('⚠️ Warmup failed (ignored):', e);
  }
})();

// スクリプト実行トリガー（CRON から呼び出し）
app.get('/run', async (req, res) => {
  try {
    await run();            // LINE 通知を含む
    res.sendStatus(204);
  } catch (err) {
    console.error('💥 /run error:', err);
    res.sendStatus(500);
  }
});

// ベンチマーク用エンドポイント（テスト的に一度だけ実行）
app.get('/run-once', async (req, res) => {
  const start = Date.now();
  try {
    await run();
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`⏱ run-once: ${elapsed}s`);
    res.send(`OK in ${elapsed}s`);
  } catch (err) {
    console.error('💥 /run-once error:', err);
    res.status(500).send(err.message);
  }
});

// ポートバインド
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
