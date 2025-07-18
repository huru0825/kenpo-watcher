const express = require('express');
const { run, warmup } = require('./index.js');
const app = express();

// ヘルスチェック
app.get('/health', (req, res) => res.send('OK'));

// CRONトリガー
app.get('/run', async (req, res) => {
  try {
    await run();
    res.sendStatus(204);
  } catch (err) {
    console.error('💥 /run error:', err);
    res.sendStatus(500);
  }
});

// ポートバインド＋Warmup
const port = process.env.PORT || 3000;
app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);
  try {
    console.log('✨ Warmup: launching browser to avoid cold start...');
    await warmup();
    console.log('✨ Warmup completed');
  } catch (e) {
    console.error('⚠️ Warmup failed (ignored):', e);
  }
});
