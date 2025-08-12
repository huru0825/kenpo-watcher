// modules/recaptchaSolver.js

const path = require('path');
const fs = require('fs');
const { downloadAudioFromPage } = require('./audioDownloader');
const { transcribeAudio } = require('./whisper');

function waitForSelectorWithRetry(frame, selector, { interval = 1000, maxRetries = 60 } = {}) {
  return (async () => {
    for (let i = 0; i < maxRetries; i++) {
      const el = await frame.$(selector);
      if (el) return el;
      await frame.waitForTimeout(interval);
    }
    throw new Error(`Selector "${selector}" が ${interval * maxRetries}ms 内に見つかりませんでした`);
  })();
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
        const f = [...document.querySelectorAll('iframe')].find(e => e.src.includes('/recaptcha/api2/anchor'));
        return f && f.contentWindow;
      }, { timeout: 10000 });
      checkboxFrame = await anchorHandle.contentFrame();
      const box = await checkboxFrame.$('.recaptcha-checkbox-border');
      const boxBox = await box.boundingBox();
      await page.mouse.move(boxBox.x + boxBox.width * Math.random(), boxBox.y + boxBox.height * Math.random(), { steps: 25 });
      await page.waitForTimeout(500 + Math.random() * 500);
      await page.mouse.click(
        boxBox.x + boxBox.width * Math.random(),
        boxBox.y + boxBox.height * Math.random(),
        { delay: 150 + Math.random() * 100 }
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

  let challengeFrame = null;
  try {
    const bframeHandle = await waitForSelectorWithRetry(page, 'iframe[src*="/recaptcha/api2/bframe"]');
    challengeFrame = await bframeHandle.contentFrame();
  } catch {
    const titleHandle = await page.$('iframe[title*="recaptcha challenge"]');
    if (titleHandle) challengeFrame = await titleHandle.contentFrame();
  }
  if (!challengeFrame) {
    console.error('[reCAPTCHA] ❌ challenge iframe取得失敗');
    return false;
  }
  console.log('[reCAPTCHA] ✅ challenge iframe取得OK');

  const tmp = process.env.LOCAL_SCREENSHOT_DIR || '/tmp/screenshots';
  fs.mkdirSync(tmp, { recursive: true });
  await page.screenshot({ path: path.join(tmp, `challenge-debug-${Date.now()}.png`), fullPage: true });

  const isAlreadyAudio = await challengeFrame.$('.rc-audiochallenge');
  if (!isAlreadyAudio) {
    const audioTab = await waitForSelectorWithRetry(challengeFrame, 'div.button-holder.audio-button-holder > button', { maxRetries: 20 });
    if (!audioTab) {
      await page.screenshot({ path: path.join(tmp, `no-audio-button-${Date.now()}.png`), fullPage: true });
      console.warn('[recaptchaSolver] 音声切替ボタン未検出');
      return false;
    }
    const tabBox = await audioTab.boundingBox();
    await page.mouse.move(tabBox.x + tabBox.width * Math.random(), tabBox.y + tabBox.height * Math.random(), { steps: 25 });
    await page.waitForTimeout(600 + Math.random() * 600);
    await page.mouse.click(
      tabBox.x + tabBox.width * Math.random(),
      tabBox.y + tabBox.height * Math.random(),
      { delay: 150 + Math.random() * 100 }
    );
    console.log('[recaptchaSolver] ✅ 音声チャレンジへ切替成功');
  } else {
    console.log('[recaptchaSolver] 🎧 既に音声チャレンジ');
  }

  try {
    await challengeFrame.waitForSelector('.rc-audiochallenge', { visible: true, timeout: 30000 });
  } catch {
    await page.screenshot({ path: path.join(tmp, `audio-ui-not-shown-${Date.now()}.png`), fullPage: true });
    console.warn('[recaptchaSolver] 音声UI出現せずタイムアウト');
    return false;
  }

  await challengeFrame.waitForFunction(() => {
    const btn = document.getElementById('recaptcha-audio-button');
    return btn && !btn.disabled;
  }, { timeout: 20000 });

  const audioFilePath = await downloadAudioFromPage(challengeFrame);
  const transcript = await transcribeAudio(audioFilePath);
  console.log('📝 Whisper 認識結果:', transcript);

  await (await challengeFrame.$('#audio-response')).type(transcript.trim(), { delay: 100 });
  await (await challengeFrame.$('button#recaptcha-verify-button')).click();
  console.log('[reCAPTCHA] ✅ 音声回答送信完了');

  await page.waitForTimeout(2000);
  const success = await checkboxFrame.evaluate(() => {
    return document.querySelector('#recaptcha-anchor[aria-checked="true"]') !== null;
  });

  if (fs.existsSync(audioFilePath)) fs.unlinkSync(audioFilePath);
  return success;
}

module.exports = { solveRecaptcha };
