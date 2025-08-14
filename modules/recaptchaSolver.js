// modules/recaptchaSolver.js

const path = require('path');
const fs = require('fs');
const { downloadAudioFromPage } = require('./audioDownloader');
const { transcribeAudio } = require('./whisper');

function waitForSelectorWithRetry(frame, selector, { interval = 1000, maxRetries = 60 } = {}) {
  return (async () => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const el = await frame.$(selector);
        if (el) return el;
      } catch (e) {
        if (e.message.includes('detached')) {
          console.warn(`[waitForSelectorWithRetry] ⚠️ Frame detached while waiting for "${selector}"`);
          break;
        }
      }
      await frame.waitForTimeout(interval);
    }
    throw new Error(`Selector "${selector}" が ${interval * maxRetries}ms 内に見つかりませんでした`);
  })();
}

function randomDelay(min = 200, max = 800) {
  return Math.floor(Math.random() * (max - min)) + min;
}

async function refreshChallengeFrame(page) {
  try {
    const bframeHandle = await waitForSelectorWithRetry(page, 'iframe[src*="/recaptcha/api2/bframe"]');
    return await bframeHandle.contentFrame();
  } catch {
    const titleHandle = await page.$('iframe[title*="recaptcha challenge"]');
    if (titleHandle) return await titleHandle.contentFrame();
  }
  return null;
}

async function saveMp3FromUrl(page, audioUrl) {
  const tmpDir = process.env.LOCAL_SCREENSHOT_DIR || '/tmp/screenshots';
  fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, `audio_${Date.now()}.mp3`);

  const resp = await page.goto(audioUrl, { timeout: 15000, waitUntil: 'networkidle2' });
  if (!resp || !resp.ok()) throw new Error(`audio fetch failed: ${resp && resp.status()}`);

  const buf = await resp.buffer();
  fs.writeFileSync(filePath, buf);

  try {
    const documentsDir = '/home/screenshots';
    fs.mkdirSync(documentsDir, { recursive: true });
    fs.copyFileSync(filePath, path.join(documentsDir, path.basename(filePath)));
  } catch (e) {
    console.warn('[recaptchaSolver] copy to /home/screenshots failed:', e.message);
  }

  return filePath;
}

async function solveRecaptcha(page) {
  console.log('[reCAPTCHA] 🔍 frames:', page.frames().map(f => f.url()).filter(Boolean));

  let checkboxFrame = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const anchorHandle = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 10000 });
      await page.waitForFunction(() => {
        const f = [...document.querySelectorAll('iframe')].find(e => e.src.includes('/recaptcha/api2/anchor'));
        return f && f.contentWindow;
      }, { timeout: 10000 });

      checkboxFrame = await anchorHandle.contentFrame();
      const box = await checkboxFrame.$('.recaptcha-checkbox-border');
      const bb = await box.boundingBox();
      await page.mouse.move(bb.x + bb.width * Math.random(), bb.y + bb.height * Math.random(), { steps: 25 });
      await page.waitForTimeout(500 + Math.random() * 500);
      await page.mouse.click(
        bb.x + bb.width * Math.random(),
        bb.y + bb.height * Math.random(),
        { delay: 120 + Math.random() * 120 }
      );
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

  let challengeFrame = await refreshChallengeFrame(page);
  if (!challengeFrame) {
    console.error('[reCAPTCHA] ❌ challenge iframe取得失敗');
    return false;
  }

  console.log('[reCAPTCHA] ✅ challenge iframe取得OK');

  const tmp = process.env.LOCAL_SCREENSHOT_DIR || '/tmp/screenshots';
  fs.mkdirSync(tmp, { recursive: true });
  await page.screenshot({ path: path.join(tmp, `challenge-debug-${Date.now()}.png`), fullPage: true });

  const alreadyAudio = await challengeFrame.$('.rc-audiochallenge');
  if (!alreadyAudio) {
    const audioTab = await waitForSelectorWithRetry(challengeFrame, 'div.button-holder.audio-button-holder > button', { maxRetries: 20 });
    const bb = await audioTab.boundingBox();
    await page.mouse.move(bb.x + bb.width * Math.random(), bb.y + bb.height * Math.random(), { steps: 25 });
    await page.waitForTimeout(600 + Math.random() * 600);
    await page.mouse.click(
      bb.x + bb.width * Math.random(),
      bb.y + bb.height * Math.random(),
      { delay: 120 + Math.random() * 120 }
    );
    console.log('[recaptchaSolver] ✅ 音声チャレンジへ切替成功');
  } else {
    console.log('[recaptchaSolver] 🎧 既に音声チャレンジ');
  }

  try {
    await challengeFrame.waitForSelector('.rc-audiochallenge', { visible: true, timeout: 30000 });
    await challengeFrame.waitForFunction(() => {
      const audio = document.querySelector('audio');
      return !!(audio && audio.src && audio.src.startsWith('http'));
    }, { timeout: 10000 });
  } catch (err) {
    try {
      await page.screenshot({ path: path.join(tmp, `audio-ui-not-shown-${Date.now()}.png`), fullPage: true });
    } catch {}
    console.warn('[recaptchaSolver] 音声UIまたは音声URL未検出:', err.message);
  }

  const audioPromise = (async () => {
    try {
      let audioSrc;
      try {
        audioSrc = await challengeFrame.evaluate(() => {
          const a = document.querySelector('audio');
          return a ? a.src : null;
        });
      } catch (e) {
        if (e.message.includes('detached')) {
          console.warn('[recaptchaSolver] ⚠️ frame detached while fetching audio, retrying...');
          challengeFrame = await refreshChallengeFrame(page);
          audioSrc = await challengeFrame.evaluate(() => {
            const a = document.querySelector('audio');
            return a ? a.src : null;
          });
        } else {
          throw e;
        }
      }

      if (audioSrc) {
        const p = await saveMp3FromUrl(challengeFrame, audioSrc);
        console.log('[recaptchaSolver] 🎯 audio 直リンクDL成功');
        return p;
      }
      throw new Error('audio src not found');
    } catch (e) {
      console.warn('[recaptchaSolver] 直リンク失敗 → フォールバック採用:', e.message);
    }

    console.log('[recaptchaSolver] ⏬ fallback ダウンロード呼び出し');
    const p = await downloadAudioFromPage(page, challengeFrame); // ← triggerFrame 指定
    console.log('[recaptchaSolver] 🔁 ネットワークフックDL成功');
    return p;
  })();

  const inputPromise = waitForSelectorWithRetry(challengeFrame, '#audio-response', { maxRetries: 30 });
  const sendBtnPromise = waitForSelectorWithRetry(challengeFrame, 'button#recaptcha-verify-button', { maxRetries: 30 });

  const audioFilePath = await audioPromise;
  if (!audioFilePath) {
    console.error('[recaptchaSolver] ❌ audioFilePath が null → 中断');
    return false;
  }

  const transcript = await transcribeAudio(audioFilePath);
  console.log('📝 Whisper 認識結果:', transcript);

  const inputEl = await inputPromise;
  await inputEl.type(transcript.trim(), { delay: 100 });

  const sendBtn = await sendBtnPromise;
  await page.waitForTimeout(randomDelay(300, 600));
  await sendBtn.click();
  console.log('[reCAPTCHA] ✅ 音声回答送信完了');

  await page.waitForTimeout(2000);
  const success = await checkboxFrame.evaluate(() => {
    return document.querySelector('#recaptcha-anchor[aria-checked="true"]') !== null;
  });

  try { if (fs.existsSync(audioFilePath)) fs.unlinkSync(audioFilePath); } catch {}
  return success;
}

module.exports = { solveRecaptcha };
