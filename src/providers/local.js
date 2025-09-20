import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

const LOCAL_WHISPER_URL = process.env.LOCAL_WHISPER_URL;

export async function transcribeLocal({ filePath }) {
  if (!LOCAL_WHISPER_URL) {
    throw new Error('LOCAL_WHISPER_URL is not set');
  }

  const form = new FormData();
  // Flask expects "file"
  form.append('file', fs.createReadStream(filePath));

  const url = `${LOCAL_WHISPER_URL}/transcribe`;
  console.log('[local] POST', url);

  try {
    const r = await axios.post(url, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      timeout: 300000, // 5 minutes (model can take time to load on free tier)
    });
    return r.data; // { text, language, duration }
  } catch (err) {
    const msg = err.response?.data || err.message;
    console.error('[local] whisper error:', msg);
    throw new Error(err.response?.data?.error || 'Local whisper failed');
  }
}
