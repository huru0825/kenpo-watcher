// modules/audioDownloader.js
const fs = require('fs');
const path = require('path');
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

  const audioResponse = page.waitForResponse(
    response =>
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
  // デバッグ: 現在ロードされているフレーム一覧を出力
  console.log('🔍 frames:', page.frames().map(f => f.url()));

  // ① anchor iframe 要素を DOM から取得
  const anchorHandle = await page.waitForSelector(
    'iframe[src*="/recaptcha/api2/anchor"]',
    { timeout: 20000 }
  ).catch(() => null);
  if (!anchorHandle) {
    console.error('❌ anchor iframe element not found');
    return false;
  }
  const checkboxFrame = await anchorHandle.contentFrame();
  if (!checkboxFrame) {
    console.error('❌ anchor contentFrame() failed');
    return false;
  }
  console.log('✅ anchor frame obtained');

  // ② チェックボックスをクリック
  try {
    // セレクターを .recaptcha-checkbox-border に変更
    await checkboxFrame.waitForSelector('.recaptcha-checkbox-border', { timeout: 10000 });
    await checkboxFrame.click('.recaptcha-checkbox-border');
  } catch (e) {
    console.error('❌ checkbox click failed', e);
    return false;
  }

  // ③ bframe iframe 要素を DOM から取得
  const bframeHandle = await page.waitForSelector(
    'iframe[src*="/recaptcha/api2/bframe"]',
    { timeout: 20000 }
  ).catch(() => null);
  if (!bframeHandle) {
    console.error('❌ bframe iframe element not found');
    return false;
  }
  const challengeFrame = await bframeHandle.contentFrame();
  if (!challengeFrame) {
    console.error('❌ bframe contentFrame() failed');
    return false;
  }
  console.log('✅ bframe frame obtained');

  // ④ 音声チャレンジモードボタンをクリック
  await challengeFrame.waitForSelector('#recaptcha-audio-button', { timeout: 10000 });
  await challengeFrame.click('#recaptcha-audio-button');

  // ⑤ 再生ボタンをクリックして音声を取得
  await challengeFrame.waitForSelector('.rc-audiochallenge-play-button', { timeout: 10000 });
  await challengeFrame.click('.rc-audiochallenge-play-button');

  // ⑥ 音声ファイルを取得
  let audioFilePath;
  try {
    audioFilePath = await downloadAudioFromPage(challengeFrame);
  } catch (err) {
    console.error('audioDownloader error:', err);
    return false;
  }

  // ⑦ Whisper で文字起こし
  let text;
  try {
    text = await transcribeAudio(audioFilePath);
  } catch (err) {
    console.error('Whisper transcription failed:', err);
    return false;
  }

  // ⑧ テキスト入力＆検証
  await challengeFrame.waitForSelector('#audio-response', { timeout: 10000 });
  await challengeFrame.type('#audio-response', text.trim(), { delay: 50 });
  await challengeFrame.waitForSelector('#recaptcha-verify-button', { timeout: 10000 });
  await challengeFrame.click('#recaptcha-verify-button');

  // ⑨ 成功判定
  await page.waitForTimeout(2000);
  const success = await checkboxFrame.evaluate(() =>
    document.querySelector('#recaptcha-anchor[aria-checked="true"]') !== null
  );

  // ⑩ 一時ファイル削除
  try { fs.unlinkSync(audioFilePath); } catch {}

  return success;
}

module.exports = {
  downloadAudioFromPage,
  solveRecaptcha
};
