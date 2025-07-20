// modules/navigate.js

/**
 * カレンダーが描画されるまで待機するユーティリティ
 */
async function waitCalendar(page) {
  console.log('→ カレンダー領域の検出待機…');

  // 1) 初回にコンテナ自体が現れるのを待機
  try {
    await page.waitForSelector('#calendarContent', { timeout: 60000 });
    console.log('→ #calendarContent 検出完了');
  } catch (err) {
    console.warn('⚠️ #calendarContent が初回待機で検出できませんでした');
  }

  // 2) テーブル本体の有無をチェックし、なければリロードして再トライ
  const maxAttempts = 2;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const calendarRoot  = await page.$('#calendarContent');
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

    // リトライフェーズ
    if (attempt < maxAttempts - 1) {
      console.log('[waitCalendar] カレンダー再読み込みを試行します');
      await page.reload({ waitUntil: 'networkidle2', timeout: 0 });
      await page.waitForTimeout(3000);
    }
  }

  // 3) 最終手段として長めに待つ
  try {
    await page.waitForSelector('#calendarContent table.tb-calendar', { timeout: 180000 });
    console.log('✅ カレンダー領域検出完了（最終 waitForSelector）');
  } catch (err) {
    const html = await page.content();
    console.error('⚠️ カレンダーDOM検出失敗。取得HTML（冒頭2000文字）:\n', html.slice(0, 2000));
    throw err;
  }

  console.log('✅ カレンダーデータ取得完了');
}

/**
 * 翌月ボタンを押してカレンダー再描画を待機
 */
async function nextMonth(page) {
  console.log('[navigate] 次月へ移動リクエスト');
  await Promise.all([
    page.waitForResponse(r =>
      r.url().includes('/calendar_apply/calendar_select') && r.status() === 200
    ),
    page.click('input.button-select.button-primary[value="次へ"]')
  ]);
  console.log('[navigate] 次月レスポンス受信 → カレンダー待機へ');
  await waitCalendar(page);
}

/**
 * 前月ボタンを押してカレンダー再描画を待機
 */
async function prevMonth(page) {
  console.log('[navigate] 前月へ移動リクエスト');
  await Promise.all([
    page.waitForResponse(r =>
      r.url().includes('/calendar_apply/calendar_select') && r.status() === 200
    ),
    page.click('input.button-select.button-primary[value="前へ"]')
  ]);
  console.log('[navigate] 前月レスポンス受信 → カレンダー待機へ');
  await waitCalendar(page);
}

module.exports = { waitCalendar, nextMonth, prevMonth };
