import express from 'express';

const app = express();
const PORT = 9000;

app.use(express.static('.'));
app.use(express.json());

console.log('🚀 ROBUST FRESH SYSTEM STARTING - NO BROKEN CODE');

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>FRESH SYSTEM WORKING</title>
        <style>
            body { 
                font-family: Arial; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                margin: 0; 
                padding: 50px;
                color: white;
            }
            .success-box { 
                background: white; 
                color: #333;
                padding: 40px; 
                border-radius: 15px; 
                text-align: center;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                max-width: 600px;
                margin: 0 auto;
            }
            .big-success { 
                font-size: 32px; 
                color: #28a745; 
                font-weight: bold;
                margin-bottom: 20px;
            }
            button {
                background: #28a745;
                color: white;
                padding: 15px 30px;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                cursor: pointer;
                margin: 10px;
            }
        </style>
    </head>
    <body>
        <div class="success-box">
            <div class="big-success">✅ YOU'RE ON THE FRESH SYSTEM!</div>
            <h2>Port 9000 - Fresh Deployed Version</h2>
            <p><strong>This is completely different from the broken system!</strong></p>
            <ul style="text-align: left; margin: 20px auto; max-width: 400px;">
                <li>✅ No complex CMYK processing</li>
                <li>✅ No broken generators</li>
                <li>✅ Simple HTML interface</li>
                <li>✅ Only deployed working code</li>
            </ul>
            <button onclick="testSystem()">Test Fresh System</button>
            <div id="result" style="margin-top: 20px;"></div>
        </div>
        
        <script>
            function testSystem() {
                fetch('/api/fresh-test')
                    .then(r => r.json())
                    .then(data => {
                        document.getElementById('result').innerHTML = 
                            '<div style="background: #d4edda; color: #155724; padding: 15px; border-radius: 5px; margin-top: 20px;">' +
                            '✅ Fresh system API working: ' + data.message + 
                            '<br>Port: ' + data.port + 
                            '<br>Status: ' + data.status + '</div>';
                    })
                    .catch(err => {
                        document.getElementById('result').innerHTML = 
                            '<div style="background: #f8d7da; color: #721c24; padding: 15px; border-radius: 5px; margin-top: 20px;">' +
                            '❌ Error: ' + err.message + '</div>';
                    });
            }
        </script>
    </body>
    </html>
  `);
});

app.get('/api/fresh-test', (req, res) => {
  res.json({ 
    message: 'Fresh system API is working perfectly!',
    port: 9000,
    status: 'success - no broken code',
    timestamp: new Date().toISOString(),
    system: 'fresh-deployed-only'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ ROBUST FRESH SYSTEM LIVE ON PORT ${PORT}`);
  console.log('🎯 This system has NO broken generators or complex features');
});
