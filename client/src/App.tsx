import React, { useState } from 'react';

function App() {
  const [project, setProject] = useState(null);
  const [status, setStatus] = useState('');

  const createProject = async () => {
    try {
      setStatus('Creating fresh project...');
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Fresh UI Test',
          templateSize: 'A3',
          garmentColor: '#FF0000'
        })
      });
      const data = await response.json();
      setProject(data);
      setStatus(`Project created: ${data.id}`);
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
  };

  const generatePDF = async () => {
    if (!project) return;
    
    try {
      setStatus('Generating PDF with fresh deployed replica...');
      const response = await fetch(`/api/projects/${project.id}/generate-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ garmentColor: '#FF0000' })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        setStatus(`PDF generated: ${blob.size} bytes (${Math.round(blob.size/1024)}KB)`);
        
        // Download the PDF
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'fresh-deployed-test.pdf';
        a.click();
      } else {
        setStatus(`PDF generation failed: ${response.status}`);
      }
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Fresh Deployed Replica - Artwork Uploader</h1>
      <p>This is a completely fresh implementation based on the exact deployed version.</p>
      
      <div style={{ marginBottom: '20px' }}>
        <button onClick={createProject} style={{ marginRight: '10px', padding: '10px 20px' }}>
          Create Fresh Project
        </button>
        
        {project && (
          <button onClick={generatePDF} style={{ padding: '10px 20px' }}>
            Generate PDF (Fresh Deployed Method)
          </button>
        )}
      </div>
      
      <div style={{ backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '5px' }}>
        <strong>Status:</strong> {status}
      </div>
      
      {project && (
        <div style={{ marginTop: '20px', padding: '10px', border: '1px solid #ccc' }}>
          <h3>Project Details:</h3>
          <p>ID: {project.id}</p>
          <p>Name: {project.name}</p>
          <p>Template: {project.templateSize}</p>
          <p>Garment Color: {project.garmentColor}</p>
        </div>
      )}
    </div>
  );
}

export default App;