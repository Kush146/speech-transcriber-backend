import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

const LOCAL_WHISPER_URL = process.env.LOCAL_WHISPER_URL || 'http://127.0.0.1:7860';

export async function transcribeLocal(filePath) {
  const form = new FormData();
  // MUST be 'file' to match Flask
  form.append('file', fs.createReadStream(filePath));

  try {
    const r = await axios.post(`${LOCAL_WHISPER_URL}/transcribe`, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      timeout: 120000, // 2 minutes
    });

    // Normalize output so frontend always gets consistent fields
    return {
      text: r.data.text || '',
      language: r.data.language || 'unknown',
      duration: r.data.duration || null,
    };
  } catch (err) {
    console.error('Local Whisper error:', err.response?.data || err.message);
    throw new Error(err.response?.data?.error || 'Local whisper failed');
  }
}
