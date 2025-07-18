const axios = require('axios');
const { GAS_WEBHOOK_URL, TARGET_FACILITY_NAME, INDEX_URL } = require('./constants');

async function sendNotification(label) {
  if (GAS_WEBHOOK_URL) {
    await axios.post(GAS_WEBHOOK_URL, {
      message: `【${TARGET_FACILITY_NAME}】予約状況更新\n日付：${label}\n詳細▶︎${INDEX_URL}`
    });
  }
}

async function sendNoVacancyNotice() {
  if (GAS_WEBHOOK_URL) {
    await axios.post(GAS_WEBHOOK_URL, {
      message: `ℹ️ ${TARGET_FACILITY_NAME} の空きはありませんでした。\n監視URL▶︎${INDEX_URL}`
    });
  }
}

async function sendErrorNotification(err) {
  if (GAS_WEBHOOK_URL) {
    await axios.post(GAS_WEBHOOK_URL, {
      message: '⚠️ エラーが発生しました：\n' + (err.stack || err.message)
    });
  }
}

module.exports = { sendNotification, sendNoVacancyNotice, sendErrorNotification };
