# Backend-Speech-Transcriber

Express API for transcribing audio with multiple providers.

- Upload endpoint: `POST /api/transcribe` (multipart field `audio`)
- List endpoint: `GET /api/transcriptions`
- Delete endpoint: `DELETE /api/transcriptions/:id`
- Providers: `mock` (default), `openai`, `google`, `local`
- Database: MongoDB via Mongoose (collection `transcriptions`)

## Quickstart
```bash
cd Backend-Speech-Transcriber
cp .env.example .env
npm i
npm run dev
```

Ensure MongoDB is running locally (or change MONGODB_URI).
