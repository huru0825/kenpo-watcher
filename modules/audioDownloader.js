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
  // 1–2. チェックボックスiframe取得＆クリック（既存）
  console.log('[reCAPTCHA] 🔍 frames:', page.frames().map(f => f.url()));
  const anchorHandle = await page
    .waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 20000 })
    .catch(() => null);
  if (!anchorHandle) return false;
  const checkboxFrame = await anchorHandle.contentFrame();
  if (!checkboxFrame) return false;
  console.log('[reCAPTCHA] ✅ reCAPTCHAチェックボックス表示確認OK');

  console.log('[reCAPTCHA] ▶ チェックボックスクリックを試行');
  try {
    await checkboxFrame.waitForSelector('.recaptcha-checkbox-border', { timeout: 10000 });
    await checkboxFrame.click('.recaptcha-checkbox-border');
    console.log('[reCAPTCHA] ✅ チェックボックスクリック成功');
  } catch {
    console.error('[reCAPTCHA] ❌ チェックボックスクリック失敗');
    return false;
  }

  // 3–4. 画像認証UI取得＆スクショ（既存）
  console.log('[reCAPTCHA] 🔍 画像認証UIを確認');
  await page.waitForTimeout(500);
  const bframeHandle = page.frames().find(f => f.url().includes('/recaptcha/api2/bframe'));
  if (!bframeHandle) {
    console.log('[reCAPTCHA] ❌ 画像認証UI表示確認NG — スキップ'); 
    return true;  // 画像チャレンジなしでOK
  }
  console.log('[reCAPTCHA] ✅ 画像認証UI表示確認OK');
  const challengeFrame = await bframeHandle.contentFrame();
  if (!challengeFrame) return false;

  // デバッグ用スクショ
  const debugDir = path.resolve(__dirname, '../tmp');
  fs.mkdirSync(debugDir, { recursive: true });
  const shot1 = path.join(debugDir, `challenge-debug-${Date.now()}.png`);
  await page.screenshot({ path: shot1, fullPage: true });
  console.log(`[reCAPTCHA] 🖼️ 画像認証画面スクショ: tmp/${path.basename(shot1)}`);

  // 5. 音声切替ボタン（ヘッドホンアイコン）を複数セレクタで試行
  await page.waitForTimeout(1500);
  console.log('[reCAPTCHA] ▶ 音声切替ボタン（ヘッドホンアイコン）を試行');

  const audioSelectors = [
    'button.rc-button-audio',               // デフォルト実装
    'button.rc-audiochallenge-play-button', // 新 UI
    '#recaptcha-audio-button'               // 旧コード用
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

  // 6. 音声チャレンジUIの確認（余裕を持って待機）
  console.log('[reCAPTCHA] 🔍 音声チャレンジUIを確認');
  await page.waitForTimeout(2000);
  try {
    await challengeFrame.waitForSelector(
      '#audio-response, .rc-audiochallenge-tdownload-link',
      { timeout: 10000 }
    );
    console.log('[reCAPTCHA] ✅ 音声チャレンジUI表示確認OK');
  } catch {
    console.error('[reCAPTCHA] ❌ 音声チャレンジUI表示確認NG');
    // フォールト画面スクショ
    const shotFail = path.join(debugDir, `audio-fail-${Date.now()}.png`);
    await page.screenshot({ path: shotFail, fullPage: true });
    console.log(`[reCAPTCHA] 📷 フォールト画面スクショ: tmp/${path.basename(shotFail)}`);
    return false;
  }

  // ここまで確認用。以降は既存ロジック（音声ダウンロード→Whisper→入力→検証）を継続してください。
  return false;
}

module.exports = {
  downloadAudioFromPage,
  solveRecaptcha
};
