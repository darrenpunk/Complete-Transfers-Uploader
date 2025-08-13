#!/usr/bin/env python3
import http.server
import socketserver
import os
import threading
import time

class StandaloneHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory="/home/runner/workspace", **kwargs)
    
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        super().end_headers()

def serve_standalone():
    os.chdir('/home/runner/workspace')
    PORT = 9999
    with socketserver.TCPServer(("0.0.0.0", PORT), StandaloneHandler) as httpd:
        print(f"🚀 EXACT STANDALONE REPLICA OF YOUR DEPLOYED APP")
        print(f"🎯 Complete Transfers at http://localhost:{PORT}/standalone_replica.html")
        print(f"✨ Professional product selection with blue-purple gradient")
        print(f"🔥 All 12 product cards with hover effects")
        httpd.serve_forever()

if __name__ == "__main__":
    serve_standalone()