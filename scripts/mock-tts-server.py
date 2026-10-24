from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import json

AUDIO = Path('/tmp/ashell-smoke/voice.mp3').read_bytes()

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            body = b'{"status":"ok"}'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path != '/tts':
            self.send_error(404)
            return
        length = int(self.headers.get('Content-Length', '0'))
        json.loads(self.rfile.read(length))
        self.send_response(200)
        self.send_header('Content-Type', 'audio/mpeg')
        self.send_header('Content-Length', str(len(AUDIO)))
        self.end_headers()
        self.wfile.write(AUDIO)

    def log_message(self, fmt, *args):
        pass

HTTPServer(('127.0.0.1', 18123), Handler).serve_forever()
