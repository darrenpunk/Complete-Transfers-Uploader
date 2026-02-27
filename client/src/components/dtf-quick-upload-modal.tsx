import { useState, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileText, X, Loader2, ShoppingCart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DtfQuickUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partnerEmail?: string | null;
  odooUrl?: string | null;
  onSuccess?: () => void;
}

export function DtfQuickUploadModal({
  open,
  onOpenChange,
  partnerEmail,
  odooUrl,
  onSuccess,
}: DtfQuickUploadModalProps) {
  const { toast } = useToast();
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [quantity, setQuantity] = useState<number>(50);
  const [projectName, setProjectName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const wasSubmittedRef = useRef(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) setPdfFile(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
  });

  const handleClose = (afterSuccess = false) => {
    if (isSubmitting && !afterSuccess) return;
    setPdfFile(null);
    setQuantity(50);
    setProjectName("");
    wasSubmittedRef.current = afterSuccess;
    onOpenChange(false);
  };

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleSubmit = async () => {
    if (!pdfFile || quantity < 1) return;
    setIsSubmitting(true);
    try {
      const pdfBase64 = await readFileAsBase64(pdfFile);
      const name = projectName.trim() || pdfFile.name.replace(/\.pdf$/i, "");

      const response = await fetch("/api/quick-upload-dtf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          pdfBase64,
          quantity,
          partnerEmail: partnerEmail || undefined,
          projectName: name,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || "Failed to add to cart");
      }

      toast({ title: "Added to Cart", description: "Your DTF order has been added to your cart." });
      onSuccess?.();
      handleClose(true);

      // Redirect to Odoo cart
      setTimeout(() => {
        const base = odooUrl || import.meta.env.VITE_ODOO_URL || "https://www.completetransfers.com";
        const isInIframe = window.self !== window.top;
        if (isInIframe) {
          window.parent.location.href = `${base}/shop/cart`;
        } else {
          window.location.href = `${base}/shop/cart`;
        }
      }, 800);
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to add to cart", variant: "destructive" });
    }
    setIsSubmitting(false);
  };

  const canSubmit = !!pdfFile && quantity >= 1 && !isSubmitting;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            DTF 1000×550mm — Quick Upload
          </DialogTitle>
          <DialogDescription>
            Upload your print-ready PDF and set the quantity. Your order goes straight to cart — no design step needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* PDF Upload */}
          <div className="space-y-2">
            <Label>PDF File <span className="text-red-500">*</span></Label>
            {pdfFile ? (
              <div className="flex items-center gap-3 border border-primary/40 bg-primary/5 rounded-lg px-4 py-3">
                <FileText className="h-8 w-8 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{pdfFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <button
                  onClick={() => setPdfFile(null)}
                  className="text-muted-foreground hover:text-foreground"
                  disabled={isSubmitting}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg px-6 py-8 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? "border-primary bg-primary/10"
                    : "border-gray-600 hover:border-gray-400 hover:bg-gray-800/50"
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                {isDragActive ? (
                  <p className="text-sm text-primary">Drop your PDF here</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-300">Drag & drop your PDF here, or click to browse</p>
                    <p className="text-xs text-gray-500 mt-1">PDF files only · Max 1 file</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Project Name */}
          <div className="space-y-2">
            <Label htmlFor="project-name">Project Name <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              id="project-name"
              placeholder={pdfFile ? pdfFile.name.replace(/\.pdf$/i, "") : "e.g. Club Jersey Front"}
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="dtf-qty">Quantity <span className="text-red-500">*</span></Label>
            <Input
              id="dtf-qty"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2 border-t border-gray-700">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting} className="flex-1 bg-transparent border-gray-600 text-gray-300">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="flex-1">
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding to Cart...
              </>
            ) : (
              <>
                <ShoppingCart className="h-4 w-4 mr-2" />
                Add to Cart
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
