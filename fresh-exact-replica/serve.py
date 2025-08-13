#!/usr/bin/env python3
import http.server
import socketserver
import os

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory="/home/runner/workspace/fresh-exact-replica", **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        super().end_headers()

os.chdir('/home/runner/workspace/fresh-exact-replica')
PORT = 8080
with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    print(f"🚀 EXACT DEPLOYED REACT APPLICATION")
    print(f"🎯 Your Complete Transfers app at http://localhost:{PORT}")
    print(f"🔥 Professional product selection interface")
    httpd.serve_forever()