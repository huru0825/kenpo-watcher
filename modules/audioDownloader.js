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

async function solveRecaptcha(page) {
  // --- ヘルパー: フレーム内のセレクタ存在チェック用ログ ---
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

  // 1. 全フレーム URL をログ出力
  console.log(
    '[reCAPTCHA] 🔍 frames:',
    page.frames().map(f => f.url()).filter(u => u)
  );

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

  // 4. challenge 用 iframe の取得
  console.log('[reCAPTCHA] ▶ challenge 用 iframe を最大60秒待つ');
  await page.waitForTimeout(20000);
  let bframeHandle = await page
    .waitForSelector('iframe[src*="/recaptcha/api2/bframe"]', { timeout: 60000 })
    .catch(() => null);

  let challengeFrame = bframeHandle
    ? await bframeHandle.contentFrame()
    : page.frames().find(
        f =>
          f.url()?.includes('/recaptcha/api2/bframe') ||
          f.name().startsWith('a-')
      );
  if (!challengeFrame) {
    const titleHandle = await page.$('iframe[title*="recaptcha challenge"]');
    if (titleHandle) challengeFrame = await titleHandle.contentFrame();
  }
  if (!challengeFrame) {
    console.error('[reCAPTCHA] ❌ チャレンジ用iframe取得失敗');
    return false;
  }
  console.log('[reCAPTCHA] ✅ challenge iframe 取得OK');

  // デバッグ: 画像認証画面スクショ
  const debugDir = path.resolve(__dirname, '../tmp');
  fs.mkdirSync(debugDir, { recursive: true });
  const debugShot1 = path.join(debugDir, `challenge-debug-${Date.now()}.png`);
  await page.screenshot({ path: debugShot1, fullPage: true });
  console.log(`[reCAPTCHA] 🖼️ 画像認証画面スクショ: tmp/${path.basename(debugShot1)}`);

  // 5. 画像認証UIまたはAudioUIがロードされるのを待機
  try {
    console.log(
      '[reCAPTCHA] ▶ UIロード待機 (.rc-imageselect-payload | .rc-imageselect-tileloop-begin OR play-button)'
    );
    await Promise.race([
      challengeFrame.waitForSelector('.rc-imageselect-payload, .rc-imageselect-tileloop-begin', { timeout: 15000 }),
      challengeFrame.waitForSelector('button.rc-audiochallenge-play-button', { timeout: 15000 })
    ]);
    console.log('[reCAPTCHA] ✅ UIロード検出OK');
  } catch {
    console.warn('[reCAPTCHA] ⚠️ UIロード待機タイムアウト → 画像UI or audioUI生成待ちスキップ');
  }

  // オプション: DOMダンプで実態を確認
  const html = await challengeFrame.evaluate(() => document.documentElement.innerHTML);
  console.log('[reCAPTCHA][DEBUG] challengeFrame innerHTML:', html.slice(0, 1000));

  // 6. 音声チャレンジ切り替えフェーズ
  // ──────────────── 透明レイヤーを無効化 ────────────────
  await challengeFrame.evaluate(() => {
    const overlay = document.querySelector('div[style*="opacity: 0.05"]');
    if (overlay) overlay.style.pointerEvents = 'none';
  });

  await page.waitForTimeout(15000);
  const toggleSelectors = [
    'div.button-holder.audio-button-holder > button', // スクショ1枚目対応
    'button[title="確認用の文字を音声として聞く"]',
    '#recaptcha-audio-button',
    'button.rc-button-audio',
    'button[aria-label*="audio"]',
    'button[aria-label*="音声"]',
    'button[title*="audio"]',
    'button[title*="音声"]'
  ];
  let toggled = false;
  console.log('[reCAPTCHA] ▶ 音声チャレンジ切り替えボタンを試行');
  for (const sel of toggleSelectors) {
    try {
      const btn = await challengeFrame.waitForSelector(sel, { visible: true, timeout: 3000 });
      await btn.click();
      console.log(`[reCAPTCHA] ✅ '${sel}' で音声チャレンジに切り替え`);
      toggled = true;
      break;
    } catch {
      console.log(`[reCAPTCHA] ⚠️ '${sel}' が見つからない or クリック失敗`);
    }
  }
  if (!toggled) {
    console.error('[reCAPTCHA] ❌ 音声切替に完全失敗');
    return false;
  }

  // 切り替え後に少し待って iframe を再取得
  await page.waitForTimeout(500);
  {
    const newB = await page.$('iframe[src*="/recaptcha/api2/bframe"]');
    if (newB) {
      challengeFrame = await newB.contentFrame();
      console.log('[reCAPTCHA][DEBUG] 別 bframe を再取得');
    }
  }

  // 7. 音声チャレンジUIの検出（回答欄 or ダウンロードリンク）
  console.log('[reCAPTCHA] 🔍 UI要素チェック (#audio-response / download-link)');
  await logExistingSelectors(challengeFrame, [
    '#audio-response',
    'a.rc-audiochallenge-tdownload-link'
  ]);
  try {
    await challengeFrame.waitForSelector('#audio-response, a.rc-audiochallenge-tdownload-link', { timeout: 5000 });
    console.log('[reCAPTCHA] ✅ 音声チャレンジUI検出');
  } catch {
    console.warn('[reCAPTCHA] ⚠️ 音声UI検出失敗 → 再生へ直接進む');
  }

  // 8. 再生（Play）フェーズ
  try {
    console.log('[reCAPTCHA] ▶ 再生ボタン待機 (.rc-audiochallenge-play-button)');
    const playBtn = await challengeFrame.waitForSelector('button.rc-audiochallenge-play-button', { timeout: 15000 });
    console.log('[reCAPTCHA] ✅ 再生ボタン検出OK → クリック');
    await playBtn.click();
  } catch {
    console.error('[reCAPTCHA] ❌ 再生ボタン検出／クリック失敗');
    return false;
  }

  // 9. ダウンロード→Whisper→入力→検証
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

  // 10. 確認ボタンを待機＆クリック
  console.log('[reCAPTCHA] ▶ 確認ボタン待機＆クリック');
  await challengeFrame.waitForSelector('button#recaptcha-verify-button', { visible: true });
  await challengeFrame.click('button#recaptcha-verify-button');
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
