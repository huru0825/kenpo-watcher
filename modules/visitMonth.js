const { DATE_FILTER_LIST, DAY_FILTER, TARGET_DAY_RAW, TARGET_FACILITY_NAME } = require('./constants');

async function visitMonth(page, includeDateFilter) {
  console.log('[visitMonth] 実行開始');

  // 最初のreCAPTCHA検出
  const anchor = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 1000 }).catch(() => null);
  const challenge = await page.waitForSelector('iframe[src*="/recaptcha/api2/bframe"], .rc-imageselect', { timeout: 1000 }).catch(() => null);

  if (challenge && !anchor) {
    console.warn('[visitMonth] reCAPTCHA画像チャレンジ検出 → スキップ');
    return [];
  }

  console.log('[visitMonth] ○アイコン付きリンクを抽出中...');
  const available = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a'))
      .filter(a => a.querySelector('img[src*="icon_circle.png"]'))
      .map(a => ({ href: a.href, label: a.textContent.trim() }))
  );

  if (available.length === 0) {
    console.log('[visitMonth] 該当リンクなし（○アイコンなし）');
    return [];
  } else {
    console.log(`[visitMonth] ○アイコン検出 ${available.length} 件`);
  }

  const hits = [];

  for (const { href, label } of available) {
    const byDate = includeDateFilter && DATE_FILTER_LIST.some(d => label.includes(d));
    const byDay = !DATE_FILTER_LIST.length && DAY_FILTER && label.includes(TARGET_DAY_RAW);

    if (byDate || byDay) {
      console.log(`[visitMonth] 対象候補: "${label}" → 遷移検証`);

      await page.goto(href, { waitUntil: 'networkidle2', timeout: 0 });
      await page.waitForFunction(() => document.querySelectorAll('.tb-calendar tbody td').length > 0, { timeout: 0 });

      const ia = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 1000 }).catch(() => null);
      const ii = await page.waitForSelector('iframe[src*="/recaptcha/api2/bframe"], .rc-imageselect', { timeout: 1000 }).catch(() => null);
      if (ii && !ia) {
        console.warn(`[visitMonth] 遷移先でreCAPTCHA出現 → スキップ: ${label}`);
        await page.goBack({ waitUntil: 'networkidle2' }).catch(() => {});
        continue;
      }

      const found = await page.evaluate(name =>
        Array.from(document.querySelectorAll('a')).some(a => a.textContent.includes(name)), TARGET_FACILITY_NAME
      );

      if (found) {
        console.log(`[visitMonth] ✅ 一致施設名を確認 → 成功: ${label}`);
        hits.push(label);
      } else {
        console.log(`[visitMonth] ❌ 施設名一致せず: ${label}`);
      }

      await page.goBack({ waitUntil: 'networkidle2' }).catch(() => {});
    } else {
      console.log(`[visitMonth] フィルタ不一致 → スキップ: ${label}`);
    }
  }

  console.log(`[visitMonth] 結果: ${hits.length} 件ヒット`);
  return hits;
}

module.exports = { visitMonth };
