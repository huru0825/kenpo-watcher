const { DATE_FILTER_LIST, DAY_FILTER, TARGET_DAY_RAW, TARGET_FACILITY_NAME } = require('./constants');

async function visitMonth(page, includeDateFilter) {
  const anchor = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 1000 }).catch(() => null);
  const challenge = await page.waitForSelector('iframe[src*="/recaptcha/api2/bframe"], .rc-imageselect', { timeout: 1000 }).catch(() => null);
  if (challenge && !anchor) return [];

  const available = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a'))
      .filter(a => a.querySelector('img[src*="icon_circle.png"]'))
      .map(a => ({ href: a.href, label: a.textContent.trim() }))
  );

  const hits = [];

  for (const { href, label } of available) {
    const byDate = includeDateFilter && DATE_FILTER_LIST.some(d => label.includes(d));
    const byDay = !DATE_FILTER_LIST.length && DAY_FILTER && label.includes(TARGET_DAY_RAW);
    if (byDate || byDay) {
      await page.goto(href, { waitUntil: 'networkidle2', timeout: 0 });
      await page.waitForFunction(() => document.querySelectorAll('.tb-calendar tbody td').length > 0, { timeout: 0 });

      const ia = await page.waitForSelector('iframe[src*="/recaptcha/api2/anchor"]', { timeout: 1000 }).catch(() => null);
      const ii = await page.waitForSelector('iframe[src*="/recaptcha/api2/bframe"], .rc-imageselect', { timeout: 1000 }).catch(() => null);
      if (ii && !ia) {
        await page.goBack({ waitUntil: 'networkidle2' }).catch(() => {});
        continue;
      }

      const found = await page.evaluate(name =>
        Array.from(document.querySelectorAll('a')).some(a => a.textContent.includes(name)), TARGET_FACILITY_NAME
      );
      if (found) hits.push(label);

      await page.goBack({ waitUntil: 'networkidle2' }).catch(() => {});
    }
  }

  return hits;
}

module.exports = { visitMonth };
