import os
import tempfile
import time
from flask import Flask, request, jsonify, Response
from faster_whisper import WhisperModel

# --- Config (env) ------------------------------------------------------------
PORT = int(os.getenv("PORT", "7860"))
MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")        # tiny | base | small | medium | large-v3
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")  # int8 | int8_float16 | float16 | float32
LANGUAGE_DEFAULT = os.getenv("WHISPER_LANGUAGE")       # e.g. "en", "hi-IN"; None => auto
BEAM_SIZE = int(os.getenv("WHISPER_BEAM_SIZE", "1"))
VAD_FILTER = os.getenv("WHISPER_VAD_FILTER", "false").lower() == "true"  # simple VAD

# --- App & model -------------------------------------------------------------
app = Flask(__name__)
model = WhisperModel(MODEL_SIZE, device="cpu", compute_type=COMPUTE_TYPE)

# --- Helpers -----------------------------------------------------------------
def _fmt_srt_time(t: float) -> str:
    ms = int((t - int(t)) * 1000)
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = int(t % 60)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"

def _segments_to_srt(segments) -> str:
    lines = []
    for i, seg in enumerate(segments, 1):
        start = _fmt_srt_time(seg.start or 0.0)
        end = _fmt_srt_time(seg.end or 0.0)
        text = (seg.text or "").strip()
        lines += [str(i), f"{start} --> {end}", text, ""]
    return "\n".join(lines)

def _effective_language(req) -> str | None:
    # allow override via ?language=en or form-data 'language'
    return (
        request.args.get("language")
        or request.form.get("language")
        or LANGUAGE_DEFAULT
    )

def _do_transcribe(temp_path: str, language: str | None):
    started = time.time()
    segments, info = model.transcribe(
        temp_path,
        language=language,
        beam_size=BEAM_SIZE,
        vad_filter=VAD_FILTER
    )
    seg_list = list(segments)
    text = "".join(seg.text for seg in seg_list).strip()
    dur = time.time() - started
    return text, info, dur, seg_list

# --- Routes ------------------------------------------------------------------
@app.post("/transcribe")
def transcribe():
    if "file" not in request.files:
        return jsonify({"error": "no file field 'file'"}), 400

    f = request.files["file"]
    with tempfile.NamedTemporaryFile(delete=False, suffix=".blob") as tmp:
        f.save(tmp.name)
        path = tmp.name

    try:
        language = _effective_language(request)
        text, info, dur, _ = _do_transcribe(path, language)
        return jsonify({
            "text": text,
            "language": info.language,
            "duration": dur
        })
    finally:
        try:
            os.remove(path)
        except Exception:
            pass

@app.post("/transcribe/segments")
def transcribe_segments():
    """Returns segment-level timestamps + text."""
    if "file" not in request.files:
        return jsonify({"error": "no file field 'file'"}), 400

    f = request.files["file"]
    with tempfile.NamedTemporaryFile(delete=False, suffix=".blob") as tmp:
        f.save(tmp.name)
        path = tmp.name

    try:
        language = _effective_language(request)
        text, info, dur, seg_list = _do_transcribe(path, language)
        payload = {
            "text": text,
            "language": info.language,
            "duration": dur,
            "segments": [
                {
                    "start": float(seg.start or 0.0),
                    "end": float(seg.end or 0.0),
                    "text": (seg.text or "").strip()
                }
                for seg in seg_list
            ]
        }
        return jsonify(payload)
    finally:
        try:
            os.remove(path)
        except Exception:
            pass

@app.post("/transcribe/srt")
def transcribe_srt():
    """Returns SRT subtitle text (text/plain)."""
    if "file" not in request.files:
        return jsonify({"error": "no file field 'file'"}), 400

    f = request.files["file"]
    with tempfile.NamedTemporaryFile(delete=False, suffix=".blob") as tmp:
        f.save(tmp.name)
        path = tmp.name

    try:
        language = _effective_language(request)
        _, info, _, seg_list = _do_transcribe(path, language)
        srt = _segments_to_srt(seg_list)
        return Response(srt, mimetype="text/plain")
    finally:
        try:
            os.remove(path)
        except Exception:
            pass

@app.get("/")
def home():
    return "Local Whisper is running. POST /transcribe", 200

@app.get("/health")
def health():
    return {"ok": True}, 200

# --- Main --------------------------------------------------------------------
if __name__ == "__main__":
    app.run(host="127.0.0.1", port=PORT, debug=False)
