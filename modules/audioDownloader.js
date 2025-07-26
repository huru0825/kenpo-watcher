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

  // 5. 少し待機して、複数候補セレクタで再生ボタンをクリック
  await page.waitForTimeout(1500);
  console.log('[reCAPTCHA] ▶ 音声切替ボタンを iframe 内でクリックを試行');
  const audioSelectors = [
    'button.rc-button-audio',               // デフォルト
    'button.rc-audiochallenge-play-button', // 新UI?
    '#recaptcha-audio-button',              // 旧UI
    'button[aria-label="Play audio challenge"]'
  ];
  let clicked = false;
  for (const sel of audioSelectors) {
    try {
      await challengeFrame.waitForSelector(sel, { timeout: 5000 });
      await challengeFrame.click(sel);
      console.log(`[reCAPTCHA] ✅ '${sel}' をクリック成功`);
      clicked = true;
      break;
    } catch {
      console.log(`[reCAPTCHA] ⚠️ '${sel}' が見つからず／クリック失敗`);
    }
  }
  if (!clicked) {
    console.error('[reCAPTCHA] ❌ いずれの音声切替ボタンもクリックできず');
    return false;
  }

  // 6. 音声チャレンジUIの確認（#audio-response または ダウンロードリンク）
  console.log('[reCAPTCHA] 🔍 音声チャレンジUIを確認');
  await page.waitForTimeout(2000);
  try {
    await challengeFrame.waitForSelector(
      '#audio-response, a.rc-audiochallenge-tdownload-link',
      { timeout: 10000 }
    );
    console.log('[reCAPTCHA] ✅ 音声チャレンジUI表示確認OK');
  } catch {
    console.error('[reCAPTCHA] ❌ 音声チャレンジUI表示確認NG');
    const shotFail = path.join(debugDir, `audio-fail-${Date.now()}.png`);
    await page.screenshot({ path: shotFail, fullPage: true });
    console.log(`[reCAPTCHA] 📷 フォールト画面スクショ: tmp/${path.basename(shotFail)}`);
    return false;
  }

  // 7. 音声ファイルダウンロードを試行
  console.log('[reCAPTCHA] ▶ 音声ファイルダウンロードを試行');
  let audioFilePath;
  try {
    audioFilePath = await downloadAudioFromPage(challengeFrame);
    console.log('[reCAPTCHA] ✅ 音声ファイルダウンロード成功');
  } catch (err) {
    console.error('[reCAPTCHA] ❌ 音声ファイルダウンロード失敗:', err);
    return false;
  }

  // 8. Whisper で文字起こし
  let text;
  try {
    text = await transcribeAudio(audioFilePath);
    console.log('📝 認識結果:', text);
  } catch (err) {
    console.error('[reCAPTCHA] ❌ Whisper transcription failed:', err);
    return false;
  }

  // 9. テキスト入力＆検証
  console.log('[reCAPTCHA] ▶ テキスト入力を試行');
  await challengeFrame.type('#audio-response', text.trim(), { delay: 100 });
  const inputValue = await challengeFrame.$eval('#audio-response', el => el.value);
  if (!inputValue) {
    console.error('[reCAPTCHA] ❌ テキスト入力失敗');
    return false;
  }
  console.log('[reCAPTCHA] ✅ テキスト入力成功');

  await challengeFrame.click('#recaptcha-verify-button');
  console.log('[reCAPTCHA] ✅ 確認ボタン押下');

  // 10. 結果確認
  await page.waitForTimeout(2000);
  const success = await checkboxFrame.evaluate(() =>
    document.querySelector('#recaptcha-anchor[aria-checked="true"]') !== null
  );

  // 11. 一時ファイル削除
  try { fs.unlinkSync(audioFilePath); } catch {}

  return success;
}

module.exports = {
  downloadAudioFromPage,
  solveRecaptcha
};
```0
