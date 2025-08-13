import React, { useState } from 'react'
import { GarmentColor } from '../../../shared/schema'

interface GarmentColorSelectionProps {
  onColorSelected: (colorId: string) => void
}

const PROFESSIONAL_COLORS: GarmentColor[] = [
  { id: 'white', name: 'White', color: '#FFFFFF' },
  { id: 'black', name: 'Black', color: '#000000' },
  { id: 'cream', name: 'Cream', color: '#F5F5DC' },
  { id: 'light-yellow', name: 'Light Yellow', color: '#FFFFE0' },
  { id: 'yellow', name: 'Yellow', color: '#FFFF00' },
  { id: 'lime', name: 'Lime', color: '#00FF00' },
  { id: 'orange', name: 'Orange', color: '#FFA500' },
  { id: 'light-green', name: 'Light Green', color: '#90EE90' },
  { id: 'pink', name: 'Pink', color: '#FFC0CB' },
  
  { id: 'light-grey', name: 'Light Grey', color: '#D3D3D3' },
  { id: 'grey', name: 'Grey', color: '#808080' },
  { id: 'charcoal', name: 'Charcoal', color: '#36454F' },
  { id: 'light-blue', name: 'Light Blue', color: '#ADD8E6' },
  { id: 'blue', name: 'Blue', color: '#0000FF' },
  { id: 'light-blue-2', name: 'Light Blue', color: '#87CEEB' },
  { id: 'royal-blue', name: 'Royal Blue', color: '#4169E1' },
  { id: 'navy', name: 'Navy', color: '#000080' },
  { id: 'dark-blue', name: 'Dark Blue', color: '#00008B' },
  
  { id: 'lime-green', name: 'Lime Green', color: '#32CD32' },
  { id: 'green', name: 'Green', color: '#008000' },
  { id: 'dark-green', name: 'Dark Green', color: '#006400' },
  { id: 'light-pink', name: 'Light Pink', color: '#FFB6C1' },
  { id: 'hot-pink', name: 'Hot Pink', color: '#FF69B4' },
  { id: 'red', name: 'Red', color: '#FF0000' },
  { id: 'maroon', name: 'Maroon', color: '#800000' },
  { id: 'brown', name: 'Brown', color: '#A52A2A' },
  { id: 'purple', name: 'Purple', color: '#800080' }
]

export function GarmentColorSelection({ onColorSelected }: GarmentColorSelectionProps) {
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [expandedManufacturer, setExpandedManufacturer] = useState<string | null>(null)

  const handleColorSelect = (colorId: string) => {
    setSelectedColor(colorId)
  }

  const handleConfirm = () => {
    if (selectedColor) {
      onColorSelected(selectedColor)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50
    }}>
      <div style={{
        backgroundColor: '#1f2937',
        borderRadius: '0.75rem',
        padding: '2rem',
        maxWidth: '48rem',
        width: '90vw',
        maxHeight: '90vh',
        overflow: 'auto',
        border: '1px solid #374151'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '2rem'
        }}>
          <div>
            <h2 style={{
              fontSize: '1.5rem',
              fontWeight: '600',
              color: '#ffffff',
              margin: '0 0 0.5rem 0'
            }}>
              🎨 Select Garment Color <span style={{ color: '#ef4444' }}>*Required</span>
            </h2>
            <p style={{
              fontSize: '0.875rem',
              color: '#9ca3af',
              margin: 0
            }}>
              Choose a garment color for your Full Colour Transfer design. This will be the background color for your artwork.
            </p>
          </div>
          <button 
            style={{
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              fontSize: '1.5rem',
              cursor: 'pointer'
            }}
          >
            ×
          </button>
        </div>

        {/* Warning */}
        <div style={{
          backgroundColor: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '0.5rem',
          padding: '1rem',
          marginBottom: '2rem'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.5rem'
          }}>
            <span style={{ fontSize: '1rem' }}>⚠️</span>
            <span style={{
              fontSize: '0.875rem',
              fontWeight: '600',
              color: '#92400e'
            }}>
              Please select a garment color to continue
            </span>
          </div>
          <p style={{
            fontSize: '0.875rem',
            color: '#92400e',
            margin: 0
          }}>
            Choose from the professional colors below or create a custom CMYK color
          </p>
        </div>

        {/* Professional Colors */}
        <div style={{
          marginBottom: '2rem'
        }}>
          <h3 style={{
            fontSize: '1.125rem',
            fontWeight: '600',
            color: '#ffffff',
            margin: '0 0 1rem 0'
          }}>
            Professional Colors
          </h3>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(9, 1fr)',
            gap: '0.5rem',
            marginBottom: '2rem'
          }}>
            {PROFESSIONAL_COLORS.map((color) => (
              <div
                key={color.id}
                onClick={() => handleColorSelect(color.id)}
                style={{
                  width: '50px',
                  height: '50px',
                  backgroundColor: color.color,
                  border: selectedColor === color.id ? '3px solid #3b82f6' : '2px solid #6b7280',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.2s ease'
                }}
                title={color.name}
              >
                {/* T-shirt shape overlay */}
                <div style={{
                  position: 'absolute',
                  inset: '4px',
                  background: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none'><path d='M8 4H16V6H18V8H20V20H4V8H6V6H8V4Z' stroke='%23000' stroke-width='1' fill='%23${color.color.slice(1)}'/></svg>") center/contain no-repeat`
                }} />
              </div>
            ))}
          </div>
        </div>

        {/* Manufacturer Colors */}
        <div style={{
          marginBottom: '2rem'
        }}>
          <h3 style={{
            fontSize: '1.125rem',
            fontWeight: '600',
            color: '#ffffff',
            margin: '0 0 1rem 0'
          }}>
            Manufacturer Colors
          </h3>

          {/* Gildan */}
          <div style={{
            backgroundColor: '#374151',
            borderRadius: '0.5rem',
            marginBottom: '1rem',
            overflow: 'hidden'
          }}>
            <button
              onClick={() => setExpandedManufacturer(expandedManufacturer === 'gildan' ? null : 'gildan')}
              style={{
                width: '100%',
                padding: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'none',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '600'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#3b82f6', fontSize: '1.25rem' }}>GILDAN</span>
              </div>
              <span style={{ fontSize: '1.25rem' }}>
                {expandedManufacturer === 'gildan' ? '−' : '+'}
              </span>
            </button>
            
            {expandedManufacturer === 'gildan' && (
              <div style={{
                padding: '1rem',
                borderTop: '1px solid #4b5563'
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(10, 1fr)',
                  gap: '0.5rem'
                }}>
                  {PROFESSIONAL_COLORS.slice(0, 20).map((color) => (
                    <div
                      key={`gildan-${color.id}`}
                      onClick={() => handleColorSelect(`gildan-${color.id}`)}
                      style={{
                        width: '40px',
                        height: '40px',
                        backgroundColor: color.color,
                        border: selectedColor === `gildan-${color.id}` ? '2px solid #3b82f6' : '1px solid #6b7280',
                        borderRadius: '0.25rem',
                        cursor: 'pointer'
                      }}
                      title={`Gildan ${color.name}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Fruit of the Loom */}
          <div style={{
            backgroundColor: '#374151',
            borderRadius: '0.5rem',
            overflow: 'hidden'
          }}>
            <button
              onClick={() => setExpandedManufacturer(expandedManufacturer === 'fotl' ? null : 'fotl')}
              style={{
                width: '100%',
                padding: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'none',
                border: 'none',
                color: '#ffffff',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: '600'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  backgroundColor: '#ef4444',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: '700'
                }}>
                  🍎
                </div>
                <span>Fruit of the Loom</span>
              </div>
              <span style={{ fontSize: '1.25rem' }}>
                {expandedManufacturer === 'fotl' ? '−' : '+'}
              </span>
            </button>
            
            {expandedManufacturer === 'fotl' && (
              <div style={{
                padding: '1rem',
                borderTop: '1px solid #4b5563'
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(10, 1fr)',
                  gap: '0.5rem'
                }}>
                  {PROFESSIONAL_COLORS.slice(0, 20).map((color) => (
                    <div
                      key={`fotl-${color.id}`}
                      onClick={() => handleColorSelect(`fotl-${color.id}`)}
                      style={{
                        width: '40px',
                        height: '40px',
                        backgroundColor: color.color,
                        border: selectedColor === `fotl-${color.id}` ? '2px solid #3b82f6' : '1px solid #6b7280',
                        borderRadius: '0.25rem',
                        cursor: 'pointer'
                      }}
                      title={`FOTL ${color.name}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Selected Color */}
        <div style={{
          marginBottom: '2rem'
        }}>
          <div style={{
            fontSize: '1rem',
            fontWeight: '600',
            color: '#ffffff',
            marginBottom: '0.5rem'
          }}>
            Selected: {selectedColor ? (
              <span style={{ color: '#22c55e' }}>
                {selectedColor.includes('gildan-') ? 'Gildan ' : 
                 selectedColor.includes('fotl-') ? 'FOTL ' : ''}
                {PROFESSIONAL_COLORS.find(c => 
                  selectedColor === c.id || 
                  selectedColor === `gildan-${c.id}` || 
                  selectedColor === `fotl-${c.id}`
                )?.name}
              </span>
            ) : (
              <span style={{ color: '#ef4444' }}>None selected</span>
            )}
          </div>
        </div>

        {/* Custom CMYK Color */}
        <div style={{
          backgroundColor: '#374151',
          borderRadius: '0.5rem',
          padding: '1.5rem',
          marginBottom: '2rem'
        }}>
          <h3 style={{
            fontSize: '1rem',
            fontWeight: '600',
            color: '#ffffff',
            margin: '0 0 1rem 0'
          }}>
            🎨 Create Custom Color
          </h3>
          <button style={{
            width: '100%',
            padding: '0.75rem',
            backgroundColor: 'transparent',
            color: '#3b82f6',
            borderRadius: '0.5rem',
            border: '1px dashed #3b82f6',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500'
          }}>
            Create Custom CMYK Color (Advanced)
          </button>
        </div>

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: '1rem'
        }}>
          <button style={{
            flex: 1,
            padding: '0.75rem',
            backgroundColor: 'transparent',
            color: '#9ca3af',
            borderRadius: '0.5rem',
            border: '1px solid #6b7280',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500'
          }}>
            ← Back to Template Size
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedColor}
            style={{
              flex: 1,
              padding: '0.75rem',
              backgroundColor: selectedColor ? '#22c55e' : '#6b7280',
              color: '#ffffff',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: selectedColor ? 'pointer' : 'not-allowed',
              fontSize: '0.875rem',
              fontWeight: '500',
              opacity: selectedColor ? 1 : 0.5
            }}
          >
            Continue to Canvas
          </button>
        </div>
      </div>
    </div>
  )
}