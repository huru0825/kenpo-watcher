// modules/audioDownloader.js
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

async function waitForSelectorWithRetry(frame, selector, { interval = 1000, maxRetries = 60 } = {}) {
  for (let i = 0; i < maxRetries; i++) {
    const el = await frame.$(selector);
    if (el) return el;
    await frame.waitForTimeout(interval);
  }
  throw new Error(`Selector "${selector}" が ${interval * maxRetries}ms 内に見つかりませんでした`);
}

function randomDelay(min = 200, max = 800) {
  return Math.floor(Math.random() * (max - min)) + min;
}

async function solveRecaptcha(page) {
  console.log('[reCAPTCHA] 🔍 frames:', page.frames().map(f => f.url()).filter(u => u));

  const anchorHandle = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 20000 }).catch(() => null);
  if (!anchorHandle) return false;
  const checkboxFrame = await anchorHandle.contentFrame();
  console.log('[reCAPTCHA] ✅ チェックボックスiframe取得OK');

  const box = await checkboxFrame.waitForSelector('.recaptcha-checkbox-border', { timeout: 10000 });
  await box.hover();
  await page.waitForTimeout(randomDelay(300, 700));
  await box.click();
  console.log('[reCAPTCHA] ✅ チェックボックスクリック');

  const bframeEl = await waitForSelectorWithRetry(page, 'iframe[src*="/recaptcha/api2/bframe"]', { interval: 1000, maxRetries: 60 }).catch(() => null);
  let challengeFrame = bframeEl ? await bframeEl.contentFrame() : null;
  if (!challengeFrame) {
    const titleHandle = await page.$('iframe[title*="recaptcha challenge"]');
    if (titleHandle) challengeFrame = await titleHandle.contentFrame();
  }
  if (!challengeFrame) {
    console.error('[reCAPTCHA] ❌ challenge iframe取得失敗');
    return false;
  }
  console.log('[reCAPTCHA] ✅ challenge iframe取得OK');

  const tmp = path.resolve(__dirname, '../tmp');
  fs.mkdirSync(tmp, { recursive: true });
  const shot = path.join(tmp, `challenge-debug-${Date.now()}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  console.log(`[reCAPTCHA] 🖼️ challenge iframeスクショ: tmp/${path.basename(shot)}`);

  console.log('[reCAPTCHA] ▶ 画像UIの描画待機');
  await challengeFrame.waitForSelector('.rc-imageselect-payload', { timeout: 15000 });
  console.log('[reCAPTCHA] ✅ 画像UI描画完了');

  const isAlreadyAudio = await challengeFrame.$('.rc-audiochallenge');
  if (!isAlreadyAudio) {
    console.log('[reCAPTCHA] ▶ 音声チャレンジへの切り替え準備');
    const audioTab = await challengeFrame.$('div.button-holder.audio-button-holder > button');

    if (!audioTab) {
      console.warn('[reCAPTCHA] ⚠️ 音声切り替えボタンが見つかりませんでした');
      await challengeFrame.screenshot({ path: `tmp/no-audio-tab-${Date.now()}.png` });
      return false;
    }

    const tabBox = await audioTab.boundingBox();
    await page.mouse.move(
      tabBox.x + tabBox.width * Math.random(),
      tabBox.y + tabBox.height * Math.random(),
      { steps: 5 }
    );
    await page.waitForTimeout(randomDelay(500, 1200));
    await audioTab.click();
    console.log('[reCAPTCHA] ✅ 音声チャレンジに切り替え');
  } else {
    console.log('[reCAPTCHA] 🎧 既に音声チャレンジモードです');
  }

  await challengeFrame.evaluate(() => {
    const btn = document.getElementById('recaptcha-audio-button');
    console.log('[DEBUG] audio-button disabled:', btn ? btn.disabled : '未発見');
    console.log('[DEBUG] audio-button attributes:', btn ? Array.from(btn.attributes).map(a => `${a.name}="${a.value}"`) : []);
  });

  try {
    await challengeFrame.waitForFunction(() => {
      const audioUI = document.querySelector('.rc-audiochallenge');
      const btn = document.getElementById('recaptcha-audio-button');
      return audioUI && btn && !btn.disabled;
    }, { timeout: 10000 });
    console.log('[reCAPTCHA] ✅ audio ボタン有効化検出OK');
  } catch (err) {
    console.error('[DEBUG] 🔴 audio-button が有効化されませんでした:', err);
    console.log('[DEBUG] ▶ 切り替え後 DOM snapshot:');
    console.log(await challengeFrame.evaluate(() => document.documentElement.outerHTML));
    return false;
  }

  const newB = await waitForSelectorWithRetry(page, 'iframe[src*="/recaptcha/api2/bframe"]', { interval: 500, maxRetries: 20 }).catch(() => null);
  if (newB) {
    challengeFrame = await newB.contentFrame();
    console.log('[reCAPTCHA] 🔄 新bframe取得');
  }

  console.log('[reCAPTCHA] ▶ 再生ボタン取得開始');
  let playBtn;
  try {
    playBtn = await waitForSelectorWithRetry(challengeFrame, 'button.rc-audiochallenge-play-button', { interval: 500, maxRetries: 20 });
    console.log('[reCAPTCHA] ✅ 再生ボタン検出OK');
  } catch (err) {
    console.error('[reCAPTCHA] ❌ 再生ボタン未検出:', err);
    return false;
  }

  const rect = await playBtn.boundingBox();
  await page.mouse.move(
    rect.x + rect.width * Math.random(),
    rect.y + rect.height * Math.random(),
    { steps: 7 }
  );
  await page.waitForTimeout(randomDelay(300, 900));
  await playBtn.click();
  console.log('[reCAPTCHA] ✅ 再生ボタン押下');

  await challengeFrame.waitForFunction(() => {
    const btn = document.querySelector('button.rc-audiochallenge-play-button');
    return btn && (btn.classList.contains('rc-audiochallenge-playing') || /再生中/.test(btn.innerText));
  }, { timeout: 10000 });
  console.log('[reCAPTCHA] ✅ 再生中状態検出OK');
  await waitForSelectorWithRetry(challengeFrame, '#audio-response', { interval: 500, maxRetries: 20 });
  console.log('[reCAPTCHA] ✅ テキスト欄出現検出OK');

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

  await (await challengeFrame.$('#audio-response')).type(text.trim(), { delay: 100 });
  console.log('[reCAPTCHA] ✅ テキスト入力完了');
  await (await challengeFrame.$('button#recaptcha-verify-button')).click();
  console.log('[reCAPTCHA] ✅ 確認ボタン押下');

  await page.waitForTimeout(2000);
  const success = await checkboxFrame.evaluate(
    () => document.querySelector('#recaptcha-anchor[aria-checked="true"]') !== null
  );
  try { fs.unlinkSync(audioFilePath); } catch {}
  return success;
}

module.exports = { downloadAudioFromPage, solveRecaptcha };
