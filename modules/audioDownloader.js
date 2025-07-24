// modules/audioDownloader.js

const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * reCAPTCHA 音声チャレンジの音源をダウンロードし、ローカルファイルパスを返す
 * @param {import('puppeteer').Frame} frame 音声チャレンジが描画された reCAPTCHA bframe
 * @returns {Promise<string>} ダウンロードした音声ファイルのパス
 */
async function downloadAudioFromPage(frame) {
  console.log('🎧 音声チャレンジの音源を取得中…');

  // 1) ページ内で音声 URL を抜き出し（<audio> または <audio><source>）
  const audioUrl = await frame.evaluate(() => {
    const audio = document.querySelector('audio');
    if (audio && audio.src) return audio.src;
    const source = document.querySelector('audio > source');
    if (source && source.src) return source.src;
    throw new Error('音声チャレンジの音源 URL が取得できませんでした');
  });

  console.log('🎧 ダウンロード開始:', audioUrl);

  // 2) Axios で音声を取得（arraybuffer 指定）
  const response = await axios.get(audioUrl, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data, 'binary');

  // 3) 一時ディレクトリに保存
  const filePath = path.resolve(__dirname, '../tmp/audio.mp3');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
  console.log(`💾 音声ファイル保存: ${filePath}`);

  return filePath;
}

module.exports = { downloadAudioFromPage };
