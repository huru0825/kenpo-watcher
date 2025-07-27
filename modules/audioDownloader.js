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

  // 4. チャレンジ用 iframe の出現を待機＋取得 (最大60秒)
  console.log('[reCAPTCHA] ▶ challenge 用 iframe の出現を待機 (20s)');
  await page.waitForTimeout(20000);

  console.log('[reCAPTCHA] ▶ challenge 用 iframe を最大60秒待つ');
  let bframeHandle = await page
    .waitForSelector('iframe[src*="/recaptcha/api2/bframe"]', { timeout: 60000 })
    .catch(() => null);

  let challengeFrame = bframeHandle
    ? await bframeHandle.contentFrame()
    : null;

  // URL/name でも見つからなければ、ページ内の frames から探す
  if (!challengeFrame) {
    challengeFrame = page.frames().find(
      f =>
        (f.url() && f.url().includes('/recaptcha/api2/bframe')) ||
        f.name().startsWith('a-')
    );
  }
  // それでもなければ title 属性で探す
  if (!challengeFrame) {
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

  // --- 音声チャレンジ切り替えフェーズ ---
  await page.waitForTimeout(15000);
  const toggleSelectors = [
    '#recaptcha-audio-button',      // 通常のヘッドホンアイコン
    'button.rc-button-audio',       // 古いバージョン向け
  ];
  let toggled = false;
  console.log('[reCAPTCHA] ▶ 音声チャレンジ切り替えボタンを試行');
  for (const sel of toggleSelectors) {
    try {
      const btn = await challengeFrame.waitForSelector(sel, { visible: true, timeout: 5000 });
      await btn.click();
      console.log(`[reCAPTCHA] ✅ '${sel}' で音声チャレンジに切り替え`);
      toggled = true;

      // — 対策2: 切り替え後に iframe 構造が変わっていれば再取得 —
      await page.waitForTimeout(500);
      const newFrameUrls = page.frames().map(f => f.url()).filter(u => u);
      console.log('[reCAPTCHA][DEBUG] toggle後の frames:', newFrameUrls);

      const newBframeHandle = await page.$('iframe[src*="/recaptcha/api2/bframe"]');
      if (newBframeHandle) {
        challengeFrame = await newBframeHandle.contentFrame();
        console.log('[reCAPTCHA][DEBUG] 別 bframe を再取得');
      }

      break;
    } catch {
      console.log(`[reCAPTCHA] ⚠️ '${sel}' で切り替え失敗`);
    }
  }
  if (!toggled) {
    console.error('[reCAPTCHA] ❌ 音声チャレンジ切り替えに失敗');
    return false;
  }

  // --- 音声チャレンジ UI 出現待ち ---
  try {
    await challengeFrame.waitForSelector('#audio-response', { timeout: 10000 });
    console.log('[reCAPTCHA] ✅ 音声チャレンジUI検出');
  } catch {
    console.error('[reCAPTCHA] ❌ 音声チャレンジUI検出に失敗');
    const failShot = path.join(debugDir, `audio-toggle-fail-${Date.now()}.png`);
    await page.screenshot({ path: failShot, fullPage: true });
    console.log(`[reCAPTCHA] 📷 フォールト画面スクショ: tmp/${path.basename(failShot)}`);
    return false;
  }

  // --- 再生（Play）フェーズ ---
  const playSelectors = [
    'button.rc-audiochallenge-play-button',
    'button[aria-label="Play audio challenge"]',
  ];
  let played = false;
  console.log('[reCAPTCHA] ▶ 再生ボタンを試行');
  for (const sel of playSelectors) {
    try {
      const playBtn = await challengeFrame.waitForSelector(sel, { visible: true, timeout: 5000 });
      await playBtn.click();
      console.log(`[reCAPTCHA] ✅ '${sel}' で再生ボタン押下`);
      played = true;
      break;
    } catch {
      console.log(`[reCAPTCHA] ⚠️ '${sel}' 再生ボタン未検出orクリック失敗`);
    }
  }
  if (!played) {
    console.error('[reCAPTCHA] ❌ 再生ボタン押下に失敗');
    return false;
  }

  // --- ダウンロード→Whisper→入力→検証 ---
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
