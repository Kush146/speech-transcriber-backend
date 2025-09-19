import axios from 'axios'
import fs from 'fs'
import FormData from 'form-data'
const BASE = process.env.LOCAL_WHISPER_URL || 'http://127.0.0.1:7860'
export async function transcribe({ filePath, fileName }){
  const form = new FormData()
  form.append('file', fs.createReadStream(filePath), fileName||'audio.webm')
  const resp = await axios.post(`${BASE}/transcribe`, form, { headers: form.getHeaders(), timeout: 120000, validateStatus: ()=>true })
  if(resp.status!==200){ const e = new Error(resp.data?.error || `local whisper error ${resp.status}`); e.status = resp.status; throw e }
  return { text: resp.data?.text || '', duration: resp.data?.duration || null }
}
