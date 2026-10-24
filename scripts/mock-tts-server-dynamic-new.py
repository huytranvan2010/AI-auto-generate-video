from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json, os, subprocess, tempfile, hashlib


RATE = float(os.environ.get("MOCK_TTS_RATE", "0.12"))
FREQ = float(os.environ.get("MOCK_TTS_FREQ", "180"))


CACHE_DIR = Path("/tmp/mock-tts-cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _build_audio(seconds: float) -> bytes:
    """Tao MP3: sine wave nen + phong bi len xuong nhe, dung seconds giay."""
    dur = max(0.4, seconds)
    tmp_path = Path(tempfile.mktemp(suffix=".mp3"))
    try:
        subprocess.run(
            [
                "ffmpeg", "-y", "-loglevel", "error",
                "-f", "lavfi", "-i", "sine=frequency=" + str(FREQ) + ":duration=" + format(dur, ".3f"),
                "-af", "volume=0.22,afade=t=in:st=0:d=0.3,afade=t=out:st=" + format(max(0.3, dur - 0.4), ".3f") + ":d=0.4",
                "-c:a", "libmp3lame", "-q:a", "8",
                str(tmp_path),
            ],
            check=True,
            capture_output=True,
        )
        return tmp_path.read_bytes()
    finally:
        tmp_path.unlink(missing_ok=True)


def _make(text: str) -> bytes:
    key = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
    cached = CACHE_DIR / (key + ".mp3")
    if cached.exists():
        return cached.read_bytes()
    seconds = RATE * len(text)
    data = _build_audio(seconds)
    cached.write_bytes(data)
    return data


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            body = '{"status":"ok"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body.encode())
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path != "/tts":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length))
        text = str(payload.get("text", ""))
        data = _make(text)
        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    port = int(os.environ.get("MOCK_TTS_PORT", "18123"))
    print("Mock TTS on http://127.0.0.1:" + str(port) + " (rate=" + str(RATE) + "s/chr)")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()