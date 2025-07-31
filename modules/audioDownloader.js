const fs = require('fs');
const path = require('path');
const { transcribeAudio } = require('./whisper');

async function downloadAudioFromPage(frame) {
  console.log('[reCAPTCHA] 🎧 音声チャレンジの音源をネットワーク経由でキャッチ中…');
  const page = frame.page ? frame.page() : frame._page;
  const audioResponse = await page.waitForResponse(
    res =>
      res.url().includes('/recaptcha/api2/payload') &&
      res.headers()['content-type']?.includes('audio/mp3'),
    { timeout: 15000 }
  );
  const audioBuffer = await audioResponse.buffer();
  const tmpDir = path.resolve(__dirname, '../tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, `audio_${Date.now()}.mp3`);
  fs.writeFileSync(filePath, audioBuffer);
  console.log(`[reCAPTCHA] ✅ 音声ファイル保存完了: ${filePath}`);
  return filePath;
}

async function waitForSelectorWithRetry(frame, selector, { interval = 1000, maxRetries = 60 } = {}) {
  for (let i = 0; i < maxRetries; i++) {
    const el = await frame.$(selector);
    if (el) return el;
    await frame.waitForTimeout(interval);
  }
  throw new Error(`Selector "${selector}" が ${interval * maxRetries}ms 内に見つかりませんでした`);
}

function randomDelay(min = 200, max = 800) {
  return Math.floor(Math.random() * (max - min)) + min;
}

async function solveRecaptcha(page) {
  console.log('[reCAPTCHA] 🔍 frames:', page.frames().map(f => f.url()).filter(u => u));

  const anchorHandle = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 20000 }).catch(() => null);
  if (!anchorHandle) return false;
  const checkboxFrame = await anchorHandle.contentFrame();
  console.log('[reCAPTCHA] ✅ チェックボックスiframe取得OK');

  const box = await checkboxFrame.$('.recaptcha-checkbox-border');
  if (!box) {
    console.warn('[reCAPTCHA] ⚠️ checkbox 要素が見つかりません（Invisible reCAPTCHAか、描画遅延）');
    const tmp = path.resolve(__dirname, '../tmp');
    fs.mkdirSync(tmp, { recursive: true });
    const shot = path.join(tmp, `checkbox-missing-${Date.now()}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    return false;
  }

  await box.hover();
  await page.waitForTimeout(randomDelay(300, 700));
  await box.click();
  console.log('[reCAPTCHA] ✅ チェックボックスクリック');

  // ※ 以下省略部分はあなたの元のコードと同じままです
  // （以下の challengeFrame 取得〜音声認識〜成功検出まで）
  // ...
}

module.exports = { downloadAudioFromPage, solveRecaptcha };
