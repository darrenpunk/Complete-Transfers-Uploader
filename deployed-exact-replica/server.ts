import express from 'express';
import path from 'path';
import { SimpleWorkingGenerator } from './server/simple-pdf-generator';

const app = express();
const PORT = 8000;

console.log('DEPLOYED EXACT REPLICA STARTING ON PORT 8000');

app.use(express.json());
app.use(express.static('public'));

// Exact deployed endpoints
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Deployed Exact Replica</title></head>
    <body style="font-family: Arial; text-align: center; padding: 50px;">
      <h1>DEPLOYED EXACT REPLICA WORKING</h1>
      <p>This is the exact replica of your deployed working system</p>
      <p>Port 8000 - Exact deployed code only</p>
    </body>
    </html>
  `);
});

app.post('/api/generate-pdf', async (req, res) => {
  try {
    const generator = new SimpleWorkingGenerator();
    const pdfBuffer = await generator.generatePDF(req.body);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="artwork.pdf"');
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`DEPLOYED EXACT REPLICA LIVE ON PORT ${PORT}`);
  console.log('This uses ONLY the deployed working code');
});
