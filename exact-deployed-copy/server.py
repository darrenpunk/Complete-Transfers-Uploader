#!/usr/bin/env python3
import http.server
import socketserver
import os
import mimetypes

class DeployedReplicaHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=".", **kwargs)

def run_server():
    PORT = 8080
    os.chdir('/home/runner/workspace/exact-deployed-copy')
    
    with socketserver.TCPServer(("0.0.0.0", PORT), DeployedReplicaHandler) as httpd:
        print(f"🚀 EXACT DEPLOYED APPLICATION REPLICA")
        print(f"🎯 Running on http://localhost:{PORT}")
        print(f"🔗 Serving files from exact-deployed-copy directory")
        httpd.serve_forever()

if __name__ == "__main__":
    run_server()