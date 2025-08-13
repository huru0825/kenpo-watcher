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

  // 親ページ取得を安全に
  const page = frame._frameManager?.page() || frame._page;
  if (!page || typeof page.waitForResponse !== 'function') {
    throw new Error('[audioDownloader] ❌ pageオブジェクト取得に失敗');
  }

  const tmpDir = process.env.LOCAL_SCREENSHOT_DIR || '/tmp/screenshots';
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const audioResponsePromise = page.waitForResponse(
      res =>
        res.url().includes('/recaptcha/api2/payload') &&
        res.headers()['content-type']?.includes('audio/mp3'),
      { timeout: 15000 }
    );

    await frame.evaluate(() => {
      const btn = document.querySelector('.rc-audiochallenge-tdownload-link');
      if (btn) btn.click();
    });

    const audioResponse = await audioResponsePromise;
    const buffer = await audioResponse.buffer();

    const filePath = path.join(tmpDir, `audio_${Date.now()}.mp3`);
    fs.writeFileSync(filePath, buffer);
    copyToDocuments(filePath);
    console.log(`[reCAPTCHA] ✅ 音声ファイル保存: ${filePath}`);
    return filePath;
  } catch (err) {
    console.warn('[reCAPTCHA] ❌ 音声取得失敗:', err.message);
    throw err;
  }
}

module.exports = { downloadAudioFromPage };
