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
  // 1. 全フレーム URL をログ出力して正しい iframe を探す
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

  // 4. 画像認証UIの確認
  console.log('[reCAPTCHA] 🔍 画像認証UIを確認');
  const bframeHandle = await page
    .waitForSelector('iframe[src*="/recaptcha/api2/bframe"]', { timeout: 20000 })
    .catch(() => null);
  console.log(bframeHandle
    ? '[reCAPTCHA] ✅ 画像認証UI表示確認OK'
    : '[reCAPTCHA] ❌ 画像認証UI表示確認NG');
  if (!bframeHandle) return true;
  const challengeFrame = await bframeHandle.contentFrame();
  if (!challengeFrame) return false;

  // スクショ：画像認証画面
  const debugDir = path.resolve(__dirname, '../tmp');
  fs.mkdirSync(debugDir, { recursive: true });
  const shot1 = path.join(debugDir, `challenge-debug-${Date.now()}.png`);
  await page.screenshot({ path: shot1, fullPage: true });
  console.log(`[reCAPTCHA] 🎥 画像認証画面スクショ: tmp/${path.basename(shot1)}`);

  // 5. 音声切替ボタンの確認
  console.log('[reCAPTCHA] 🔍 音声切替ボタンを確認');
  let playButton = await challengeFrame.$('#recaptcha-audio-button')
    || await challengeFrame.$('button[aria-label="Play audio challenge"]');
  console.log(playButton
    ? '[reCAPTCHA] ✅ 音声切替ボタン表示確認OK'
    : '[reCAPTCHA] ❌ 音声切替ボタン表示確認NG');
  if (!playButton) return false;

  // 6. 座標方式で音声切替ボタンをクリック
  console.log('[reCAPTCHA] ▶ 音声切替ボタンクリックを試行 (boundingBox)');
  const box = await playButton.boundingBox();
  if (!box) {
    console.error('[reCAPTCHA] ❌ ボタン座標取得失敗');
    return false;
  }
  // フレームをまたいでも正しくクリックするために page.mouse を使用
  await page.mouse.click(
    box.x + box.width / 2,
    box.y + box.height / 2
  );
  console.log('[reCAPTCHA] ✅ 音声切替ボタンクリック成功');

  // 7. 音声チャレンジUIの確認
  console.log('[reCAPTCHA] 🔍 音声チャレンジUIを確認');
  try {
    await challengeFrame.waitForSelector('#audio-response', { timeout: 10000 });
    console.log('[reCAPTCHA] ✅ 音声チャレンジUI表示確認OK');
  } catch {
    console.error('[reCAPTCHA] ❌ 音声チャレンジUI表示確認NG');
    return false;
  }

  // スクショ：音声チャレンジ画面
  const shot2 = path.join(debugDir, `audio-challenge-${Date.now()}.png`);
  await page.screenshot({ path: shot2, fullPage: true });
  console.log(`[reCAPTCHA] 🎥 音声チャレンジ画面スクショ: tmp/${path.basename(shot2)}`);

  // 8. 音声ファイルダウンロードを試行
  console.log('[reCAPTCHA] ▶ 音声ファイルダウンロードを試行');
  let audioFilePath;
  try {
    audioFilePath = await downloadAudioFromPage(challengeFrame);
    console.log('[reCAPTCHA] ✅ 音声ファイルダウンロード成功');
  } catch (err) {
    console.error('[reCAPTCHA] ❌ 音声ファイルダウンロード失敗:', err);
    return false;
  }

  // 9. Whisper で文字起こし
  let text;
  try {
    text = await transcribeAudio(audioFilePath);
    console.log('📝 認識結果:', text);
  } catch (err) {
    console.error('[reCAPTCHA] ❌ Whisper transcription failed:', err);
    return false;
  }

  // 10. テキスト入力＆検証
  await challengeFrame.type('#audio-response', text.trim(), { delay: 100 });
  const inputValue = await challengeFrame.$eval('#audio-response', el => el.value);
  if (!inputValue) return false;

  await challengeFrame.click('#recaptcha-verify-button');
  console.log('[reCAPTCHA] ✅ 確認ボタン押下');

  // 11. 結果確認
  await page.waitForTimeout(2000);
  const success = await checkboxFrame.evaluate(() =>
    document.querySelector('#recaptcha-anchor[aria-checked="true"]') !== null
  );

  // 12. 一時ファイル削除
  try { fs.unlinkSync(audioFilePath); } catch {}

  return success;
}

module.exports = {
  downloadAudioFromPage,
  solveRecaptcha
};
```0
