const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function transcribeAudio(filePath) {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(filePath));
  formData.append('model', 'whisper-1');

  const headers = {
    ...formData.getHeaders(),
    Authorization: `Bearer ${OPENAI_API_KEY}`
  };

  const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
    headers
  });

  return response.data.text;
}

module.exports = { transcribeAudio };
