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

  // 1) 公式のダウンロードリンク要素があればそこから
  let audioUrl = await frame
    .$eval('a#audio-download-link', a => a.href)
    .catch(() => null);

  // 2) なければ <audio><source> を試す
  if (!audioUrl) {
    console.debug('[debug] ダウンロードリンク見えず → <audio><source> から取得を試行');
    audioUrl = await frame
      .$eval('audio > source', el => el.src)
      .catch(() => null);
  }

  // 3) それでもなければ <audio> タグの src を取得
  if (!audioUrl) {
    console.debug('[debug] <audio><source> も見えず → <audio> タグから src を試行');
    audioUrl = await frame
      .$eval('audio', el => el.src)
      .catch(() => null);
  }

  if (!audioUrl) {
    throw new Error('音声チャレンジの音源 URL が取得できませんでした');
  }

  // ローカル保存先を生成
  const tmpDir = path.resolve(__dirname, '../tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const fileName = `audio_${Date.now()}.mp3`;
  const filePath = path.join(tmpDir, fileName);

  // バイナリ取得＆ファイル書き込み
  const res = await axios.get(audioUrl, { responseType: 'arraybuffer' });
  fs.writeFileSync(filePath, res.data);
  console.log(`🎧 音声ファイルを保存しました: ${filePath}`);

  return filePath;
}

module.exports = { downloadAudioFromPage };
