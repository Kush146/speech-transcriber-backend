import fs from 'fs'
import axios from 'axios'
import FormData from 'form-data'
const KEY = process.env.OPENAI_API_KEY
const MODEL = process.env.OPENAI_MODEL || 'whisper-1'
async function callOpenAI(form, attempt=1){
  const resp = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
    headers: { ...form.getHeaders(), Authorization: `Bearer ${KEY}` },
    timeout: 20000, maxBodyLength: Infinity, maxContentLength: Infinity, validateStatus: ()=>true
  })
  if(resp.status===200) return resp.data
  if((resp.status===429||resp.status>=500) && attempt<3){ await new Promise(r=>setTimeout(r,1000*2**(attempt-1))); return callOpenAI(form, attempt+1) }
  const err = new Error(resp.data?.error?.message || `OpenAI error ${resp.status}`); err.status = resp.status; throw err
}
export async function transcribe({filePath,fileName}){
  if(!KEY) throw new Error('OPENAI_API_KEY is not set')
  const form = new FormData()
  form.append('file', fs.createReadStream(filePath), fileName||'audio.webm')
  form.append('model', MODEL)
  const data = await callOpenAI(form)
  return { text: data.text || '', duration: null }
}
