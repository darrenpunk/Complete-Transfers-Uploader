import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSupportTicketSchema } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import CompleteTransferLogo from "./complete-transfer-logo";
import { HelpCircle, Upload, Palette, MousePointer, FileText, Printer, Package, ChevronRight, Mail, Loader2, ShoppingCart, Layers } from "lucide-react";
import { z } from "zod";

interface HelpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HelpModal({ open, onOpenChange }: HelpModalProps) {
  const [activeSection, setActiveSection] = useState("getting-started");
  const { toast } = useToast();

  const form = useForm<z.infer<typeof insertSupportTicketSchema>>({
    resolver: zodResolver(insertSupportTicketSchema),
    defaultValues: {
      name: "",
      email: "",
      subject: "",
      message: ""
    }
  });

  const supportTicketMutation = useMutation({
    mutationFn: async (data: z.infer<typeof insertSupportTicketSchema>) => {
      const response = await apiRequest('POST', '/api/support-tickets', data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Support ticket submitted",
        description: "We'll get back to you within 24 hours during business days."
      });
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to submit ticket",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const sections = [
    { id: "getting-started", label: "Getting Started", icon: ChevronRight },
    { id: "uploading", label: "Uploading Files", icon: Upload },
    { id: "design", label: "Design Tools", icon: MousePointer },
    { id: "grouping", label: "Grouping & Multi-Select", icon: Layers },
    { id: "colors", label: "Color Management", icon: Palette },
    { id: "templates", label: "Templates", icon: Package },
    { id: "printing", label: "Generating PDFs", icon: Printer },
    { id: "ordering", label: "Ordering & Cart", icon: ShoppingCart },
    { id: "troubleshooting", label: "Troubleshooting", icon: FileText },
    { id: "support", label: "Contact Support", icon: Mail },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] p-0">
        <DialogHeader className="px-6 pt-6">
          <CompleteTransferLogo size="md" className="mb-4" />
          <DialogTitle className="text-2xl flex items-center gap-2 justify-center">
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
                      CompleteTransfers is a professional web-to-print platform for creating custom heat transfers and garment decorations. 
                      Design your artwork, position it perfectly, and generate production-ready PDFs in minutes.
                    </p>
                  </div>

                  <div className="bg-muted rounded-lg p-4 space-y-3">
                    <h4 className="font-medium">Quick Start Steps:</h4>
                    <ol className="list-decimal list-inside space-y-2 text-sm">
                      <li>Click "Change" to select a product template</li>
                      <li>Upload your logo or artwork files (drag & drop or click)</li>
                      <li>Position and resize your designs on the canvas</li>
                      <li>Choose garment color (for Full Colour, HD, Metallic transfers)</li>
                      <li>Review preflight checks and click "Continue to Pre-flight"</li>
                      <li>Generate your PDF and add to cart</li>
                    </ol>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Supported File Types:</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li><strong>PDF</strong> - Recommended for best quality, preserves CMYK colors</li>
                      <li><strong>AI</strong> - Adobe Illustrator files (converted automatically)</li>
                      <li><strong>SVG</strong> - Vector graphics</li>
                      <li><strong>PNG</strong> - Transparent backgrounds supported</li>
                      <li><strong>JPEG/JPG</strong> - Photos and raster images</li>
                    </ul>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-4">
                    <h4 className="font-medium mb-2">Login Required</h4>
                    <p className="text-sm">
                      You can explore the uploader and position artwork freely. Login is required when 
                      you select a product to view pricing and add items to your cart.
                    </p>
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
                    <ul className="list-disc list-inside space-y-2 text-sm">
                      <li><strong>Drag and Drop:</strong> Drag files from your computer onto the upload area</li>
                      <li><strong>Click to Browse:</strong> Click the "Upload Logos" button to select files</li>
                      <li><strong>Dropbox File Request:</strong> For complex or large files, use our Dropbox integration</li>
                    </ul>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-4">
                    <h4 className="font-medium mb-2">Pro Tips:</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Upload multiple files at once</li>
                      <li>Vector files (PDF, AI, SVG) provide the best print quality</li>
                      <li>Files are automatically converted to CMYK for print</li>
                      <li>Maximum file size: 200MB per file</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Automatic Processing:</h4>
                    <p className="text-sm text-muted-foreground">
                      When you upload a file, the system automatically:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground mt-2">
                      <li>Extracts and preserves CMYK colors</li>
                      <li>Detects fonts that may need outlining</li>
                      <li>Calculates precise content bounds for accurate sizing</li>
                      <li>Centers the logo on your template</li>
                      <li>Generates a preview thumbnail</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Complex Files</h4>
                    <p className="text-sm text-muted-foreground">
                      If you see "Complex file detected", your artwork has many paths or effects. 
                      Use our Dropbox File Request option - we'll process it manually and notify you when ready.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">PDF Pass-Through Mode</h4>
                    <p className="text-sm text-muted-foreground">
                      If you upload a multi-page PDF that already contains garment color pages, 
                      the system will ask if you want to use your original pages in the final output. 
                      This preserves your exact CMYK colors and layout.
                    </p>
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
                      <li><strong>Resize:</strong> Drag the corner handles to resize (maintains aspect ratio)</li>
                      <li><strong>Rotate:</strong> Use the "Rotate 90°" button or rotation slider in properties</li>
                      <li><strong>Duplicate:</strong> Create copies using the "Duplicate Logo" button</li>
                      <li><strong>Imposition:</strong> Create a grid of repeated logos automatically</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Alignment Tools</h3>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Align to canvas edges (top, bottom, left, right)</li>
                      <li>Center horizontally or vertically</li>
                      <li>"Center Logo" button for quick centering</li>
                      <li>"Fit to Bounds" - automatically scale to fit within safety margins</li>
                      <li>Alignment respects the 3mm safety margins (red dotted lines)</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Safety Margins</h3>
                    <p className="text-sm text-muted-foreground">
                      The red dotted lines show the 3mm safety margin. Keep your artwork inside 
                      these boundaries to prevent anything being cut off during production.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Zoom Controls</h3>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Use the zoom slider or +/- buttons in the toolbar</li>
                      <li>Toggle "Grid" for alignment guides</li>
                      <li>Toggle "Guides" for safety margin visibility</li>
                    </ul>
                  </div>

                  <div className="bg-muted rounded-lg p-4">
                    <h4 className="font-medium mb-2">Keyboard Shortcuts:</h4>
                    <ul className="space-y-1 text-sm">
                      <li><kbd className="px-1 bg-background rounded">Delete</kbd> - Remove selected element</li>
                      <li><kbd className="px-1 bg-background rounded">Shift+Click</kbd> - Multi-select elements</li>
                      <li><kbd className="px-1 bg-background rounded">Arrow Keys</kbd> - Fine-tune position</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "grouping" && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold">Grouping & Multi-Select</h2>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Selecting Multiple Elements</h3>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li><strong>Shift+Click:</strong> Add or remove elements from selection</li>
                      <li><strong>Select All:</strong> Click "Select All" button to select everything</li>
                      <li>Selected elements show blue highlight borders</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Group Movement</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      When multiple elements are selected, you can:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Drag to move all selected elements together</li>
                      <li>Elements maintain their relative positions</li>
                      <li>Use alignment tools to align the entire group</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Group Resize & Rotation</h3>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Resize multiple elements proportionally as a group</li>
                      <li>Rotate all selected elements together around the group center</li>
                      <li>Each element also rotates individually while orbiting</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Persistent Groups</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      Create permanent groups that stay together:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li><strong>Group:</strong> Select 2+ elements and click "Group" button</li>
                      <li><strong>Ungroup:</strong> Select a group and click "Ungroup" to split</li>
                      <li>Clicking any element in a group selects the entire group</li>
                      <li>Groups are saved and persist when you reload</li>
                    </ul>
                  </div>

                  <div className="bg-muted rounded-lg p-4">
                    <h4 className="font-medium mb-2">When to Use Grouping:</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Multiple logos that should stay aligned together</li>
                      <li>Creating consistent layouts across the canvas</li>
                      <li>Moving complex arrangements without disturbing positions</li>
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
                    <h3 className="font-semibold mb-2">CMYK Color Preservation</h3>
                    <p className="text-muted-foreground">
                      Your exact CMYK colors are preserved throughout the entire process. 
                      We use the FOGRA51 ICC profile for professional print accuracy.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Garment Colors (27 options)</h3>
                    <p className="text-muted-foreground mb-3">
                      For Full Colour, HD, and Metallic transfers, select your garment color:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Choose from Gildan or Fruit of the Loom colors</li>
                      <li>Includes standard colors, Hi-Viz, pastels, and specialty options</li>
                      <li>Preview shows your artwork on the selected background</li>
                      <li>Final PDF includes garment color page for production reference</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Ink Colors (29 Pantone options)</h3>
                    <p className="text-muted-foreground mb-3">
                      For Single Colour and Zero transfers:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Select from 29 Pantone spot colors</li>
                      <li>Includes 2 metallic options (Gold and Silver)</li>
                      <li>Your design will be printed entirely in the selected ink</li>
                      <li>Preview shows the recolored artwork</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">CMYK Color Editor</h3>
                    <p className="text-muted-foreground mb-3">
                      Fine-tune colors with the CMYK slider popup:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Click any color swatch to open the editor</li>
                      <li>Adjust Cyan, Magenta, Yellow, and Black values</li>
                      <li>See live preview of color changes</li>
                      <li>Changes are saved automatically</li>
                    </ul>
                  </div>

                  <div className="bg-yellow-50 dark:bg-yellow-950 rounded-lg p-4">
                    <h4 className="font-medium mb-2">Screen vs Print Colors:</h4>
                    <p className="text-sm">
                      Colors on screen (RGB) always appear brighter than print (CMYK). 
                      The preflight panel shows your colors in CMYK format for accurate expectations.
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
                    <h3 className="font-semibold mb-2">Transfer Types</h3>
                    <ul className="space-y-3">
                      <li>
                        <strong>Full Colour Transfers</strong>
                        <p className="text-sm text-muted-foreground">
                          Multi-color designs with white base layer. Requires garment color selection. 
                          Available in A3, A4, A5, A6, and custom sizes.
                        </p>
                      </li>
                      <li>
                        <strong>HD Transfers</strong>
                        <p className="text-sm text-muted-foreground">
                          High-definition prints for detailed artwork. Supports multi-color garment orders.
                        </p>
                      </li>
                      <li>
                        <strong>Metallic Transfers</strong>
                        <p className="text-sm text-muted-foreground">
                          Gold and silver metallic finishes. Supports multi-color garment orders.
                        </p>
                      </li>
                      <li>
                        <strong>Single Colour Transfers</strong>
                        <p className="text-sm text-muted-foreground">
                          One-color designs using Pantone inks. Select from 29 ink colors.
                        </p>
                      </li>
                      <li>
                        <strong>Zero Transfers</strong>
                        <p className="text-sm text-muted-foreground">
                          No-feel transfers for a soft hand. Limited ink color selection.
                        </p>
                      </li>
                      <li>
                        <strong>DTF Digital Film</strong>
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
                        <strong>Reflective Transfers</strong>
                        <p className="text-sm text-muted-foreground">
                          Hi-visibility reflective transfers. Silver ink only.
                        </p>
                      </li>
                      <li>
                        <strong>Custom Badges & Applique</strong>
                        <p className="text-sm text-muted-foreground">
                          Embroidered patches and appliques. Includes detailed specification form.
                        </p>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-muted rounded-lg p-4">
                    <h4 className="font-medium mb-2">Template Sizes:</h4>
                    <p className="text-sm">
                      Each product offers multiple size options (A3, A4, A5, A6, and custom dimensions). 
                      Larger templates have higher minimum order quantities. Pricing is calculated 
                      automatically based on size and quantity.
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
                      Before generating your PDF, review the preflight panel on the left:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li><strong>Print Resolution:</strong> Vector or raster quality status</li>
                      <li><strong>File Format:</strong> Vector (preferred) or raster</li>
                      <li><strong>Colour Mode:</strong> CMYK preservation status</li>
                      <li><strong>Position:</strong> Confirms artwork is within bounds</li>
                      <li><strong>Print Size:</strong> Current dimensions in mm</li>
                      <li><strong>Typography:</strong> Font outlining status</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">PDF Generation Process</h3>
                    <ol className="list-decimal list-inside space-y-2 text-sm">
                      <li>Click "Continue to Pre-flight" button</li>
                      <li>Click "Generate PDF" to create your production file</li>
                      <li>Review the multi-page preview</li>
                      <li>Check both approval checkboxes</li>
                      <li>Click "Attach to Order" to proceed</li>
                    </ol>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Multi-Page PDF Output</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      Your final PDF contains multiple pages:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li><strong>Page 1:</strong> Artwork on transparent background (for production)</li>
                      <li><strong>Page 2+:</strong> Artwork on each garment color background with footer</li>
                      <li>Footer shows project name, color name, and quantity</li>
                    </ul>
                  </div>

                  <div className="bg-green-50 dark:bg-green-950 rounded-lg p-4">
                    <h4 className="font-medium mb-2">PDF Features:</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Professional CMYK color space with FOGRA51 ICC profile</li>
                      <li>Vector graphics preserved for sharp printing at any scale</li>
                      <li>Exact canvas dimensions replicated</li>
                      <li>Automatic rotation handling for all orientations</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "ordering" && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold">Ordering & Cart</h2>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Project Naming</h3>
                    <p className="text-sm text-muted-foreground">
                      Before adding to cart, you'll name your project. This name appears on the PDF 
                      and helps identify your order in production.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Multi-Color Garment Orders</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      For Full Colour, HD, and Metallic transfers, order the same design on multiple garment colors:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Click "Add Color" in the project naming modal</li>
                      <li>Select additional garment colors</li>
                      <li>Set individual quantities for each color</li>
                      <li>Example: "10 Black, 4 Gold, 4 Charcoal"</li>
                      <li>PDF generates separate pages for each garment color</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Special Instructions</h3>
                    <p className="text-sm text-muted-foreground">
                      Add comments or special instructions for the production team. These are 
                      included with your order and visible to our staff.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Add to Cart</h3>
                    <ol className="list-decimal list-inside space-y-2 text-sm">
                      <li>Review your PDF preview</li>
                      <li>Check both approval boxes</li>
                      <li>Click "Add to Cart"</li>
                      <li>Choose "Start New Project" or "View Cart"</li>
                    </ol>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-2">Save Progress</h3>
                    <p className="text-sm text-muted-foreground">
                      Click "Save Progress" anytime to save your work. Your uploaded logos, 
                      positions, and settings are preserved. Return later to continue where you left off.
                    </p>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-4">
                    <h4 className="font-medium mb-2">Order Workflow:</h4>
                    <p className="text-sm">
                      Your production-ready PDF is automatically attached to your order. 
                      The production team sees your artwork, garment colors, quantities, 
                      and any special instructions directly in their workflow.
                    </p>
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
                        <h4 className="font-medium">Position or Print Size warning after rotating</h4>
                        <p className="text-sm text-muted-foreground">
                          The preflight checks account for rotation. If you still see warnings after rotating, 
                          try "Fit to Bounds" to automatically scale within safety margins, or manually resize.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-medium">White elements not visible</h4>
                        <p className="text-sm text-muted-foreground">
                          White designs are preserved but hard to see on a white canvas. 
                          Select a garment color to see them, or they'll appear correctly in the final PDF.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-medium">Colors look different than expected</h4>
                        <p className="text-sm text-muted-foreground">
                          Screen colors (RGB) always appear brighter than print (CMYK). 
                          The preflight panel shows CMYK values for accurate expectations.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-medium">Font outlining warning</h4>
                        <p className="text-sm text-muted-foreground">
                          If your file contains live text, convert fonts to outlines in your design software 
                          before uploading, or the system will attempt to outline them automatically.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-medium">Large file upload fails (413 error)</h4>
                        <p className="text-sm text-muted-foreground">
                          Maximum file size is 200MB. For larger files, use our Dropbox File Request 
                          option, or optimize the PDF/reduce image resolution before uploading.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-medium">Complex file detected</h4>
                        <p className="text-sm text-muted-foreground">
                          Files with many paths or complex effects may need manual processing. 
                          Use the Dropbox File Request option and we'll process it for you.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-medium">Logo appears clipped or off-center</h4>
                        <p className="text-sm text-muted-foreground">
                          Our system extracts precise content bounds. If clipping occurs, 
                          try re-uploading the file or contact support for assistance.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-medium">Pricing unavailable</h4>
                        <p className="text-sm text-muted-foreground">
                          Ensure you're logged in to see pricing. If logged in but still seeing this, 
                          try refreshing the page or contact support.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted rounded-lg p-4">
                    <h4 className="font-medium mb-2">Need More Help?</h4>
                    <p className="text-sm">
                      Try "Start Over" to begin fresh, or use the Contact Support section 
                      to reach our team directly.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeSection === "support" && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold">Contact Support</h2>
                
                <div className="space-y-4">
                  <p className="text-muted-foreground">
                    Have a question or need help? Fill out the form below and our support team will get back to you.
                  </p>

                  <Form {...form}>
                    <form onSubmit={form.handleSubmit((data) => supportTicketMutation.mutate(data))} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Your name" 
                                data-testid="input-support-name"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input 
                                type="email" 
                                placeholder="your@email.com" 
                                data-testid="input-support-email"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="subject"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Subject</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Brief description of your issue" 
                                data-testid="input-support-subject"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="message"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Message</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Describe your issue in detail..." 
                                className="min-h-[120px]"
                                data-testid="input-support-message"
                                {...field} 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button 
                        type="submit" 
                        className="w-full"
                        disabled={supportTicketMutation.isPending}
                        data-testid="btn-submit-support"
                      >
                        {supportTicketMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          <>
                            <Mail className="mr-2 h-4 w-4" />
                            Submit Support Ticket
                          </>
                        )}
                      </Button>
                    </form>
                  </Form>

                  <div className="bg-muted rounded-lg p-4 mt-6">
                    <h4 className="font-medium mb-2">Alternative Contact</h4>
                    <p className="text-sm text-muted-foreground">
                      You can also email us directly at:{" "}
                      <a href="mailto:transferhelp@serigraf.com" className="text-primary hover:underline">
                        transferhelp@serigraf.com
                      </a>
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      We typically respond within 24 hours during business days.
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
