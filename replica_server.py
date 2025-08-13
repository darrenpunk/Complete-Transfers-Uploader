#!/usr/bin/env python3
import http.server
import socketserver
import os
from urllib.parse import urlparse, parse_qs
import mimetypes

class ReplicaHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urlparse(self.path)
        
        # Serve the main app
        if parsed_path.path == '/':
            self.serve_main_page()
        # Serve assets with correct paths  
        elif parsed_path.path.startswith('/assets/'):
            asset_name = parsed_path.path[8:]  # Remove '/assets/'
            self.serve_asset(asset_name)
        # Serve other files
        else:
            super().do_GET()
    
    def serve_main_page(self):
        html_content = '''<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
    <script type="module" crossorigin src="/deployed_actual_app.js"></script>
    <link rel="stylesheet" crossorigin href="/deployed_actual_styles.css">
  </head>
  <body class="dark">
    <div id="root"></div>
  </body>
</html>'''
        
        self.send_response(200)
        self.send_header('Content-type', 'text/html')
        self.send_header('Content-length', len(html_content))
        self.end_headers()
        self.wfile.write(html_content.encode('utf-8'))
    
    def serve_asset(self, asset_name):
        # Map asset names to actual files
        asset_mapping = {
            'Artboard 1@4x_1753539065182-B1QyImPQ.png': 'Artboard 1@4x_1753539065182-B1QyImPQ.png',
            'Full Colour tshirt mock_1753540286823-CPbK6whQ.png': 'Full Colour tshirt mock_1753540286823-CPbK6whQ.png',
            'DTF_1753540006979-DscAnoR0.png': 'DTF_1753540006979-DscAnoR0.png'
        }
        
        if asset_name in asset_mapping:
            file_path = asset_mapping[asset_name]
            if os.path.exists(file_path):
                with open(file_path, 'rb') as f:
                    content = f.read()
                
                content_type, _ = mimetypes.guess_type(file_path)
                if content_type is None:
                    content_type = 'application/octet-stream'
                
                self.send_response(200)
                self.send_header('Content-type', content_type)
                self.send_header('Content-length', len(content))
                self.end_headers()
                self.wfile.write(content)
                return
        
        # Asset not found
        self.send_response(404)
        self.end_headers()

def run_server():
    PORT = 3000
    
    with socketserver.TCPServer(("0.0.0.0", PORT), ReplicaHandler) as httpd:
        print(f"🚀 EXACT REPLICA OF YOUR DEPLOYED APP")
        print(f"🎯 Running on http://localhost:{PORT}")
        print(f"🔗 This is identical to https://proof-designer-darren190.replit.app/")
        httpd.serve_forever()

if __name__ == "__main__":
    run_server()