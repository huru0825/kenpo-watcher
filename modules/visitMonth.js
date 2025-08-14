// modules/visitMonth.js

const { DATE_FILTER_LIST, DAY_FILTER, TARGET_DAY_RAW, TARGET_FACILITY_NAME } = require('./constants');
const { reportError } = require('./kw-error');

async function visitMonth(page, includeDateFilter) {
  console.log('[visitMonth] 実行開始');

  const anchor = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 1000 }).catch(() => null);
  const challenge = await page.waitForSelector('iframe[src*="/recaptcha/api2/bframe"], .rc-imageselect', { timeout: 1000 }).catch(() => null);

  if (challenge && !anchor) {
    reportError('E026');
    return [];
  }

  console.log('[visitMonth] ○アイコン付きリンクを抽出中...');
  const available = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a'))
      .filter(a => a.querySelector('img[src*="icon_circle.png"]'))
      .map(a => ({ href: a.href, label: a.textContent.trim() }))
  );

  if (available.length === 0) {
    reportError('E027');
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

      try {
        await page.waitForSelector('.tb-calendar tbody td', { timeout: 10000 });
        await page.waitForTimeout(1000);
      } catch (e) {
        reportError('E028', e, { replace: { label } });
        continue;
      }

      const ia = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 1000 }).catch(() => null);
      const ii = await page.waitForSelector('iframe[src*="/recaptcha/api2/bframe"], .rc-imageselect', { timeout: 1000 }).catch(() => null);
      if (ii && !ia) {
        reportError('E029', null, { replace: { label } });
        await page.goBack({ waitUntil: 'networkidle2' }).catch(() => {});
        continue;
      }

      await page.waitForTimeout(1000);

      const found = await page.evaluate(name =>
        Array.from(document.querySelectorAll('a')).some(a => a.textContent.includes(name)), TARGET_FACILITY_NAME
      );

      if (found) {
        reportError('E030', null, { replace: { label } });
        hits.push(label);
      } else {
        reportError('E031', null, { replace: { label } });
      }

      await page.goBack({ waitUntil: 'networkidle2' }).catch(() => {});
    } else {
      reportError('E032', null, { replace: { label } });
    }
  }

  console.log(`[visitMonth] 結果: ${hits.length} 件ヒット`);
  return hits;
}

module.exports = { visitMonth };
