import mongoose from 'mongoose'
const schema = new mongoose.Schema({
  filename: String,
  originalName: String,
  provider: String,
  mimeType: String,
  text: String,
  duration: Number,
}, { timestamps: true })
export const Transcription = mongoose.model('Transcription', schema)
