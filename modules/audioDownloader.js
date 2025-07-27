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
  // 1. 全フレーム URL をログ出力（空文字列は除外）
  const frameUrls = page.frames().map(f => f.url()).filter(u => u);
  console.log('[reCAPTCHA] 🔍 frames:', frameUrls);

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

  // 4. challenge 用 iframe を page.frames().find で柔軟に取得
  let challengeFrame = page.frames().find(
    f =>
      (f.url() && f.url().includes('/recaptcha/api2/bframe')) ||
      f.name().startsWith('a-')
  );
  if (!challengeFrame) {
    // URL/name でも見つからなければ、title 属性を持つ iframe を探す
    const titleHandle = await page.$('iframe[title*="recaptcha challenge"]');
    if (titleHandle) {
      challengeFrame = await titleHandle.contentFrame();
    }
  }
  if (!challengeFrame) {
    console.error('[reCAPTCHA] ❌ チャレンジ用iframe取得失敗');
    return false;
  }
  console.log('[reCAPTCHA] ✅ challenge iframe 取得OK');

  // --- デバッグ: 画像認証画面スクショ ---
  const debugDir = path.resolve(__dirname, '../tmp');
  fs.mkdirSync(debugDir, { recursive: true });
  const debugShot1 = path.join(debugDir, `challenge-debug-${Date.now()}.png`);
  await page.screenshot({ path: debugShot1, fullPage: true });
  console.log(`[reCAPTCHA] 🖼️ 画像認証画面スクショ: tmp/${path.basename(debugShot1)}`);

  const audioSelectors = [
    'button.rc-button-audio',
    'button.rc-audiochallenge-play-button',
    '#recaptcha-audio-button',
    'button[aria-label="Play audio challenge"]'
  ];

  // 存在チェック
  async function logExistingSelectors(frame, selectors) {
    for (const sel of selectors) {
      const el = await frame.$(sel);
      console.log(
        el
          ? `[reCAPTCHA] ✅ 存在: '${sel}'`
          : `[reCAPTCHA] ⚠️ 存在しない: '${sel}'`
      );
    }
  }

  // 5. 音声切替ボタンを順次試行
  await page.waitForTimeout(15000);
  console.log('[reCAPTCHA] ▶ クリック可能なセレクタを事前確認します');
  await logExistingSelectors(challengeFrame, audioSelectors);

  console.log('[reCAPTCHA] ▶ 音声切替ボタンをクリック試行');
  let clicked = false;
  const results = [];
  for (const sel of audioSelectors) {
    console.log(`[reCAPTCHA] ▶ セレクタ '${sel}' を試行`);
    try {
      await challengeFrame.waitForSelector(sel, { timeout: 5000 });
      await challengeFrame.click(sel);
      console.log(`[reCAPTCHA] ✅ '${sel}' クリック成功`);
      results.push({ selector: sel, success: true });
      clicked = true;
      break;
    } catch (err) {
      console.log(`[reCAPTCHA] ⚠️ '${sel}' 試行失敗: ${err.message}`);
      results.push({ selector: sel, success: false });
    }
  }
  if (!clicked) {
    console.error('[reCAPTCHA] ❌ すべてのセレクタでクリック失敗');
    console.table(results);
    return false;
  }

  // 6. 音声チャレンジUIの確認
  console.log('[reCAPTCHA] 🔍 音声チャレンジUIを確認');
  await page.waitForTimeout(20000);
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

  // 7. ダウンロード→Whisper→入力→検証…以降は変更なし
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
