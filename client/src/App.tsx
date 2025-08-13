import { useState } from 'react'
import { WorkflowStep } from '../../shared/schema'

// Import components
import { WorkflowSteps } from './components/WorkflowSteps'
import { Sidebar } from './components/Sidebar'
import { ProductSelection } from './components/ProductSelection'
import { GarmentColorSelection } from './components/GarmentColorSelection'
import { CanvasEditor } from './components/CanvasEditor'

const WORKFLOW_STEPS: WorkflowStep[] = [
  { id: 1, name: 'Upload Logo', description: 'Upload your logo file', completed: false },
  { id: 2, name: 'Template Size', description: 'Select template dimensions', completed: false },
  { id: 3, name: 'Garment Color', description: 'Choose garment colors', completed: false },
  { id: 4, name: 'Canvas/PDF', description: 'Position and edit artwork', completed: false },
  { id: 5, name: 'Artwork', description: 'Generate final artwork', completed: false }
]

type AppState = 'product-selection' | 'template-selection' | 'color-selection' | 'canvas-editor'

export default function App() {
  const [appState, setAppState] = useState<AppState>('product-selection')
  const [currentStep, setCurrentStep] = useState(0)
  const [workflowSteps, setWorkflowSteps] = useState(WORKFLOW_STEPS)
  
  // Project state
  const [selectedProduct, setSelectedProduct] = useState<string>('')
  const [selectedTemplate, setSelectedTemplate] = useState<string>('A3')
  const [selectedGarmentColor, setSelectedGarmentColor] = useState<string>('')

  const handleProductSelected = (productId: string) => {
    setSelectedProduct(productId)
    setAppState('template-selection')
    setCurrentStep(1)
    updateWorkflowStep(0, true)
  }

  const handleColorSelected = (colorId: string) => {
    setSelectedGarmentColor(colorId)
    setAppState('canvas-editor')
    setCurrentStep(2)
    updateWorkflowStep(1, true)
  }

  const handleStepClick = (step: number) => {
    setCurrentStep(step)
    // Navigate to appropriate state based on step
    switch (step) {
      case 0:
        setAppState('product-selection')
        break
      case 1:
        setAppState('template-selection')
        break
      case 2:
        setAppState('color-selection')
        break
      case 3:
      case 4:
        setAppState('canvas-editor')
        break
    }
  }

  const updateWorkflowStep = (stepIndex: number, completed: boolean) => {
    setWorkflowSteps(prev => prev.map((step, index) => 
      index === stepIndex ? { ...step, completed } : step
    ))
  }

  const handlePDFGenerate = () => {
    // Handle PDF generation
    console.log('Generating PDF...', {
      product: selectedProduct,
      template: selectedTemplate,
      color: selectedGarmentColor
    })
    updateWorkflowStep(4, true)
  }

  // Show product selection modal
  if (appState === 'product-selection') {
    return <ProductSelection onProductSelected={handleProductSelected} />
  }

  // Show template selection with color selection
  if (appState === 'template-selection') {
    return <GarmentColorSelection onColorSelected={handleColorSelected} />
  }

  // Show color selection
  if (appState === 'color-selection') {
    return <GarmentColorSelection onColorSelected={handleColorSelected} />
  }

  // Main application layout with sidebar and canvas
  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      backgroundColor: '#111827',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Sidebar */}
      <Sidebar 
        currentStep={currentStep} 
        onStepClick={handleStepClick} 
      />

      {/* Main Content Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Workflow Steps Header */}
        <WorkflowSteps 
          steps={workflowSteps} 
          currentStep={currentStep} 
        />

        {/* Canvas Editor */}
        <CanvasEditor
          templateSize={selectedTemplate}
          garmentColor={selectedGarmentColor}
          onPDFGenerate={handlePDFGenerate}
        />
      </div>
    </div>
  )
}