async function waitCalendar(page) {
  console.log('→ カレンダー領域の検出待機…');

  const maxAttempts = 2;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const calendarRoot = await page.$('#calendarContent');
    const calendarTable = await page.$('#calendarContent table.tb-calendar');

    if (!calendarRoot) {
      console.warn(`[waitCalendar] #calendarContent が存在しません（${attempt + 1}回目）`);
    } else if (!calendarTable) {
      console.warn(`[waitCalendar] table.tb-calendar が存在しません（${attempt + 1}回目）`);
    }

    if (calendarRoot && calendarTable) {
      console.log('✅ カレンダー領域検出完了（再読み込みなし）');
      console.log('✅ カレンダーデータ取得完了');
      return;
    }

    if (attempt < maxAttempts - 1) {
      console.log('[waitCalendar] カレンダー再読み込みを試行します');
      await page.reload({ waitUntil: 'networkidle2', timeout: 0 });
      await page.waitForTimeout(3000);
    }
  }

  try {
    await page.waitForSelector('#calendarContent table.tb-calendar', { timeout: 180000 });
    console.log('✅ カレンダー領域検出完了（最終waitForSelector）');
  } catch (err) {
    const html = await page.content();
    console.log('⚠️ カレンダーDOM検出失敗。取得HTML（冒頭2000文字）:\n', html.slice(0, 2000));
    throw err;
  }

  console.log('✅ カレンダーデータ取得完了');
}

async function nextMonth(page) {
  await page.waitForSelector('input.button-select.button-primary[value="次へ"]', { timeout: 10000 });
  await Promise.all([
    page.waitForResponse(r =>
      r.url().includes('/calendar_apply/calendar_select') && r.status() === 200
    ),
    page.click('input.button-select.button-primary[value="次へ"]')
  ]);
  await waitCalendar(page);
}

async function prevMonth(page) {
  await page.waitForSelector('input.button-select.button-primary[value="前へ"]', { timeout: 10000 });
  await Promise.all([
    page.waitForResponse(r =>
      r.url().includes('/calendar_apply/calendar_select') && r.status() === 200
    ),
    page.click('input.button-select.button-primary[value="前へ"]')
  ]);
  await waitCalendar(page);
}

module.exports = { waitCalendar, nextMonth, prevMonth };
