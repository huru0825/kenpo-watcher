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

  // ① ダウンロードリンクが出るまで待機（最大20秒）
  const linkSelector = 'a.rc-audiochallenge-tdownload-link';
  let audioUrl;
  try {
    await frame.waitForSelector(linkSelector, { timeout: 20000 });
    audioUrl = await frame.$eval(linkSelector, el => el.href);
    console.log('[debug] ダウンロードリンク検出:', audioUrl);
  } catch {
    console.log('[debug] ダウンロードリンク見えず → <audio> から取得を試行');

    // ② <audio> 要素が出現するまで待機（最大20秒）
    await frame.waitForSelector('audio', { timeout: 20000 });

    // ③ audio 要素から URL を取得（<source> or audio.src）
    audioUrl = await frame.evaluate(() => {
      const audio = document.querySelector('audio');
      const source = audio.querySelector('source');
      return (source && source.src) || audio.src;
    });
    console.log('[debug] audio 要素から取得:', audioUrl);
  }

  // ④ URL へナビゲートしてバイナリを取得
  const response = await frame.goto(audioUrl);
  const buffer = await response.buffer();

  // ⑤ 一時ファイルに保存
  const filePath = path.resolve('/tmp', 'audio.mp3');
  fs.writeFileSync(filePath, buffer);
  console.log('[debug] audio.mp3 に保存');

  return filePath;
}

module.exports = { downloadAudioFromPage };
