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

  try {
    await checkboxFrame.waitForSelector('.recaptcha-checkbox-border', { timeout: 10000 });
    await checkboxFrame.click('.recaptcha-checkbox-border');
    console.log('[reCAPTCHA] ▶ チェックボックスクリック');
  } catch {
    return false;
  }

  // 3. Challenge 用 iframe を /api2/bframe/ で確実に取得
  const bframeHandle = await page
    .waitForSelector('iframe[src*="/recaptcha/api2/bframe"]', { timeout: 20000 })
    .catch(() => null);
  if (!bframeHandle) return true; // 画像チャレンジスキップ
  console.log('[reCAPTCHA] ✅ 画像認証ダイアログ表示確認');

  const challengeFrame = await bframeHandle.contentFrame();
  if (!challengeFrame) return false;

  // --- ここからデバッグロジックを追加 ---
  // ボタンの outerHTML をログ出力
  const allButtonsHtml = await challengeFrame.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .map(b => b.outerHTML)
      .join('\n\n')
  );
  console.log('[reCAPTCHA][DEBUG] ボタン要素一覧:\n', allButtonsHtml);

  // 現状のチャレンジUIをページ全体でスクショ保存
  const debugDir = path.resolve(__dirname, '../tmp');
  fs.mkdirSync(debugDir, { recursive: true });
  const debugShot = path.join(debugDir, `challenge-debug-${Date.now()}.png`);
  await page.screenshot({ path: debugShot, fullPage: true });
  console.log(`[reCAPTCHA][DEBUG] チャレンジUIスクショ: tmp/${path.basename(debugShot)}`);
  // --- デバッグロジックここまで ---

  // 4. 動的セレクタ検出：全ボタンから「再生」を含むものを探す
  console.log('[reCAPTCHA] ▶ 再生ボタン動的検出中');
  const buttons = await challengeFrame.$$('button');
  let playButton = null;
  for (const btn of buttons) {
    const label = await challengeFrame.evaluate(
      el => el.innerText.trim() || el.getAttribute('aria-label') || el.getAttribute('title') || '',
      btn
    );
    if (label.includes('再生')) {
      playButton = btn;
      console.log('[reCAPTCHA] 🔎 動的検出: 再生ボタン →', label);
      break;
    }
  }
  if (!playButton) {
    console.error('[reCAPTCHA] ❌ 再生ボタンが見つかりません（動的検出失敗）');
    return false;
  }

  // 5. 再生ボタンをクリックし、音声ファイルを取得
  await playButton.click();
  console.log('[reCAPTCHA] ✅ 音声再生ボタンクリック');

  let audioFilePath;
  try {
    audioFilePath = await downloadAudioFromPage(challengeFrame);
  } catch (err) {
    console.error('[reCAPTCHA] ❌ 音声ファイルダウンロード失敗:', err);
    return false;
  }

  // 6. Whisper で文字起こし
  let text;
  try {
    text = await transcribeAudio(audioFilePath);
    console.log('📝 認識結果:', text);
  } catch (err) {
    console.error('[reCAPTCHA] ❌ Whisper transcription failed:', err);
    return false;
  }

  // 7. テキスト入力＆検証
  await challengeFrame.type('#audio-response', text.trim(), { delay: 100 });
  const inputValue = await challengeFrame.$eval('#audio-response', el => el.value);
  if (!inputValue) return false;

  await challengeFrame.click('#recaptcha-verify-button');
  console.log('[reCAPTCHA] ✅ 確認ボタン押下');

  // 8. 結果確認
  await page.waitForTimeout(2000);
  const success = await checkboxFrame.evaluate(() =>
    document.querySelector('#recaptcha-anchor[aria-checked="true"]') !== null
  );

  // 9. 一時ファイル削除
  try {
    fs.unlinkSync(audioFilePath);
  } catch {}

  return success;
}

module.exports = {
  downloadAudioFromPage,
  solveRecaptcha
};
