// audioDownloader.js
const fs = require('fs');
const path = require('path');
const { transcribeAudio } = require('./whisper');

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

async function solveRecaptcha(page) {
  // 1. 全フレーム URL をログ出力
  console.log('[reCAPTCHA] 🔍 frames:', page.frames().map(f => f.url()));

  // 2. チェックボックス iframe 抽出
  const anchorHandle = await page
    .waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 20000 })
    .catch(() => null);
  if (!anchorHandle) return false;
  const checkboxFrame = await anchorHandle.contentFrame();
  if (!checkboxFrame) return false;
  console.log('[reCAPTCHA] ✅ reCAPTCHAチェックボックス表示確認OK');

  // 3. チェックボックスクリック
  console.log('[reCAPTCHA] ▶ チェックボックスクリックを試行');
  try {
    await checkboxFrame.waitForSelector('.recaptcha-checkbox-border', { timeout: 10000 });
    await checkboxFrame.click('.recaptcha-checkbox-border');
    console.log('[reCAPTCHA] ✅ チェックボックスクリック成功');
  } catch {
    console.error('[reCAPTCHA] ❌ チェックボックスクリック失敗');
    return false;
  }

  // 4. 画像認証UIの確認（元のロジックに戻す）
  console.log('[reCAPTCHA] 🔍 画像認証UIを確認');
  const bframeHandle = await page
    .waitForSelector('iframe[src*="/recaptcha/api2/bframe"]:not([src=""])', { timeout: 20000 })
    .catch(() => null);
  if (!bframeHandle) {
    console.log('[reCAPTCHA] ❌ 画像認証UI表示確認NG — スキップ');
    return true; // 画像チャレンジなしでOK
  }
  console.log('[reCAPTCHA] ✅ 画像認証UI表示確認OK');

  const challengeFrame = await bframeHandle.contentFrame();
  if (!challengeFrame) return false;

  // --- デバッグ: 画像認証画面スクショ ---
  const debugDir = path.resolve(__dirname, '../tmp');
  fs.mkdirSync(debugDir, { recursive: true });
  const debugShot1 = path.join(debugDir, `challenge-debug-${Date.now()}.png`);
  await page.screenshot({ path: debugShot1, fullPage: true });
  console.log(`[reCAPTCHA] 🖼️ 画像認証画面スクショ: tmp/${path.basename(debugShot1)}`);

  // 5. 少し待機して、iframe内部で直接再生ボタンをクリック
  await page.waitForTimeout(1500);
  console.log('[reCAPTCHA] ▶ 音声切替ボタンを iframe 内で直接クリックを試行');
  try {
    await challengeFrame.waitForSelector('#recaptcha-audio-button', { timeout: 10000 });
    await challengeFrame.click('#recaptcha-audio-button');
    console.log('[reCAPTCHA] ✅ 音声切替ボタンクリック成功');
  } catch {
    console.error('[reCAPTCHA] ❌ 音声切替ボタンクリック失敗');
    return false;
  }

  // 6. 余裕をもって待機し、音声チャレンジUIの確認
  console.log('[reCAPTCHA] 🔍 音声チャレンジUIを確認');
  await page.waitForTimeout(1500);
  try {
    await challengeFrame.waitForSelector('#audio-response', { timeout: 10000 });
    console.log('[reCAPTCHA] ✅ 音声チャレンジUI表示確認OK');
  } catch {
    console.error('[reCAPTCHA] ❌ 音声チャレンジUI表示確認NG');
    return false;
  }

  // スクショ：音声チャレンジ画面
  const debugShot2 = path.join(debugDir, `audio-challenge-${Date.now()}.png`);
  await page.screenshot({ path: debugShot2, fullPage: true });
  console.log(`[reCAPTCHA] 🎥 音声チャレンジ画面スクショ: tmp/${path.basename(debugShot2)}`);

  // 以下、まだ未到達なので省略…
  return false;
}

module.exports = {
  downloadAudioFromPage,
  solveRecaptcha
};
