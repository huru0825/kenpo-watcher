// modules/audioDownloader.js

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

  // Puppeteer のページオブジェクトを取得
  // Puppeteer v14 以降は frame.page() が公式API
  const page = frame.page ? frame.page() : frame._page;

  // 音声リクエストを待ち受け（payload エンドポイント＋media リソース）
  const audioResponse = page.waitForResponse(response =>
    response.url().includes('/recaptcha/api2/payload') &&
    response.request().resourceType() === 'media' &&
    response.headers()['content-type']?.startsWith('audio'),
    { timeout: 20000 }
  );

  // ここでは既存の「音声モード切替」クリックが済んでいる前提です
  // （呼び出し元で findAudioButton → audioBtn.click() を行ってください）

  // ネットワークから返ってきた音声バイナリを取得
  const response = await audioResponse;
  const buffer = await response.buffer();

  // tmp/ にファイル保存
  const tmpDir = path.resolve(__dirname, '../tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, `audio_${Date.now()}.mp3`);
  fs.writeFileSync(filePath, buffer);
  console.log(`💾 ネットワーク経由で音声ファイル保存: ${filePath}`);

  return filePath;
}

module.exports = { downloadAudioFromPage };
