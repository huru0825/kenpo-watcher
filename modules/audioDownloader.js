const fs = require('fs');
const axios = require('axios');
const path = '/tmp/audio.mp3';

/**
 * reCAPTCHAの音声チャレンジ音源を保存。
 * 既に保存済みの場合は再利用する。
 * @param {import('puppeteer').Page} page 
 * @returns {Promise<string>} 保存先のファイルパス
 */
async function downloadAudioFromPage(page) {
  if (fs.existsSync(path)) {
    console.log('✅ 音声ファイルが既に存在 → キャッシュ再利用: /tmp/audio.mp3');
    return path;
  }

  console.log('🎧 音声チャレンジの音源を取得中...');
  const audioSrc = await page.$eval('audio > source', el => el.src);
  if (!audioSrc) throw new Error('音声チャレンジの audio ソースが取得できませんでした');

  const response = await axios.get(audioSrc, { responseType: 'stream' });
  const writer = fs.createWriteStream(path);

  await new Promise((resolve, reject) => {
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  console.log('💾 音声ファイルを保存完了: /tmp/audio.mp3');
  return path;
}

module.exports = { downloadAudioFromPage };
