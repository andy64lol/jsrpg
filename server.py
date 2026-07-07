import os
import json
from http.server import HTTPServer, SimpleHTTPRequestHandler

os.chdir(os.path.join(os.path.dirname(__file__), "src"))

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_POST(self):
        if self.path == "/api/write":
            host = self.headers.get("Host", "")
            if not (host.startswith("localhost") or host.startswith("127.0.0.1")):
                self.send_error(403, "Solo desde localhost")
                return
            try:
                length = int(self.headers.get("Content-Length", 0))
                data = json.loads(self.rfile.read(length))
                ruta = data["path"]
                contenido = data["content"]
                # solo deja escribir en maps/
                if ".." in ruta or not ruta.startswith("maps/"):
                    self.send_error(403, "Prohibido")
                    return
                with open(ruta, "w", encoding="utf-8") as f:
                    f.write(contenido)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"ok":true}')
            except Exception as e:
                self.send_error(400, str(e))
        else:
            self.send_error(404)

    def log_message(self, format, *args):
        try:
            if int(args[1]) >= 400:
                super().log_message(format, *args)
        except (IndexError, ValueError):
            super().log_message(format, *args)

HOST = "0.0.0.0"
PORT = 5000

print(f"JSRPG corriendo en http://{HOST}:{PORT}")
HTTPServer((HOST, PORT), Handler).serve_forever()
