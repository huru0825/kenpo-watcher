// audioDownloader.js
      { timeout: 5000 }
    );
    console.log('[reCAPTCHA] ✅ 音声チャレンジUI検出');
  } catch {
    console.warn('[reCAPTCHA] ⚠️ 音声UI検出失敗 → 再生へ直接進む');
  }

  // ――――― ここから追加 ―――――
  // 8a. Downloadリンク／入力欄／確認ボタン の存在チェック
  await Promise.all([
    challengeFrame.waitForSelector('#audio-response',                   { timeout: 5000 }),
    challengeFrame.waitForSelector('a.rc-audiochallenge-tdownload-link', { timeout: 5000 }),
    challengeFrame.waitForSelector('button#recaptcha-verify-button',    { timeout: 5000 }),
  ]);
  console.log('[reCAPTCHA] ✅ Download/UI/確認ボタン 全部OK');
  // ――――― 追加ここまで ―――――

  // 8. 再生（Play）フェーズ
  const playSelectors = [
    'button.rc-button-default.goog-inline-block',
    'button[aria-labelledby="audio-instructions"]',
    'button.rc-audiochallenge-play-button',
  ];
  let played = false;
  console.log('[reCAPTCHA] ▶ 再生ボタンを試行');
  for (const sel of playSelectors) {
    try {
      const btn = await challengeFrame.waitForSelector(sel, { visible: true, timeout: 5000 });
      await btn.click();
      console.log(`[reCAPTCHA] ✅ '${sel}' で再生ボタン押下`);
      played = true;
      break;
    } catch {
      console.log(`[reCAPTCHA] ⚠️ '${sel}' 未検出 or クリック失敗`);
    }
  }
  if (!played) {
    console.error('[reCAPTCHA] ❌ 再生ボタン押下に完全失敗');
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

module.exports = 
  downloadAudioFromPage,
  solveRecaptcha
};
