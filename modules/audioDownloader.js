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

async function downloadAudioFromPage(page, triggerFrame) {
  console.log('[reCAPTCHA] 🎧 音声チャレンジの音源をキャッチ中...');

  if (!page || typeof page.waitForResponse !== 'function') {
    throw new Error('[audioDownloader] ❌ Invalid Page object');
  }

  const tmpDir = process.env.LOCAL_SCREENSHOT_DIR || '/tmp/screenshots';
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // 先にクリックトリガー
    await triggerFrame.evaluate(() => {
      const btn = document.querySelector('.rc-audiochallenge-tdownload-link');
      if (btn) btn.click();
    });

    const audioResponse = await page.waitForResponse(
      res =>
        res.url().includes('/recaptcha/api2/payload') &&
        /audio/.test(res.headers()['content-type']),
      { timeout: 15000 }
    );

    const buffer = await audioResponse.buffer();
    const filePath = path.join(tmpDir, `audio_${Date.now()}.mp3`);
    fs.writeFileSync(filePath, buffer);
    copyToDocuments(filePath);
    console.log(`[reCAPTCHA] ✅ 音声ファイル保存: ${filePath}`);
    return filePath;
  } catch (err) {
    console.warn('[reCAPTCHA] ❌ 音声取得失敗:', err.message);
    return null; // クラッシュ回避で null返し
  }
}

module.exports = { downloadAudioFromPage };
