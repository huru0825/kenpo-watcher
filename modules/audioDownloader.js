// modules/audioDownloader.js

const fs = require('fs');
const path = require('path');

function copyToDocuments(srcPath) {
  const documentsDir = '/home/screenshots';
  try {
    fs.mkdirSync(documentsDir, { recursive: true });
    const fileName = path.basename(srcPath);
    const destPath = path.join(documentsDir, fileName);
    fs.copyFileSync(srcPath, destPath);
    console.log(`[copy] 📁 ${srcPath} → ${destPath}`);
  } catch (err) {
    console.warn('[copy] ❌ 転送失敗:', err.message);
  }
}

async function downloadAudioFromPage(frame) {
  console.log('[reCAPTCHA] 🎧 音声チャレンジの音源をキャッチ中...');
  const page = frame.page ? frame.page() : frame._page;
  const audioResponse = await page.waitForResponse(
    res =>
      res.url().includes('/recaptcha/api2/payload') &&
      res.headers()['content-type']?.includes('audio/mp3'),
    { timeout: 15000 }
  );
  const buffer = await audioResponse.buffer();
  const tmpDir = process.env.LOCAL_SCREENSHOT_DIR || '/tmp/screenshots';
  fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, `audio_${Date.now()}.mp3`);
  fs.writeFileSync(filePath, buffer);
  copyToDocuments(filePath);
  console.log(`[reCAPTCHA] ✅ 音声ファイル保存: ${filePath}`);
  return filePath;
}

module.exports = { downloadAudioFromPage };
