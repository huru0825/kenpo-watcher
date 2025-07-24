// modules/audioDownloader.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function downloadAudioFromPage(frame) {
  console.log('🎧 音声チャレンジの音源を取得中…');

  // ① audio要素かダウンロードリンクの出現を待つ（最大20秒）
  try {
    await frame.waitForSelector('.rc-audiochallenge-tdownload-link, #audio-source, audio', { timeout: 20000 });
  } catch {
    console.warn('⚠️ 音声チャレンジコントロールの出現をタイムアウト');
  }

  // ② フレーム内 evaluate で URL を一発取得
  const audioUrl = await frame.evaluate(() => {
    // 公式ダウンロードリンク（クラス名は reCAPTCHA v2 の実装依存）
    const dl = document.querySelector('.rc-audiochallenge-tdownload-link');
    if (dl?.href) return dl.href;
    // ID付きオーディオ要素
    const srcAudio = document.querySelector('#audio-source');
    if (srcAudio?.src) return srcAudio.src;
    // 標準 audio 要素
    const audio = document.querySelector('audio');
    if (audio?.src) return audio.src;
    // audio>source
    const source = document.querySelector('audio > source');
    if (source?.src) return source.src;
    throw new Error('音声チャレンジの音源 URL が取得できませんでした');
  });

  console.log('🎧 ダウンロード開始:', audioUrl);

  // ③ Axios でバイナリ取得
  const res = await axios.get(audioUrl, { responseType: 'arraybuffer' });
  const buffer = Buffer.from(res.data);

  // ④ tmp/ に一時ファイル保存
  const tmpDir = path.resolve(__dirname, '../tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, `audio_${Date.now()}.mp3`);
  fs.writeFileSync(filePath, buffer);
  console.log(`💾 音声ファイル保存: ${filePath}`);

  return filePath;
}

module.exports = { downloadAudioFromPage };
