import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, ExternalLink, Check } from "lucide-react";

interface DropboxUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    fileName: string;
    description?: string;
  }) => Promise<{ uploadUrl: string } | void>;
}

export function DropboxUploadModal({
  open,
  onOpenChange,
  onSubmit,
}: DropboxUploadModalProps) {
  const [fileName, setFileName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!fileName) return;

    setIsSubmitting(true);
    try {
      const result = await onSubmit({
        fileName,
        description,
      });
      
      if (result && 'uploadUrl' in result) {
        setUploadUrl(result.uploadUrl);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFileName("");
    setDescription("");
    setUploadUrl(null);
    onOpenChange(false);
  };

  const handleOpenUploadLink = () => {
    if (uploadUrl) {
      window.open(uploadUrl, '_blank');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-blue-600" />
            Upload via Dropbox
          </DialogTitle>
          <DialogDescription>
            {uploadUrl ? (
              "Your upload link is ready. Click the button below to upload your file to Dropbox."
            ) : (
              "We'll generate a secure Dropbox upload link for your large file. No file size limits!"
            )}
          </DialogDescription>
        </DialogHeader>

        {!uploadUrl ? (
          <>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="file-name">File Name *</Label>
                <Input
                  id="file-name"
                  placeholder="my-artwork.pdf"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  data-testid="input-dropbox-filename"
                />
                <p className="text-xs text-muted-foreground">
                  Include the file extension (.pdf, .ai, .eps, etc.)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Additional details about your file..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  data-testid="textarea-dropbox-description"
                />
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>How it works:</strong>
                </p>
                <ul className="text-xs text-blue-700 dark:text-blue-300 mt-2 space-y-1 list-disc list-inside">
                  <li>We'll create a secure Dropbox upload link just for your file</li>
                  <li>A placeholder appears on your canvas immediately</li>
                  <li>Upload your file to Dropbox using the link</li>
                  <li>We'll automatically detect and download your file</li>
                  <li>Complete your order as normal</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
                data-testid="button-cancel-dropbox"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!fileName || isSubmitting}
                data-testid="button-generate-dropbox-link"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                {isSubmitting ? "Generating..." : "Generate Upload Link"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-4 py-4">
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="h-5 w-5 text-green-600" />
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">
                    Upload Link Created!
                  </p>
                </div>
                <p className="text-xs text-green-700 dark:text-green-300">
                  A placeholder has been added to your canvas. Click the button below to upload your file.
                </p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                  <strong>Next Steps:</strong>
                </p>
                <ol className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-decimal list-inside">
                  <li>Click "Open Upload Link" below</li>
                  <li>Drag and drop your file to Dropbox</li>
                  <li>Return here and continue working on your project</li>
                  <li>We'll automatically detect and process your file</li>
                </ol>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={handleClose}
                data-testid="button-close-dropbox"
              >
                Done
              </Button>
              <Button
                asChild
                data-testid="button-open-dropbox-link"
              >
                <a
                  href={uploadUrl || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open Upload Link
                </a>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
