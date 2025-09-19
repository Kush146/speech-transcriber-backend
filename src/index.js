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

app.use(cors({ origin: ORIGIN }))
app.use(express.json())

app.get('/api/health', (req, res) => res.json({ ok: true }))

// DB
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/speech_transcriber'
mongoose.connect(uri).then(() => console.log('MongoDB connected:', uri)).catch(e => {
  console.error('Mongo connection error:', e.message)
  process.exit(1)
})

app.use('/api', routes)

app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`))
