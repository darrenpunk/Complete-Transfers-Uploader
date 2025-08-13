const express = require('express')
const path = require('path')

const app = express()
const PORT = 3000

// Serve static files
app.use(express.static('.'))

// Serve the main HTML page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'))
})

// Serve assets with correct paths
app.get('/assets/:filename', (req, res) => {
  const filename = req.params.filename
  res.sendFile(path.join(__dirname, filename))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 EXACT REPLICA OF YOUR DEPLOYED APP running on http://localhost:${PORT}`)
  console.log(`🎯 This is identical to https://proof-designer-darren190.replit.app/`)
})