const express = require('express');
const { run } = require('./index.js');
const app = express();

// --- 定期的なウォームアップ用（cold start 対策） ---
let lastWarm = 0;
const WARM_INTERVAL = 1000 * 60 * 15; // 15分ごとに自動ウォーム

async function warmup() {
  const now = Date.now();
  if (now - lastWarm < WARM_INTERVAL) return;
  lastWarm = now;
  try {
    console.log('🔄 Warmup: running headless task to keep container warm');
    await run();
    console.log('✅ Warmup completed');
  } catch (e) {
    console.warn('⚠️ Warmup failed:', e.message);
  }
}

// アプリ起動時と以降 15 分ごとに warmup を走らせる
warmup();
setInterval(warmup, WARM_INTERVAL);

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
    console.error('[/run] Error:', err);
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
    console.error('[/run-once] Error:', err);
    res.status(500).send(err.message);
  }
});

// ポートバインド
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
