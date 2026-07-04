import os
from http.server import HTTPServer, SimpleHTTPRequestHandler

# Serve from the src/ directory so index.html and all assets are at the root
os.chdir(os.path.join(os.path.dirname(__file__), "src"))

class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format, *args):
        # Keep access logs quiet to reduce noise; only show 4xx/5xx errors
        try:
            if int(args[1]) >= 400:
                super().log_message(format, *args)
        except (IndexError, ValueError):
            super().log_message(format, *args)

HOST = "0.0.0.0"
PORT = 5000

print(f"Servidor de JSRPG corriendose en http://{HOST}:{PORT} en el directorio src")
HTTPServer((HOST, PORT), NoCache).serve_forever()
