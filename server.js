const express = require('express');
const { run }  = require('./index.js');       // 既存のメイン処理
const { runBenchmark } = require('./benchmark'); // ベンチマーク処理
const app     = express();

// ヘルスチェック用エンドポイント
app.get('/health', (req, res) => {
  res.send('OK');
});

// --- 既存：スクリプト実行トリガー用エンドポイント ---
app.get('/run', async (req, res) => {
  try {
    await run();
    res.sendStatus(204);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// ★あとで消す：ベンチマーク専用エンドポイント ※CRON ジョブから叩く★
app.get('/benchmark', async (req, res) => {
  try {
    const result = await runBenchmark();
    res.status(200).json({ status: 'ok', result });
  } catch (err) {
    console.error('Benchmark error:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});
// ★ここまで消す★

const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
