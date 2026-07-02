# odio el cacheeeeee y me forzan a crear un server.py para init!!!! AAAAAAAAAAAAAAAAAAAAAAAAAAAAA

from http.server import HTTPServer, SimpleHTTPRequestHandler

class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


print("Estoy corriendo en http://localhost:8000, en contexto de correr una programa")
HTTPServer(("localhost", 8000), NoCache).serve_forever()

# A tomar por saco