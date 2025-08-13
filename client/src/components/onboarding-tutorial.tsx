import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, X, Upload, Palette, Settings, Eye, Download, CheckCircle, Play } from "lucide-react";
import CompleteTransferLogo from "./complete-transfer-logo";

interface OnboardingTutorialProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TutorialStep {
  id: number;
  title: string;
  description: string;
  content: React.ReactNode;
  icon: React.ReactNode;
}

export function OnboardingTutorial({ open, onOpenChange }: OnboardingTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);

  const tutorialSteps: TutorialStep[] = [
    {
      id: 1,
      title: "Welcome to CompleteTransfers Artwork Tool",
      description: "Professional design workflow for custom transfers",
      icon: <Play className="w-8 h-8 text-primary" />,
      content: (
        <div className="space-y-6">
          <div className="text-center">
            <CompleteTransferLogo size="lg" className="mx-auto mb-6" />
            <div className="space-y-4">
              <h3 className="text-2xl font-bold text-foreground">Welcome to Your Professional Design Workspace</h3>
              <p className="text-lg text-muted-foreground leading-relaxed">
                This tool helps you create high-quality transfer designs with professional workflow management. 
                Perfect for screen printing, DTF transfers, and custom apparel decoration.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
                <Card className="text-center">
                  <CardContent className="pt-6">
                    <Upload className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                    <h4 className="font-semibold">Smart Upload</h4>
                    <p className="text-sm text-muted-foreground">AI-powered file processing with color preservation</p>
                  </CardContent>
                </Card>
                <Card className="text-center">
                  <CardContent className="pt-6">
                    <Palette className="w-8 h-8 text-purple-500 mx-auto mb-2" />
                    <h4 className="font-semibold">Color Management</h4>
                    <p className="text-sm text-muted-foreground">Professional CMYK workflow for accurate printing</p>
                  </CardContent>
                </Card>
                <Card className="text-center">
                  <CardContent className="pt-6">
                    <Download className="w-8 h-8 text-green-500 mx-auto mb-2" />
                    <h4 className="font-semibold">Production Ready</h4>
                    <p className="text-sm text-muted-foreground">Generate print-ready PDFs with exact specifications</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 2,
      title: "Step 1: Choose Your Template",
      description: "Select the right template for your transfer type",
      icon: <Settings className="w-8 h-8 text-blue-500" />,
      content: (
        <div className="space-y-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Template Selection</h4>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Templates determine your final output size, pricing, and printing method. Choose based on your project needs.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Full Colour Transfers</CardTitle>
                <CardDescription>Multi-color designs with photo-realistic printing</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Badge variant="secondary">A3, A4, A5 sizes</Badge>
                  <Badge variant="secondary">Minimum 10 copies</Badge>
                  <p className="text-sm text-muted-foreground">Perfect for logos, photographs, and complex designs</p>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">DTF Transfers</CardTitle>
                <CardDescription>Direct-to-Film transfers for any fabric</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Badge variant="secondary">Various sizes</Badge>
                  <Badge variant="secondary">Minimum 1 copy</Badge>
                  <p className="text-sm text-muted-foreground">Flexible application on cotton, polyester, blends</p>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              💡 <strong>Pro Tip:</strong> Template selection affects pricing and minimum quantities. DTF transfers offer lower minimums but Full Colour transfers provide the best quality for detailed designs.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 3,
      title: "Step 2: Upload Your Artwork",
      description: "Smart file processing with automatic optimization",
      icon: <Upload className="w-8 h-8 text-green-500" />,
      content: (
        <div className="space-y-6">
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">Smart File Processing</h4>
            <p className="text-sm text-green-700 dark:text-green-300">
              Our system automatically detects file types and applies the best processing workflow for optimal print quality.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="font-semibold">Supported File Types:</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm"><strong>Vector Files:</strong> SVG, PDF (recommended)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm"><strong>Raster Images:</strong> PNG, JPEG</span>
                </div>
                <div className="text-xs text-muted-foreground ml-6">
                  Up to 200MB per file
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold">Automatic Processing:</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-blue-500" />
                  <span className="text-sm">CMYK color conversion</span>
                </div>
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-purple-500" />
                  <span className="text-sm">Vector optimization</span>
                </div>
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-orange-500" />
                  <span className="text-sm">Quality analysis</span>
                </div>
              </div>
            </div>
          </div>

          <Card className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20">
            <CardContent className="pt-6">
              <h4 className="font-semibold mb-2">AI Vectorization Service</h4>
              <p className="text-sm text-muted-foreground mb-3">
                Have a raster logo that needs to be converted to vector? Our AI service can automatically vectorize simple logos, 
                or you can request professional manual vectorization for complex designs.
              </p>
              <div className="flex gap-2">
                <Badge variant="outline">AI Vectorization: €3.00 ex VAT</Badge>
                <Badge variant="outline">Professional Service: Custom Quote</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    },
    {
      id: 4,
      title: "Step 3: Design Your Layout",
      description: "Interactive canvas with professional tools",
      icon: <Palette className="w-8 h-8 text-purple-500" />,
      content: (
        <div className="space-y-6">
          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
            <h4 className="font-semibold text-purple-800 dark:text-purple-200 mb-2">Interactive Design Canvas</h4>
            <p className="text-sm text-purple-700 dark:text-purple-300">
              Position, resize, and arrange your logos with precision tools and real-time preview.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="font-semibold">Canvas Tools:</h4>
              <div className="space-y-3">
                <div className="border rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 bg-blue-500 rounded"></div>
                    <span className="text-sm font-medium">Position & Transform</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Drag, resize, rotate with precision controls</p>
                </div>
                <div className="border rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 bg-green-500 rounded"></div>
                    <span className="text-sm font-medium">Smart Alignment</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Auto-snap to guides, center, and align tools</p>
                </div>
                <div className="border rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 bg-orange-500 rounded"></div>
                    <span className="text-sm font-medium">Gang Sheet Builder</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Replicate designs in grids for efficient printing</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold">Color Management:</h4>
              <div className="space-y-3">
                <div className="border rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 bg-red-500 rounded"></div>
                    <span className="text-sm font-medium">Garment Colors</span>
                  </div>
                  <p className="text-xs text-muted-foreground">27+ professional garment colors from Gildan & Fruit of the Loom</p>
                </div>
                <div className="border rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 bg-purple-500 rounded"></div>
                    <span className="text-sm font-medium">Ink Colors</span>
                  </div>
                  <p className="text-xs text-muted-foreground">CMYK color picker with Pantone matching</p>
                </div>
                <div className="border rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 bg-yellow-500 rounded"></div>
                    <span className="text-sm font-medium">Auto-Recoloring</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Single-color templates automatically adjust vector colors</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 5,
      title: "Step 4: Pre-flight Quality Check",
      description: "Comprehensive analysis for print-ready files",
      icon: <CheckCircle className="w-8 h-8 text-green-600" />,
      content: (
        <div className="space-y-6">
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">Quality Assurance</h4>
            <p className="text-sm text-green-700 dark:text-green-300">
              Automated checks ensure your files meet professional printing standards before production.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Palette className="w-5 h-5 text-blue-500" />
                  Color Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">CMYK color mode verification</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">Color profile compliance</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">Pantone color detection</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings className="w-5 h-5 text-purple-500" />
                  Technical Checks
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">Font outlining verification</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">Resolution and sizing</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">Vector path optimization</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Automatic Fixes Available</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="space-y-1">
                <p className="text-blue-700 dark:text-blue-300">• RGB to CMYK conversion</p>
                <p className="text-blue-700 dark:text-blue-300">• Font outlining</p>
              </div>
              <div className="space-y-1">
                <p className="text-blue-700 dark:text-blue-300">• Logo sizing optimization</p>
                <p className="text-blue-700 dark:text-blue-300">• Color standardization</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 6,
      title: "Step 5: Generate Production Files",
      description: "Professional PDF output with exact specifications",
      icon: <Download className="w-8 h-8 text-green-500" />,
      content: (
        <div className="space-y-6">
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">Production-Ready Output</h4>
            <p className="text-sm text-green-700 dark:text-green-300">
              Generate professional PDF files with exact dimensions and color profiles for your chosen printing method.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="font-semibold">PDF Specifications:</h4>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-500 rounded mt-2"></div>
                  <div>
                    <p className="text-sm font-medium">Exact Dimensions</p>
                    <p className="text-xs text-muted-foreground">210×208.249mm at 600×595px (0.35mm per pixel)</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-purple-500 rounded mt-2"></div>
                  <div>
                    <p className="text-sm font-medium">CMYK Color Profile</p>
                    <p className="text-xs text-muted-foreground">FOGRA51 ICC profile embedded for accurate color reproduction</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded mt-2"></div>
                  <div>
                    <p className="text-sm font-medium">Vector Preservation</p>
                    <p className="text-xs text-muted-foreground">Maintains vector paths for crisp printing at any size</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold">Included in PDF:</h4>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-orange-500 rounded mt-2"></div>
                  <div>
                    <p className="text-sm font-medium">Artwork Page</p>
                    <p className="text-xs text-muted-foreground">Clean artwork on white background</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-red-500 rounded mt-2"></div>
                  <div>
                    <p className="text-sm font-medium">Garment Preview</p>
                    <p className="text-xs text-muted-foreground">Design shown on selected garment color</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-yellow-500 rounded mt-2"></div>
                  <div>
                    <p className="text-sm font-medium">Production Notes</p>
                    <p className="text-xs text-muted-foreground">Quantity, colors, and specifications</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Card className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20">
            <CardContent className="pt-6">
              <h4 className="font-semibold mb-2">Ready for Production</h4>
              <p className="text-sm text-muted-foreground">
                Your PDF files are now ready to be sent to production or attached to your order. 
                Each file includes all necessary specifications for accurate printing and meets industry standards for professional transfer production.
              </p>
            </CardContent>
          </Card>
        </div>
      )
    }
  ];

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleStart = () => {
    setHasStarted(true);
    setCurrentStep(0);
  };

  const handleClose = () => {
    onOpenChange(false);
    setCurrentStep(0);
    setHasStarted(false);
  };

  const currentTutorialStep = tutorialSteps[currentStep];

  if (!hasStarted && open) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <CompleteTransferLogo size="md" className="mx-auto mb-4" />
            <DialogTitle className="text-center text-2xl">Welcome to CompleteTransfers</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            <div className="text-center space-y-4">
              <p className="text-lg text-muted-foreground">
                Ready to learn how to create professional transfer designs?
              </p>
              <p className="text-sm text-muted-foreground">
                This interactive tutorial will guide you through the complete workflow in just a few minutes.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
              {tutorialSteps.map((step, index) => (
                <div key={step.id} className="space-y-2">
                  <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                    {step.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium">Step {index + 1}</p>
                    <p className="text-xs text-muted-foreground">{step.title.replace(/^Step \d+: /, '')}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-center gap-4">
              <Button variant="outline" onClick={handleClose}>
                Skip Tutorial
              </Button>
              <Button onClick={handleStart}>
                Start Tutorial
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open && hasStarted} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <CompleteTransferLogo size="sm" />
              <div>
                <DialogTitle className="text-xl">{currentTutorialStep?.title}</DialogTitle>
                <p className="text-sm text-muted-foreground">{currentTutorialStep?.description}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Progress indicator */}
          <div className="flex items-center gap-2">
            {tutorialSteps.map((_, index) => (
              <div
                key={index}
                className={`h-2 flex-1 rounded ${
                  index <= currentStep ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>

          {/* Step content */}
          <div className="min-h-[400px]">
            {currentTutorialStep?.content}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Step {currentStep + 1} of {tutorialSteps.length}
              </span>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={currentStep === 0}
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Previous
              </Button>
              
              {currentStep === tutorialSteps.length - 1 ? (
                <Button onClick={handleClose}>
                  Get Started
                  <CheckCircle className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button onClick={handleNext}>
                  Next
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}