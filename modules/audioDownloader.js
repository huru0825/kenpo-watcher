// modules/audioDownloader.js
const fs = require('fs');
const path = require('path');

/**
 * reCAPTCHA 音声チャレンジの音源を
 * XHR／MediaStream 経由でもキャッチできるように
 * ネットワークリスナーを使ってダウンロード
 */
async function downloadAudioFromPage(frame) {
  console.log('🎧 音声チャレンジの音源をネットワーク経由でキャッチ中…');

  // Puppeteer のページオブジェクトを取得
  const page = frame._page;  // internal api, Puppeteer v14+なら frame.page()

  // ネットワークレスポンス待ちの Promise をセットアップ
  const audioResponse = page.waitForResponse(response =>
    response.url().includes('/recaptcha/api2/payload') &&
    response.request().resourceType() === 'media' &&
    response.headers()['content-type']?.startsWith('audio'),
    { timeout: 20000 }
  );

  // 既存の「音声チャレンジ切替」クリック等はそのまま
  // （省略: findAudioButton→audioBtn.click()→transcribe など）

  // ここで audioResponse が解決され、実際のバイナリを取得
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
