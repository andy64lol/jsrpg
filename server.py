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

    def do_GET(self):
        # lista recursiva de mapas
        if self.path == "/api/listmaps":
            try:
                mapas = []
                base = "maps"
                for raiz, dirs, archivos in os.walk(base):
                    if "map.csv" in archivos:
                        rel = os.path.relpath(raiz, base).replace("\\", "/")
                        if rel != ".":
                            mapas.append(rel)
                mapas.sort()
                datos = json.dumps(mapas).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(datos)))
                self.end_headers()
                self.wfile.write(datos)
            except Exception as e:
                self.send_error(500, str(e))
            return
        super().do_GET()

    def do_POST(self):
        if self.path == "/api/write":
            try:
                length = int(self.headers.get("Content-Length", 0))
                data = json.loads(self.rfile.read(length))
                ruta = data["path"]
                contenido = data["content"]
                # solo deja escribir en maps/
                if not ruta.startswith("maps/"):
                    self.send_error(403, "Prohibido")
                    return
                base_abs = os.path.realpath("maps")
                ruta_abs = os.path.realpath(ruta)
                if not ruta_abs.startswith(base_abs + os.sep):
                    self.send_error(403, "Prohibido")
                    return
                os.makedirs(os.path.dirname(ruta_abs), exist_ok=True)
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
