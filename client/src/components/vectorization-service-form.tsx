import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Palette, Upload, FileImage, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const vectorizationFormSchema = z.object({
  file: z.any().refine((file) => file instanceof File, "Please select a file to upload"),
  comments: z.string().min(1, "Please provide details about your requirements"),
  printSize: z.string().min(1, "Please specify the final print size"),
});

type VectorizationFormData = z.infer<typeof vectorizationFormSchema>;

interface VectorizationServiceFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VectorizationServiceForm({ open, onOpenChange }: VectorizationServiceFormProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [requestId, setRequestId] = useState<string>("");
  const { toast } = useToast();

  const form = useForm<VectorizationFormData>({
    resolver: zodResolver(vectorizationFormSchema),
    defaultValues: {
      comments: "",
      printSize: "",
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: VectorizationFormData) => {
      const formData = new FormData();
      formData.append('file', data.file);
      formData.append('comments', data.comments);
      formData.append('printSize', data.printSize);

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
        title: "Request Submitted",
        description: "Your vectorization request has been submitted successfully.",
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
                Your vectorization request has been submitted to our design team.
              </p>
              <div className="bg-muted p-4 rounded-lg">
                <p className="font-medium mb-2">Request ID: {requestId}</p>
                <p className="text-sm text-muted-foreground">
                  Charge: €3.00 ex VAT
                </p>
              </div>
            </div>
            <div className="text-center text-sm text-muted-foreground">
              <p>Our design team will process your request and contact you with the vectorized artwork.</p>
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
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Vectorization Service
          </DialogTitle>
          <DialogDescription>
            Submit your design to our professional team for vectorization. Perfect for converting photos, logos, or artwork into scalable vector graphics.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
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
                <span className="text-lg font-bold text-primary">€3.00 ex VAT</span>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>• High-quality vector conversion</p>
                <p>• Scalable SVG format output</p>
                <p>• Professional design team review</p>
                <p>• Color optimization for print</p>
              </div>
            </CardContent>
          </Card>

          {/* Upload Form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                        placeholder="e.g., A4, 200x100mm, 8x6 inches"
                        disabled={submitMutation.isPending}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Submit Button */}
              <div className="flex gap-3 pt-4">
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
                >
                  {submitMutation.isPending ? (
                    <>
                      <Upload className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      Submit Request - €15.00
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}