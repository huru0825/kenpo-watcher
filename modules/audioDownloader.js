const fs = require('fs');
const path = require('path');

/**
 * reCAPTCHA 音声チャレンジの音源を
 * ネットワークリスナー経由でキャッチしてダウンロード
 * @param {import('puppeteer').Frame} frame 音声チャレンジが描画された reCAPTCHA bframe
 * @returns {Promise<string>} ダウンロードした音声ファイルのパス
 */
async function downloadAudioFromPage(frame) {
  console.log('🎧 音声チャレンジの音源をネットワーク経由でキャッチ中…');

  // Puppeteer v14+ 公式 API: frame.page()
  const page = frame.page ? frame.page() : frame._page;

  // (1) 音声リクエストを待ち受け（payload エンドポイント＋media）
  const audioResponse = page.waitForResponse(response =>
    response.url().includes('/recaptcha/api2/payload') &&
    response.request().resourceType() === 'media' &&
    response.headers()['content-type']?.startsWith('audio'),
    { timeout: 20000 }
  );

  // （呼び出し元で audioBtn.click() など済ませている前提）
  const response = await audioResponse;
  const buffer = await response.buffer();

  // (2) tmp/ にファイル保存
  const tmpDir = path.resolve(__dirname, '../tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, `audio_${Date.now()}.mp3`);
  fs.writeFileSync(filePath, buffer);
  console.log(`💾 ネットワーク経由で音声ファイル保存: ${filePath}`);

  return filePath;
}

module.exports = { downloadAudioFromPage };
