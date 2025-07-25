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
  if (!anchorHandle) return false;
  const checkboxFrame = await anchorHandle.contentFrame();
  if (!checkboxFrame) return false;
  console.log('[reCAPTCHA] ✅ reCAPTCHAチェックボックス表示確認OK');

  try {
    await checkboxFrame.waitForSelector('.recaptcha-checkbox-border', { timeout: 10000 });
    await checkboxFrame.click('.recaptcha-checkbox-border');
    console.log('[reCAPTCHA] ▶ チェックボックスクリック');
  } catch {
    return false;
  }

  const bframeHandle = await page.waitForSelector('iframe[src*="/recaptcha/api2/bframe"]', { timeout: 20000 }).catch(() => null);
  if (!bframeHandle) return true;
  console.log('[reCAPTCHA] ✅ 画像認証ダイアログ表示確認');

  const challengeFrame = await bframeHandle.contentFrame();
  if (!challengeFrame) return false;

  await challengeFrame.waitForSelector('#recaptcha-audio-button', { timeout: 10000 });
  await challengeFrame.click('#recaptcha-audio-button');
  console.log('[reCAPTCHA] ✅ 音声再生ダイアログ表示確認OK');

  const playButtonSelector = '.rc-audiochallenge-play-button button';
  console.log('[reCAPTCHA] ▶ 再生ボタン表示確認中（状態ログあり）');

  let retries = 10;
  let playButton = null;
  while (retries-- > 0) {
    const state = await challengeFrame.evaluate(selector => {
      const el = document.querySelector(selector);
      if (!el) return 'NOT_FOUND';
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return 'HIDDEN';
      return 'VISIBLE';
    }, playButtonSelector);
    console.log(`[reCAPTCHA] ▶ 再生ボタン状態: ${state}（残りリトライ: ${retries}）`);
    if (state === 'VISIBLE') {
      playButton = await challengeFrame.$(playButtonSelector);
      break;
    }
    await challengeFrame.waitForTimeout(2000);
  }

  if (!playButton) {
    console.warn('[reCAPTCHA] ⚠️ セレクタ緩和による再生ボタン探索を試行');
    const candidates = await challengeFrame.$$('button');
    for (const btn of candidates) {
      const label = await challengeFrame.evaluate(el => el.textContent.trim(), btn);
      if (label === '再生') {
        playButton = btn;
        console.log('[reCAPTCHA] ✅ セレクタ緩和成功: innerText一致ボタンを検出');
        break;
      }
    }
  }

  if (!playButton) {
    console.error('[reCAPTCHA] ❌ 再生ボタンが見つかりません（通常＋緩和両方失敗）');
    return false;
  }

  await challengeFrame.waitForSelector('#audio-response', { timeout: 5000 });
  await challengeFrame.waitForSelector('#recaptcha-verify-button', { timeout: 5000 });

  await playButton.click();
  console.log('[reCAPTCHA] ✅ 音声再生OK');

  let audioFilePath;
  try {
    audioFilePath = await downloadAudioFromPage(challengeFrame);
  } catch (err) {
    console.error('[reCAPTCHA] ❌ 音声ファイルダウンロード失敗:', err);
    return false;
  }

  let text;
  try {
    text = await transcribeAudio(audioFilePath);
    console.log('📝 認識結果:', text);
  } catch (err) {
    console.error('[reCAPTCHA] ❌ Whisper transcription failed:', err);
    return false;
  }

  await challengeFrame.type('#audio-response', text.trim(), { delay: 100 });
  const inputValue = await challengeFrame.$eval('#audio-response', el => el.value);
  if (!inputValue) return false;

  await challengeFrame.click('#recaptcha-verify-button');
  console.log('[reCAPTCHA] ✅ 確認ボタン押下');

  await page.waitForTimeout(2000);
  const success = await checkboxFrame.evaluate(() =>
    document.querySelector('#recaptcha-anchor[aria-checked="true"]') !== null
  );

  try { fs.unlinkSync(audioFilePath); } catch {}

  return success;
}

module.exports = {
  downloadAudioFromPage,
  solveRecaptcha
};
