import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Palette, Upload, FileImage, CheckCircle, ShoppingCart, Package, PaintBucket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import ProductLauncherModal from "@/components/product-launcher-modal";
import TemplateSelectorModal from "@/components/template-selector-modal";
import GarmentColorModal from "@/components/garment-color-modal";
import InkColorModal from "@/components/ink-color-modal";

const vectorizationFormSchema = z.object({
  file: z.any().refine((file) => file instanceof File, "Please select a file to upload"),
  comments: z.string().min(1, "Please provide details about your requirements"),
  printSize: z.string().min(1, "Please specify the final print size"),
  serviceType: z.enum(["vectorization-only", "vectorization-with-product"], {
    required_error: "Please select a service type",
  }),
  transferProduct: z.string().optional(),
  quantity: z.number().optional(),
  garmentColor: z.string().optional(),
  inkColor: z.string().optional(),
});

type VectorizationFormData = z.infer<typeof vectorizationFormSchema>;

interface VectorizationServiceFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TemplateSize {
  id: string;
  name: string;
  label: string;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  group: string;
  description: string | null;
  placeholderImage: string | null;
}

export function VectorizationServiceForm({ open, onOpenChange }: VectorizationServiceFormProps) {
  console.log('VectorizationServiceForm render:', { open });
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [requestId, setRequestId] = useState<string>("");
  const [showProductLauncher, setShowProductLauncher] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [selectedProductGroup, setSelectedProductGroup] = useState<string>("");
  const [selectedProduct, setSelectedProduct] = useState<TemplateSize | null>(null);
  const [garmentColor, setGarmentColor] = useState<string | null>(null);
  const [inkColor, setInkColor] = useState<string | null>(null);
  const { toast } = useToast();
  
  const isInIframe = window.self !== window.top;
  const getOdooBaseUrl = () => {
    try {
      if (isInIframe && document.referrer) {
        const referrerUrl = new URL(document.referrer);
        return referrerUrl.origin;
      }
    } catch (e) {
      console.warn('Could not parse referrer URL:', e);
    }
    return 'https://completetransfers.odoo.com';
  };
  const odooBaseUrl = getOdooBaseUrl();
  const cartUrl = isInIframe ? `${odooBaseUrl}/shop/cart` : '/shop/cart';

  // Fetch available templates
  const { data: templates = [] } = useQuery<TemplateSize[]>({
    queryKey: ['/api/template-sizes'],
  });

  const form = useForm<VectorizationFormData>({
    resolver: zodResolver(vectorizationFormSchema),
    defaultValues: {
      comments: "",
      printSize: "",
      serviceType: "vectorization-only",
      transferProduct: "",
      quantity: 1,
      garmentColor: "",
      inkColor: "",
    },
  });

  const serviceType = form.watch("serviceType");

  // Check if the selected product is a single-color template
  const isSingleColorTemplate = (template: TemplateSize | null): boolean => {
    if (!template || !template.id) return false;
    const id = template.id.toLowerCase();
    // Check if template ID starts with single-, zero-, or reflective-
    const isSingleColor = id.startsWith('single-') || id.startsWith('zero-') || id.startsWith('reflective-');
    console.log('🎨 Checking if template is single-color:', { 
      templateId: template.id, 
      templateLabel: template.label,
      isSingleColor 
    });
    return isSingleColor;
  };

  const submitMutation = useMutation({
    mutationFn: async (data: VectorizationFormData) => {
      const formData = new FormData();
      formData.append('file', data.file);
      formData.append('comments', data.comments);
      formData.append('printSize', data.printSize);
      formData.append('serviceType', data.serviceType);
      
      if (data.serviceType === "vectorization-with-product") {
        if (!data.transferProduct) {
          throw new Error("Please select a transfer product");
        }
        formData.append('transferProduct', data.transferProduct);
        formData.append('quantity', (data.quantity || 1).toString());
        
        // Add garment color (required for all products)
        if (data.garmentColor) {
          formData.append('garmentColor', data.garmentColor);
        }
        
        // Add ink color (required for single-color templates)
        if (data.inkColor) {
          formData.append('inkColor', data.inkColor);
        }
      }

      const response = await fetch('/api/vectorization-requests', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return response.json();
    },
    onSuccess: (response) => {
      setRequestId(response.id);
      setShowSuccess(true);
      form.reset();
      setUploadedFile(null);
      setSelectedProduct(null);
      
      // Auto-trigger add-to-cart for vectorization-only requests
      if (serviceType === "vectorization-only") {
        console.log('🛒 Auto-adding vectorization service to cart');
        fetch(`/api/projects/vector-service/add-to-cart`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serviceType: 'vectorization-only',
            requestId: response.id
          })
        })
        .then(async r => {
          if (!r.ok) {
            const text = await r.text();
            console.error('❌ Auto-add to cart failed:', r.status, text);
          } else {
            console.log('✅ Auto-add to cart successful');
          }
        })
        .catch(err => console.error('Error auto-adding to cart:', err));
      }

      toast({
        title: "Request Submitted & Added to Cart",
        description: serviceType === "vectorization-only" 
          ? "Your vectorization request has been submitted."
          : "Your vectorization request has been submitted and products added to cart.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit request",
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      form.setValue('file', file);
      form.clearErrors('file');
    }
  };

  const handleProductLauncherSelect = (productId: string) => {
    setSelectedProductGroup(productId);
    setShowProductLauncher(false);
    setShowTemplateSelector(true);
  };

  const handleTemplateSelect = (templateId: string, copies: number) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setSelectedProduct(template);
      form.setValue('transferProduct', template.id);
      form.setValue('quantity', copies);
      form.clearErrors('transferProduct');
      form.clearErrors('quantity');
      // Reset colors when changing product
      setGarmentColor(null);
      setInkColor(null);
      form.setValue('garmentColor', '');
      form.setValue('inkColor', '');
    }
    setShowTemplateSelector(false);
  };

  const handleBackToProductLauncher = () => {
    setShowTemplateSelector(false);
    setShowProductLauncher(true);
  };

  const onSubmit = (data: VectorizationFormData) => {
    // Validate product selection for vectorization-with-product
    if (data.serviceType === "vectorization-with-product") {
      if (!selectedProduct) {
        toast({
          title: "Product Required",
          description: "Please select a transfer product",
          variant: "destructive",
        });
        return;
      }
      
      // Validate garment color
      if (!garmentColor) {
        toast({
          title: "Garment Color Required",
          description: "Please select a garment color for your transfer",
          variant: "destructive",
        });
        return;
      }
      
      // Validate ink color for single-color templates
      if (isSingleColorTemplate(selectedProduct) && !inkColor) {
        toast({
          title: "Ink Color Required",
          description: "Please select an ink color for single-color transfers",
          variant: "destructive",
        });
        return;
      }
    }
    
    submitMutation.mutate(data);
  };

  const handleClose = () => {
    if (!submitMutation.isPending) {
      setShowSuccess(false);
      setRequestId("");
      form.reset();
      setUploadedFile(null);
      setSelectedProduct(null);
      setGarmentColor(null);
      setInkColor(null);
      onOpenChange(false);
    }
  };

  if (showSuccess) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              Request Submitted Successfully
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                {serviceType === "vectorization-only"
                  ? "Your vectorization request has been submitted to our design team."
                  : "Your vectorization request has been submitted to our design team and products added to your cart."
                }
              </p>
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="font-medium">Request ID: {requestId}</p>
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Added to Cart:</p>
                  <p>• Vectorization Service - €15.00 ex VAT</p>
                  {serviceType === "vectorization-with-product" && selectedProduct && (
                    <p>• {selectedProduct.label} Transfer (with quantity)</p>
                  )}
                </div>
              </div>
            </div>
            <div className="text-center text-sm text-muted-foreground">
              <p>Our design team will process your request and contact you with the vectorized artwork.{serviceType === "vectorization-with-product" && " Your products are now in your cart ready for checkout."}</p>
            </div>
            <div className="flex gap-3">
              <Button 
                onClick={handleClose} 
                variant="outline"
                className="flex-1"
                data-testid="button-order-more"
              >
                <Package className="w-4 h-4 mr-2" />
                Order More Transfers
              </Button>
              <Button 
                onClick={() => {
                  if (isInIframe) {
                    window.parent.location.href = cartUrl;
                  } else {
                    window.location.href = cartUrl;
                  }
                }}
                className="flex-1"
                data-testid="button-view-cart"
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                View Cart
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" />
              Vectorization Service
            </DialogTitle>
            <DialogDescription>
              Submit your design to our professional team for vectorization. Perfect for converting photos, logos, or artwork into scalable vector graphics.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-4">
                  {/* Service Information */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Service Details</CardTitle>
                      <CardDescription>
                        Professional vectorization service by Complete Transfers design team
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">Service Charge:</span>
                        <span className="text-lg font-bold text-primary">€15.00 ex VAT</span>
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>• High-quality vector conversion</p>
                        <p>• Scalable SVG format output</p>
                        <p>• Professional design team review</p>
                        <p>• Color optimization for print</p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* File Upload */}
                  <FormField
                    control={form.control}
                    name="file"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Upload File</FormLabel>
                        <FormControl>
                          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:border-muted-foreground/50 transition-colors">
                            <input
                              type="file"
                              accept="image/*,.pdf,.ai,.eps"
                              onChange={handleFileChange}
                              className="hidden"
                              id="vectorization-file-upload"
                              disabled={submitMutation.isPending}
                            />
                            <label htmlFor="vectorization-file-upload" className="cursor-pointer">
                              {uploadedFile ? (
                                <div className="space-y-2">
                                  <FileImage className="h-12 w-12 mx-auto text-primary" />
                                  <p className="font-medium">{uploadedFile.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                                  </p>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                                  <p className="font-medium">Click to upload file</p>
                                  <p className="text-sm text-muted-foreground">
                                    Supports: JPG, PNG, PDF, AI, EPS (max 200MB)
                                  </p>
                                </div>
                              )}
                            </label>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Right Column */}
                <div className="space-y-4">
                  {/* Service Type Selection */}
                  <FormField
                    control={form.control}
                    name="serviceType"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Service Type</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            className="flex flex-col space-y-2"
                          >
                            <div className="flex items-center space-x-3 space-y-0">
                              <RadioGroupItem value="vectorization-only" id="vectorization-only" />
                              <Label htmlFor="vectorization-only" className="font-normal cursor-pointer">
                                Vectorization Service Only (€15.00 ex VAT)
                              </Label>
                            </div>
                            <div className="flex items-center space-x-3 space-y-0">
                              <RadioGroupItem value="vectorization-with-product" id="vectorization-with-product" />
                              <Label htmlFor="vectorization-with-product" className="font-normal cursor-pointer">
                                Vectorization + Transfer Product
                              </Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormDescription>
                          Choose vectorization only or include transfer products with your order
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Transfer Product Selection (only show if vectorization-with-product selected) */}
                  {serviceType === "vectorization-with-product" && (
                    <>
                      <div className="space-y-2">
                        <Label>Selected Transfer Product</Label>
                        <div className="border rounded-lg p-4 bg-muted/50">
                          {selectedProduct ? (
                            <div className="space-y-2">
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-medium">{selectedProduct.label}</p>
                                  <p className="text-sm text-muted-foreground">{selectedProduct.description}</p>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {selectedProduct.width}mm × {selectedProduct.height}mm
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setShowProductLauncher(true)}
                                  disabled={submitMutation.isPending}
                                >
                                  Change
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-4">
                              <Package className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                              <p className="text-sm text-muted-foreground mb-3">No product selected</p>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setShowProductLauncher(true)}
                                disabled={submitMutation.isPending}
                                data-testid="button-select-product"
                              >
                                Select Transfer Product
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Quantity (only show if product selected) */}
                      {selectedProduct && (
                        <FormField
                          control={form.control}
                          name="quantity"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Quantity of Transfers Required</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="1"
                                  max="10000"
                                  placeholder="Enter quantity"
                                  disabled={submitMutation.isPending}
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                                  data-testid="input-quantity"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      {/* Garment Color Selection (only show if product selected) */}
                      {selectedProduct && (
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <Palette className="w-4 h-4" />
                            Garment Color
                            <span className="text-red-500 text-sm">*Required</span>
                          </Label>
                          <div className="border rounded-lg p-4 bg-muted/50">
                            {garmentColor ? (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div 
                                    className="w-10 h-10 rounded border border-gray-300 shadow-sm"
                                    style={{ backgroundColor: garmentColor }}
                                  />
                                  <div>
                                    <p className="font-medium text-sm">Selected Color</p>
                                    <p className="text-xs text-muted-foreground">{garmentColor}</p>
                                  </div>
                                </div>
                                <GarmentColorModal
                                  currentColor={garmentColor}
                                  onColorChange={(color) => {
                                    setGarmentColor(color);
                                    form.setValue('garmentColor', color);
                                  }}
                                  trigger={
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={submitMutation.isPending}
                                    >
                                      Change
                                    </Button>
                                  }
                                />
                              </div>
                            ) : (
                              <div className="text-center py-2">
                                <GarmentColorModal
                                  currentColor={garmentColor}
                                  onColorChange={(color) => {
                                    setGarmentColor(color);
                                    form.setValue('garmentColor', color);
                                  }}
                                  trigger={
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={submitMutation.isPending}
                                      data-testid="button-select-garment-color"
                                    >
                                      <Palette className="w-4 h-4 mr-2" />
                                      Select Garment Color
                                    </Button>
                                  }
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Ink Color Selection (only show if product is single-color template) */}
                      {selectedProduct && isSingleColorTemplate(selectedProduct) && (
                        <div className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <PaintBucket className="w-4 h-4" />
                            Ink Color
                            <span className="text-red-500 text-sm">*Required for Single-Color</span>
                          </Label>
                          <div className="border rounded-lg p-4 bg-muted/50">
                            {inkColor ? (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div 
                                    className="w-10 h-10 rounded border border-gray-300 shadow-sm"
                                    style={{ backgroundColor: inkColor }}
                                  />
                                  <div>
                                    <p className="font-medium text-sm">Selected Ink Color</p>
                                    <p className="text-xs text-muted-foreground">{inkColor}</p>
                                  </div>
                                </div>
                                <InkColorModal
                                  currentColor={inkColor}
                                  onColorChange={(color) => {
                                    setInkColor(color);
                                    form.setValue('inkColor', color);
                                  }}
                                  templateId={selectedProduct.id}
                                  trigger={
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={submitMutation.isPending}
                                    >
                                      Change
                                    </Button>
                                  }
                                />
                              </div>
                            ) : (
                              <div className="text-center py-2">
                                <InkColorModal
                                  currentColor={inkColor}
                                  onColorChange={(color) => {
                                    setInkColor(color);
                                    form.setValue('inkColor', color);
                                  }}
                                  templateId={selectedProduct.id}
                                  trigger={
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={submitMutation.isPending}
                                      data-testid="button-select-ink-color"
                                    >
                                      <PaintBucket className="w-4 h-4 mr-2" />
                                      Select Ink Color
                                    </Button>
                                  }
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Comments */}
                  <FormField
                    control={form.control}
                    name="comments"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Requirements & Comments</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Please describe what you need:
- Specific colors to use or avoid
- Elements to include or remove
- Style preferences
- Any special requirements"
                            className="min-h-[120px]"
                            disabled={submitMutation.isPending}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Print Size */}
                  <FormField
                    control={form.control}
                    name="printSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Final Print Size</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., A4, 200x100mm"
                            disabled={submitMutation.isPending}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-6 mt-6 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={submitMutation.isPending}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitMutation.isPending || !uploadedFile}
                  className="flex-1"
                  data-testid="button-submit-vectorization"
                >
                  {submitMutation.isPending ? (
                    <>
                      <Upload className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Submit Request & Add to Cart
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Product Launcher Modal */}
      <ProductLauncherModal
        open={showProductLauncher}
        onClose={() => setShowProductLauncher(false)}
        onSelectProduct={handleProductLauncherSelect}
      />

      {/* Template Selector Modal */}
      <TemplateSelectorModal
        open={showTemplateSelector}
        templates={templates.filter(t => {
          if (!selectedProductGroup) return true;
          
          // Define exact template IDs for each product type (matching upload-tool.tsx)
          const productTemplates: { [key: string]: string[] } = {
            "full-colour-transfers": ["template-A3", "template-A4", "template-A5", "template-A6", "template-transfer-size", "template-square", "template-badge", "template-small", "template-295x300"],
            "full-colour-metallic": ["metallic-A3", "metallic-A4", "metallic-A5", "metallic-A6", "metallic-transfer-size", "metallic-square", "metallic-badge", "metallic-small", "metallic-295x300"],
            "full-colour-hd": ["hd-A3", "hd-A4", "hd-295x300"],
            "single-colour-transfers": ["single-A3", "single-A4", "single-A5", "single-A6", "single-transfer-size", "single-square", "single-badge", "single-small", "single-295x300"],
            "dtf-transfers": ["dtf-SRA3", "dtf-large"],
            "uv-dtf": ["uvdtf-A3"],
            "custom-badges": ["woven-A6", "woven-square", "woven-badge", "woven-small"],
            "applique-badges": ["applique-A6", "applique-square", "applique-badge", "applique-small"],
            "reflective-transfers": ["reflective-A3", "reflective-A4", "reflective-A5", "reflective-A6", "reflective-transfer-size", "reflective-square", "reflective-badge", "reflective-small"],
            "zero-single-colour": ["zero-A3", "zero-A4", "zero-A5", "zero-A6", "zero-transfer-size", "zero-square", "zero-badge", "zero-small"],
            "sublimation-transfers": ["sublimation-SRA3", "sublimation-A4", "sublimation-A5", "sublimation-A6"],
          };
          
          const allowedTemplates = productTemplates[selectedProductGroup] || [];
          return allowedTemplates.includes(t.id);
        })}
        onSelectTemplate={handleTemplateSelect}
        onClose={() => setShowTemplateSelector(false)}
        onBack={handleBackToProductLauncher}
        selectedGroup={selectedProductGroup}
      />
    </>
  );
}
