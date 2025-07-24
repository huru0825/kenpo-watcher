// modules/audioDownloader.js
const fs = require('fs');
const path = require('path');
const { downloadAudioFromPage } = module.exports; // 自己参照
const { transcribeAudio } = require('./whisper');

/**
 * reCAPTCHA 音声チャレンジの音源を
 * ネットワークリスナー経由でキャッチしてダウンロード
 * @param {import('puppeteer').Frame} frame
 * @returns {Promise<string>}
 */
async function downloadAudioFromPage(frame) {
  console.log('🎧 音声チャレンジの音源をネットワーク経由でキャッチ中…');
  const page = frame.page ? frame.page() : frame._page;

  const audioResponse = page.waitForResponse(response =>
    response.url().includes('/recaptcha/api2/payload') &&
    response.request().resourceType() === 'media' &&
    response.headers()['content-type']?.startsWith('audio'),
    { timeout: 20000 }
  );
  const response = await audioResponse;
  const buffer = await response.buffer();

  const tmpDir = path.resolve(__dirname, '../tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, `audio_${Date.now()}.mp3`);
  fs.writeFileSync(filePath, buffer);
  console.log(`💾 ネットワーク経由で音声ファイル保存: ${filePath}`);

  return filePath;
}

/**
 * ReCAPTCHA v2（音声チャレンジ）を突破する
 * @param {import('puppeteer').Page} page
 * @returns {Promise<boolean>}
 */
async function solveRecaptcha(page) {
  // ① チェックボックス iframe 取得＆クリック
  const checkboxFrame = page.frames().find(f => f.url().includes('api2/anchor'));
  if (!checkboxFrame) return false;
  await checkboxFrame.waitForSelector('#recaptcha-anchor', { timeout: 5000 });
  await checkboxFrame.click('#recaptcha-anchor');

  // ② bframe 取得
  const challengeFrame = page.frames().find(f => f.url().includes('api2/bframe'));
  if (!challengeFrame) return false;
  await challengeFrame.waitForTimeout(1000);

  // ③ 音声チャレンジ再生ボタンをクリック
  await challengeFrame.waitForSelector('.rc-audiochallenge-play-button', { timeout: 5000 });
  await challengeFrame.click('.rc-audiochallenge-play-button');

  // ④ 音声ファイルを取得
  let audioFilePath;
  try {
    audioFilePath = await downloadAudioFromPage(challengeFrame);
  } catch (err) {
    console.error('audioDownloader error:', err);
    return false;
  }

  // ⑤ Whisper で文字起こし
  let text;
  try {
    text = await transcribeAudio(audioFilePath);
  } catch (err) {
    console.error('Whisper transcription failed:', err);
    return false;
  }

  // ⑥ テキスト入力＆検証
  await challengeFrame.waitForSelector('#audio-response', { timeout: 5000 });
  await challengeFrame.type('#audio-response', text.trim(), { delay: 50 });
  await challengeFrame.waitForSelector('#recaptcha-verify-button', { timeout: 5000 });
  await challengeFrame.click('#recaptcha-verify-button');

  // ⑦ 成功判定
  await page.waitForTimeout(2000);
  const success = await checkboxFrame.evaluate(() =>
    document.querySelector('#recaptcha-anchor[aria-checked="true"]') !== null
  );

  // ⑧ 一時ファイル削除
  try { fs.unlinkSync(audioFilePath); } catch {}

  return success;
}

module.exports = {
  downloadAudioFromPage,
  solveRecaptcha
};
