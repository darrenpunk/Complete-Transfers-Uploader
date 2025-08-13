const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9000;

const server = http.createServer((req, res) => {
  console.log(`Request: ${req.method} ${req.url}`);
  
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
<!DOCTYPE html>
<html>
<head>
    <title>Fresh System Working</title>
    <style>
        body { 
            font-family: Arial; 
            background: #2196F3; 
            color: white; 
            text-align: center; 
            padding: 50px; 
            margin: 0; 
        }
        .box { 
            background: white; 
            color: #333; 
            padding: 40px; 
            border-radius: 15px; 
            max-width: 600px; 
            margin: 0 auto; 
        }
        .success { 
            font-size: 32px; 
            color: #4CAF50; 
            font-weight: bold; 
            margin-bottom: 20px; 
        }
    </style>
</head>
<body>
    <div class="box">
        <div class="success">SUCCESS! Fresh System Working on Port 9000</div>
        <h2>This is your fresh deployed system</h2>
        <p><strong>Features:</strong></p>
        <ul style="text-align: left;">
            <li>Simple HTTP server (no complex dependencies)</li>
            <li>No broken generators or CMYK processing</li>
            <li>Only basic working code</li>
            <li>Independent from port 5000</li>
        </ul>
        <p>Port 9000 is now accessible and working!</p>
    </div>
</body>
</html>
    `);
  } else if (req.url === '/api/test') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      message: 'Fresh system API working', 
      port: 9000, 
      status: 'success' 
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`FRESH SYSTEM RUNNING ON PORT ${PORT}`);
  console.log(`Access: http://localhost:${PORT}`);
});
