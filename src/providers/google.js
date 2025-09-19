import fs from 'fs'
import speech from '@google-cloud/speech'
const client = new speech.SpeechClient()
const languageCode = process.env.GOOGLE_STT_LANGUAGE || 'en-US'
export async function transcribe({ filePath }){
  const audioBytes = fs.readFileSync(filePath).toString('base64')
  const [response] = await client.recognize({
    audio: { content: audioBytes },
    config: { languageCode, enableAutomaticPunctuation: true, encoding: 'ENCODING_UNSPECIFIED' }
  })
  const text = (response.results||[]).map(r=>r.alternatives?.[0]?.transcript||'').join(' ').trim()
  return { text, duration: null }
}
