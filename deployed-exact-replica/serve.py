#!/usr/bin/env python3
import http.server
import socketserver
import os

PORT = 9000

class DeployedHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory="/home/runner/workspace/deployed-exact-replica", **kwargs)

os.chdir('/home/runner/workspace/deployed-exact-replica')

with socketserver.TCPServer(("0.0.0.0", PORT), DeployedHandler) as httpd:
    print(f"🚀 YOUR EXACT DEPLOYED APPLICATION")  
    print(f"🎯 Running at http://localhost:{PORT}")
    print(f"🔗 Complete Transfers - No Mess, Just Press")
    httpd.serve_forever()