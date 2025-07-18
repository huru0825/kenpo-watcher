const fs = require('fs');
const path = require('path');

const INDEX_URL = 'https://as.its-kenpo.or.jp/service_category/index';
const GAS_WEBHOOK_URL = process.env.GAS_WEBHOOK_URL;
const TARGET_FACILITY_NAME = process.env.TARGET_FACILITY_NAME || '';
const DAY_FILTER_RAW = process.env.DAY_FILTER || '土曜日';
const DATE_FILTER_RAW = process.env.DATE_FILTER || '';
const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH;

if (!CHROME_PATH) throw new Error('PUPPETEER_EXECUTABLE_PATH が未設定です');
if (!GAS_WEBHOOK_URL) console.warn('※ GAS_WEBHOOK_URL が未設定です（通知対象はAブラウザのみ）');

const DAY_MAP = {
  '日曜日': 'Sunday', '月曜日': 'Monday', '火曜日': 'Tuesday',
  '水曜日': 'Wednesday', '木曜日': 'Thursday', '金曜日': 'Friday', '土曜日': 'Saturday'
};

function normalizeDates(raw) {
  return raw.replace(/、/g, ',').split(',').map(d => d.trim()).filter(Boolean).map(date => {
    const m = date.match(/^(\d{1,2})月(\d{1,2})日$/);
    return m ? m[1].padStart(2, '0') + '月' + m[2].padStart(2, '0') + '日' : null;
  }).filter(Boolean);
}

const DATE_FILTER_LIST = normalizeDates(DATE_FILTER_RAW);
const DAY_FILTER = DAY_MAP[DAY_FILTER_RAW] || null;
const TARGET_DAY_RAW = DAY_FILTER_RAW;

const fixedCookies = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../Cookie.json'), 'utf-8'));

module.exports = {
  INDEX_URL,
  GAS_WEBHOOK_URL,
  TARGET_FACILITY_NAME,
  DAY_FILTER,
  DATE_FILTER_LIST,
  TARGET_DAY_RAW,
  fixedCookies,
  CHROME_PATH
};
