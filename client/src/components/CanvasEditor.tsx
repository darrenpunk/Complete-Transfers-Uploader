import React, { useState, useRef, useEffect } from 'react'

interface CanvasEditorProps {
  templateSize: string
  garmentColor: string
  onPDFGenerate: () => void
}

export function CanvasEditor({ templateSize, garmentColor, onPDFGenerate }: CanvasEditorProps) {
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoUrl, setLogoUrl] = useState<string>('')
  const [logoPosition, setLogoPosition] = useState({ x: 50, y: 50 })
  const [logoScale, setLogoScale] = useState(100)
  const [logoRotation, setLogoRotation] = useState(0)
  const [canvasZoom, setCanvasZoom] = useState(100)
  const [isDragging, setIsDragging] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Safety Color Warning popup state
  const [showColorWarning, setShowColorWarning] = useState(false)

  // Handle logo upload
  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setLogoFile(file)
      const url = URL.createObjectURL(file)
      setLogoUrl(url)
      
      // Show color warning popup if needed
      if (file.name.toLowerCase().includes('png') || file.name.toLowerCase().includes('jpg')) {
        setShowColorWarning(true)
      }
    }
  }

  // Get template dimensions
  const getTemplateDimensions = () => {
    switch (templateSize) {
      case 'A3': return { width: 420, height: 297 }
      case 'A4': return { width: 297, height: 210 }
      case 'A5': return { width: 210, height: 148 }
      case 'A6': return { width: 148, height: 105 }
      default: return { width: 420, height: 297 }
    }
  }

  const templateDims = getTemplateDimensions()

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      backgroundColor: '#111827'
    }}>
      {/* Main Canvas Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Top Toolbar */}
        <div style={{
          backgroundColor: '#1f2937',
          padding: '1rem',
          borderBottom: '1px solid #374151',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                borderRadius: '0.5rem',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              📁 Upload Logo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.svg,.pdf"
              style={{ display: 'none' }}
              onChange={handleLogoUpload}
            />
            
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Grid:</span>
              <button style={{
                padding: '0.25rem 0.5rem',
                backgroundColor: '#4b5563',
                color: '#ffffff',
                borderRadius: '0.25rem',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.75rem'
              }}>
                Guides
              </button>
              <button style={{
                padding: '0.25rem 0.5rem',
                backgroundColor: '#4b5563',
                color: '#ffffff',
                borderRadius: '0.25rem',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.75rem'
              }}>
                Rulers
              </button>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                Zoom: {canvasZoom}%
              </span>
              <input
                type="range"
                min="25"
                max="200"
                value={canvasZoom}
                onChange={(e) => setCanvasZoom(parseInt(e.target.value))}
                style={{
                  width: '100px',
                  accentColor: '#3b82f6'
                }}
              />
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem'
          }}>
            <button
              onClick={onPDFGenerate}
              style={{
                padding: '0.5rem 1.5rem',
                backgroundColor: '#22c55e',
                color: '#ffffff',
                borderRadius: '0.5rem',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '600'
              }}
            >
              Generate PDF
            </button>
            <button style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#ef4444',
              color: '#ffffff',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}>
              Save Project
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#6b7280',
          padding: '2rem',
          overflow: 'auto'
        }}>
          <div
            ref={canvasRef}
            style={{
              width: `${templateDims.width * (canvasZoom / 100)}px`,
              height: `${templateDims.height * (canvasZoom / 100)}px`,
              backgroundColor: '#ffff00', // Yellow gang sheet background like in your screenshots
              border: '2px solid #000000',
              position: 'relative',
              cursor: 'crosshair',
              backgroundImage: `
                linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px),
                linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px)
              `,
              backgroundSize: '20px 20px',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
            }}
          >
            {/* Template Size Label */}
            <div style={{
              position: 'absolute',
              top: '-2rem',
              left: '0',
              color: '#ffffff',
              fontSize: '0.875rem',
              fontWeight: '600',
              backgroundColor: '#1f2937',
              padding: '0.25rem 0.5rem',
              borderRadius: '0.25rem'
            }}>
              {templateSize} ({templateDims.width}×{templateDims.height}mm)
            </div>

            {/* Safety Color Warning in center */}
            {showColorWarning && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                padding: '1rem',
                borderRadius: '0.5rem',
                textAlign: 'center',
                border: '2px solid #f59e0b',
                maxWidth: '300px'
              }}>
                <div style={{
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: '#f59e0b',
                  marginBottom: '0.5rem'
                }}>
                  Safety Color Warning
                </div>
                <p style={{
                  fontSize: '0.875rem',
                  color: '#4b5563',
                  margin: '0 0 1rem 0',
                  lineHeight: '1.4'
                }}>
                  Your display shows different colors from how they appear on final transfer.
                </p>
                <button
                  onClick={() => setShowColorWarning(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#f59e0b',
                    color: '#ffffff',
                    borderRadius: '0.375rem',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500'
                  }}
                >
                  I understand
                </button>
              </div>
            )}

            {/* Logo Display */}
            {logoUrl && (
              <img
                src={logoUrl}
                alt="Logo"
                style={{
                  position: 'absolute',
                  left: `${logoPosition.x}%`,
                  top: `${logoPosition.y}%`,
                  transform: `translate(-50%, -50%) scale(${logoScale / 100}) rotate(${logoRotation}deg)`,
                  maxWidth: '200px',
                  maxHeight: '200px',
                  cursor: 'move',
                  border: '2px dashed #3b82f6',
                  padding: '4px',
                  backgroundColor: 'rgba(255, 255, 255, 0.8)'
                }}
                draggable={false}
                onMouseDown={(e) => {
                  setIsDragging(true)
                  e.preventDefault()
                }}
              />
            )}

            {/* Grid overlay */}
            <div style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              backgroundImage: `
                repeating-linear-gradient(
                  0deg,
                  transparent,
                  transparent 19px,
                  rgba(0,0,0,0.1) 20px
                ),
                repeating-linear-gradient(
                  90deg,
                  transparent,
                  transparent 19px,
                  rgba(0,0,0,0.1) 20px
                )
              `
            }} />
          </div>
        </div>
      </div>

      {/* Right Sidebar - Properties Panel */}
      <div style={{
        width: '320px',
        backgroundColor: '#1f2937',
        borderLeft: '1px solid #374151',
        padding: '1.5rem',
        overflow: 'auto'
      }}>
        <h3 style={{
          fontSize: '1.125rem',
          fontWeight: '600',
          color: '#ffffff',
          margin: '0 0 1.5rem 0'
        }}>
          Logo Properties
        </h3>

        {logoUrl ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem'
          }}>
            {/* Logo Preview */}
            <div style={{
              padding: '1rem',
              backgroundColor: '#374151',
              borderRadius: '0.5rem',
              textAlign: 'center'
            }}>
              <img
                src={logoUrl}
                alt="Logo preview"
                style={{
                  maxWidth: '100px',
                  maxHeight: '100px',
                  border: '1px solid #6b7280',
                  borderRadius: '0.25rem'
                }}
              />
              <div style={{
                fontSize: '0.875rem',
                color: '#9ca3af',
                marginTop: '0.5rem'
              }}>
                {logoFile?.name}
              </div>
            </div>

            {/* Position */}
            <div>
              <label style={{
                fontSize: '0.875rem',
                fontWeight: '600',
                color: '#ffffff',
                marginBottom: '0.5rem',
                display: 'block'
              }}>
                Position
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', color: '#9ca3af' }}>X: {logoPosition.x}%</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={logoPosition.x}
                    onChange={(e) => setLogoPosition(prev => ({ ...prev, x: parseInt(e.target.value) }))}
                    style={{ width: '100%', accentColor: '#3b82f6' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Y: {logoPosition.y}%</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={logoPosition.y}
                    onChange={(e) => setLogoPosition(prev => ({ ...prev, y: parseInt(e.target.value) }))}
                    style={{ width: '100%', accentColor: '#3b82f6' }}
                  />
                </div>
              </div>
            </div>

            {/* Scale */}
            <div>
              <label style={{
                fontSize: '0.875rem',
                fontWeight: '600',
                color: '#ffffff',
                marginBottom: '0.5rem',
                display: 'block'
              }}>
                Scale: {logoScale}%
              </label>
              <input
                type="range"
                min="25"
                max="300"
                value={logoScale}
                onChange={(e) => setLogoScale(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: '#3b82f6' }}
              />
            </div>

            {/* Rotation */}
            <div>
              <label style={{
                fontSize: '0.875rem',
                fontWeight: '600',
                color: '#ffffff',
                marginBottom: '0.5rem',
                display: 'block'
              }}>
                Rotation: {logoRotation}°
              </label>
              <input
                type="range"
                min="0"
                max="360"
                value={logoRotation}
                onChange={(e) => setLogoRotation(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: '#3b82f6' }}
              />
              <div style={{
                display: 'flex',
                gap: '0.5rem',
                marginTop: '0.5rem'
              }}>
                <button
                  onClick={() => setLogoRotation(0)}
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    backgroundColor: '#4b5563',
                    color: '#ffffff',
                    borderRadius: '0.25rem',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.75rem'
                  }}
                >
                  Reset
                </button>
                <button
                  onClick={() => setLogoRotation(prev => prev + 90)}
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    backgroundColor: '#4b5563',
                    color: '#ffffff',
                    borderRadius: '0.25rem',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.75rem'
                  }}
                >
                  +90°
                </button>
              </div>
            </div>

            {/* Quick Actions */}
            <div>
              <label style={{
                fontSize: '0.875rem',
                fontWeight: '600',
                color: '#ffffff',
                marginBottom: '0.5rem',
                display: 'block'
              }}>
                Quick Actions
              </label>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem'
              }}>
                <button
                  onClick={() => {
                    setLogoPosition({ x: 50, y: 50 })
                    setLogoScale(100)
                    setLogoRotation(0)
                  }}
                  style={{
                    padding: '0.5rem',
                    backgroundColor: '#3b82f6',
                    color: '#ffffff',
                    borderRadius: '0.25rem',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  Center Logo
                </button>
                <button style={{
                  padding: '0.5rem',
                  backgroundColor: '#6b7280',
                  color: '#ffffff',
                  borderRadius: '0.25rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}>
                  Fit to Bounds
                </button>
              </div>
            </div>

          </div>
        ) : (
          <div style={{
            textAlign: 'center',
            color: '#9ca3af',
            padding: '2rem 0'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📁</div>
            <p>Upload a logo to see properties</p>
          </div>
        )}

        {/* Layers Panel */}
        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          backgroundColor: '#374151',
          borderRadius: '0.5rem'
        }}>
          <h4 style={{
            fontSize: '1rem',
            fontWeight: '600',
            color: '#ffffff',
            margin: '0 0 1rem 0'
          }}>
            Layers (0)
          </h4>
          <div style={{
            fontSize: '0.875rem',
            color: '#9ca3af',
            textAlign: 'center',
            padding: '1rem 0'
          }}>
            No layers yet
          </div>
        </div>
      </div>
    </div>
  )
}