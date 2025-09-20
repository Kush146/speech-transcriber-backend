import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import mongoose from 'mongoose'
import routes from './routes/transcribe.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 5000
const ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173'
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

// CORS
const allowed = new Set([
  'http://localhost:5173',
  'https://speech-transcriber-frontend.vercel.app',
  ORIGIN, // allow env override too
])
app.use(cors({
  origin: (origin, cb) => {
    // allow same-origin tools (curl/postman) and allowed list
    if (!origin || allowed.has(origin)) return cb(null, true)
    return cb(new Error(`CORS not allowed: ${origin}`))
  },
  credentials: true
}))
app.use(express.json())

// --- Health + root (must return 200)
app.get('/', (_req, res) => res.json({ ok: true, name: 'STT backend' }))
app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }))
app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }))

// DB
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/speech_transcriber'
mongoose.connect(uri)
  .then(() => console.log('MongoDB connected:', uri))
  .catch(e => {
    console.error('Mongo connection error:', e.message)
    process.exit(1)
  })

process.on('unhandledRejection', err => {
  console.error('UNHANDLED REJECTION', err)
  process.exit(1)
})
process.on('uncaughtException', err => {
  console.error('UNCAUGHT EXCEPTION', err)
  process.exit(1)
})

// Mount routes BEFORE the error handler
app.use('/api', routes)

// --- Global JSON error handler MUST be LAST
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  if (res.headersSent) return next(err)
  res.status(err.status || err.response?.status || 500)
     .json({ error: err.message || 'Server error' })
})

app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`))
  