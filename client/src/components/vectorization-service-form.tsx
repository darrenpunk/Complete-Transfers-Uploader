import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Palette, Upload, FileImage, CheckCircle, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const TRANSFER_PRODUCTS = [
  { value: "template-A3", label: "Full Colour Transfers - A3" },
  { value: "template-A4", label: "Full Colour Transfers - A4" },
  { value: "template-A5", label: "Full Colour Transfers - A5" },
  { value: "single-A3", label: "Single Colour Transfers - A3" },
  { value: "single-A4", label: "Single Colour Transfers - A4" },
  { value: "dtf-SRA3", label: "DTF Digital Film - SRA3" },
  { value: "metallic-A3", label: "Metallic Transfers - A3" },
  { value: "metallic-A4", label: "Metallic Transfers - A4" },
  { value: "hd-A3", label: "HD Transfers - A3" },
  { value: "hd-A4", label: "HD Transfers - A4" },
];

const vectorizationFormSchema = z.object({
  file: z.any().refine((file) => file instanceof File, "Please select a file to upload"),
  comments: z.string().min(1, "Please provide details about your requirements"),
  printSize: z.string().min(1, "Please specify the final print size"),
  transferProduct: z.string().min(1, "Please select a transfer product"),
  quantity: z.number().min(1, "Quantity must be at least 1").max(10000, "Quantity cannot exceed 10,000"),
});

type VectorizationFormData = z.infer<typeof vectorizationFormSchema>;

interface VectorizationServiceFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VectorizationServiceForm({ open, onOpenChange }: VectorizationServiceFormProps) {
  console.log('VectorizationServiceForm render:', { open });
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [requestId, setRequestId] = useState<string>("");
  const { toast } = useToast();

  const form = useForm<VectorizationFormData>({
    resolver: zodResolver(vectorizationFormSchema),
    defaultValues: {
      comments: "",
      printSize: "",
      transferProduct: "",
      quantity: 1,
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: VectorizationFormData) => {
      const formData = new FormData();
      formData.append('file', data.file);
      formData.append('comments', data.comments);
      formData.append('printSize', data.printSize);
      formData.append('transferProduct', data.transferProduct);
      formData.append('quantity', data.quantity.toString());

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
      toast({
        title: "Request Submitted & Added to Cart",
        description: "Your vectorization request has been submitted and products added to cart.",
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

  const onSubmit = (data: VectorizationFormData) => {
    submitMutation.mutate(data);
  };

  const handleClose = () => {
    if (!submitMutation.isPending) {
      setShowSuccess(false);
      setRequestId("");
      form.reset();
      setUploadedFile(null);
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
                Your vectorization request has been submitted to our design team and products added to your cart.
              </p>
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="font-medium">Request ID: {requestId}</p>
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Added to Cart:</p>
                  <p>• Vectorization Service - €15.00 ex VAT</p>
                  <p>• Selected Transfer Product (with quantity)</p>
                </div>
              </div>
            </div>
            <div className="text-center text-sm text-muted-foreground">
              <p>Our design team will process your request and contact you with the vectorized artwork. Your products are now in your cart ready for checkout.</p>
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
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl">
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
                          className="min-h-[140px]"
                          disabled={submitMutation.isPending}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Print Size and Quantity in a row */}
                <div className="grid grid-cols-2 gap-4">
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

                  <FormField
                    control={form.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quantity</FormLabel>
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
                </div>

                {/* Transfer Product Selection */}
                <FormField
                  control={form.control}
                  name="transferProduct"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Transfer Product</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                        disabled={submitMutation.isPending}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-transfer-product">
                            <SelectValue placeholder="Select transfer product type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TRANSFER_PRODUCTS.map((product) => (
                            <SelectItem key={product.value} value={product.value}>
                              {product.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
  );
}