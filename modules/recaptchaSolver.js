// modules/recaptchaSolver.js

const path = require('path');
const fs = require('fs');
const { downloadAudioFromPage } = require('./audioDownloader');
const { transcribeAudio } = require('./whisper');
const { reportError } = require('./kw-error');

function waitForSelectorWithRetry(frame, selector, { interval = 1000, maxRetries = 60 } = {}) {
  return (async () => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const el = await frame.$(selector);
        if (el) return el;
      } catch (e) {
        if (e.message.includes('detached')) {
          reportError('E004', e);
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
    reportError('E005', e);
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
      reportError('E006', err, { replace: { attempt } });
      await page.waitForTimeout(1000);
    }
  }

  if (!checkboxFrame) {
    reportError('E007');
    return false;
  }

  let challengeFrame = await refreshChallengeFrame(page);
  if (!challengeFrame) {
    reportError('E008');
    return false;
  }

  return true;
}

module.exports = { solveRecaptcha };
