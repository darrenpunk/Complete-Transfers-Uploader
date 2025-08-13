const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 9000;

// Serve static files
app.use(express.static('.'));
app.use(express.json());

console.log('🚀 ULTRA SIMPLE FRESH SYSTEM STARTING');

// Simple test endpoint
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Ultra Simple Fresh System</title></head>
    <body style="font-family: Arial; text-align: center; padding: 50px;">
      <h1>🌟 Ultra Simple Fresh System Working!</h1>
      <p>This is the simplest possible version using only basic code.</p>
      <p>Running on port 9000</p>
      <p>No complex features, no broken generators</p>
      <button onclick="alert('System is working!')">Test Button</button>
    </body>
    </html>
  `);
});

// API test
app.get('/api/test', (req, res) => {
  res.json({ message: 'Fresh system API working', port: 9000, status: 'success' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ ULTRA SIMPLE FRESH SYSTEM RUNNING ON PORT ${PORT}`);
  console.log(`🔗 Access at: http://localhost:${PORT}`);
});
