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
  // デバッグ用ログ
  async function logExistingSelectors(frame, selectors) {
    for (const sel of selectors) {
      console.log(
        (await frame.$(sel))
          ? `[reCAPTCHA][DEBUG] 存在: '${sel}'`
          : `[reCAPTCHA][DEBUG] 未発見: '${sel}'`
      );
    }
  }

  console.log('[reCAPTCHA] 🔍 frames:', page.frames().map(f => f.url()).filter(u => u));

  // 1. チェックボックスiframe取得→クリック
  const anchorHandle = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout:20000 }).catch(()=>null);
  if (!anchorHandle) return false;
  const checkboxFrame = await anchorHandle.contentFrame();
  console.log('[reCAPTCHA] ✅ チェックボックスiframe取得OK');
  await checkboxFrame.waitForSelector('.recaptcha-checkbox-border', { timeout:10000 });
  await checkboxFrame.click('.recaptcha-checkbox-border');
  console.log('[reCAPTCHA] ✅ チェックボックスクリック');

  // 2. challenge iframe取得
  const bframeEl = await waitForSelectorWithRetry(page, 'iframe[src*="/recaptcha/api2/bframe"]', { interval:1000, maxRetries:60 }).catch(()=>null);
  let challengeFrame = bframeEl ? await bframeEl.contentFrame() : null;
  if (!challengeFrame) {
    const titleHandle = await page.$('iframe[title*="recaptcha challenge"]');
    if (titleHandle) challengeFrame = await titleHandle.contentFrame();
  }
  if (!challengeFrame) { console.error('[reCAPTCHA] ❌ challenge iframe取得失敗'); return false; }
  console.log('[reCAPTCHA] ✅ challenge iframe取得OK');

  // 3. challenge iframeスクショ + UIロード待機
  {
    const tmp = path.resolve(__dirname,'../tmp');
    fs.mkdirSync(tmp,{recursive:true});
    const shot = path.join(tmp,`challenge-debug-${Date.now()}.png`);
    await page.screenshot({ path: shot, fullPage:true });
    console.log(`[reCAPTCHA] 🖼️ challenge iframeスクショ: tmp/${path.basename(shot)}`);
  }
  // 画像UIを先に完全に待つ
  console.log('[reCAPTCHA] ▶ 画像UIの描画待機');
  await challengeFrame.waitForSelector('.rc-imageselect-payload', { timeout:15000 });
  console.log('[reCAPTCHA] ✅ 画像UI描画完了');

  // 4. 音声切り替えクリック
  await challengeFrame.waitForSelector('div.button-holder.audio-button-holder > button', { timeout:15000 });
  console.log('[reCAPTCHA] ▶ 音声切り替えボタン検出OK');
  await challengeFrame.click('div.button-holder.audio-button-holder > button');
  console.log('[reCAPTCHA] ✅ 音声チャレンジに切り替え');

  // デバッグ：切り替え直後のDOM＆フレーム一覧ダンプ
  console.log('[DEBUG] ▶ 切り替え直後の DOM:');
  console.log(await challengeFrame.evaluate(() => document.documentElement.outerHTML));
  console.log('[DEBUG] ▶ 現在のフレーム一覧:');
  console.log(page.frames().map(f => f.url()));

  // 5. 新bframe取得
  {
    const newB = await waitForSelectorWithRetry(page, 'iframe[src*="/recaptcha/api2/bframe"]', { interval:500, maxRetries:20 }).catch(()=>null);
    if (newB) { challengeFrame = await newB.contentFrame(); console.log('[reCAPTCHA] 🔄 新bframe取得'); }
  }

  // ────────── 切り分け開始 ──────────

  // 6. 再生ボタン取得
  console.log('[reCAPTCHA] ▶ 再生ボタン取得開始');
  let playBtn;
  try {
    playBtn = await waitForSelectorWithRetry(challengeFrame, 'button.rc-audiochallenge-play-button', { interval:500, maxRetries:20 });
    console.log('[reCAPTCHA] ✅ 再生ボタン検出OK');
  } catch (err) {
    console.error('[reCAPTCHA] ❌ 再生ボタン未検出:', err);
    return false;
  }

  // 7. 必要要素取得（入力＆DL＆確認）
  let inputEl, downloadEl, verifyEl;
  try {
    inputEl    = await waitForSelectorWithRetry(challengeFrame, '#audio-response', { interval:500, maxRetries:20 });
    downloadEl = await waitForSelectorWithRetry(challengeFrame, 'a.rc-audiochallenge-tdownload-link', { interval:500, maxRetries:20 });
    verifyEl   = await waitForSelectorWithRetry(challengeFrame, 'button#recaptcha-verify-button', { interval:500, maxRetries:20 });
    console.log('[reCAPTCHA] ✅ 入力／DL／確認ボタン取得OK');
  } catch (err) {
    console.error('[reCAPTCHA] ❌ 要素取得失敗:', err);
    return false;
  }

  // 8. 再生→ボタン状態変化待機→テキスト欄待機
  console.log('[reCAPTCHA] ▶ 再生→状態変化待機');
  await playBtn.click();
  await challengeFrame.waitForFunction(()=>{
    const btn = document.querySelector('button.rc-audiochallenge-play-button');
    return btn && (btn.classList.contains('rc-audiochallenge-playing') || /再生中/.test(btn.innerText));
  }, { timeout:10000 });
  console.log('[reCAPTCHA] ✅ 再生中状態検出OK');
  await waitForSelectorWithRetry(challengeFrame, '#audio-response', { interval:500, maxRetries:20 });
  console.log('[reCAPTCHA] ✅ テキスト欄出現検出OK');

  // ────────── 切り分け終了 ──────────

  // 9. ダウンロード→Whisper→入力→検証
  let audioFilePath;
  try {
    audioFilePath = await downloadAudioFromPage(challengeFrame);
    console.log('[reCAPTCHA] ✅ 音声ダウンロードOK');
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
  await inputEl.type(text.trim(), { delay:100 });
  console.log('[reCAPTCHA] ✅ テキスト入力完了');
  await verifyEl.click();
  console.log('[reCAPTCHA] ✅ 確認ボタン押下');

  await page.waitForTimeout(2000);
  const success = await checkboxFrame.evaluate(()=>
    document.querySelector('#recaptcha-anchor[aria-checked="true"]') !== null
  );
  try { fs.unlinkSync(audioFilePath); } catch {}
  return success;
}

module.exports = { downloadAudioFromPage, solveRecaptcha };
