const express = require('express');
const { run } = require('./index.js');
const app = express();

// ヘルスチェック用エンドポイント
app.get('/health', (req, res) => {
  res.send('OK');
});

// スクリプト実行トリガー用エンドポイント
app.get('/run', async (req, res) => {
  try {
    await run();
    res.send(204);
  } catch (err) {
    console.error(err);
    res.status(500);
  }
});

// Render が提供するポートを利用
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
