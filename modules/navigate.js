/**
 * カレンダーが描画されるまで待機するユーティリティ
 */
async function waitCalendar(page) {
  console.log('→ カレンダー領域の検出待機…');

  // 1) #calendarContent が現れるのを待つ
  try {
    await page.waitForSelector('#calendarContent', { timeout: 60000 });
    console.log('→ #calendarContent 検出完了');
  } catch {
    console.warn('⚠️ #calendarContent が初回待機で検出できませんでした');
  }

  // 2) table.tb-calendar があるかリロード込みで最大2回チェック
  for (let attempt = 1; attempt <= 2; attempt++) {
    const root = await page.$('#calendarContent');
    const table = await page.$('#calendarContent table.tb-calendar');
    if (root && table) {
      console.log('✅ カレンダー領域検出完了（再読み込みなし）');
      return;
    }
    console.warn(`[waitCalendar] テーブル未検出（${attempt} 回目）`);
    await page.reload({ waitUntil: 'networkidle2', timeout: 0 });
    await page.waitForTimeout(3000);
  }

  // 3) 最終手段で長めに待機
  try {
    await page.waitForSelector('#calendarContent table.tb-calendar', { timeout: 180000 });
    console.log('✅ カレンダー領域検出完了（最終待機）');
  } catch (err) {
    const html = await page.content();
    console.error('⚠️ カレンダーDOM検出失敗。取得HTML:', html.slice(0, 2000));
    throw err;
  }
}

/**
 * 翌月ボタンを押してカレンダー再描画待機
 */
async function nextMonth(page) {
  console.log('[navigate] 次月へ移動リクエスト');
  await Promise.all([
    page.waitForResponse(r =>
      r.url().includes('/calendar_apply/calendar_select') && r.status() === 200
    ),
    page.click('input.button-select.button-primary[value="次へ"]')
  ]);
  console.log('[navigate] 次月レスポンス受信');
  await waitCalendar(page);
}

/**
 * 前月ボタンを押してカレンダー再描画待機
 */
async function prevMonth(page) {
  console.log('[navigate] 前月へ移動リクエスト');
  await Promise.all([
    page.waitForResponse(r =>
      r.url().includes('/calendar_apply/calendar_select') && r.status() === 200
    ),
    page.click('input.button-select.button-primary[value="前へ"]')
  ]);
  console.log('[navigate] 前月レスポンス受信');
  await waitCalendar(page);
}

module.exports = { waitCalendar, nextMonth, prevMonth };
