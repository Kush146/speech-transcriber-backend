import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Transcription } from '../db/mongo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname || 'audio.webm') || '.webm';
    cb(null, unique + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (req, file, cb) => {
    const ok = /audio|video|octet-stream/.test(file.mimetype) || /(wav|mp3|m4a|ogg|webm|flac)$/i.test(file.originalname || '');
    ok ? cb(null, true) : cb(new Error('Unsupported file type'));
  }
});

// Lazy providers
const providers = {
  mock:   async () => (await import('../providers/mock.js')).transcribe,
  openai: async () => (await import('../providers/openai.js')).transcribe,
  google: async () => (await import('../providers/google.js')).transcribe,
  local:  async () => (await import('../providers/local.js')).transcribeLocal,
};

// ---------- ROUTES ----------

// Health for quick checks
router.get('/health', (req, res) => res.json({ ok: true }));

// NOTE: wrap Multer so its errors return JSON (not HTML 500)
router.post('/transcribe', (req, res) => {
  upload.single('audio')(req, res, async (uploadErr) => {
    if (uploadErr) {
      console.error('[multer] error:', uploadErr);
      return res.status(400).json({ error: uploadErr.message || 'Upload failed' });
    }

    try {
      if (!req.file) return res.status(400).json({ error: 'No audio file provided (field "audio")' });

      const name = (req.body.provider || process.env.TRANSCRIBE_PROVIDER || 'mock').toLowerCase();
      const load = providers[name];
      if (!load) return res.status(400).json({ error: `Unknown provider "${name}"` });

      let fn;
      try {
        fn = await load();
      } catch (e) {
        console.error('[provider] load failed:', e);
        return res.status(500).json({ error: `Provider "${name}" failed to load: ${e.message}` });
      }

      let result;
      try {
        result = await fn({ filePath: req.file.path, fileName: req.file.filename, mimeType: req.file.mimetype });
      } catch (e) {
        // Optional fallback for 429
        if ((e.status || e.response?.status) === 429 && name !== 'mock') {
          const mock = await providers.mock();
          result = await mock({});
          result.text = `[${name} 429: ${e.message}] ` + result.text;
        } else {
          console.error('[transcribe] provider error:', e);
          throw e;
        }
      }

      const saved = await Transcription.create({
        filename: req.file.filename,
        originalName: req.file.originalname || null,
        provider: name,
        mimeType: req.file.mimetype,
        text: result.text,
        duration: result.duration || null
      });

      res.json({ ok: true, transcription: saved });
    } catch (err) {
      console.error('[route] transcribe error:', err);
      const status = err.status || err.response?.status || 500;
      res.status(status).json({ error: err.message || 'Transcription failed' });
    }
  });
});

router.get('/transcriptions', async (req, res) => {
  try {
    const list = await Transcription.find().sort({ createdAt: -1 }).lean();
    res.json({ ok: true, transcriptions: list });
  } catch (e) {
    console.error('[transcriptions] error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/transcriptions/:id', async (req, res) => {
  try {
    const doc = await Transcription.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    await Transcription.deleteOne({ _id: doc._id });
    try { fs.unlinkSync(path.join(UPLOAD_DIR, doc.filename)); } catch {}
    res.json({ ok: true });
  } catch (e) {
    console.error('[delete] error:', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
