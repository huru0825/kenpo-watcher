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

  let checkboxFrame = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const anchorHandle = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 10000 });
      await page.waitForFunction(() => {
        const frame = [...document.querySelectorAll('iframe')].find(f => f.src.includes('/recaptcha/api2/anchor'));
        return frame && frame.contentWindow;
      }, { timeout: 10000 });
      checkboxFrame = await anchorHandle.contentFrame();
      if (!checkboxFrame) throw new Error('checkbox iframe not found');

      const box = await checkboxFrame.$('.recaptcha-checkbox-border');
      if (!box) throw new Error('checkbox element not found');
      await box.hover();
      await page.waitForTimeout(randomDelay(300, 700));
      await box.click();
      console.log('[reCAPTCHA] ✅ チェックボックスクリック');
      break;
    } catch (err) {
      console.warn(`[reCAPTCHA] ⚠️ Attempt ${attempt}/3 failed: ${err.message}`);
      await page.waitForTimeout(1000);
    }
  }

  if (!checkboxFrame) {
    console.error('[reCAPTCHA] ❌ Checkbox frame の取得・クリックに失敗');
    return false;
  }

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

  await challengeFrame.waitForSelector('.rc-imageselect-payload', { timeout: 15000 });
  const isAlreadyAudio = await challengeFrame.$('.rc-audiochallenge');
  if (!isAlreadyAudio) {
    const audioTab = await challengeFrame.$('div.button-holder.audio-button-holder > button');
    if (!audioTab) {
      console.warn('[reCAPTCHA] ⚠️ 音声切り替えボタンが見つからない');
      await challengeFrame.screenshot({ path: `tmp/no-audio-${Date.now()}.png` });
      return false;
    }
    const box = await audioTab.boundingBox();
    await page.mouse.move(box.x + box.width * Math.random(), box.y + box.height * Math.random(), { steps: 5 });
    await page.waitForTimeout(randomDelay(500, 1200));
    await audioTab.click();
    console.log('[reCAPTCHA] ✅ 音声チャレンジ切替');
  } else {
    console.log('[reCAPTCHA] 🎧 既に音声チャレンジ');
  }

  await challengeFrame.waitForFunction(() => {
    const btn = document.getElementById('recaptcha-audio-button');
    const audioUI = document.querySelector('.rc-audiochallenge');
    return audioUI && btn && !btn.disabled;
  }, { timeout: 10000 });

  const newB = await waitForSelectorWithRetry(page, 'iframe[src*="/recaptcha/api2/bframe"]', { interval: 500, maxRetries: 20 }).catch(() => null);
  if (newB) {
    challengeFrame = await newB.contentFrame();
    console.log('[reCAPTCHA] 🔄 新しい bframe 取得');
  }

  let playBtn;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      playBtn = await waitForSelectorWithRetry(challengeFrame, 'button.rc-audiochallenge-play-button', { interval: 500, maxRetries: 20 });
      await playBtn.click();
      await challengeFrame.waitForFunction(() => {
        const btn = document.querySelector('button.rc-audiochallenge-play-button');
        return btn && (btn.classList.contains('rc-audiochallenge-playing') || /再生中/.test(btn.innerText));
      }, { timeout: 10000 });
      console.log('[reCAPTCHA] ✅ 再生ボタン押下 and 再生中確認');
      break;
    } catch (err) {
      console.warn(`[reCAPTCHA] ❌ playBtn retry ${attempt}/3 failed:`, err.message);
      await page.waitForTimeout(1000);
    }
  }

  await waitForSelectorWithRetry(challengeFrame, '#audio-response', { interval: 500, maxRetries: 20 });

  let audioFilePath;
  try {
    audioFilePath = await downloadAudioFromPage(challengeFrame);
    console.log('[reCAPTCHA] ✅ 音声ダウンロード完了');
  } catch (err) {
    console.error('[reCAPTCHA] ❌ ダウンロード失敗:', err);
    return false;
  }

  let text;
  try {
    text = await transcribeAudio(audioFilePath);
    console.log('📝 Whisper 認識結果:', text);
  } catch (err) {
    console.error('[reCAPTCHA] ❌ Whisper 認識失敗:', err);
    return false;
  }

  await (await challengeFrame.$('#audio-response')).type(text.trim(), { delay: 100 });
  await (await challengeFrame.$('button#recaptcha-verify-button')).click();
  console.log('[reCAPTCHA] ✅ 音声回答送信完了');

  await page.waitForTimeout(2000);
  const success = await checkboxFrame.evaluate(() => {
    return document.querySelector('#recaptcha-anchor[aria-checked="true"]') !== null;
  });

  try { fs.unlinkSync(audioFilePath); } catch {}
  return success;
}

module.exports = { downloadAudioFromPage, solveRecaptcha };
