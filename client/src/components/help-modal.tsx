import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HelpCircle, Upload, Palette, MousePointer, FileText, Printer, Wand2, Package, ChevronRight } from "lucide-react";

interface HelpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HelpModal({ open, onOpenChange }: HelpModalProps) {
  const [activeSection, setActiveSection] = useState("getting-started");

  const sections = [
    { id: "getting-started", label: "Getting Started", icon: ChevronRight },
    { id: "uploading", label: "Uploading Files", icon: Upload },
    { id: "design", label: "Design Tools", icon: MousePointer },
    { id: "colors", label: "Color Management", icon: Palette },
    { id: "vectorizer", label: "Vectorization", icon: Wand2 },
    { id: "templates", label: "Templates", icon: Package },
    { id: "printing", label: "Printing", icon: Printer },
    { id: "troubleshooting", label: "Troubleshooting", icon: FileText },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="text-2xl flex items-center gap-2">
            <HelpCircle className="h-6 w-6" />
            CompleteTransfers Help Guide
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex h-full">
          {/* Sidebar Navigation */}
          <div className="w-64 border-r bg-muted/50 p-4">
            <nav className="space-y-2">
              {sections.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeSection === section.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {section.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Content Area */}
          <ScrollArea className="flex-1 p-6">
            {activeSection === "getting-started" && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold">Getting Started</h2>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Welcome to CompleteTransfers</h3>
                    <p className="text-muted-foreground">
                      CompleteTransfers is a professional web-to-print platform for creating custom transfers and garment decorations. 
                      Follow these simple steps to create your first design:
                    </p>
                  </div>

                  <div className="bg-muted rounded-lg p-4 space-y-3">
                    <h4 className="font-medium">Quick Start Steps:</h4>
                    <ol className="list-decimal list-inside space-y-2 text-sm">
                      <li>Select a product template from the product launcher</li>
                      <li>Upload your logo or artwork files</li>
                      <li>Position and resize your designs on the canvas</li>
                      <li>Choose garment colors (for Full Colour Transfers)</li>
                      <li>Review preflight checks and generate your PDF</li>
                    </ol>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Supported File Types:</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>PDF (recommended for best quality)</li>
                      <li>SVG (vector graphics)</li>
                      <li>PNG (transparent backgrounds supported)</li>
                      <li>JPEG/JPG (photos and raster images)</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "uploading" && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold">Uploading Files</h2>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">File Upload Methods</h3>
                    <p className="text-muted-foreground mb-3">
                      You can upload files in two ways:
                    </p>
                    <ul className="list-disc list-inside space-y-2 text-sm">
                      <li><strong>Drag and Drop:</strong> Simply drag files from your computer onto the upload area</li>
                      <li><strong>Click to Browse:</strong> Click the upload button to select files from your computer</li>
                    </ul>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-4">
                    <h4 className="font-medium mb-2">Pro Tips:</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Upload multiple files at once by selecting them all</li>
                      <li>Vector files (PDF, SVG) provide the best print quality</li>
                      <li>Files are automatically converted to CMYK for print-ready output</li>
                      <li>Maximum file size: 100MB per file</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Automatic Processing:</h4>
                    <p className="text-sm text-muted-foreground">
                      When you upload a file, the system automatically:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground mt-2">
                      <li>Detects colors and converts them to CMYK</li>
                      <li>Identifies fonts that may need outlining</li>
                      <li>Centers the logo on your template</li>
                      <li>Calculates the optimal size for your design</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "design" && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold">Design Tools</h2>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Canvas Controls</h3>
                    <ul className="space-y-2 text-sm">
                      <li><strong>Move:</strong> Click and drag any logo to reposition it</li>
                      <li><strong>Resize:</strong> Drag the corner handles to resize proportionally</li>
                      <li><strong>Rotate:</strong> Use the rotation slider in the properties panel</li>
                      <li><strong>Delete:</strong> Click the trash icon when multiple copies exist</li>
                      <li><strong>Duplicate:</strong> Use the duplicate button in the properties panel</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Alignment Tools</h3>
                    <p className="text-muted-foreground mb-3">
                      Use the alignment panel to perfectly position your designs:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Align elements to canvas edges (top, bottom, left, right)</li>
                      <li>Center elements horizontally or vertically</li>
                      <li>Select all elements for group alignment</li>
                      <li>Use "Fit to Bounds" for A3 templates to ensure safe margins</li>
                    </ul>
                  </div>

                  <div className="bg-muted rounded-lg p-4">
                    <h4 className="font-medium mb-2">Keyboard Shortcuts:</h4>
                    <ul className="space-y-1 text-sm">
                      <li><kbd>Delete</kbd> - Remove selected element</li>
                      <li><kbd>Ctrl+Z</kbd> - Undo last action</li>
                      <li><kbd>Ctrl+Y</kbd> - Redo action</li>
                      <li><kbd>Arrow Keys</kbd> - Fine-tune position</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "colors" && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold">Color Management</h2>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Print Color Simulation</h3>
                    <p className="text-muted-foreground">
                      The canvas shows how your colors will appear when printed. Toggle "Print Preview" 
                      to see the difference between screen and print colors.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Garment Colors</h3>
                    <p className="text-muted-foreground mb-3">
                      For Full Colour Transfers, you must select a garment color:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Choose from professional garment colors (Gildan & Fruit of the Loom)</li>
                      <li>Each logo can have its own garment color</li>
                      <li>Colors include Hi-Viz options for safety garments</li>
                      <li>PDF preview shows artwork on selected background</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Ink Colors</h3>
                    <p className="text-muted-foreground mb-3">
                      For Single Colour Transfers, select from Pantone ink colors:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>31 standard Pantone colors available</li>
                      <li>Your entire design will be printed in the selected ink color</li>
                      <li>Perfect for single-color logos and text</li>
                    </ul>
                  </div>

                  <div className="bg-yellow-50 dark:bg-yellow-950 rounded-lg p-4">
                    <h4 className="font-medium mb-2">Color Accuracy:</h4>
                    <p className="text-sm">
                      All colors are automatically converted to CMYK for professional printing. 
                      The system uses industry-standard color profiles (FOGRA51) to ensure 
                      accurate color reproduction.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "vectorizer" && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold">AI Vectorization</h2>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">When to Use Vectorization</h3>
                    <p className="text-muted-foreground">
                      If you upload a raster image (JPEG, PNG), you'll be offered the option to 
                      convert it to a vector format for superior print quality.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Vectorizer Features</h3>
                    <ul className="space-y-2 text-sm">
                      <li><strong>Color Management:</strong> Remove unwanted background colors</li>
                      <li><strong>Color Locking:</strong> Click colors to protect them from deletion</li>
                      <li><strong>Eyedropper Tool:</strong> Copy colors from one element to another</li>
                      <li><strong>CMYK Adjustments:</strong> Fine-tune color values with sliders</li>
                      <li><strong>Zoom Controls:</strong> Inspect details up to 800% zoom</li>
                    </ul>
                  </div>

                  <div className="bg-muted rounded-lg p-4">
                    <h4 className="font-medium mb-2">Vectorization Workflow:</h4>
                    <ol className="list-decimal list-inside space-y-2 text-sm">
                      <li>Preview the vectorization (free)</li>
                      <li>Remove unwanted colors or backgrounds</li>
                      <li>Lock important colors to protect them</li>
                      <li>Use "Delete Unlocked Colors" for quick cleanup</li>
                      <li>Approve and use the vectorized result</li>
                    </ol>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-4">
                    <p className="text-sm">
                      <strong>Note:</strong> Vectorization uses credits only when you approve the final result. 
                      Preview and color editing are free.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "templates" && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold">Product Templates</h2>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Available Products</h3>
                    <ul className="space-y-3">
                      <li>
                        <strong>Full Colour Transfers</strong>
                        <p className="text-sm text-muted-foreground">
                          Multi-color designs with white base layer. Requires garment color selection.
                        </p>
                      </li>
                      <li>
                        <strong>Single Colour Transfers</strong>
                        <p className="text-sm text-muted-foreground">
                          One-color designs using Pantone inks. Perfect for simple logos and text.
                        </p>
                      </li>
                      <li>
                        <strong>DTF Digital Film Transfers</strong>
                        <p className="text-sm text-muted-foreground">
                          Large format (1000×550mm) for oversized designs and all-over prints.
                        </p>
                      </li>
                      <li>
                        <strong>UV DTF Hard Surface</strong>
                        <p className="text-sm text-muted-foreground">
                          For non-fabric surfaces like plastics, metals, and glass.
                        </p>
                      </li>
                      <li>
                        <strong>Custom Badges</strong>
                        <p className="text-sm text-muted-foreground">
                          Embroidered patches and appliques. Includes detailed form for specifications.
                        </p>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-muted rounded-lg p-4">
                    <h4 className="font-medium mb-2">Template Sizes:</h4>
                    <p className="text-sm">
                      Each product category offers multiple size options. The A3 template includes 
                      safety margin guides to prevent edge clipping during production.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "printing" && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold">Generating PDFs</h2>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Preflight Checks</h3>
                    <p className="text-muted-foreground mb-3">
                      Before generating your PDF, review the preflight panel:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li><strong>Vector Status:</strong> Confirms your files are print-ready</li>
                      <li><strong>Font Outlining:</strong> Shows if text needs to be converted</li>
                      <li><strong>Color Analysis:</strong> Displays all colors in CMYK format</li>
                      <li><strong>Size Check:</strong> Ensures artwork fits within print area</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">PDF Generation Process</h3>
                    <ol className="list-decimal list-inside space-y-2 text-sm">
                      <li>Click "Generate CMYK PDF" button</li>
                      <li>Review the 2-page preview (design + garment mockup)</li>
                      <li>Check both approval checkboxes</li>
                      <li>Enter project name and quantity</li>
                      <li>Add any special instructions in comments</li>
                      <li>Download your production-ready PDF</li>
                    </ol>
                  </div>

                  <div className="bg-green-50 dark:bg-green-950 rounded-lg p-4">
                    <h4 className="font-medium mb-2">PDF Features:</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Professional CMYK color space with ICC profiles</li>
                      <li>Vector graphics preserved for sharp printing</li>
                      <li>300 DPI resolution for raster elements</li>
                      <li>Includes all project specifications</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "troubleshooting" && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold">Troubleshooting</h2>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Common Issues</h3>
                    
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-medium">White elements not visible</h4>
                        <p className="text-sm text-muted-foreground">
                          White designs are preserved but may be hard to see on white canvas. 
                          They will appear correctly in the final PDF.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-medium">Colors look different than expected</h4>
                        <p className="text-sm text-muted-foreground">
                          Toggle "Print Preview" to see accurate print colors. Screen colors 
                          (RGB) always appear brighter than print colors (CMYK).
                        </p>
                      </div>

                      <div>
                        <h4 className="font-medium">Font outlining warning</h4>
                        <p className="text-sm text-muted-foreground">
                          Click "Outline Fonts" in the properties panel to convert text to paths. 
                          This ensures fonts print correctly even if not installed on production systems.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-medium">Large file upload fails</h4>
                        <p className="text-sm text-muted-foreground">
                          Maximum file size is 200MB. For larger files, try optimizing the PDF 
                          or reducing image resolution before uploading.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted rounded-lg p-4">
                    <h4 className="font-medium mb-2">Need More Help?</h4>
                    <p className="text-sm">
                      If you're experiencing issues not covered here, try using the "Start Over" 
                      button to begin fresh, or contact support for assistance.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}