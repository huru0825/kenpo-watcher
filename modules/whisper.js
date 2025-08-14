// modules/whisper.js

const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { reportError } = require('./kw-error');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function transcribeAudio(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    reportError('E021', null, { replace: { filePath } });
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
    reportError('E022', err, { replace: { message: err.message } });
    return '[API失敗]';
  }
}

module.exports = { transcribeAudio };
