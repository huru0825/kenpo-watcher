// modules/kw-error.js

const errorMap = {
  E001: '[index] ❌ スクリーンショット転送失敗: {{message}}',
  E002: '[index] ❌ solveRecaptcha failed',
  E003: '[index] ❌ run関数内で未処理の例外発生',
  E004: '[recaptchaSolver] iframeがdetachされたためセレクタ待機中断',
  E005: '[recaptchaSolver] 音声ファイルの /home/screenshots へのコピーに失敗: {{message}}',
  E006: '[recaptchaSolver] reCAPTCHAチェックボックスクリック失敗 (試行 {{attempt}}/3)',
  E007: '[recaptchaSolver] チェックボックス frame の取得に失敗',
  E008: '[recaptchaSolver] challenge iframe の取得に失敗',
  E009: '[recaptchaSolver] 音声UIまたは音声URL未検出: {{message}}',
  E010: '[recaptchaSolver] 直リンク失敗 → フォールバック採用: {{message}}',
  E011: '[recaptchaSolver] ⏬ fallback ダウンロード呼び出し',
  E012: '[recaptchaSolver] 🔁 ネットワークフックDL成功',
  E013: '[recaptchaSolver] audioFilePath が null → 中断',
  E014: '[recaptchaSolver] ✅ 音声チャレンジへ切替成功',
  E015: '[recaptchaSolver] 🎧 既に音声チャレンジ',
  E016: '[recaptchaSolver] ✅ チェックボックスクリック',
  E017: '[recaptchaSolver] ✅ challenge iframe取得OK',
  E018: '[audioDownloader] 🎧 音声チャレンジの音源をキャッチ中...',
  E019: '[audioDownloader] ❌ 無効な page オブジェクト',
  E020: '[audioDownloader] ❌ 音声取得失敗: {{message}}',
  E021: '[whisper] ❌ 無効なファイルパスが渡されました: {{filePath}}',
  E022: '[whisper] ❌ API 呼び出し失敗: {{message}}',
  E023: '[waitCalendar] ⚠️ #calendarContent が初回待機で検出できませんでした',
  E024: '[waitCalendar] ⚠️ テーブル未検出（{{attempt}} 回目）',
  E025: '[waitCalendar] ❌ カレンダーDOM検出失敗（HTML先頭取得）: {{html}}',
  E026: '[visitMonth] ⚠️ reCAPTCHA画像チャレンジ検出 → スキップ',
  E027: '[visitMonth] ⚠️ 該当リンクなし（○アイコンなし）',
  E028: '[visitMonth] ⚠️ カレンダー描画待機失敗: {{label}}',
  E029: '[visitMonth] ⚠️ 遷移先でreCAPTCHA出現 → スキップ: {{label}}',
  E030: '[visitMonth] ✅ 一致施設名を確認 → 成功: {{label}}',
  E031: '[visitMonth] ❌ 施設名一致せず: {{label}}',
  E032: '[visitMonth] ℹ️ フィルタ不一致 → スキップ: {{label}}',
  E033: '[notifier] ❌ 通知送信失敗: label={{label}}',
  E034: '[notifier] ❌ 空きなし通知送信失敗',
  E035: '[notifier] ❌ エラー通知送信失敗（元エラー: {{message}}）',
  E036: '[constants] unused fixedCookies definition removed',
  E037: '[cookieSelector|spreadsheet] ℹ️ GAS_WEBHOOK_URL 未設定 → Cookie 取得をスキップ',
  E038: '[cookieSelector|spreadsheet] ⚠️ スプレッドシートから Cookie 取得失敗: {{message}}',
  E039: '[cookieUpdater] ファイル保存に失敗: {{message}}',
  E040: '[cookieUpdater|spreadsheet] ℹ️ GAS_WEBHOOK_URL 未設定 → Cookie 書き込みをスキップ',
  E041: '[cookieUpdater|spreadsheet] ❌ スプレッドシートへの Cookie 送信失敗: {{message}}'
};

function renderMessage(template, replace = {}) {
  return template.replace(/{{(.*?)}}/g, (_, key) => replace[key] ?? '');
}

function reportError(code, err = null, options = {}) {
  const template = errorMap[code] || '不明なエラー';
  const message = renderMessage(template, options.replace || {});
  if (err) {
    console.error(`❌ [${code}] ${message}`, err);
  } else {
    console.warn(`⚠️ [${code}] ${message}`);
  }
}

module.exports = { reportError };
