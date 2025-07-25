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

  const anchorHandle = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 20000 }).catch(() => null);
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

  const bframeHandle = await page.waitForSelector('iframe[src*="/recaptcha/api2/bframe"]', { timeout: 20000 }).catch(() => null);
  if (!bframeHandle) return true;
  console.log('[reCAPTCHA] ✅ 画像認証ダイアログ表示確認');

  const challengeFrame = await bframeHandle.contentFrame();
  if (!challengeFrame) return false;

  await challengeFrame.waitForSelector('#recaptcha-audio-button', { timeout: 10000 });
  await challengeFrame.click('#recaptcha-audio-button');
  console.log('[reCAPTCHA] ✅ 音声再生ダイアログ表示確認OK');

  const playButtonSelector = '.rc-audiochallenge-play-button button';
  console.log('[reCAPTCHA] ▶ 再生ボタン表示確認中（状態ログあり）');

  let playButton = null;
  for (let i = 0; i < 10; i++) {
    const state = await challengeFrame.evaluate(selector => {
      const el = document.querySelector(selector);
      if (!el) return 'NOT_FOUND';
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return 'HIDDEN';
      return 'VISIBLE';
    }, playButtonSelector);
    console.log(`[reCAPTCHA] ▶ 再生ボタン状態: ${state}（リトライ: ${9 - i}）`);
    if (state === 'VISIBLE') {
      playButton = await challengeFrame.$(playButtonSelector);
      break;
    }
    await challengeFrame.waitForTimeout(2000);
  }

  if (!playButton) {
    console.warn('[reCAPTCHA] ⚠️ セレクタ一致失敗 → 代替試行: 全ボタンclick+スクショへ');
    const candidates = await challengeFrame.$$('button');
    const tmpDir = path.resolve(__dirname, '../tmp');
    fs.mkdirSync(tmpDir, { recursive: true });

    for (let i = 0; i < candidates.length; i++) {
      const btn = candidates[i];
      const label = await challengeFrame.evaluate(el => el.textContent.trim(), btn);
      const tag = label || `no-label-${i}`;

      if (!label.includes('再生')) {
        console.log(`[reCAPTCHA] ⏩ スキップ: ${i}（${tag}） → 再生ラベルなし`);
        continue;
      }

      await challengeFrame.evaluate(el => el.scrollIntoView(), btn);
      const box = await btn.boundingBox();
      const fname = `btn_${i}_${Date.now()}.png`;
      const fpath = path.join(tmpDir, fname);
      if (box) await btn.screenshot({ path: fpath });

      const hostname = process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:10000';
      const fullUrl = `https://${hostname}/tmp/${fname}`;

      console.log(`[reCAPTCHA] 🔎 ボタン${i}: ${tag} → ${box ? '📸 スクショ保存' : '❌ 不可視'}`);
      console.log(`[reCAPTCHA] 🔗 ダウンロード: ${fullUrl}`);

      try {
        await btn.click();
        console.log(`[reCAPTCHA] ✅ 通常クリック成功: ${i}（${tag}）`);
        playButton = btn;
        break;
      } catch {
        try {
          await challengeFrame.evaluate(el => el.click(), btn);
          console.log(`[reCAPTCHA] ✅ evaluateクリック成功: ${i}（${tag}）`);
          playButton = btn;
          break;
        } catch {
          console.warn(`[reCAPTCHA] ⚠️ 両方ともクリック失敗: ${i}（${tag}）`);
        }
      }
    }
  }

  if (!playButton) {
    console.error('[reCAPTCHA] ❌ 再生ボタンが見つかりません（全手法失敗）');
    return false;
  }

  await challengeFrame.waitForSelector('#audio-response', { timeout: 5000 });
  await challengeFrame.waitForSelector('#recaptcha-verify-button', { timeout: 5000 });

  await playButton.click();
  console.log('[reCAPTCHA] ✅ 音声再生OK');

  let audioFilePath;
  try {
    audioFilePath = await downloadAudioFromPage(challengeFrame);
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
  const inputValue = await challengeFrame.$eval('#audio-response', el => el.value);
  if (!inputValue) return false;

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
