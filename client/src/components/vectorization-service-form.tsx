import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Palette, Upload, FileImage, CheckCircle, ShoppingCart, Package } from "lucide-react";
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

const vectorizationFormSchema = z.object({
  file: z.any().refine((file) => file instanceof File, "Please select a file to upload"),
  comments: z.string().min(1, "Please provide details about your requirements"),
  printSize: z.string().min(1, "Please specify the final print size"),
  serviceType: z.enum(["vectorization-only", "vectorization-with-product"], {
    required_error: "Please select a service type",
  }),
  transferProduct: z.string().optional(),
  quantity: z.number().optional(),
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
  const { toast } = useToast();

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
    },
  });

  const serviceType = form.watch("serviceType");

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
    }
    setShowTemplateSelector(false);
  };

  const handleBackToProductLauncher = () => {
    setShowTemplateSelector(false);
    setShowProductLauncher(true);
  };

  const onSubmit = (data: VectorizationFormData) => {
    // Validate product selection for vectorization-with-product
    if (data.serviceType === "vectorization-with-product" && !selectedProduct) {
      toast({
        title: "Product Required",
        description: "Please select a transfer product",
        variant: "destructive",
      });
      return;
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
            <div className="flex justify-center">
              <Button onClick={handleClose} className="w-full">
                Close
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
          const productMap: Record<string, string[]> = {
            "full-colour-transfers": ["Screen Printed Transfers"],
            "full-colour-metallic": ["Screen Printed Transfers"],
            "full-colour-hd": ["Screen Printed Transfers"],
            "single-colour-transfers": ["Screen Printed Transfers"],
            "dtf-transfers": ["Digital Transfers"],
            "uv-dtf": ["Digital Transfers"],
            "custom-badges": ["Digital Transfers"],
            "applique-badges": ["Digital Transfers"],
            "reflective-transfers": ["Screen Printed Transfers"],
            "zero-single-colour": ["Screen Printed Transfers"],
            "sublimation-transfers": ["Digital Transfers"],
          };
          
          const allowedGroups = productMap[selectedProductGroup] || [];
          return allowedGroups.includes(t.group || '');
        })}
        onSelectTemplate={handleTemplateSelect}
        onClose={() => setShowTemplateSelector(false)}
        onBack={handleBackToProductLauncher}
        selectedGroup={selectedProductGroup}
      />
    </>
  );
}
