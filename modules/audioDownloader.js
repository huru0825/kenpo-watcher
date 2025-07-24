// modules/audioDownloader.js

const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function downloadAudioFromPage(frame) {
  console.log('🎧 音声チャレンジの音源を取得中…');

  // 1) フレーム内で <audio> または <audio><source> の src を一発取得
  const audioUrl = await frame.evaluate(() => {
    const audio = document.querySelector('audio');
    if (audio?.src) return audio.src;
    const source = document.querySelector('audio > source');
    if (source?.src) return source.src;
    throw new Error('音声チャレンジの音源 URL が取得できませんでした');
  });

  console.log('🎧 ダウンロード開始:', audioUrl);

  // 2) Axios でバイナリ取得
  const response = await axios.get(audioUrl, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(response.data);

  // 3) tmp/ にファイル保存
  const tmpDir = path.resolve(__dirname, '../tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, `audio_${Date.now()}.mp3`);
  fs.writeFileSync(filePath, buffer);
  console.log(`💾 音声ファイル保存: ${filePath}`);

  return filePath;
}

module.exports = { downloadAudioFromPage };
