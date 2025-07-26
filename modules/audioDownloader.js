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
  console.log('[reCAPTCHA] 🔍 frames:', page.frames().map(f => f.url()));

  // 1. チェックボックス
  const anchorHandle = await page
    .waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 20000 })
    .catch(() => null);
  if (!anchorHandle) return false;
  const checkboxFrame = await anchorHandle.contentFrame();
  console.log('[reCAPTCHA] ✅ reCAPTCHAチェックボックス表示確認OK');
  console.log('[reCAPTCHA] ▶ チェックボックスクリックを試行');
  try {
    await checkboxFrame.click('.recaptcha-checkbox-border');
    console.log('[reCAPTCHA] ✅ チェックボックスクリック成功');
  } catch {
    console.error('[reCAPTCHA] ❌ チェックボックスクリック失敗');
    return false;
  }

  // 2. 画像認証UI
  console.log('[reCAPTCHA] 🔍 画像認証UIを確認');
  const bframeHandle = await page
    .waitForSelector('iframe[src*="/recaptcha/api2/bframe"]', { timeout: 20000 })
    .catch(() => null);
  if (!bframeHandle) {
    console.log('[reCAPTCHA] ❌ 画像認証UI表示確認NG');
    return true;
  }
  console.log('[reCAPTCHA] ✅ 画像認証UI表示確認OK');
  const challengeFrame = await bframeHandle.contentFrame();

  // （旧UIデバッグは省略して座標方式に特化）

  // 3. ヘッドホンアイコンの座標取得＆クリック
  console.log('[reCAPTCHA] 🔍 音声切替ボタンを確認');
  const audioBtn = await challengeFrame.$('#recaptcha-audio-button');
  if (!audioBtn) {
    console.error('[reCAPTCHA] ❌ 音声切替ボタン表示確認NG');
    return false;
  }
  console.log('[reCAPTCHA] ✅ 音声切替ボタン表示確認OK');

  const box = await audioBtn.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  console.log('[reCAPTCHA] ▶ 座標方式でヘッドホンアイコンをクリックを試行');
  await page.mouse.click(x, y);
  console.log('[reCAPTCHA] ✅ 座標方式でヘッドホンアイコンをクリック成功');

  // 4. 音声チャレンジUI
  console.log('[reCAPTCHA] 🔍 音声チャレンジUIを確認');
  try {
    await challengeFrame.waitForSelector('#audio-response', { timeout: 10000 });
    console.log('[reCAPTCHA] ✅ 音声チャレンジUI表示確認OK');
  } catch {
    console.error('[reCAPTCHA] ❌ 音声チャレンジUI表示確認NG');
    return false;
  }

  // スクショ撮影
  const tmpDir = path.resolve(__dirname, '../tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const shot = path.join(tmpDir, `audio-challenge-${Date.now()}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  console.log(`[reCAPTCHA] 🎥 音声チャレンジ画面スクショ: tmp/${path.basename(shot)}`);

  // 5. 音声ダウンロード以降は既存ロジック
  console.log('[reCAPTCHA] ▶ 音声ファイルダウンロードを試行');
  let audioFilePath;
  try {
    audioFilePath = await downloadAudioFromPage(challengeFrame);
    console.log('[reCAPTCHA] ✅ 音声ファイルダウンロード成功');
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
  await challengeFrame.click('#recaptcha-verify-button');
  console.log('[reCAPTCHA] ✅ 確認ボタン押下');

  await page.waitForTimeout(2000);
  const success = await checkboxFrame.evaluate(
    () => document.querySelector('#recaptcha-anchor[aria-checked="true"]') !== null
  );

  try { fs.unlinkSync(audioFilePath); } catch {}
  return success;
}

module.exports = {
  downloadAudioFromPage,
  solveRecaptcha
};
