import React from 'react'
import { WorkflowStep } from '../../../shared/schema'

interface WorkflowStepsProps {
  steps: WorkflowStep[]
  currentStep: number
}

export function WorkflowSteps({ steps, currentStep }: WorkflowStepsProps) {
  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      gap: '1rem',
      padding: '2rem',
      backgroundColor: '#1f2937',
      borderBottom: '1px solid #374151'
    }}>
      {steps.map((step, index) => (
        <React.Fragment key={step.id}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <div style={{
              width: '2.5rem',
              height: '2.5rem',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: index <= currentStep ? '#3b82f6' : '#374151',
              color: 'white',
              fontSize: '0.875rem',
              fontWeight: '600',
              transition: 'all 0.3s ease'
            }}>
              {index < currentStep ? '✓' : step.id}
            </div>
            <div style={{
              textAlign: 'center',
              maxWidth: '120px'
            }}>
              <div style={{
                fontSize: '0.875rem',
                fontWeight: '600',
                color: index <= currentStep ? '#ffffff' : '#9ca3af',
                marginBottom: '0.25rem'
              }}>
                {step.name}
              </div>
              <div style={{
                fontSize: '0.75rem',
                color: '#6b7280',
                lineHeight: '1.2'
              }}>
                {step.description}
              </div>
            </div>
          </div>
          {index < steps.length - 1 && (
            <div style={{
              width: '3rem',
              height: '2px',
              backgroundColor: index < currentStep ? '#3b82f6' : '#374151',
              marginTop: '-1rem',
              transition: 'all 0.3s ease'
            }} />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}