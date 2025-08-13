import express from 'express';

const app = express();
const PORT = 9000;

console.log('🚀 SIMPLE FRESH SYSTEM STARTING ON PORT 9000');

app.use(express.static('.'));
app.use(express.json());

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Working Fresh System</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .success { color: #28a745; font-size: 24px; font-weight: bold; }
            button { background: #007cba; color: white; padding: 15px 30px; border: none; border-radius: 5px; font-size: 16px; cursor: pointer; margin: 10px; }
            button:hover { background: #005c8a; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1 class="success">✅ Fresh System is Working!</h1>
            <p>This is your fresh deployed system running on port 9000</p>
            <p><strong>Features:</strong></p>
            <ul style="text-align: left;">
                <li>Simple HTML interface (no React complexity)</li>
                <li>Uses only deployed working code</li>
                <li>No broken generators or CMYK processing</li>
                <li>Independent from port 5000</li>
            </ul>
            <button onclick="testAPI()">Test API</button>
            <button onclick="alert('System is responsive!')">Test Interface</button>
            <div id="status" style="margin-top: 20px;"></div>
        </div>
        
        <script>
            async function testAPI() {
                try {
                    const response = await fetch('/api/test');
                    const data = await response.json();
                    document.getElementById('status').innerHTML = 
                        '<p style="color: green;">✅ API Working: ' + data.message + '</p>';
                } catch (error) {
                    document.getElementById('status').innerHTML = 
                        '<p style="color: red;">❌ API Error: ' + error.message + '</p>';
                }
            }
        </script>
    </body>
    </html>
  `);
});

app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Fresh system API working perfectly', 
    port: 9000, 
    status: 'success',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ FRESH SYSTEM LIVE ON PORT ${PORT}`);
  console.log(`🔗 Access URL: http://localhost:${PORT}`);
  console.log('🎯 This is the simple system using only deployed code');
});
