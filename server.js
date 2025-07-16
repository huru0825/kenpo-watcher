const express = require('express');
const { run } = require('./index.js');
const app = express();

// ヘルスチェック
app.get('/health', (req, res) => {
  res.send('OK');
});

// スクリプト実行トリガー
app.get('/run', async (req, res) => {
  try {
    await run();
    res.sendStatus(204);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// ベンチマーク用エンドポイント
app.get('/run-once', async (req, res) => {
  const start = Date.now();
  try {
    await run();
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`⏱ 実行完了まで ${elapsed}s`);
    res.send(`OK: ${elapsed}s`);
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

// ポートバインド
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
