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
    res.send('実行完了');
  } catch (err) {
    console.error('Error in run():', err);
    res.status(500).send('実行失敗: ' + err.message);
  }
});

// Render が提供するポートを利用
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
