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
  console.log('[reCAPTCHA] 🎧 音声チャレンジの音源をネットワーク経由でキャッチ中…');
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
  console.log(`[reCAPTCHA] ✅ 音声ファイル保存完了: ${filePath}`);

  return filePath;
}

/**
 * ReCAPTCHA v2（音声チャレンジ）を突破する
 * @param {import('puppeteer').Page} page
 * @returns {Promise<boolean>}
 */
async function solveRecaptcha(page) {
  console.log('[reCAPTCHA] 🔍 frames:', page.frames().map(f => f.url()));

  const anchorHandle = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 20000 }).catch(() => null);
  if (!anchorHandle) {
    console.error('[reCAPTCHA] ❌ anchor iframe element not found');
    return false;
  }
  const checkboxFrame = await anchorHandle.contentFrame();
  if (!checkboxFrame) {
    console.error('[reCAPTCHA] ❌ anchor contentFrame() failed');
    return false;
  }
  console.log('[reCAPTCHA] ✅ reCAPTCHAチェックボックス表示確認OK');

  try {
    await checkboxFrame.waitForSelector('.recaptcha-checkbox-border', { timeout: 10000 });
    console.log('[reCAPTCHA] ▶ reCAPTCHAチェックボックスにチェック試行');
    await checkboxFrame.click('.recaptcha-checkbox-border');
  } catch (e) {
    console.error('[reCAPTCHA] ❌ checkbox click failed', e);
    return false;
  }

  const bframeHandle = await page.waitForSelector('iframe[src*="/recaptcha/api2/bframe"]', { timeout: 20000 }).catch(() => null);
  if (!bframeHandle) {
    console.log('[reCAPTCHA] ✅ reCAPTCHAチェックボックスにチェック表示確認OK（画像認証なし）');
    return true;
  }
  console.log('[reCAPTCHA] ✅ 画像認証ダイアログ表示を確認');

  const challengeFrame = await bframeHandle.contentFrame();
  if (!challengeFrame) {
    console.error('[reCAPTCHA] ❌ bframe contentFrame() failed');
    return false;
  }

  console.log('[reCAPTCHA] ▶ 音声再生切り替えボタン(ヘッドホンボタ)押下試行');
  await challengeFrame.waitForSelector('#recaptcha-audio-button', { timeout: 10000 });
  await challengeFrame.click('#recaptcha-audio-button');
  console.log('[reCAPTCHA] ✅ 音声再生ダイアログ表示確認OK');

  console.log('[reCAPTCHA] ▶ 再生ボタン表示確認中…');
  let retries = 10;
  let playButton;
  while (retries-- > 0) {
    playButton = await challengeFrame.$('.rc-audiochallenge-play-button button');
    if (playButton) break;
    await challengeFrame.waitForTimeout(2000);
  }
  if (!playButton) {
    console.error('[reCAPTCHA] ❌ 再生ボタンが見つかりません');
    return false;
  }
  console.log('[reCAPTCHA] ✅ 再生ボタン表示確認OK');

  await challengeFrame.waitForSelector('#audio-response', { timeout: 5000 });
  console.log('[reCAPTCHA] ✅ 入力欄表示確認OK');

  await challengeFrame.waitForSelector('#recaptcha-verify-button', { timeout: 5000 });
  console.log('[reCAPTCHA] ✅ 確認ボタン表示確認OK');

  console.log('[reCAPTCHA] ▶ 音声再生試行');
  await challengeFrame.waitForSelector('.rc-audiochallenge-play-button button', { timeout: 10000 });
  await challengeFrame.click('.rc-audiochallenge-play-button button');
  console.log('[reCAPTCHA] ✅ 音声再生OK');

  console.log('[reCAPTCHA] ▶ 音声ファイルの保存試行');
  let audioFilePath;
  try {
    audioFilePath = await downloadAudioFromPage(challengeFrame);
  } catch (err) {
    console.error('[reCAPTCHA] ❌ audioDownloader error:', err);
    return false;
  }

  console.log('[reCAPTCHA] ▶ Whisper で文字起こし試行');
  let text;
  try {
    text = await transcribeAudio(audioFilePath);
    console.log('📝 認識結果:', text);
  } catch (err) {
    console.error('[reCAPTCHA] ❌ Whisper transcription failed:', err);
    return false;
  }
  console.log('[reCAPTCHA] ✅ 音声文字変換OK');

  console.log('[reCAPTCHA] ▶ 入力欄にテキスト入力試行');
  await challengeFrame.type('#audio-response', text.trim(), { delay: 100 });
  console.log('[reCAPTCHA] ✅ 入力欄に入力OK');

  const inputValue = await challengeFrame.$eval('#audio-response', el => el.value);
  if (!inputValue) {
    console.error('[reCAPTCHA] ❌ 入力欄に文字が入力されていません');
    return false;
  }
  console.log('[reCAPTCHA] ✅ 入力欄に入力されたことを確認OK');

  console.log('[reCAPTCHA] ▶ 確認ボタン押下試行');
  await challengeFrame.click('#recaptcha-verify-button');
  console.log('[reCAPTCHA] ✅ 確認ボタン押下OK');

  console.log('[reCAPTCHA] ▶ チェック完了判定待機中…');
  await page.waitForTimeout(2000);
  const success = await checkboxFrame.evaluate(() =>
    document.querySelector('#recaptcha-anchor[aria-checked="true"]') !== null
  );
  console.log(success ? '[reCAPTCHA] ✅ チェック表示確認OK' : '[reCAPTCHA] ❌ チェック完了確認NG');

  try { fs.unlinkSync(audioFilePath); } catch {}

  return success;
}

module.exports = {
  downloadAudioFromPage,
  solveRecaptcha
};
