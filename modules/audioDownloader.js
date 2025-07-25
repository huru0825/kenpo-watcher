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

  const audioResponse = await page.waitForResponse(
    res =>
      res.url().includes('/recaptcha/api2/payload') &&
      res.headers()['content-type']?.includes('audio/mp3'),
    { timeout: 10000 }
  );
  const audioBuffer = await audioResponse.buffer();

  const tmpDir = path.resolve(__dirname, '../tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, `audio_${Date.now()}.mp3`);
  fs.writeFileSync(filePath, audioBuffer);
  console.log(`✅ 音声ファイル保存完了: ${filePath}`);

  return filePath;
}

/**
 * ReCAPTCHA v2（音声チャレンジ）を突破する
 * @param {import('puppeteer').Page} page
 * @returns {Promise<boolean>}
 */
async function solveRecaptcha(page) {
  console.log('🔍 frames:', page.frames().map(f => f.url()));

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

  try {
    await checkboxFrame.waitForSelector('.recaptcha-checkbox-border', { timeout: 10000 });
    await checkboxFrame.click('.recaptcha-checkbox-border');
  } catch (e) {
    console.error('❌ checkbox click failed', e);
    return false;
  }

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

  await challengeFrame.waitForSelector('#recaptcha-audio-button', { timeout: 10000 });
  await challengeFrame.click('#recaptcha-audio-button');

  // ④ 再生ボタンが表示されるまで最大20秒、2秒ごとにリトライ
  let retries = 10;
  let playButton;
  while (retries-- > 0) {
    playButton = await challengeFrame.$('.rc-audiochallenge-play-button');
    if (playButton) break;
    await challengeFrame.waitForTimeout(2000);
  }
  if (!playButton) {
    console.error('❌ 再生ボタンが見つかりません');
    return false;
  }

  // ⑤ 再生ボタンの中の button を直接対象にする
  await challengeFrame.waitForSelector('.rc-audiochallenge-play-button button', { timeout: 10000 });
  await challengeFrame.click('.rc-audiochallenge-play-button button');

  // ⑥ 音声リクエストを取得
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
    console.log('📝 認識結果:', text);
  } catch (err) {
    console.error('Whisper transcription failed:', err);
    return false;
  }

  // ⑧ 入力欄に文字起こし結果を入力
  await challengeFrame.waitForSelector('#audio-response', { timeout: 5000 });
  await challengeFrame.type('#audio-response', text.trim(), { delay: 100 });

  // ⑨ 「確認」ボタンをクリック
  await challengeFrame.waitForSelector('#recaptcha-verify-button', { timeout: 5000 });
  await challengeFrame.click('#recaptcha-verify-button');
  console.log('✅ 確認ボタン押下完了');

  // ⑩ 判定反映待ち & 成功チェック
  await page.waitForTimeout(2000);
  const success = await checkboxFrame.evaluate(() =>
    document.querySelector('#recaptcha-anchor[aria-checked="true"]') !== null
  );
  console.log(success ? '🎉 CAPTCHA突破成功' : '❌ CAPTCHA突破失敗');

  // ⑪ 一時ファイル削除
  try { fs.unlinkSync(audioFilePath); } catch {}

  return success;
}

module.exports = {
  downloadAudioFromPage,
  solveRecaptcha
};
