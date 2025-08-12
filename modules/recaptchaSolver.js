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

  // 🔄 条件を分割して段階的に処理を進める
  try {
    // 1. .rc-audiochallenge の表示確認
    await challengeFrame.waitForSelector('.rc-audiochallenge', { visible: true, timeout: 30000 });

    // 2. audio 要素の src 属性が読み込まれるのを待機（Whisper 解析用）
    await challengeFrame.waitForFunction(() => {
      const audio = document.querySelector('audio');
      return audio && audio.src && audio.src.startsWith('https://');
    }, { timeout: 10000 });

  } catch (err) {
    await page.screenshot({ path: path.join(tmp, `audio-ui-not-shown-${Date.now()}.png`), fullPage: true });
    console.warn('[recaptchaSolver] 音声UIまたは音声ファイル未検出:', err.message);
    return false;
  }

  // 🔊 音声取得 & Whisper 解析（非同期開始）
  const audioPromise = (async () => {
    const audioFilePath = await downloadAudioFromPage(challengeFrame);
    const transcript = await transcribeAudio(audioFilePath);
    console.log('📝 Whisper 認識結果:', transcript);
    return { audioFilePath, transcript };
  })();

  // ⌨️ 入力欄と送信ボタンの同時待機（非同期）
  const inputPromise = waitForSelectorWithRetry(challengeFrame, '#audio-response', { maxRetries: 20 });
  const sendBtnPromise = waitForSelectorWithRetry(challengeFrame, 'button#recaptcha-verify-button', { maxRetries: 20 });

  const { audioFilePath, transcript } = await audioPromise;
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

  if (fs.existsSync(audioFilePath)) fs.unlinkSync(audioFilePath);
  return success;
}

module.exports = { solveRecaptcha };
