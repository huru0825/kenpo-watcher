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
  // --- ヘルパー: フレーム内のセレクタ存在チェック用ログ ---
  async function logExistingSelectors(frame, selectors) {
    for (const sel of selectors) {
      const found = await frame.$(sel);
      console.log(
        found
          ? `[reCAPTCHA][DEBUG] 存在: '${sel}'`
          : `[reCAPTCHA][DEBUG] 未発見: '${sel}'`
      );
    }
  }

  // 1. 全フレーム URL をログ出力
  console.log('[reCAPTCHA] 🔍 frames:', page.frames().map(f => f.url()).filter(u => u));

  // 2. チェックボックス iframe 抽出
  const anchorHandle = await page
    .waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 20000 })
    .catch(() => null);
  if (!anchorHandle) return false;
  const checkboxFrame = await anchorHandle.contentFrame();
  if (!checkboxFrame) return false;
  console.log('[reCAPTCHA] ✅ reCAPTCHAチェックボックス表示確認OK');

  // 3. チェックボックスクリック
  console.log('[reCAPTCHA] ▶ チェックボックスクリックを試行');
  try {
    await checkboxFrame.waitForSelector('.recaptcha-checkbox-border', { timeout: 10000 });
    await checkboxFrame.click('.recaptcha-checkbox-border');
    console.log('[reCAPTCHA] ✅ チェックボックスクリック成功');
  } catch {
    console.error('[reCAPTCHA] ❌ チェックボックスクリック失敗');
    return false;
  }

  // 4. challenge iframe の取得
  console.log('[reCAPTCHA] ▶ challenge 用 iframe を最大60秒待つ');
  await page.waitForTimeout(20000);
  let bframeHandle = await page
    .waitForSelector('iframe[src*="/recaptcha/api2/bframe"]', { timeout: 60000 })
    .catch(() => null);

  let challengeFrame = bframeHandle
    ? await bframeHandle.contentFrame()
    : page.frames().find(f =>
        (f.url() && f.url().includes('/recaptcha/api2/bframe')) ||
        f.name().startsWith('a-')
      );
  if (!challengeFrame) {
    const titleHandle = await page.$('iframe[title*="recaptcha challenge"]');
    if (titleHandle) challengeFrame = await titleHandle.contentFrame();
  }
  if (!challengeFrame) {
    console.error('[reCAPTCHA] ❌ チャレンジ用iframe取得失敗');
    return false;
  }
  console.log('[reCAPTCHA] ✅ challenge iframe 取得OK');

  // デバッグ: 画像認証スクショ
  const debugDir = path.resolve(__dirname, '../tmp');
  fs.mkdirSync(debugDir, { recursive: true });
  const debugShot1 = path.join(debugDir, `challenge-debug-${Date.now()}.png`);
  await page.screenshot({ path: debugShot1, fullPage: true });
  console.log(`[reCAPTCHA] 🖼️ 画像認証画面スクショ: tmp/${path.basename(debugShot1)}`);

  // 5. 音声チャレンジ切り替えフェーズ（さらに強化）
  await page.waitForTimeout(15000);

  // 英語・日本語ロケール両対応＋古いクラス名
  const toggleSelectors = [
    '#recaptcha-audio-button',      // ID
    'button.rc-button-audio',       // 古いバージョン
    'button[aria-label*="audio"]',  // en locale
    'button[aria-label*="音声"]',    // ja locale
    'button[title*="audio"]',       // title=en
    'button[title*="音声"]'         // title=ja
  ];

  let toggled = false;
  console.log('[reCAPTCHA] ▶ 音声チャレンジ切り替えボタンを試行');
  for (const sel of toggleSelectors) {
    try {
      await challengeFrame.waitForSelector(sel, { visible: true, timeout: 3000 });
      await challengeFrame.evaluate(s => document.querySelector(s).click(), sel);
      console.log(`[reCAPTCHA] ✅ '${sel}' で音声チャレンジに切り替え`);
      toggled = true;
      break;
    } catch {
      console.log(`[reCAPTCHA] ⚠️ '${sel}' が見つからない or クリック失敗`);
    }
  }

  // フェイルセーフ1: .rc-button-default を generic に拾う
  if (!toggled) {
    const iconEls = await challengeFrame.$$('.rc-button-default');
    console.log(`[reCAPTCHA][DEBUG] rc-button-default 要素数: ${iconEls.length}`);
    if (iconEls.length >= 2) {
      await iconEls[1].click();
      console.log('[reCAPTCHA] ✅ フェイルセーフ: 2番目の .rc-button-default をクリック');
      toggled = true;
    }
  }

  // フェイルセーフ2: role=button 全体を試す
  if (!toggled) {
    const roleEls = await challengeFrame.$$('[role="button"]');
    console.log(`[reCAPTCHA][DEBUG] role=button 要素数: ${roleEls.length}`);
    for (let i = 0; i < roleEls.length && !toggled; i++) {
      try {
        await roleEls[i].click();
        console.log(`[reCAPTCHA] ✅ フェイルセーフ: role=button index ${i} をクリック`);
        toggled = true;
      } catch {}
    }
  }

  if (!toggled) {
    console.error('[reCAPTCHA] ❌ 音声チャレンジ切り替えに完全失敗');
    return false;
  }

  // 切り替え後に少し待って iframe を再取得
  await page.waitForTimeout(500);
  {
    const newB = await page.$('iframe[src*="/recaptcha/api2/bframe"]');
    if (newB) {
      challengeFrame = await newB.contentFrame();
      console.log('[reCAPTCHA][DEBUG] 別 bframe を再取得');
    }
  }

  // —— ここからDOMダンプ —— 
  const html = await challengeFrame.evaluate(() => document.documentElement.innerHTML);
  console.log('[reCAPTCHA][DEBUG] challengeFrame HTML:', html.slice(0, 2000));
  // （必要ならファイル出力も可能）
  // fs.writeFileSync(path.join(debugDir, 'frame.html'), html, 'utf8');

  // 切り替え後の UI 要素チェック
  console.log('[reCAPTCHA] 🔍 切り替え後の UI 要素チェック');
  await logExistingSelectors(challengeFrame, [
    '#audio-response',
    'a.rc-audiochallenge-tdownload-link'
  ]);

  // 6. 音声チャレンジUIの検出（回答欄 or ダウンロードリンク）
  try {
    await challengeFrame.waitForSelector(
      '#audio-response, a.rc-audiochallenge-tdownload-link',
      { timeout: 10000 }
    );
    console.log('[reCAPTCHA] ✅ 音声チャレンジUI検出');
  } catch {
    console.error('[reCAPTCHA] ❌ 音声チャレンジUI検出に失敗');
    const failShot = path.join(debugDir, `audio-toggle-fail-${Date.now()}.png`);
    await page.screenshot({ path: failShot, fullPage: true });
    console.log(`[reCAPTCHA] 📷 フォールト画面スクショ: tmp/${path.basename(failShot)}`);
    return false;
  }

  // 7. 再生（Play）フェーズ
  const playSelectors = [
    'button.rc-audiochallenge-play-button',
    'button[aria-label="Play audio challenge"]',
  ];
  let played = false;
  console.log('[reCAPTCHA] ▶ 再生ボタンを試行');
  for (const sel of playSelectors) {
    try {
      await challengeFrame.waitForSelector(sel, { visible: true, timeout: 5000 });
      await challengeFrame.evaluate(s => document.querySelector(s).click(), sel);
      console.log(`[reCAPTCHA] ✅ '${sel}' で再生ボタン押下`);
      played = true;
      break;
    } catch {
      console.log(`[reCAPTCHA] ⚠️ '${sel}' 再生ボタン未検出orクリック失敗`);
    }
  }
  if (!played) {
    console.error('[reCAPTCHA] ❌ 再生ボタン押下に失敗');
    return false;
  }

  // 8. ダウンロード→Whisper→入力→検証
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
