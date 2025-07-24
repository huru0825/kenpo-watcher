// modules/audioDownloader.js

const fs = require('fs');
const path = require('path');

/**
 * reCAPTCHA 音声チャレンジのオーディオをダウンロードし、ローカルファイルに保存する
 * @param {Frame} frame - bframe（音声チャレンジ iframe）の Puppeteer Frame オブジェクト
 * @returns {string} 保存したファイルパス
 */
async function downloadAudioFromPage(frame) {
  console.log('🎧 音声チャレンジの音源を取得中...');

  // ① <audio> 要素が出現するまで待機（最大 20 秒）
  await frame.waitForSelector('audio', { timeout: 20000 });

  // ② audio 要素から URL を取得
  const audioUrl = await frame.evaluate(() => {
    const audio = document.querySelector('audio');
    // <source> があればそちらの src を、なければ audio.src を使う
    const source = audio.querySelector('source');
    return (source && source.src) || audio.src;
  });

  console.log('[debug] audioUrl:', audioUrl);

  // ③ audioUrl を取得したページでナビゲートすることでレスポンスを取得
  const response = await frame.goto(audioUrl);
  const buffer = await response.buffer();

  // ④ 一時ファイルに保存
  const filePath = path.resolve('/tmp', 'audio.mp3');
  fs.writeFileSync(filePath, buffer);

  return filePath;
}

module.exports = { downloadAudioFromPage };
