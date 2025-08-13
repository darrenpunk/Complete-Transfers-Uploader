#!/usr/bin/env python3
import http.server
import socketserver
import os
from urllib.parse import unquote

class DeployedHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory="/home/runner/workspace", **kwargs)

    def guess_type(self, path):
        """Override to handle proper MIME types"""
        mimetype, encoding = super().guess_type(path)
        if path.endswith('.js'):
            return 'application/javascript', encoding
        elif path.endswith('.css'):
            return 'text/css', encoding
        return mimetype, encoding

    def end_headers(self):
        # Add CORS headers for cross-origin requests
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

PORT = 7000
os.chdir("/home/runner/workspace")

print(f"🚀 EXACT DEPLOYED REPLICA SERVER")
print(f"📍 Serving your deployed application files at: http://localhost:{PORT}")
print(f"🎯 This serves the actual JS/CSS from your deployed site")
print(f"📂 Assets directory: /home/runner/workspace/assets/")

with socketserver.TCPServer(("0.0.0.0", PORT), DeployedHandler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n📴 Server stopped")