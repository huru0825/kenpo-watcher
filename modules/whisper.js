// modules/whisper.js
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Whisper API を呼び出して音声ファイルを文字起こし
 * @param {string} filePath ローカルに保存された音声ファイルのパス
 * @returns {Promise<string>} 文字起こし結果のテキスト
 */
async function transcribeAudio(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    console.error('[whisper] ❌ 無効なファイルパスが渡されました:', filePath);
    return '[音声取得失敗]';
  }

  const formData = new FormData();
  formData.append('file', fs.createReadStream(filePath));
  formData.append('model', 'whisper-1');

  const headers = {
    ...formData.getHeaders(),
    Authorization: `Bearer ${OPENAI_API_KEY}`
  };

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      formData,
      { headers }
    );
    return response.data.text;
  } catch (err) {
    console.error('[whisper] ❌ API 呼び出し失敗:', err.message);
    return '[API失敗]';
  }
}

module.exports = { transcribeAudio };
