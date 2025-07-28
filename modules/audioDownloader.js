// audioDownloader.js
const fs = require('fs');
const path = require('path');
const { transcribeAudio } = require('./whisper');

/**
 * フレーム内のネットワークレスポンスから音声ファイルをダウンロードして保存。
 */
async function downloadAudioFromPage(frame) {
  console.log('[reCAPTCHA] 🎧 音声チャレンジの音源をネットワーク経由でキャッチ中…');
  const page = frame.page ? frame.page() : frame._page;

  const audioResponse = await page.waitForResponse(
    res =>
      res.url().includes('/recaptcha/api2/payload') &&
      res.headers()['content-type']?.includes('audio/mp3'),
    { timeout: 15000 }
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
 * selector を定期ポーリングでリトライ取得するユーティリティ。
 * 見つかれば ElementHandle を返し、最大時間超過でエラーを投げる。
 */
async function waitForSelectorWithRetry(frame, selector, { interval = 1000, maxRetries = 60 } = {}) {
  for (let i = 0; i < maxRetries; i++) {
    const el = await frame.$(selector);
    if (el) return el;
    await frame.waitForTimeout(interval);
  }
  throw new Error(`Selector "${selector}" が ${interval * maxRetries}ms 内に見つかりませんでした`);
}

async function solveRecaptcha(page) {
  // --- デバッグ用: フレーム内のセレクタ存在チェックログ ---
  async function logExistingSelectors(frame, selectors) {
    for (const sel of selectors) {
      const found = await frame.$(sel);
      console.log(
        found
          ? `[reCAPTCHA][DEBUG] 存在: '${sel}'`
          : `[reCAPTCHA][DEBUG] 未発見: '${sel}'`
      );
    }
  }

  console.log('[reCAPTCHA] 🔍 frames:', page.frames().map(f => f.url()).filter(u => u));

  // 2. チェックボックス iframe
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

  // 4. challenge 用 iframe を確実に取得
  console.log('[reCAPTCHA] ▶ challenge 用 iframe を取得');
  const bframeEl = await waitForSelectorWithRetry(page, 'iframe[src*="/recaptcha/api2/bframe"]', { interval: 1000, maxRetries: 60 })
    .catch(() => null);
  let challengeFrame = bframeEl ? await bframeEl.contentFrame() : null;
  if (!challengeFrame) {
    const titleHandle = await page.$('iframe[title*="recaptcha challenge"]');
    if (titleHandle) challengeFrame = await titleHandle.contentFrame();
  }
  if (!challengeFrame) {
    console.error('[reCAPTCHA] ❌ challenge iframe 取得失敗');
    return false;
  }
  console.log('[reCAPTCHA] ✅ challenge iframe 取得OK');

  // スクショ
  {
    const debugDir = path.resolve(__dirname, '../tmp');
    fs.mkdirSync(debugDir, { recursive: true });
    const debugShot1 = path.join(debugDir, `challenge-debug-${Date.now()}.png`);
    await page.screenshot({ path: debugShot1, fullPage: true });
    console.log(`[reCAPTCHA] 🖼️ challenge iframe スクショ: tmp/${path.basename(debugShot1)}`);
  }

  // 5. UIロード待機
  try {
    console.log('[reCAPTCHA] ▶ UIロード待機');
    await Promise.race([
      challengeFrame.waitForSelector('.rc-imageselect-payload, .rc-imageselect-tileloop-begin', { timeout: 15000 }),
      challengeFrame.waitForSelector('button.rc-audiochallenge-play-button', { timeout: 15000 }),
    ]);
    console.log('[reCAPTCHA] ✅ UIロード検出OK');
  } catch {
    console.warn('[reCAPTCHA] ⚠️ UIロード待機タイムアウト → 続行');
  }

  // DOMダンプ
  {
    const html = await challengeFrame.evaluate(() => document.documentElement.innerHTML);
    console.log('[reCAPTCHA][DEBUG] challengeFrame innerHTML:', html.slice(0, 1000));
  }

  // 6. 音声切り替えフェーズ
  await challengeFrame.evaluate(() => {
    const ov = document.querySelector('div[style*="opacity: 0.05"]');
    if (ov) ov.style.pointerEvents = 'none';
  });
  console.log('[reCAPTCHA] ▶ 音声切り替えを試行');
  let toggled = false;
  for (const sel of [
    'div.button-holder.audio-button-holder > button',
    'button[title="確認用の文字を音声として聞く"]',
    '#recaptcha-audio-button',
    'button.rc-button-audio',
    'button[aria-label*="audio"]',
    'button[aria-label*="音声"]',
    'button[title*="audio"]',
    'button[title*="音声"]',
  ]) {
    try {
      const btn = await waitForSelectorWithRetry(challengeFrame, sel, { interval: 500, maxRetries: 20 });
      await btn.click();
      console.log(`[reCAPTCHA] ✅ '${sel}' で音声チャレンジに切り替え`);
      toggled = true;
      break;
    } catch {
      console.log(`[reCAPTCHA] ⚠️ '${sel}' 取得失敗→次`);
    }
  }
  if (!toggled) {
    console.error('[reCAPTCHA] ❌ 音声切替に完全失敗');
    return false;
  }

  // bframe 再取得
  {
    const newB = await waitForSelectorWithRetry(page, 'iframe[src*="/recaptcha/api2/bframe"]', { interval: 500, maxRetries: 20 })
      .catch(() => null);
    if (newB) {
      challengeFrame = await newB.contentFrame();
      console.log('[reCAPTCHA] 🔄 bframe 再取得');
    }
  }

  // 7. 必要要素を確実に掴む
  let inputEl, downloadEl, verifyEl;
  try {
    inputEl    = await waitForSelectorWithRetry(challengeFrame, '#audio-response',                   { interval: 500, maxRetries: 60 });
    downloadEl = await waitForSelectorWithRetry(challengeFrame, 'a.rc-audiochallenge-tdownload-link', { interval: 500, maxRetries: 60 });
    verifyEl   = await waitForSelectorWithRetry(challengeFrame, 'button#recaptcha-verify-button',    { interval: 500, maxRetries: 60 });
    console.log('[reCAPTCHA] ✅ 入力／DL／確認ボタン 全部確保');
  } catch (err) {
    console.error('[reCAPTCHA] ❌ 要素取得タイムアウト:', err);
    return false;
  }

  // 8. 再生フェーズ
  console.log('[reCAPTCHA] ▶ 再生ボタンを試行');
  let played = false;
  for (const sel of [
    'button.rc-button-default.goog-inline-block',
    'button[aria-labelledby="audio-instructions"]',
    'button.rc-audiochallenge-play-button',
  ]) {
    try {
      const btn = await waitForSelectorWithRetry(challengeFrame, sel, { interval: 500, maxRetries: 20 });
      await btn.click();
      console.log(`[reCAPTCHA] ✅ '${sel}' で再生押下`);
      played = true;
      break;
    } catch {
      console.log(`[reCAPTCHA] ⚠️ '${sel}' 未取得→次`);
    }
  }
  if (!played) {
    console.error('[reCAPTCHA] ❌ 再生押下に完全失敗');
    return false;
  }

  // 9. ダウンロード→Whisper→入力
  let audioFilePath;
  try {
    audioFilePath = await downloadAudioFromPage(challengeFrame);
    console.log('[reCAPTCHA] ✅ 音声ダウンロード成功');
  } catch (err) {
    console.error('[reCAPTCHA] ❌ ダウンロード失敗:', err);
    return false;
  }

  let text;
  try {
    text = await transcribeAudio(audioFilePath);
    console.log('📝 認識結果:', text);
  } catch (err) {
    console.error('[reCAPTCHA] ❌ Whisper失敗:', err);
    return false;
  }

  await inputEl.type(text.trim(), { delay: 100 });
  console.log('[reCAPTCHA] ✅ テキスト入力完了');

  // 10. 確認ボタン押下
  await verifyEl.click();
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
