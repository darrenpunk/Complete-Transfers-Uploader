import React from 'react'

interface SidebarProps {
  currentStep: number
  onStepClick: (step: number) => void
}

const sidebarSections = [
  { id: 'upload', label: 'Upload Logo', icon: '📁', step: 0 },
  { id: 'template', label: 'Template Size', icon: '📐', step: 1 },
  { id: 'color', label: 'Garment Color', icon: '🎨', step: 2 },
  { id: 'canvas', label: 'Canvas/PDF', icon: '🖼️', step: 3 },
  { id: 'artwork', label: 'Artwork', icon: '🎯', step: 4 }
]

export function Sidebar({ currentStep, onStepClick }: SidebarProps) {
  return (
    <div style={{
      width: '280px',
      backgroundColor: '#1f2937',
      height: '100vh',
      borderRight: '1px solid #374151',
      padding: '1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem'
    }}>
      {/* Logo */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        marginBottom: '2rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid #374151'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          backgroundColor: '#3b82f6',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.25rem'
        }}>
          🎨
        </div>
        <div>
          <div style={{
            fontSize: '1.125rem',
            fontWeight: '700',
            color: '#ffffff',
            lineHeight: '1.2'
          }}>
            Complete Transfers
          </div>
          <div style={{
            fontSize: '0.75rem',
            color: '#9ca3af',
            lineHeight: '1'
          }}>
            No Mess, Just Press
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {sidebarSections.map((section) => (
          <button
            key={section.id}
            onClick={() => onStepClick(section.step)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              backgroundColor: currentStep === section.step ? '#3b82f6' : 'transparent',
              color: currentStep === section.step ? '#ffffff' : '#9ca3af',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              transition: 'all 0.2s ease',
              textAlign: 'left',
              width: '100%'
            }}
            onMouseEnter={(e) => {
              if (currentStep !== section.step) {
                e.currentTarget.style.backgroundColor = '#374151'
                e.currentTarget.style.color = '#ffffff'
              }
            }}
            onMouseLeave={(e) => {
              if (currentStep !== section.step) {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = '#9ca3af'
              }
            }}
          >
            <span style={{ fontSize: '1rem' }}>{section.icon}</span>
            {section.label}
          </button>
        ))}
      </nav>

      {/* Pre-flight Check */}
      <div style={{
        marginTop: '2rem',
        padding: '1rem',
        backgroundColor: '#374151',
        borderRadius: '0.5rem',
        border: '1px solid #4b5563'
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
            color: '#fbbf24'
          }}>
            Pre-flight Check
          </span>
        </div>
        <p style={{
          fontSize: '0.75rem',
          color: '#d1d5db',
          margin: 0,
          lineHeight: '1.4'
        }}>
          Select a logo to run pre-flight checks.
        </p>
      </div>

      {/* Product Selector */}
      <div style={{
        marginTop: '1rem',
        padding: '1rem',
        backgroundColor: '#374151',
        borderRadius: '0.5rem',
        border: '1px solid #4b5563'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '0.75rem'
        }}>
          <span style={{ fontSize: '1rem' }}>🎯</span>
          <span style={{
            fontSize: '0.875rem',
            fontWeight: '600',
            color: '#ffffff'
          }}>
            Product Selector
          </span>
        </div>
        <select style={{
          width: '100%',
          padding: '0.5rem',
          borderRadius: '0.375rem',
          border: '1px solid #6b7280',
          backgroundColor: '#1f2937',
          color: '#ffffff',
          fontSize: '0.875rem'
        }}>
          <option>Choose Template</option>
          <option>Full Colour Transfers</option>
          <option>DTF Transfers</option>
          <option>UV DTF</option>
        </select>
        <button style={{
          width: '100%',
          padding: '0.5rem',
          marginTop: '0.5rem',
          borderRadius: '0.375rem',
          backgroundColor: '#3b82f6',
          color: '#ffffff',
          border: 'none',
          cursor: 'pointer',
          fontSize: '0.75rem',
          fontWeight: '500'
        }}>
          Change
        </button>
      </div>
    </div>
  )
}