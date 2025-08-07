// modules/audioDownloader.js

const fs = require('fs');
const path = require('path');
const { transcribeAudio } = require('./whisper');

function copyToDocuments(srcPath) {
  const documentsDir = '/home/screenshots';
  try {
    fs.mkdirSync(documentsDir, { recursive: true });
    const fileName = path.basename(srcPath);
    const destPath = path.join(documentsDir, fileName);
    fs.copyFileSync(srcPath, destPath);
    console.log(`[copy] 📁 ${srcPath} → ${destPath}`);
  } catch (err) {
    console.warn('[copy] ❌ 転送失敗:', err.message);
  }
}

async function downloadAudioFromPage(frame) {
  console.log('[reCAPTCHA] 🎧 音声チャレンジの音源をキャッチ中...');
  const page = frame.page ? frame.page() : frame._page;
  const audioResponse = await page.waitForResponse(
    res => res.url().includes('/recaptcha/api2/payload') &&
           res.headers()['content-type']?.includes('audio/mp3'),
    { timeout: 15000 }
  );
  const audioBuffer = await audioResponse.buffer();
  const tmpDir = process.env.LOCAL_SCREENSHOT_DIR || '/tmp/screenshots';
  fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, `audio_${Date.now()}.mp3`);

  fs.writeFileSync(filePath, audioBuffer);
  copyToDocuments(filePath);
  console.log(`[reCAPTCHA] ✅ 音声ファイル保存: ${filePath}`);
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

  // チェックボックスフレームクリック
  let checkboxFrame = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const anchorHandle = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 10000 });
      await page.waitForFunction(() => {
        const frame = [...document.querySelectorAll('iframe')].find(f => f.src.includes('/recaptcha/api2/anchor'));
        return frame && frame.contentWindow;
      }, { timeout: 10000 });
      checkboxFrame = await anchorHandle.contentFrame();
      const box = await checkboxFrame.$('.recaptcha-checkbox-border');
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
    console.error('[reCAPTCHA] ❌ チェックボックスクリック失敗');
    return false;
  }

  // challenge iframe 取得
  let challengeFrame = await waitForSelectorWithRetry(page, 'iframe[src*="/recaptcha/api2/bframe"]', { interval: 1000, maxRetries: 60 }).then(h => h.contentFrame()).catch(() => null);
  if (!challengeFrame) {
    const titleHandle = await page.$('iframe[title*="recaptcha challenge"]');
    challengeFrame = titleHandle ? await titleHandle.contentFrame() : null;
  }
  if (!challengeFrame) return false;
  console.log('[reCAPTCHA] ✅ challenge iframe取得OK');

  const tmp = process.env.LOCAL_SCREENSHOT_DIR || '/tmp/screenshots';
  fs.mkdirSync(tmp, { recursive: true });
  const shot = path.join(tmp, `challenge-debug-${Date.now()}.png`);
  await page.screenshot({ path: shot, fullPage: true });

  await challengeFrame.waitForSelector('.rc-imageselect-payload', { timeout: 15000 });
  const isAlreadyAudio = await challengeFrame.$('.rc-audiochallenge');

  if (!isAlreadyAudio) {
    const audioTab = await challengeFrame.$('div.button-holder.audio-button-holder > button');
    if (!audioTab) {
      console.warn('[reCAPTCHA] ⚠️ 音声切り替えボタン無し');
      await challengeFrame.screenshot({ path: path.join(tmp, `no-audio-${Date.now()}.png`) });
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

  // 音声UIとボタンの状態を待機
  await challengeFrame.waitForSelector('.rc-audiochallenge', { visible: true, timeout: 15000 });
  await challengeFrame.waitForFunction(() => {
    const btn = document.getElementById('recaptcha-audio-button');
    return btn && !btn.disabled;
  }, { timeout: 15000 });

  // 再生ボタンを押し、再生中を確認
  let playBtn;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      playBtn = await waitForSelectorWithRetry(challengeFrame, 'button.rc-audiochallenge-play-button', { interval: 500, maxRetries: 20 });
      await playBtn.click();
      await challengeFrame.waitForFunction(() => {
        const btn = document.querySelector('button.rc-audiochallenge-play-button');
        return btn && (btn.classList.contains('rc-audiochallenge-playing') || /再生中/.test(btn.innerText));
      }, { timeout: 10000 });
      console.log('[reCAPTCHA] ✅ 再生確認');
      break;
    } catch (err) {
      console.warn(`[reCAPTCHA] ⚠️ playBtn retry ${attempt}/3 failed: ${err.message}`);
      await page.waitForTimeout(1000);
    }
  }

  await waitForSelectorWithRetry(challengeFrame, '#audio-response', { interval: 500, maxRetries: 20 });

  // 音声取得 → Whisper → 回答送信
  const audioFilePath = await downloadAudioFromPage(challengeFrame);
  const text = await transcribeAudio(audioFilePath);
  console.log('📝 Whisper 認識結果:', text);

  await (await challengeFrame.$('#audio-response')).type(text.trim(), { delay: 100 });
  await (await challengeFrame.$('button#recaptcha-verify-button')).click();
  console.log('[reCAPTCHA] ✅ 音声回答送信完了');

  await page.waitForTimeout(2000);
  const success = await checkboxFrame.evaluate(() => document.querySelector('#recaptcha-anchor[aria-checked="true"]') !== null);

  try { fs.unlinkSync(audioFilePath); } catch {}
  return success;
}

module.exports = { downloadAudioFromPage, solveRecaptcha };
