async function waitCalendar(page) {
  console.log('→ カレンダー領域の検出待機…');
  await page.waitForSelector('#calendarContent table.tb-calendar', { timeout: 180000 });
  console.log('→ カレンダー領域検出完了');
  await page.waitForResponse(r =>
    r.url().includes('/calendar_apply/calendar_select') && r.status() === 200
  );
  console.log('→ カレンダーデータ取得完了');
}

async function nextMonth(page) {
  await page.click('input.button-select.button-primary[value="次へ"]');
  await waitCalendar(page);
}

async function prevMonth(page) {
  await page.click('input.button-select.button-primary[value="前へ"]');
  await waitCalendar(page);
}

module.exports = { waitCalendar, nextMonth, prevMonth };
