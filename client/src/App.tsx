import { useState, useEffect } from 'react'

// Product type definitions
interface Product {
  id: string
  name: string
  description: string
  image: string
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

function ProductSelectionPage() {
  const [loading, setLoading] = useState(true)
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    // Simulate workspace loading exactly like your deployed version
    const timer = setTimeout(() => {
      setLoading(false)
    }, 1500)
    return () => clearTimeout(timer)
  }, [])

  const selectProduct = (productId: string) => {
    setSelectedProduct(productId)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setSelectedProduct(null)
  }

  const proceedToUploader = () => {
    if (selectedProduct) {
      window.location.href = `/uploader?product=${selectedProduct}`
    }
  }

  if (loading) {
    return (
      <div style={{
        position: 'fixed',
        inset: '0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <div style={{
          color: 'white',
          fontSize: '1.25rem',
          fontWeight: '500'
        }}>
          Setting up your workspace...
        </div>
      </div>
    )
  }

  const selectedProductData = PRODUCTS.find(p => p.id === selectedProduct)

  return (
    <>
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <div style={{
          maxWidth: '80rem',
          margin: '0 auto',
          padding: '2rem'
        }}>
          {/* Header */}
          <div style={{
            textAlign: 'center',
            marginBottom: '3rem'
          }}>
            <img 
              src="/assets/Artboard%201@4x_1753539065182-B1QyImPQ.png"
              alt="Complete Transfers - No Mess, Just Press"
              style={{
                maxWidth: '20rem',
                margin: '0 auto 1rem',
                display: 'block'
              }}
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
            <h1 style={{
              fontSize: '3rem',
              fontWeight: 'bold',
              color: 'white',
              marginBottom: '1rem',
              textShadow: '0 4px 8px rgba(0, 0, 0, 0.3)'
            }}>
              Complete Transfers - No Mess, Just Press
            </h1>
          </div>

          {/* Sub heading */}
          <div style={{
            textAlign: 'center',
            marginBottom: '3rem'
          }}>
            <h2 style={{
              fontSize: '1.5rem',
              fontWeight: '600',
              color: 'white',
              marginBottom: '0.5rem'
            }}>
              Select Product Type
            </h2>
            <p style={{
              color: 'rgba(255, 255, 255, 0.9)',
              fontSize: '1.125rem'
            }}>
              Choose the type of product you want to create artwork for
            </p>
          </div>

          {/* Products Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '2rem'
          }}>
            {PRODUCTS.map((product) => (
              <div
                key={product.id}
                style={{
                  backgroundColor: 'white',
                  borderRadius: '0.75rem',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transform: 'translateY(0)',
                  transition: 'all 0.3s ease',
                }}
                onClick={() => selectProduct(product.id)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-0.5rem)'
                  e.currentTarget.style.boxShadow = '0 35px 60px -12px rgba(0, 0, 0, 0.35)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                }}
              >
                <div style={{
                  height: '12rem',
                  overflow: 'hidden'
                }}>
                  <img
                    src={product.image}
                    alt={product.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                    onError={(e) => {
                      e.currentTarget.src = `data:image/svg+xml;base64,${btoa(`
                        <svg width="300" height="200" viewBox="0 0 300 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <rect width="300" height="200" fill="#f5f5f5"/>
                          <text x="150" y="100" text-anchor="middle" fill="#999" font-size="14">${product.name}</text>
                        </svg>
                      `)}`
                    }}
                  />
                </div>
                <div style={{ padding: '1.5rem' }}>
                  <h3 style={{
                    fontSize: '1.25rem',
                    fontWeight: '600',
                    color: '#1f2937',
                    marginBottom: '0.5rem'
                  }}>
                    {product.name}
                  </h3>
                  <p style={{
                    color: '#6b7280',
                    fontSize: '0.875rem',
                    marginBottom: '1.5rem',
                    lineHeight: '1.5'
                  }}>
                    {product.description}
                  </p>
                  <button style={{
                    width: '100%',
                    background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.5rem',
                    fontWeight: '600',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'opacity 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '0.9'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '1'
                  }}>
                    Select
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div style={{
          position: 'fixed',
          inset: '0',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: '50'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            padding: '2rem',
            maxWidth: '28rem',
            width: '100%',
            margin: '0 1rem'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.5rem'
            }}>
              <h2 style={{
                fontSize: '1.5rem',
                fontWeight: '600',
                color: '#1f2937'
              }}>
                Product Selected
              </h2>
              <button 
                onClick={closeModal}
                style={{
                  color: '#9ca3af',
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#6b7280'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#9ca3af'
                }}
              >
                ×
              </button>
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{
                color: '#6b7280',
                marginBottom: '1rem'
              }}>
                You have selected <strong style={{ color: '#1f2937' }}>{selectedProductData?.name}</strong>
              </p>
              <p style={{ color: '#6b7280' }}>
                This will redirect you to the artwork uploader for this product type.
              </p>
            </div>
            <div style={{
              display: 'flex',
              gap: '1rem'
            }}>
              <button 
                onClick={proceedToUploader}
                style={{
                  flex: '1',
                  background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  padding: '0.75rem 1rem',
                  borderRadius: '0.5rem',
                  fontWeight: '600',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'opacity 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.9'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1'
                }}
              >
                Continue to Artwork Uploader
              </button>
              <button 
                onClick={closeModal}
                style={{
                  flex: '1',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  padding: '0.75rem 1rem',
                  borderRadius: '0.5rem',
                  fontWeight: '600',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'opacity 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.9'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function App() {
  return <ProductSelectionPage />
}