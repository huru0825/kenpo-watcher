// modules/audioDownloader.js

const fs = require('fs');
const path = require('path');
const { reportError } = require('./kw-error');

function copyToDocuments(srcPath) {
  const documentsDir = '/home/screenshots';
  try {
    fs.mkdirSync(documentsDir, { recursive: true });
    const fileName = path.basename(srcPath);
    const destPath = path.join(documentsDir, fileName);
    fs.copyFileSync(srcPath, destPath);
    console.log(`[copy] 📁 ${srcPath} → ${destPath}`);
  } catch (err) {
    reportError('E005', err);
  }
}

async function downloadAudioFromPage(page, triggerFrame) {
  reportError('E018');

  if (!page || typeof page.waitForResponse !== 'function') {
    reportError('E019', new Error('Invalid Page object'), {
      replace: { message: 'Invalid Page object' }
    });
    return null;
  }

  const tmpDir = process.env.LOCAL_SCREENSHOT_DIR || '/tmp/screenshots';
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    await triggerFrame.evaluate(() => {
      const btn = document.querySelector('.rc-audiochallenge-tdownload-link');
      if (btn) btn.click();
    });

    const audioResponse = await page.waitForResponse(
      res =>
        res.url().includes('/recaptcha/api2/payload') &&
        /audio/.test(res.headers()['content-type']),
      { timeout: 15000 }
    );

    const buffer = await audioResponse.buffer();
    const filePath = path.join(tmpDir, `audio_${Date.now()}.mp3`);
    fs.writeFileSync(filePath, buffer);
    copyToDocuments(filePath);
    reportError('E020', null, { replace: { filePath } });
    return filePath;
  } catch (err) {
    reportError('E019', err, { replace: { message: err.message } });
    return null;
  }
}

module.exports = { downloadAudioFromPage };
