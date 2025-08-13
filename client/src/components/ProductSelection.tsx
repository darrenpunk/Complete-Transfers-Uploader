import React, { useState } from 'react'
import { Product } from '../../../shared/schema'

interface ProductSelectionProps {
  onProductSelected: (productId: string) => void
}

const PRODUCTS: Product[] = [
  {
    id: 'full-colour',
    name: 'Full Colour Transfers',
    description: 'Full-Colour screen printed heat applied transfers',
    image: '/assets/Full%20Colour%20tshirt%20mock_1753540286823-CPbK6whQ.png'
  },
  {
    id: 'full-colour-metallic',
    name: 'Full Colour Metallic',
    description: 'Full-Colour screen printed with metallic finish',
    image: '/assets/Full%20Colour%20tshirt%20mock_1753540286823-CPbK6whQ.png'
  },
  {
    id: 'full-colour-hd',
    name: 'Full Colour HD',
    description: 'High-definition full-colour screen printed transfers',
    image: '/assets/Full%20Colour%20tshirt%20mock_1753540286823-CPbK6whQ.png'
  },
  {
    id: 'single-colour',
    name: 'Single Colour Transfers',
    description: 'Screen printed using our off-the-shelf colour range',
    image: '/assets/Full%20Colour%20tshirt%20mock_1753540286823-CPbK6whQ.png'
  },
  {
    id: 'dtf',
    name: 'DTF - Digital Film Transfers',
    description: 'Small order digital heat transfers',
    image: '/assets/DTF_1753540006979-DscAnoR0.png'
  },
  {
    id: 'uvdtf',
    name: 'UV DTF',
    description: 'Hard Surface Transfers',
    image: '/assets/UVDTF%20page2_1753544185426-B40awus8.png'
  },
  {
    id: 'custom-badges',
    name: 'Custom Badges',
    description: 'Polyester textile woven badges',
    image: '/assets/image%20(2)_1753544203744-CwwMIr2C.png'
  },
  {
    id: 'applique-badges',
    name: 'Applique Badges',
    description: 'Fabric applique badges',
    image: '/assets/image%20(2)_1753544203744-CwwMIr2C.png'
  },
  {
    id: 'reflective',
    name: 'Reflective Transfers',
    description: 'Our silver reflective helps enhance the visibility of the wearer at night',
    image: '/assets/Full%20Colour%20tshirt%20mock_1753540286823-CPbK6whQ.png'
  },
  {
    id: 'zero-single',
    name: 'ZERO Single Colour Transfers',
    description: 'Zero inks are super stretchy and do not bleed!',
    image: '/assets/Full%20Colour%20tshirt%20mock_1753540286823-CPbK6whQ.png'
  },
  {
    id: 'sublimation',
    name: 'Sublimation Transfers',
    description: 'Sublimation heat transfers are designed for full colour decoration of white, 100% polyester',
    image: '/assets/Full%20Colour%20tshirt%20mock_1753540286823-CPbK6whQ.png'
  },
  {
    id: 'zero-silicone',
    name: 'Zero Silicone Transfers',
    description: 'Silicone-free transfers',
    image: '/assets/Full%20Colour%20tshirt%20mock_1753540286823-CPbK6whQ.png'
  }
]

export function ProductSelection({ onProductSelected }: ProductSelectionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState<string>('')

  const handleProductSelect = (productId: string) => {
    setSelectedProductId(productId)
    setIsModalOpen(true)
  }

  const handleConfirm = () => {
    onProductSelected(selectedProductId)
    setIsModalOpen(false)
  }

  const selectedProduct = PRODUCTS.find(p => p.id === selectedProductId)

  return (
    <>
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#000000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 40
      }}>
        <div style={{
          backgroundColor: '#1f2937',
          borderRadius: '1rem',
          padding: '3rem',
          maxWidth: '80rem',
          width: '90vw',
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative'
        }}>
          {/* Header */}
          <div style={{
            textAlign: 'center',
            marginBottom: '3rem'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{
                width: '60px',
                height: '40px',
                background: 'linear-gradient(45deg, #3b82f6, #8b5cf6)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <div style={{
                  width: '40px',
                  height: '20px',
                  background: 'linear-gradient(45deg, #fbbf24, #f59e0b)',
                  borderRadius: '4px',
                  position: 'relative'
                }}>
                  <div style={{
                    position: 'absolute',
                    top: '2px',
                    left: '2px',
                    width: '36px',
                    height: '16px',
                    background: 'linear-gradient(45deg, #ef4444, #dc2626)',
                    borderRadius: '2px'
                  }} />
                </div>
              </div>
              <div>
                <div style={{
                  fontSize: '1.5rem',
                  fontWeight: '700',
                  color: '#ffffff'
                }}>
                  COMPLETE TRANSFERS
                </div>
                <div style={{
                  fontSize: '0.875rem',
                  color: '#9ca3af'
                }}>
                  NO MESS, JUST PRESS
                </div>
              </div>
            </div>
            <h1 style={{
              fontSize: '2rem',
              fontWeight: '600',
              color: '#ffffff',
              margin: '0 0 0.5rem 0'
            }}>
              Select Product Type
            </h1>
            <p style={{
              color: '#9ca3af',
              fontSize: '1rem',
              margin: 0
            }}>
              Choose the type of product you want to create artwork for
            </p>
          </div>

          {/* Products Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '2rem'
          }}>
            {PRODUCTS.map((product) => (
              <div
                key={product.id}
                onClick={() => handleProductSelect(product.id)}
                style={{
                  backgroundColor: '#374151',
                  borderRadius: '0.75rem',
                  padding: '1.5rem',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  border: '2px solid transparent'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#4b5563'
                  e.currentTarget.style.borderColor = '#3b82f6'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#374151'
                  e.currentTarget.style.borderColor = 'transparent'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div style={{
                  width: '60px',
                  height: '60px',
                  backgroundColor: '#4b5563',
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem'
                }}>
                  🎨
                </div>
                <h3 style={{
                  fontSize: '1.125rem',
                  fontWeight: '600',
                  color: '#ffffff',
                  margin: '0 0 0.5rem 0'
                }}>
                  {product.name}
                </h3>
                <p style={{
                  fontSize: '0.875rem',
                  color: '#9ca3af',
                  margin: '0 0 1.5rem 0',
                  lineHeight: '1.4'
                }}>
                  {product.description}
                </p>
                <button style={{
                  width: '100%',
                  padding: '0.75rem',
                  backgroundColor: '#3b82f6',
                  color: '#ffffff',
                  borderRadius: '0.5rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  transition: 'background-color 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#2563eb'
                  e.stopPropagation()
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#3b82f6'
                  e.stopPropagation()
                }}>
                  Select
                </button>
              </div>
            ))}
          </div>

          {/* Cancel Button */}
          <div style={{
            textAlign: 'center',
            marginTop: '3rem'
          }}>
            <button style={{
              padding: '0.75rem 2rem',
              backgroundColor: '#6b7280',
              color: '#ffffff',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}>
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {isModalOpen && selectedProduct && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50
        }}>
          <div style={{
            backgroundColor: '#1f2937',
            borderRadius: '0.75rem',
            padding: '2rem',
            maxWidth: '28rem',
            width: '90vw',
            border: '1px solid #374151'
          }}>
            {/* Header */}
            <div style={{
              textAlign: 'center',
              marginBottom: '2rem'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1rem',
                marginBottom: '1rem'
              }}>
                <div style={{
                  width: '40px',
                  height: '26px',
                  background: 'linear-gradient(45deg, #3b82f6, #8b5cf6)',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <div style={{
                    width: '26px',
                    height: '13px',
                    background: 'linear-gradient(45deg, #fbbf24, #f59e0b)',
                    borderRadius: '3px',
                    position: 'relative'
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: '1px',
                      left: '1px',
                      width: '24px',
                      height: '11px',
                      background: 'linear-gradient(45deg, #ef4444, #dc2626)',
                      borderRadius: '2px'
                    }} />
                  </div>
                </div>
                <div>
                  <div style={{
                    fontSize: '1.125rem',
                    fontWeight: '700',
                    color: '#ffffff'
                  }}>
                    COMPLETE TRANSFERS
                  </div>
                  <div style={{
                    fontSize: '0.75rem',
                    color: '#9ca3af'
                  }}>
                    NO MESS, JUST PRESS
                  </div>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1rem',
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
            </div>

            <h2 style={{
              fontSize: '1.25rem',
              fontWeight: '600',
              color: '#ffffff',
              textAlign: 'center',
              margin: '0 0 1rem 0'
            }}>
              {selectedProduct.name} - Select Template Size
            </h2>
            <p style={{
              fontSize: '0.875rem',
              color: '#9ca3af',
              textAlign: 'center',
              margin: '0 0 2rem 0'
            }}>
              Choose the specific template size for your full colour transfers.
            </p>

            {/* Template Sizes */}
            <div style={{
              backgroundColor: '#374151',
              borderRadius: '0.5rem',
              padding: '1.5rem',
              marginBottom: '2rem'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '1rem'
              }}>
                <span style={{ fontSize: '1rem' }}>🎨</span>
                <span style={{
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#ffffff'
                }}>
                  Screen Printed Transfers
                </span>
                <span style={{
                  fontSize: '0.75rem',
                  color: '#9ca3af'
                }}>
                  8 templates available
                </span>
              </div>
              
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '0.75rem',
                marginBottom: '1rem'
              }}>
                {['A3', 'A4', 'A5', 'A6'].map((size, index) => (
                  <button
                    key={size}
                    style={{
                      padding: '1rem 0.5rem',
                      backgroundColor: index === 0 ? '#7c3aed' : '#4b5563',
                      color: '#ffffff',
                      borderRadius: '0.5rem',
                      border: index === 0 ? '2px solid #8b5cf6' : '1px solid #6b7280',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      textAlign: 'center'
                    }}
                  >
                    <div>{size}</div>
                    <div style={{ fontSize: '0.75rem', fontWeight: '400', marginTop: '0.25rem' }}>
                      {size === 'A3' ? '297×420mm' : 
                       size === 'A4' ? '210×297mm' :
                       size === 'A5' ? '148×210mm' : '105×148mm'}
                    </div>
                  </button>
                ))}
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '0.75rem'
              }}>
                {['295×100mm', '95×95mm', '100×70mm', '60×60mm'].map((size) => (
                  <button
                    key={size}
                    style={{
                      padding: '1rem 0.5rem',
                      backgroundColor: '#4b5563',
                      color: '#ffffff',
                      borderRadius: '0.5rem',
                      border: '1px solid #6b7280',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: '0.75rem' }}>{size}</div>
                    <div style={{ fontSize: '0.6875rem', fontWeight: '400', marginTop: '0.25rem' }}>
                      {size}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Selected Template Info */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '2rem'
            }}>
              <div>
                <div style={{
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: '#ffffff',
                  marginBottom: '0.25rem'
                }}>
                  Selected Template
                </div>
                <div style={{
                  fontSize: '0.875rem',
                  color: '#9ca3af'
                }}>
                  A3 (297×420mm)
                </div>
                <div style={{
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#ffffff',
                  marginTop: '1rem',
                  marginBottom: '0.25rem'
                }}>
                  Price Estimate
                </div>
                <div style={{
                  fontSize: '0.875rem',
                  color: '#9ca3af'
                }}>
                  Pricing unavailable
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#ffffff',
                  marginBottom: '0.25rem'
                }}>
                  Quantity of Transfers Required
                </div>
                <input 
                  type="number"
                  defaultValue="10"
                  style={{
                    width: '60px',
                    padding: '0.5rem',
                    borderRadius: '0.375rem',
                    border: '1px solid #6b7280',
                    backgroundColor: '#1f2937',
                    color: '#ffffff',
                    fontSize: '0.875rem',
                    textAlign: 'center'
                  }}
                />
                <div style={{
                  fontSize: '0.75rem',
                  color: '#9ca3af',
                  marginTop: '0.25rem'
                }}>
                  Min: 10 (Standard)
                </div>
                <div style={{
                  fontSize: '0.875rem',
                  color: '#9ca3af',
                  marginTop: '1rem'
                }}>
                  10 × A3<br />
                  Prices from Odoo system
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{
              display: 'flex',
              gap: '1rem'
            }}>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  backgroundColor: 'transparent',
                  color: '#9ca3af',
                  borderRadius: '0.5rem',
                  border: '1px solid #6b7280',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                ← Back to Product Selection
              </button>
              <button
                onClick={handleConfirm}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  backgroundColor: '#7c3aed',
                  color: '#ffffff',
                  borderRadius: '0.5rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}