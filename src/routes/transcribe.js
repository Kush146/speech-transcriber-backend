import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { Transcription } from '../db/mongo.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const router = express.Router()

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
    const ext =
      path.extname(file.originalname || '') ||
      (file.mimetype?.includes('wav') ? '.wav' : '.webm')
    cb(null, unique + ext)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      /audio|video|octet-stream/.test(file.mimetype) ||
      /(wav|mp3|m4a|ogg|webm|flac)$/i.test(file.originalname || '')
    ok ? cb(null, true) : cb(new Error('Unsupported file type'))
  }
})

// lazy providers
const providers = {
  mock:   async () => (await import('../providers/mock.js')).transcribe,
  openai: async () => (await import('../providers/openai.js')).transcribe,
  google: async () => (await import('../providers/google.js')).transcribe,
  local:  async () => (await import('../providers/local.js')).transcribeLocal,
}

// Wrap multer to catch & return its errors as 400 instead of crashing
router.post('/transcribe', (req, res) => {
  upload.any()(req, res, async (multerErr) => {
    if (multerErr) {
      // e.g. LIMIT_UNEXPECTED_FILE
      console.error('[multer] error:', multerErr)
      return res.status(400).json({ error: multerErr.message })
    }

    try {
      // find file under 'audio' or 'file', tolerate extra spaces
      const f = (req.files || []).find((x) => {
        const name = (x.fieldname || '').trim().toLowerCase()
        return name === 'audio' || name === 'file'
      })

      if (!f) {
        return res.status(400).json({ error: 'No audio provided (field "audio" or "file")' })
      }

      const providerName = (req.body.provider || process.env.TRANSCRIBE_PROVIDER || 'local')
        .toLowerCase()

      const load = providers[providerName]
      if (!load) return res.status(400).json({ error: `Unknown provider "${providerName}"` })

      let transcribeFn
      try {
        transcribeFn = await load()
      } catch (e) {
        return res.status(500).json({ error: `Provider "${providerName}" failed to load: ${e.message}` })
      }

      // run provider
      let result
      try {
        result = await transcribeFn({
          filePath: f.path,
          fileName: f.filename,
          mimeType: f.mimetype,
        })
      } catch (e) {
        if ((e.status || e.response?.status) === 429 && providerName !== 'mock') {
          const mock = await providers.mock()
          result = await mock({})
          result.text = `[${providerName} 429: ${e.message}] ` + result.text
        } else {
          throw e
        }
      }

      const saved = await Transcription.create({
        filename: f.filename,
        originalName: f.originalname || null,
        provider: providerName,
        mimeType: f.mimetype,
        text: result.text,
        duration: result.duration || null,
      })

      res.json({ ok: true, transcription: saved })
    } catch (err) {
      console.error(err)
      const status = err.status || err.response?.status || 500
      res.status(status).json({ error: err.message || 'Transcription failed' })
    }
  })
})

router.get('/transcriptions', async (_req, res) => {
  try {
    const list = await Transcription.find().sort({ createdAt: -1 }).lean()
    res.json({ ok: true, transcriptions: list })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.delete('/transcriptions/:id', async (req, res) => {
  try {
    const doc = await Transcription.findById(req.params.id)
    if (!doc) return res.status(404).json({ error: 'Not found' })
    await Transcription.deleteOne({ _id: doc._id })
    try { fs.unlinkSync(path.join(UPLOAD_DIR, doc.filename)) } catch {}
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
